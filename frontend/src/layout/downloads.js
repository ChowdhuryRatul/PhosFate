const SITE_COLUMNS = [
  "id",
  "ligand",
  "pdbId",
  "chain",
  "site",
  "pdbFile",
  "residueFile",
  "residueCount",
  "residueIndices",
];

function escapeCsvField(value) {
  const normalizedValue = Array.isArray(value) ? value.join(" ") : (value ?? "");
  const text = String(normalizedValue);

  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function saveBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function asDownloadPath(path) {
  if (!path) {
    return "";
  }

  return path.startsWith("/") ? path : "/" + path;
}

export function filenameFromPath(path) {
  if (!path) {
    return "";
  }

  return String(path).split("/").pop() || "";
}

function withoutInternalPaths(site) {
  const exportSite = { ...site };

  exportSite.pdbFile = filenameFromPath(site.pdbPath);
  exportSite.residueFile = filenameFromPath(site.residuePath);

  delete exportSite.pdbPath;
  delete exportSite.residuePath;

  return exportSite;
}

export function downloadFile(path) {
  const link = document.createElement("a");
  const downloadPath = asDownloadPath(path);

  link.href = downloadPath;
  link.download = downloadPath.split("/").pop() || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function sitesToCsv(sites) {
  const exportSites = sites.map((site) => withoutInternalPaths(site));

  return [
    SITE_COLUMNS.join(","),
    ...exportSites.map((site) =>
      SITE_COLUMNS.map((column) => escapeCsvField(site[column])).join(","),
    ),
  ].join("\n");
}

export function downloadSitesCsv(sites, filename) {
  saveBlob(filename, sitesToCsv(sites), "text/csv;charset=utf-8");
}

export function downloadSitesJson(sites, filename) {
  const content = JSON.stringify(
    sites.map((site) => withoutInternalPaths(site)),
    null,
    2,
  );
  saveBlob(filename, content, "application/json;charset=utf-8");
}
