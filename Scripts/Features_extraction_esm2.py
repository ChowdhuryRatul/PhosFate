# Site Extraction 
""" 
How to Use this python Script:

Usage: python extract_binding_site_features_esm2_v2.py --output_folder_location Features_extraction --ion_symbols PO4 --ion_names Phosphate --distance 4.7 [other options]"

If you want to change the location of the PDB files, you can do this: Edit the variable "pdbs_folder_address"

When to run this script?
Before you run this script, you need to download the PDB files from the RCSB database and perform the filtering steps.

"""

from Bio import PDB
import os
import esm
import torch
import pickle
import argparse
import requests
from Bio.PDB import PDBParser, PDBIO
from pathlib import Path
from transformers import AutoTokenizer, AutoModel, pipeline
import re
import numpy as np
import pandas as pd
from tqdm.auto import tqdm
import sys
sys.path.append("../utils")
from phosbind_utils import *

def create_parser():
    parser = argparse.ArgumentParser(
        description="Downnload, and filter the PDB files from the RCBS PDB database"
        )
    parser.add_argument(
        "--ion_symbols",
        type=str,
        required=False,
        help="In case of multi-ion mode, specify the list of ions you want to plot. Default is just K.",
        )
    parser.add_argument(
        "--input_file",
        type=str,
        default=None,
        required=False,
        help="Load the arguments from this input file",
        )
    parser.add_argument(
        "--ion_names",
        type=str,
        required=True,
        help="Specify ion name in a list. Default is just Potassium",
        )
    parser.add_argument(
        "--output_folder_location",
        type=str,
        required=True,
        help="Specify location where to save the PDBs folder",
        )
    parser.add_argument(
        "--distance",
        type=float,
        required=True,
        help="Specify the cutoff distance",
        )
    parser.add_argument(
        "--logfile",
        type=str,
        required=False,
        default="logfile.log",
        help="Specofy which step to start from",
        )
    return parser
    
def parse_arguments_from_file(file_path):
    with open(file_path, 'r') as file:
        lines = file.readlines()

    arguments = [line.strip().split() for line in lines]
    return sum(arguments, [])  # flatten the list

