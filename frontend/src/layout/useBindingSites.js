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

function buildBindingSitesUrl({
  query = "",
  ligands = [],
  page = 0,
  pageSize = 25,
  fields = "",
} = {}) {
  const params = new URLSearchParams();
  const wantsAll = pageSize === "all";

  params.set("limit", String(pageSize));
  params.set("offset", wantsAll ? "0" : String(Math.max(0, page) * pageSize));

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  if (ligands.length) {
    params.set("ligand", ligands.join(","));
  }

  if (fields) {
    params.set("fields", fields);
  }

  return `${API_BASE}/api/binding-sites?${params}`;
}

export function useBindingSites(options = {}) {
  const {
    query = "",
    ligands = [],
    page = 0,
    pageSize = 25,
  } = options;
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");
  const ligandsKey = useMemo(() => ligands.join(","), [ligands]);
  const requestUrl = useMemo(
    () =>
      buildBindingSitesUrl({
        query,
        ligands: ligandsKey ? ligandsKey.split(",") : [],
        page,
        pageSize,
      }),
    [ligandsKey, page, pageSize, query],
  );

  useEffect(() => {
    let cancelled = false;

    fetch(requestUrl)
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
  }, [requestUrl]);

  const sites = useMemo(() => manifest?.sites ?? [], [manifest]);

  return {
    error,
    isLoading: !manifest && !error,
    manifest,
    sites,
    totalSites: manifest?.totalSites ?? 0,
  };
}

export async function fetchBindingSitePaths({ query = "", ligands = [] } = {}) {
  const response = await fetch(
    buildBindingSitesUrl({
      query,
      ligands,
      page: 0,
      pageSize: "all",
      fields: "pdbPath",
    }),
  );

  if (!response.ok) {
    throw new Error("Could not load PDB download list from backend");
  }

  const data = await response.json();
  return onlyAvailableLigands(data).sites;
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
