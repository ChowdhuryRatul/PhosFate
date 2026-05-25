import { useEffect, useMemo, useState } from "react";

const SELECTED_SITE_KEY = "phosfate:selected-binding-site";
export const AVAILABLE_LIGANDS = new Set(["Phosphate", "Chloride", "Nitrate"]);

function onlyAvailableLigands(data) {
  const sites = (data.sites ?? []).filter((site) =>
    AVAILABLE_LIGANDS.has(site.ligand),
  );

  return {
    ...data,
    ligands: (data.ligands ?? []).filter((ligand) =>
      AVAILABLE_LIGANDS.has(ligand.ligand),
    ),
    sites,
    totalSites: sites.length,
  };
}

export function useBindingSites() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/data/binding-sites-manifest.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load binding-site manifest");
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setManifest(onlyAvailableLigands(data));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sites = useMemo(() => manifest?.sites ?? [], [manifest]);

  return {
    error,
    isLoading: !manifest && !error,
    manifest,
    sites,
  };
}

export function getStoredBindingSite() {
  try {
    const rawSite = window.sessionStorage.getItem(SELECTED_SITE_KEY);
    return rawSite ? JSON.parse(rawSite) : null;
  } catch {
    return null;
  }
}

export function storeBindingSite(site) {
  window.sessionStorage.setItem(SELECTED_SITE_KEY, JSON.stringify(site));
}
