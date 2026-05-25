import { useEffect, useRef, useState } from "react";

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

export default function StructureViewer({ label, pdbId, structurePath }) {
  const rootRef = useRef(null);
  const viewerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Preparing 3D viewer...");
  const [error, setError] = useState("");

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

        const response = structureUrl
          ? await fetch(structureUrl, { method: "GET" })
          : null;

        if (response?.ok) {
          const pdbText = await response.text();
          viewer.addModel(pdbText, "pdb");
        } else if (pdbId) {
          setStatus("Pocket file unavailable locally. Loading " + pdbId + " from RCSB...");
          const rcsbResponse = await fetch(
            "https://files.rcsb.org/download/" + pdbId + ".pdb",
          );
          if (!rcsbResponse.ok) {
            throw new Error("RCSB returned HTTP " + rcsbResponse.status);
          }
          const pdbText = await rcsbResponse.text();
          viewer.addModel(pdbText, "pdb");
        } else {
          throw new Error("Structure file is unavailable: " + structurePath);
        }

        if (!cancelled) {
          applyDefaultStyle(viewer);
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
  }, [isReady, label, pdbId, structurePath]);

  return (
    <div className="structure-viewer">
      <div className="structure-viewer-root" ref={rootRef} />
      {status ? <div className="structure-viewer-status">{status}</div> : null}
      {error ? (
        <div className="structure-viewer-status structure-viewer-status-error">
          The 3D viewer could not load this structure: {error}
        </div>
      ) : null}
    </div>
  );
}