if __name__ == "__main__":
    parser = create_parser()
    args = parser.parse_args()
    if all(value is None for value in vars(args).values()):
        print("Usage: python extract_binding_site_features_esm2_v2.py --output_folder_location Features_extraction --ion_symbols PO4 --ion_names Phosphate --distance 4.7 [other options]")
        exit()
    if args.input_file:
        file_arguments = parse_arguments_from_file(args.input_file)
        # Override default values with arguments from the file
        for arg in vars(args):
            file_value = [file_arguments[i + 1] for i, val in enumerate(file_arguments) if val == f'--{arg}']
            if file_value:
                setattr(args, arg, file_value[0])
    required_arguments = ["output_folder_location", "ion_symbols", "ion_names", "distance"]
    for argument in required_arguments:
        if argument not in vars(parser.parse_args()) or not vars(parser.parse_args()).get(argument):
            raise ValueError(f"--{argument} is a required argument. Please provide it in the text file.")
    #X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-

    ion_names_in_a_list = []
    ion_symbols_in_a_list = []
    for ion_name,ion_symbol in zip(args.ion_names.split(","),args.ion_symbols.split(",")):
        ion_names_in_a_list.append(ion_name)
        ion_symbols_in_a_list.append(ion_symbol)

    # Load ESM-2 model
    esm_model, alphabet = esm.pretrained.esm2_t33_650M_UR50D()
    batch_converter = alphabet.get_batch_converter()
    esm_model.eval()  # disables dropout for deterministic results

    for ion_name,ion_symbol in zip(ion_names_in_a_list,ion_symbols_in_a_list):
        pdbs_folder_address = f"../Data_new/Ion-Unique-PDBs/{ion_name}-unique-pdbs/"
        list_of_files= [pdbs_folder_address + item for item in os.listdir(pdbs_folder_address)]
        distance = float(args.distance)
        embeddings_output_folder = f"../{args.output_folder_location}/esm2/Distance-{distance}/{ion_name}"
        check_dir(embeddings_output_folder)

        # Initialize storage
        seq_store_global = []
        binding_site_embeddings = []
        binding_site_index = 0
        long_chain_PDBS = []
        sites_with_non_standard_residues = []
        
        # Setup progress log
        progress_tracker_file = f"{embeddings_output_folder}/run_{ion_name}-site-extraction-Progress-tracker_esm2"
        with open(progress_tracker_file, 'w') as file:
            print(f"Starting my work", file=file)
        
        # Process each PDB
        for filenumber,filename in enumerate(list_of_files, start=1):
            with open(progress_tracker_file, 'a') as file:
                print(f"working on {filenumber}/{len(list_of_files)}- {filename}", file=file)

            # Parse structure
            parser = PDBParser(QUIET=True)
            structure = parser.get_structure("protein", filename)
            first_model = next(structure.get_models())

            # Collect sequences and ion atoms
            seq_store_local = []
            list_of_ion_atoms = []
            pdb_id = Path(filename).stem

            for chain in first_model:
                chain_id = chain.get_id()
                seq_label = f"{pdb_id}-chain-{chain_id}"
                sequence = get_chain_sequence(chain)
                seq_store_global.append([seq_label, sequence])
                seq_store_local.append([seq_label, sequence])

                for residue in chain:
                    if residue.get_resname() == ion_symbol:
                        ion_info = ion_classification.get(ion_symbol, {})
                        ion_type = ion_info.get("type", "single atom")
                        main_atom = ion_info.get("main_atom", None)  
                            
                        for atom in residue:
                            if ion_type == "molecule":
                                print(f"The {ion_symbol} is molecule")
                                if atom.get_id() == main_atom:
                                    list_of_ion_atoms.append(atom)
                                    print("Found main atom in molecule:", main_atom)
                            else:
                                list_of_ion_atoms.append(atom)
                                print("Found single atom ion:", main_atom)             
            
            # For each ion atom, find binding-site residues and extract embeddings
            for ref_atom in list_of_ion_atoms:
                binding_site_index += 1
            
                # Get nearby atoms/residues
                atoms, closest_residues, indexes_for_averaging = (get_closest_all_atoms_and_residues_and_indices_v3(first_model, ref_atom, distance))
                coordinating_number_atom = len(atoms)
                
                # Keep only standard amino acids + exactly one target ion
                unique_closest_residues = list(set(closest_residues))
                target_ion_count = 1   # current reference ion
                other_hetero = []
                for residue in unique_closest_residues:
                    if is_aa(residue, standard=True):
                        continue
                    resname = residue.get_resname().strip()
                    hetfield = residue.get_id()[0]
                    
                    if hetfield == "W":
                        continue
                    if resname == ion_symbol:
                        target_ion_count += 1
                    else:
                        other_hetero.append(resname)
                if target_ion_count > 1:
                    print(f"Skipped {pdb_id}: multiple {ion_symbol} ions nearby")
                    binding_site_index -= 1
                    continue
                if other_hetero:
                    print(f"Skipped {pdb_id}: other hetero residues {set(other_hetero)}")
                    binding_site_index -= 1
                    continue
                
                # Warn if no residues found
                if not closest_residues:
                    print(f"No residues within {distance}Å of site-{binding_site_index}")

                # Iterate over each chain's sequence for embedding
                for seq_label, sequence in seq_store_local:
                    cid = seq_label.split("-chain-")[1]
                    coords = indexes_for_averaging.get(cid, [])
                    coordinating_number_residues = len(coords)

                    # Skip very long chains
                    if len(sequence) >= 1024:
                        long_chain_PDBS.append(seq_label)
                        continue
                    
                    # Extract per-residue embeddings
                    tensors = get_set_of_embeddings_at_binding_site_esm(esm_model, alphabet, batch_converter, [seq_label, sequence], coords)
                    if not tensors:
                        continue

                    site_residues_tensor_embeddings = torch.stack(tensors, dim=0)
                    averaged_tensor_embedding = site_residues_tensor_embeddings.mean(dim=0)

                    # Record the site
                    binding_site_embeddings.append([f"site-{binding_site_index}", structure.header.get("name", pdb_id), f"{structure.header.get('idcode', pdb_id)}-{cid}", coordinating_number_atom, coordinating_number_residues, averaged_tensor_embedding, site_residues_tensor_embeddings])

                # Checkpoint every 300 sites
                if binding_site_index % 300 == 0:
                    chkpt = (f"{embeddings_output_folder}/{ion_name}BindingSiteEmbeddings-Distance{distance}angstroms-Upto{binding_site_index}-files.restart.pkl")
                    with open(chkpt, "wb") as chk_f:
                        pickle.dump(binding_site_embeddings, chk_f)
                        print(f"Checkpoint saved at: {chkpt}")
                
                    # Remove previous chunk if exists
                    prev_idx = binding_site_index - 300
                    if prev_idx > 0:
                        prev_chkpt = (f"{embeddings_output_folder}/{ion_name}BindingSiteEmbeddings-Distance{distance}angstroms-Upto{prev_idx}-files.restart.pkl")
                        if os.path.exists(prev_chkpt):
                            os.remove(prev_chkpt)
                            print(f"Previous checkpoint deleted: {prev_chkpt}")
                        else:
                            print(f"No previous checkpoint found at: {prev_chkpt}")

        # Final dump to pickle
        final_pkl = (f"{embeddings_output_folder}/{ion_name}BindingSiteEmbeddings-Distance{distance}angstroms-complete.pkl")
        with open(final_pkl, "wb") as f:
            pickle.dump(binding_site_embeddings, f)

        # Build DataFrame and CSV
        columns = ["site_id", "protein_name", "pdb_chain_id","coordinating_atoms", "coordinating_residues","avg_embedding", "residue_embeddings"]
        df = pd.DataFrame(binding_site_embeddings, columns=columns)

        # Serialize tensor fields to strings
        df["avg_embedding"] = df["avg_embedding"].apply(lambda x: ",".join(map(str, x.tolist())) if hasattr(x, "tolist") else str(x))
        df["residue_embeddings"] = df["residue_embeddings"].apply(str)
        df["coordinating_atoms"] = df["coordinating_atoms"].apply(str)
        df["coordinating_residues"] = df["coordinating_residues"].apply(str)

        csv_path = f"{embeddings_output_folder}/binding_site_embeddings.csv"
        df.to_csv(csv_path, index=False)

        with open(progress_tracker_file, 'a') as file:
            # Print a line to the file
            print(f"The sequences skipped due to excessive sequence length are: \n", file=file)
            print(long_chain_PDBS, file=file)
            print(f"The {ion_name} ion is completed", file=file)
