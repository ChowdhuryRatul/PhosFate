#!/usr/bin/env python3
"""Run PhosFate inference for one protein sequence.

This script is intentionally CLI-shaped so the Node API can run heavyweight
Python inference out of process and return structured JSON.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoTokenizer, EsmForProteinFolding
from transformers.models.esm.openfold_utils.feats import atom14_to_atom37
from transformers.models.esm.openfold_utils.protein import Protein as OFProtein
from transformers.models.esm.openfold_utils.protein import to_pdb

import esm


AA3_TO_AA1 = {
    "ALA": "A",
    "ARG": "R",
    "ASN": "N",
    "ASP": "D",
    "CYS": "C",
    "GLU": "E",
    "GLN": "Q",
    "GLY": "G",
    "HIS": "H",
    "ILE": "I",
    "LEU": "L",
    "LYS": "K",
    "MET": "M",
    "PHE": "F",
    "PRO": "P",
    "SER": "S",
    "THR": "T",
    "TRP": "W",
    "TYR": "Y",
    "VAL": "V",
}

POSITIVE_RES = {"ARG", "LYS", "HIS"}
POLAR_RES = {"SER", "THR", "ASN", "GLN", "CYS", "TYR"}
NEGATIVE_RES = {"ASP", "GLU"}
HYDROPHOBIC_RES = {"ALA", "VAL", "ILE", "LEU", "MET", "PHE", "TRP", "PRO"}

W_POSITIVE = 3.0
W_POLAR = 1.5
W_NEGATIVE = -3.0
W_HYDROPHOBIC = -1.0


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def progress(stage: str, message: str, step: int | None = None, total: int | None = None) -> None:
    print(
        json.dumps(
            {
                "type": "progress",
                "stage": stage,
                "message": message,
                "step": step,
                "total": total,
            }
        ),
        file=sys.stderr,
        flush=True,
    )


def clean_sequence(sequence: str) -> str:
    cleaned = re.sub(r"\s+", "", sequence or "").upper()
    invalid = sorted(set(cleaned) - set("ACDEFGHIKLMNPQRSTVWY"))

    if not cleaned:
        raise ValueError("Protein sequence is empty.")

    if invalid:
        raise ValueError(f"Protein sequence contains invalid amino acids: {', '.join(invalid)}")

    return cleaned


def safe_job_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", (value or "").strip())
    return cleaned.strip("._-") or "phosfate_job"


def select_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def convert_outputs_to_pdb(outputs) -> list[str]:
    final_atom_positions = atom14_to_atom37(outputs["positions"][-1], outputs)
    outputs_np = {
        key: value.detach().cpu().numpy() if torch.is_tensor(value) else value
        for key, value in outputs.items()
    }
    final_atom_positions = final_atom_positions.detach().cpu().numpy()
    final_atom_mask = outputs_np["atom37_atom_exists"]

    pdbs = []
    for index in range(outputs_np["aatype"].shape[0]):
        protein = OFProtein(
            aatype=outputs_np["aatype"][index],
            atom_positions=final_atom_positions[index],
            atom_mask=final_atom_mask[index],
            residue_index=outputs_np["residue_index"][index] + 1,
            b_factors=outputs_np["plddt"][index],
            chain_index=outputs_np["chain_index"][index]
            if "chain_index" in outputs_np
            else None,
        )
        pdbs.append(to_pdb(protein))

    return pdbs


def run_esmfold(sequence: str, job_name: str, job_dir: Path, device: torch.device) -> dict:
    progress(
        "esmfold_download",
        "Downloading or loading ESMFold weights from the local Hugging Face cache.",
        1,
        5,
    )
    log("[1/5] Loading ESMFold")
    tokenizer = AutoTokenizer.from_pretrained("facebook/esmfold_v1")
    model = EsmForProteinFolding.from_pretrained(
        "facebook/esmfold_v1",
        low_cpu_mem_usage=True,
    ).to(device)

    if device.type == "cuda":
        model.esm = model.esm.half()
        torch.backends.cuda.matmul.allow_tf32 = True

    model.trunk.set_chunk_size(64)
    model.eval()

    progress("folding", "Folding the submitted sequence with ESMFold.", 2, 5)
    tokenized_input = tokenizer(
        [sequence],
        return_tensors="pt",
        add_special_tokens=False,
    )["input_ids"].to(device)

    log("[2/5] Running ESMFold")
    with torch.no_grad():
        outputs = model(tokenized_input)

    mean_plddt = float(outputs["plddt"].mean().item())
    min_plddt = float(outputs["plddt"].min().item())
    max_plddt = float(outputs["plddt"].max().item())

    pdb_text = convert_outputs_to_pdb(outputs)[0]
    pdb_path = job_dir / f"{job_name}.pdb"
    pdb_path.write_text(pdb_text)

    del model
    if device.type == "cuda":
        torch.cuda.empty_cache()

    return {
        "pdb_path": pdb_path,
        "mean_plddt": mean_plddt,
        "min_plddt": min_plddt,
        "max_plddt": max_plddt,
    }


def run_fpocket(pdb_path: Path) -> Path:
    if not shutil.which("fpocket"):
        raise RuntimeError("fpocket is not installed or not on PATH.")

    progress("fpocket", "Running fpocket to detect candidate binding pockets.", 3, 5)
    log("[3/5] Running fpocket")
    result = subprocess.run(
        ["fpocket", "-f", str(pdb_path.resolve())],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "fpocket failed:\n"
            + result.stdout[-2000:]
            + "\n"
            + result.stderr[-2000:]
        )

    return pdb_path.parent / f"{pdb_path.stem}_out"


def parse_fpocket_info(info_file: Path) -> dict[int, dict]:
    pockets = {}
    current = None

    with info_file.open("r") as handle:
        for line in handle:
            pocket_match = re.match(r"Pocket\s+(\d+)\s*:", line)
            if pocket_match:
                current = int(pocket_match.group(1))
                pockets[current] = {}
                continue

            if current is None:
                continue

            fields = [
                ("score", r"Score\s*:\s*(.+)"),
                ("druggability", r"Druggability Score\s*:\s*(.+)"),
                ("volume", r"Volume\s*:\s*(.+)"),
                ("n_spheres", r"Number of alpha spheres\s*:\s*(.+)"),
            ]

            for key, pattern in fields:
                hit = re.search(pattern, line)
                if not hit:
                    continue
                raw = hit.group(1).strip()
                try:
                    pockets[current][key] = int(raw) if key == "n_spheres" else float(raw)
                except ValueError:
                    pockets[current][key] = raw

    return pockets


def find_pocket_files(out_dir: Path) -> dict[int, dict[str, Path]]:
    pocket_dir = out_dir / "pockets"
    files = {}

    if not pocket_dir.exists():
        return files

    for pocket_path in pocket_dir.glob("pocket*_atm.pdb"):
        match = re.search(r"pocket(\d+)_atm\.pdb", pocket_path.name)
        if match:
            pocket_id = int(match.group(1))
            files[pocket_id] = {
                "atm": pocket_path,
                "vert": pocket_dir / f"pocket{pocket_id}_vert.pqr",
            }

    return files


def parse_protein_atoms(pdb_file: Path) -> list[dict]:
    atoms = []

    with pdb_file.open("r") as handle:
        for line in handle:
            if not line.startswith("ATOM"):
                continue

            try:
                atoms.append(
                    {
                        "resname": line[17:20].strip(),
                        "chain": line[21].strip() or "A",
                        "resid": int(line[22:26].strip()),
                        "coord": (
                            float(line[30:38]),
                            float(line[38:46]),
                            float(line[46:54]),
                        ),
                    }
                )
            except ValueError:
                continue

    return atoms


def get_alpha_sphere_coords(vert_file: Path) -> list[tuple[float, float, float]]:
    coords = []

    if not vert_file.exists():
        return coords

    with vert_file.open("r") as handle:
        for line in handle:
            if not line.startswith(("ATOM", "HETATM")):
                continue

            try:
                coords.append(
                    (
                        float(line[30:38]),
                        float(line[38:46]),
                        float(line[46:54]),
                    )
                )
            except ValueError:
                continue

    return coords


def distance(a, b) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def get_binding_site_residues(protein_pdb: Path, vert_file: Path, cutoff: float) -> list[dict]:
    protein_atoms = parse_protein_atoms(protein_pdb)
    alpha_coords = get_alpha_sphere_coords(vert_file)
    selected = {}

    if not alpha_coords:
        return []

    for atom in protein_atoms:
        min_dist = min(distance(atom["coord"], alpha_coord) for alpha_coord in alpha_coords)

        if min_dist <= cutoff:
            key = (atom["chain"], atom["resid"], atom["resname"])
            if key not in selected or min_dist < selected[key]["min_dist"]:
                selected[key] = {
                    "sequence_index": atom["resid"] - 1,
                    "display_index": atom["resid"],
                    "chain": atom["chain"],
                    "resname": atom["resname"],
                    "min_dist": min_dist,
                }

    return sorted(selected.values(), key=lambda item: item["sequence_index"])


def pocket_residue_counts(residues: list[dict]) -> dict[str, int]:
    counts = {"positive": 0, "polar": 0, "negative": 0, "hydrophobic": 0, "other": 0}

    for residue in residues:
        resname = residue["resname"]
        if resname in POSITIVE_RES:
            counts["positive"] += 1
        elif resname in POLAR_RES:
            counts["polar"] += 1
        elif resname in NEGATIVE_RES:
            counts["negative"] += 1
        elif resname in HYDROPHOBIC_RES:
            counts["hydrophobic"] += 1
        else:
            counts["other"] += 1

    return counts


def anion_preference_score(residues: list[dict]) -> tuple[float, dict[str, int]]:
    counts = pocket_residue_counts(residues)
    score = (
        W_POSITIVE * counts["positive"]
        + W_POLAR * counts["polar"]
        + W_NEGATIVE * counts["negative"]
        + W_HYDROPHOBIC * counts["hydrophobic"]
    )
    return score, counts


def safe_float(value, default=float("-inf")) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def select_top_anion_pockets(
    pdb_path: Path,
    pocket_info: dict[int, dict],
    pocket_files: dict[int, dict[str, Path]],
    cutoff: float,
    top_k: int,
) -> list[dict]:
    candidates = []

    for pocket_id, info in pocket_info.items():
        if pocket_id not in pocket_files:
            continue

        residues = get_binding_site_residues(
            protein_pdb=pdb_path,
            vert_file=pocket_files[pocket_id]["vert"],
            cutoff=cutoff,
        )
        pref_score, counts = anion_preference_score(residues)

        candidates.append(
            {
                "pid": pocket_id,
                "fpocket_score": info.get("score"),
                "druggability": info.get("druggability"),
                "volume": info.get("volume"),
                "n_spheres": info.get("n_spheres"),
                "anion_preference_score": pref_score,
                "counts": counts,
                "residues": residues,
                "files": pocket_files[pocket_id],
            }
        )

    return sorted(
        candidates,
        key=lambda item: (
            item["anion_preference_score"],
            safe_float(item["fpocket_score"]),
            safe_float(item["n_spheres"]),
        ),
        reverse=True,
    )[:top_k]


def load_esm2(device: torch.device):
    progress(
        "embedding_model",
        "Downloading or loading the ESM2 embedding model.",
        4,
        5,
    )
    log("[4/5] Loading ESM2")
    model, alphabet = esm.pretrained.esm2_t33_650M_UR50D()
    model.eval()

    if device.type == "cuda":
        model = model.cuda()

    return model, alphabet, alphabet.get_batch_converter()


def embedding_for_residues(
    sequence: str,
    residue_indices: list[int],
    model,
    alphabet,
    batch_converter,
    device: torch.device,
) -> np.ndarray:
    valid_indices = [index for index in residue_indices if 0 <= index < len(sequence)]

    if not valid_indices:
        raise ValueError("No valid binding-site residue indices are available for embedding.")

    progress(
        "embedding",
        f"Generating ESM2 embedding for {len(valid_indices)} binding-site residues.",
        4,
        5,
    )
    batch_labels, batch_strs, batch_tokens = batch_converter([("protein", sequence)])

    if device.type == "cuda":
        batch_tokens = batch_tokens.cuda()

    with torch.no_grad():
        results = model(batch_tokens, repr_layers=[33], return_contacts=False)

    token_representations = results["representations"][33]
    tensors = [token_representations[0][index] for index in valid_indices]
    return torch.mean(torch.stack(tensors), dim=0).detach().cpu().numpy()


class MLP(nn.Module):
    def __init__(self, in_dim, h1, h2, h3, out_dim, p_drop=0.3, use_bn=True):
        super().__init__()
        self.fc1 = nn.Linear(in_dim, h1)
        self.bn1 = nn.BatchNorm1d(h1) if use_bn else nn.Identity()
        self.fc2 = nn.Linear(h1, h2)
        self.bn2 = nn.BatchNorm1d(h2) if use_bn else nn.Identity()
        self.fc3 = nn.Linear(h2, h3)
        self.bn3 = nn.BatchNorm1d(h3) if use_bn else nn.Identity()
        self.out = nn.Linear(h3, out_dim)
        self.drop = nn.Dropout(p_drop)

    def forward(self, x):
        x = self.fc1(x)
        x = self.bn1(x)
        x = F.relu(x)
        x = self.fc2(x)
        x = self.bn2(x)
        x = F.relu(x)
        x = self.fc3(x)
        x = self.bn3(x)
        x = F.relu(x)
        return self.out(x)


def load_mlp(model_dir: Path, device: torch.device):
    metadata_path = model_dir / "metadata.json"
    weights_path = model_dir / "mlp_state_dict.pt"

    with metadata_path.open("r") as handle:
        metadata = json.load(handle)

    h1, h2, h3 = metadata["architecture"]["hidden_sizes"]
    best_params = metadata["best_params"]
    model = MLP(
        in_dim=metadata["feature_dim"],
        h1=h1,
        h2=h2,
        h3=h3,
        out_dim=metadata["n_classes"],
        p_drop=best_params["dropout"],
        use_bn=best_params["use_bn"],
    ).to(device)
    state_dict = torch.load(weights_path, map_location=device)
    model.load_state_dict(state_dict)
    model.eval()

    return model, metadata


def predict_one(vector: np.ndarray, model, metadata: dict, device: torch.device) -> dict:
    x = torch.tensor(np.asarray(vector, dtype=np.float32), device=device).view(1, -1)

    if x.shape[1] != metadata["feature_dim"]:
        raise ValueError(f"Expected {metadata['feature_dim']} features, got {x.shape[1]}.")

    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

    pred_class = int(np.argmax(probs))
    class_id_to_name = metadata["class_id_to_name"]
    pred_name = class_id_to_name.get(str(pred_class), str(pred_class))

    return {
        "predictedClassId": pred_class,
        "predictedClassName": pred_name,
        "confidence": float(probs[pred_class]),
        "probabilities": {
            class_id_to_name.get(str(index), str(index)): float(probability)
            for index, probability in enumerate(probs)
        },
    }


def relative_path(path: Path, base_dir: Path) -> str:
    return path.resolve().relative_to(base_dir.resolve()).as_posix()


def run(args) -> dict:
    sequence = clean_sequence(args.sequence)
    job_name = safe_job_name(args.job_name)
    output_root = Path(args.output_dir).resolve()
    model_dir = Path(args.model_dir).resolve()
    job_dir = output_root / job_name
    job_dir.mkdir(parents=True, exist_ok=True)

    device = select_device()
    progress("queued", f"Preparing PhosFate run on {device}.", 0, 5)
    log(f"Using device: {device}")

    fold_result = run_esmfold(sequence, job_name, job_dir, device)
    pdb_path = fold_result["pdb_path"]

    out_dir = run_fpocket(pdb_path)
    info_file = out_dir / f"{pdb_path.stem}_info.txt"

    if not info_file.exists():
        raise RuntimeError("fpocket completed but did not produce an info file.")

    pocket_info = parse_fpocket_info(info_file)
    pocket_files = find_pocket_files(out_dir)
    selected_pockets = select_top_anion_pockets(
        pdb_path=pdb_path,
        pocket_info=pocket_info,
        pocket_files=pocket_files,
        cutoff=args.distance,
        top_k=args.top_k,
    )

    if not selected_pockets:
        raise RuntimeError("fpocket did not produce any usable pockets.")

    esm_model, alphabet, batch_converter = load_esm2(device)
    progress("scoring", "Loading PhosFate MLP and scoring candidate pockets.", 5, 5)
    log("[5/5] Loading PhosFate MLP and predicting pockets")
    mlp_model, metadata = load_mlp(model_dir, device)

    predictions = []
    for rank, pocket in enumerate(selected_pockets, start=1):
        sequence_indices = [residue["sequence_index"] for residue in pocket["residues"]]

        if not sequence_indices:
            continue

        vector = embedding_for_residues(
            sequence=sequence,
            residue_indices=sequence_indices,
            model=esm_model,
            alphabet=alphabet,
            batch_converter=batch_converter,
            device=device,
        )
        prediction = predict_one(vector, mlp_model, metadata, device)

        pocket_file = pocket["files"]["atm"]
        ligand = prediction["predictedClassName"].capitalize()
        display_indices = [residue["display_index"] for residue in pocket["residues"]]

        predictions.append(
            {
                "id": f"{job_name}_pocket_{rank}",
                "jobName": job_name,
                "rank": rank,
                "ligand": ligand,
                "pdbId": job_name,
                "chain": "A",
                "site": str(rank),
                "pdbFile": pocket_file.name,
                "pdbPath": relative_path(pocket_file, output_root),
                "generatedPdbPath": relative_path(pdb_path, output_root),
                "residueCount": len(display_indices),
                "residueIndices": display_indices,
                "residueNames": [residue["resname"] for residue in pocket["residues"]],
                "sequenceIndices": sequence_indices,
                "fpocketId": pocket["pid"],
                "fpocketScore": pocket["fpocket_score"],
                "druggability": pocket["druggability"],
                "volume": pocket["volume"],
                "nSpheres": pocket["n_spheres"],
                "anionPreferenceScore": pocket["anion_preference_score"],
                "residueClassCounts": pocket["counts"],
                "predictionScores": prediction["probabilities"],
                "phosFateScores": prediction["probabilities"],
                "predictedClassId": prediction["predictedClassId"],
                "predictedClassName": prediction["predictedClassName"],
                "confidence": prediction["confidence"],
                "hasPhosFateScores": True,
                "hasPdbFile": pocket_file.exists(),
            }
        )

    if not predictions:
        raise RuntimeError("No selected pocket contained residues that could be embedded.")

    return {
        "ok": True,
        "jobName": job_name,
        "sequenceLength": len(sequence),
        "distanceCutoff": args.distance,
        "topK": args.top_k,
        "device": str(device),
        "structure": {
            "pdbPath": relative_path(pdb_path, output_root),
            "meanPlddt": fold_result["mean_plddt"],
            "minPlddt": fold_result["min_plddt"],
            "maxPlddt": fold_result["max_plddt"],
        },
        "model": {
            "path": str(model_dir),
            "featureDim": metadata["feature_dim"],
            "nClasses": metadata["n_classes"],
            "classIdToName": metadata["class_id_to_name"],
        },
        "pockets": predictions,
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Run PhosFate inference")
    parser.add_argument("--sequence", required=True)
    parser.add_argument("--job-name", default="phosfate_job")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--distance", type=float, default=5.0)
    parser.add_argument("--top-k", type=int, default=5)
    return parser.parse_args()


def main() -> int:
    try:
        result = run(parse_args())
        print(json.dumps(result), flush=True)
        return 0
    except Exception as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(error),
                }
            ),
            flush=True,
        )
        log(f"ERROR: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
