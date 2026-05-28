import { useEffect, useMemo, useState } from "react";

const SELECTED_SITE_KEY = "phosfate:selected-binding-site";

export const API_BASE =
  import.meta.env.VITE_PHOSFATE_API_BASE ||
  "https://phosfate-api.structf.studio";

export const AVAILABLE_LIGANDS = new Set([
  "Carbonate",
  "Phosphate",
  "Sulfate",
  "Chloride",
  "Nitrate",
]);
// TODO: remove this note once the hosted API includes Sulfate data. The local
// backend reference supports Sulfate, but the current hosted API may not return it.

function normalizeLigandSummary(ligand) {
  return {
    ...ligand,
    recoveredSiteCount: ligand.recoveredSiteCount ?? ligand.siteCount ?? 0,
    recoveredProjectCount:
      ligand.recoveredProjectCount ?? ligand.projectCount ?? 0,
  };
}

function onlyAvailableLigands(data) {
  const sites = (data.sites ?? [])
    .map(normalizeSite)
    .filter((site) => AVAILABLE_LIGANDS.has(site.ligand));

  const ligands = (data.ligands ?? [])
    .filter((ligand) => AVAILABLE_LIGANDS.has(ligand.ligand))
    .map(normalizeLigandSummary);

  return {
    ...data,
    ligands,
    sites,
    totalSites: data.totalSites ?? sites.length,
  };
}

function normalizeSite(site) {
  return {
    ...site,
    residueIndices: site.residueIndices ?? [],

    pdbPath: site.pdbPath || site.pdbUrl || "",
    residuePath: site.residuePath || site.residueUrl || "",

    pdbUrl: site.pdbUrl || site.pdbPath || "",
    residueUrl: site.residueUrl || site.residuePath || "",
  };
}

export function useBindingSites() {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/api/binding-sites`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load binding sites from backend");
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

export async function fetchBindingSite(site) {
  const params = new URLSearchParams({
    ligand: site.ligand,
    pdbId: site.pdbId,
    chain: site.chain,
  });

  if (site.site) {
    params.set("site", site.site);
  }

  const response = await fetch(`${API_BASE}/api/binding-site?${params}`);

  if (!response.ok) {
    throw new Error(
      `Could not fetch ${site.ligand} ${site.pdbId} chain ${site.chain}`,
    );
  }

  const data = await response.json();
  return normalizeSite(data);
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
