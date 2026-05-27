import { useEffect, useRef, useState } from "react";

function formatPocketDisplayName(value) {
  const filename = String(value ?? "")
    .split("/")
    .pop();

  const match = filename.match(
    /^([A-Za-z0-9]+)_chain-([A-Za-z0-0]+)_site-([0-9]+)\.pdb$/i,
  );

  if (!match) {
    return filename.replace(/\.pdbs$/i, "");
  }
  const [, pdbId, chain, site] = match;

  return `${pdbId.toUpperCase()}_Chain-${chain.toUpperCase()} (Site: ${site})`;
}

function resolveStructureUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  return new URL(normalizedPath, window.location.origin).href;
}

// Label anion
const ANION_RESNAMES = new Set([
  "PO4",
  "SO4",
  "NO3",
  "CO3",
  "CL",
  "CLA",
  "PHO",
  "SUL",
  "NIT",
  "CAR",
]);

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function averagePosition(atoms) {
  const total = atoms.reduce(
    (sum, atom) => ({
      x: sum.x + atom.x,
      y: sum.y + atom.y,
      z: sum.z + atom.z,
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / atoms.length,
    y: total.y / atoms.length,
    z: total.z / atoms.length,
  };
}

function getResidueKey(atom) {
  return `${atom.chain ?? ""}:${atom.resn}:${atom.resi}`;
}

function addPocketLabels(viewer, showResidueLabels = false) {
  const model = viewer.getModel();
  if (!model) return;

  const atoms = model.selectedAtoms({});

  const residues = new Map();
  const anions = new Map();

  atoms.forEach((atom) => {
    const resn = String(atom.resn ?? "").trim();
    const resi = atom.resi;
    const chain = atom.chain ?? "";

    if (!resn || resi == null) return;

    const key = `${chain}:${resn}:${resi}`;

    if (atom.hetflag) {
      if (!anions.has(key)) anions.set(key, []);
      anions.get(key).push(atom);
    } else {
      if (!residues.has(key)) residues.set(key, []);
      residues.get(key).push(atom);
    }
  });

  anions.forEach((anionAtoms) => {
    const atom = anionAtoms[0];
    const center = averagePosition(anionAtoms);

    viewer.addLabel(atom.resn, {
      position: center,
      fontSize: 14,
      fontColor: "black",
      backgroundColor: "yellow",
      backgroundOpacity: 0.85,
      inFront: true,
    });
  });

  if (showResidueLabels) {
    residues.forEach((residueAtoms) => {
      const atom = residueAtoms[0];
      const center = averagePosition(residueAtoms);

      viewer.addLabel(`${atom.resn} ${atom.resi}`, {
        position: center,
        fontSize: 11,
        fontColor: "black",
        backgroundColor: "white",
        backgroundOpacity: 0.75,
        inFront: true,
      });
    });
  }

  viewer.render();
}
//
function isPdbText(text) {
  return text
    .split("\n")
    .some(
      (line) =>
        line.startsWith("ATOM") ||
        line.startsWith("HETATM") ||
        line.startsWith("HEADER") ||
        line.startsWith("TITLE") ||
        line.startsWith("MODEL") ||
        line.startsWith("COMPND") ||
        line.startsWith("REMARK"),
    );
}

async function readPdbResponse(response, sourceLabel) {
  if (!response?.ok) {
    throw new Error(
      sourceLabel + " returned HTTP " + (response?.status ?? "0"),
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const pdbText = await response.text();

  if (contentType.includes("text/html") || !isPdbText(pdbText)) {
    throw new Error(sourceLabel + " did not return PDB content");
  }

  return pdbText;
}

function applyDefaultStyle(viewer) {
  viewer.setBackgroundColor("white");
  viewer.setStyle(
    {},
    {
      sphere: { scale: 0.18, colorscheme: "Jmol" },
      stick: { radius: 0.08, colorscheme: "Jmol" },
    },
  );
  viewer.addStyle(
    { hetflag: true },
    {
      sphere: { scale: 0.34 },
      stick: { radius: 0.22 },
    },
  );
  viewer.resize();
  viewer.zoomTo();
  viewer.render();
}

export default function StructureViewer({
  label,
  pdbId,
  structurePath,
  showResidueLabels = false,
}) {
  const rootRef = useRef(null);
  const viewerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Preparing 3D viewer...");
  const [error, setError] = useState("");

  function handleZoom(factor) {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    viewer.zoom(factor);
    viewer.render();
  }

  useEffect(() => {
    let cancelled = false;

    async function createViewer() {
      if (!rootRef.current || viewerRef.current) {
        return;
      }

      try {
        const $3Dmol = await import("3dmol");
        if (cancelled) {
          return;
        }

        viewerRef.current = $3Dmol.createViewer(rootRef.current, {
          backgroundColor: "white",
          antialias: true,
          preserveDrawingBuffer: true,
        });
        setIsReady(true);
        setStatus("");
      } catch (createError) {
        if (!cancelled) {
          setError(createError.message);
          setStatus("");
        }
      }
    }

    createViewer();

    return () => {
      cancelled = true;
      viewerRef.current?.clear();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStructure() {
      const viewer = viewerRef.current;
      const structureUrl = resolveStructureUrl(structurePath);

      if (!isReady || !viewer || (!structureUrl && !pdbId)) {
        return;
      }

      try {
        setError("");
        setStatus("Loading " + (label ?? "structure") + "...");
        viewer.clear();

        let pdbText = "";

        if (structureUrl) {
          const response = await fetch(structureUrl, { method: "GET" });
          try {
            pdbText = await readPdbResponse(response, "Pocket file");
          } catch (localError) {
            if (!pdbId) {
              throw localError;
            }
          }
        }

        if (!pdbText && pdbId) {
          setStatus(
            "Pocket file unavailable locally. Loading " +
              pdbId +
              " from RCSB...",
          );
          const rcsbResponse = await fetch(
            "https://files.rcsb.org/download/" + pdbId + ".pdb",
          );
          pdbText = await readPdbResponse(rcsbResponse, "RCSB");
        }

        if (!pdbText) {
          throw new Error("Structure file is unavailable: " + structurePath);
        }

        viewer.addModel(pdbText, "pdb");

        if (!cancelled) {
          applyDefaultStyle(viewer);
          addPocketLabels(viewer, showResidueLabels);
          viewer.render();
          setStatus("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || String(loadError));
          setStatus("");
        }
      }
    }

    loadStructure();

    return () => {
      cancelled = true;
    };
  }, [isReady, label, pdbId, structurePath, showResidueLabels]);

  return (
    <div className="structure-viewer">
      <div className="structure-viewer-root" ref={rootRef} />
      <div
        className="structure-viewer-controls"
        role="group"
        aria-label="3D viewer zoom controls"
      >
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => handleZoom(1.2)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => handleZoom(0.8)}
        >
          -
        </button>
      </div>
      {status ? <div className="structure-viewer-status">{status}</div> : null}
      {error ? (
        <div className="structure-viewer-status structure-viewer-status-error">
          The 3D viewer could not load this structure: {error}
        </div>
      ) : null}
    </div>
  );
}
