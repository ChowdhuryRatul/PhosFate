const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const POCKET_PDBS_DIR = path.join(__dirname, "Pocket_pdbs");

const PROBABILITY_CSV_PATH = path.join(
  POCKET_PDBS_DIR,
  "all_probilities_and_true_lables.csv",
);

let probabilityCache = {
  mtimeMs: null,
  map: new Map(),
};

// New ligand folders
const LIGAND_FOLDERS = {
  Chloride: "Chloride_pockets",
  Nitrate: "Nitrate_pockets",
  Phosphate: "Phosphate_pockets",
  Sulfate: "Sulfate_pockets",
  Carbonate: "Carbonate_pockets",
};

const ALLOWED_LIGANDS = Object.keys(LIGAND_FOLDERS);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("PhosFate workstation API is running");
});

function safeJoin(baseDir, ...paths) {
  const basePath = path.resolve(baseDir);
  const finalPath = path.resolve(path.join(baseDir, ...paths));

  if (!finalPath.startsWith(basePath)) {
    return null;
  }

  return finalPath;
}

function getApiBase(req) {
  if (process.env.PHOSFATE_API_BASE) {
    return process.env.PHOSFATE_API_BASE.replace(/\/$/, "");
  }

  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function normalizeLigand(ligand) {
  const value = String(ligand || "").toLowerCase();

  if (value === "chloride" || value === "cl") return "Chloride";
  if (value === "nitrate" || value === "no3") return "Nitrate";
  if (value === "phosphate" || value === "po4") return "Phosphate";
  if (value === "sulfate" || value === "so4") return "Sulfate";
  if (value === "carbonate" || value === "co3") return "Carbonate";

  return ligand;
}

function ligandFolderPath(ligand) {
  const folderName = LIGAND_FOLDERS[ligand];

  if (!folderName) {
    return null;
  }

  return safeJoin(POCKET_PDBS_DIR, folderName);
}

function parseResidueIndicesFromText(text) {
  return text
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : value;
    });
}

function readResidueIndices(residueFilePath) {
  if (!residueFilePath || !fs.existsSync(residueFilePath)) {
    return [];
  }

  try {
    const text = fs.readFileSync(residueFilePath, "utf8");
    return parseResidueIndicesFromText(text);
  } catch {
    return [];
  }
}

function parseSitePdbFile(file) {
  const match = file.match(/^(.+)_chain-([A-Za-z0-9]+)_site-(\d+)\.pdb$/);

  if (!match) {
    return null;
  }

  return {
    pdbId: match[1].toUpperCase(),
    chain: match[2],
    site: match[3],
  };
}

function walkFiles(dir) {
  if (!dir || !fs.existsSync(dir)) {
    return [];
  }

  const output = [];

  for (const item of fs.readdirSync(dir)) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      output.push(...walkFiles(itemPath));
    } else {
      output.push(itemPath);
    }
  }

  return output;
}

function getRelativePocketPath(fullPath) {
  return path.relative(POCKET_PDBS_DIR, fullPath).replace(/\\/g, "/");
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeProbabilityKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function loadProbabilityMap() {
  if (!fs.existsSync(PROBABILITY_CSV_PATH)) {
    return new Map();
  }

  const stat = fs.statSync(PROBABILITY_CSV_PATH);

  if (
    probabilityCache.mtimeMs === stat.mtimeMs &&
    probabilityCache.map instanceof Map
  ) {
    return probabilityCache.map;
  }

  const csvText = fs.readFileSync(PROBABILITY_CSV_PATH, "utf8");
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    probabilityCache = {
      mtimeMs: stat.mtimeMs,
      map: new Map(),
    };
    return probabilityCache.map;
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const map = new Map();

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index];
    });

    const key = normalizeProbabilityKey(row.pdb_chain_id);

    if (!key) {
      continue;
    }

    map.set(key, {
      Phosphate: toNumber(row.proba_phosphate),
      Sulfate: toNumber(row.proba_sulfate),
      Chloride: toNumber(row.proba_chloride),
      Nitrate: toNumber(row.proba_nitrate),
      Carbonate: toNumber(row.proba_carbonate),
    });
  }

  probabilityCache = {
    mtimeMs: stat.mtimeMs,
    map,
  };

  console.log(`Loaded ${map.size} PhosFate probability rows`);

  return map;
}

function getProbabilityForSite(pdbId, chain) {
  const probabilityMap = loadProbabilityMap();
  const key = normalizeProbabilityKey(`${pdbId}-${chain}`);

  return probabilityMap.get(key) || null;
}

function buildSiteRecord({ req, ligand, pdbFilePath }) {
  const file = path.basename(pdbFilePath);
  const parsed = parseSitePdbFile(file);

  if (!parsed) {
    return null;
  }

  const residueFile = file.replace(".pdb", "_residue_indices.txt");
  const residueFilePath = path.join(path.dirname(pdbFilePath), residueFile);

  const residueIndices = readResidueIndices(residueFilePath);
  const apiBase = getApiBase(req);
  const phosFateScores = getProbabilityForSite(parsed.pdbId, parsed.chain);

  const relativePdbSubPath = getRelativePocketPath(pdbFilePath);
  const relativeResidueSubPath = getRelativePocketPath(residueFilePath);

  const relativePdbPath = `/pockets/${relativePdbSubPath}`;
  const relativeResiduePath = `/pockets/${relativeResidueSubPath}`;

  return {
    id: `${parsed.pdbId}_chain-${parsed.chain}_site-${parsed.site}`,
    ligand,
    pdbId: parsed.pdbId,
    chain: parsed.chain,
    site: parsed.site,

    pdbFile: file,
    residueFile,

    // Absolute URL for StructureViewer
    pdbPath: `${apiBase}${relativePdbPath}`,
    residuePath: `${apiBase}${relativeResiduePath}`,
    pdbUrl: `${apiBase}${relativePdbPath}`,
    residueUrl: `${apiBase}${relativeResiduePath}`,

    relativePdbPath,
    relativeResiduePath,

    residueCount: residueIndices.length,
    residueIndices,

    phosFateScores,
    predictionScores: phosFateScores,
    hasPhosFateScores: Boolean(phosFateScores),

    hasPdbFile: fs.existsSync(pdbFilePath),
    hasResidueFile: fs.existsSync(residueFilePath),
  };
}

function scanLigandSites(req, ligand) {
  const folderPath = ligandFolderPath(ligand);

  if (!folderPath || !fs.existsSync(folderPath)) {
    return {
      ligand,
      projectCount: 0,
      sites: [],
    };
  }

  const pdbFiles = walkFiles(folderPath)
    .filter(
      (filePath) =>
        filePath.endsWith(".pdb") && !filePath.includes("_residue_indices"),
    )
    .sort();

  const sites = pdbFiles
    .map((pdbFilePath) =>
      buildSiteRecord({
        req,
        ligand,
        pdbFilePath,
      }),
    )
    .filter(Boolean);

  const pdbFolders = new Set(sites.map((site) => site.pdbId));

  return {
    ligand,
    projectCount: pdbFolders.size,
    sites,
  };
}

function scanAllSites(req) {
  const allSites = [];
  const ligands = [];

  for (const ligand of ALLOWED_LIGANDS) {
    const result = scanLigandSites(req, ligand);

    allSites.push(...result.sites);

    ligands.push({
      ligand,
      siteCount: result.sites.length,
      projectCount: result.projectCount,
    });
  }

  return {
    ligands,
    sites: allSites,
    totalSites: allSites.length,
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "PhosFate workstation API is running",
    pocketPdbsDir: POCKET_PDBS_DIR,
    probabilityCsv: {
      path: PROBABILITY_CSV_PATH,
      exists: fs.existsSync(PROBABILITY_CSV_PATH),
      rows: loadProbabilityMap().size,
    },
    ligands: ALLOWED_LIGANDS.map((ligand) => ({
      ligand,
      folder: LIGAND_FOLDERS[ligand],
      exists: fs.existsSync(ligandFolderPath(ligand)),
    })),
  });
});

app.get("/api/binding-sites", (req, res) => {
  try {
    const { ligand, pdbId, chain, site } = req.query;

    const manifest = scanAllSites(req);
    let sites = manifest.sites;

    if (ligand) {
      const normalizedLigand = normalizeLigand(ligand);
      sites = sites.filter((item) => item.ligand === normalizedLigand);
    }

    if (pdbId) {
      const normalizedPdbId = String(pdbId).toUpperCase();
      sites = sites.filter(
        (item) => item.pdbId.toUpperCase() === normalizedPdbId,
      );
    }

    if (chain) {
      const normalizedChain = String(chain).toUpperCase();
      sites = sites.filter(
        (item) => item.chain.toUpperCase() === normalizedChain,
      );
    }

    if (site) {
      sites = sites.filter((item) => String(item.site) === String(site));
    }

    res.json({
      ligands: manifest.ligands,
      sites,
      totalSites: sites.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to scan binding sites",
      details: error.message,
    });
  }
});

app.get("/api/binding-site", (req, res) => {
  try {
    const { ligand, pdbId, chain, site } = req.query;

    if (!ligand || !pdbId || !chain) {
      return res.status(400).json({
        error: "Missing ligand, pdbId, or chain",
        example:
          "/api/binding-site?ligand=Carbonate&pdbId=1A2A&chain=A&site=5721",
      });
    }

    const normalizedLigand = normalizeLigand(ligand);
    const normalizedPdbId = String(pdbId).toUpperCase();
    const normalizedChain = String(chain).toUpperCase();

    const result = scanLigandSites(req, normalizedLigand);

    const matchedSite = result.sites.find((item) => {
      const pdbMatches = item.pdbId.toUpperCase() === normalizedPdbId;
      const chainMatches = item.chain.toUpperCase() === normalizedChain;
      const siteMatches = site ? String(item.site) === String(site) : true;

      return pdbMatches && chainMatches && siteMatches;
    });

    if (!matchedSite) {
      return res.status(404).json({
        error: "No matching binding site found",
        query: {
          ligand: normalizedLigand,
          pdbId: normalizedPdbId,
          chain: normalizedChain,
          site: site || null,
        },
        availableSites: result.sites
          .filter((item) => item.pdbId.toUpperCase() === normalizedPdbId)
          .map((item) => ({
            id: item.id,
            chain: item.chain,
            site: item.site,
            pdbFile: item.pdbFile,
          })),
      });
    }

    res.json(matchedSite);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to load binding site",
      details: error.message,
    });
  }
});

app.get("/api/binding-sites/:ligand/:pdbId", (req, res) => {
  try {
    const ligand = normalizeLigand(req.params.ligand);
    const pdbId = String(req.params.pdbId || "").toUpperCase();

    const result = scanLigandSites(req, ligand);

    const sites = result.sites.filter(
      (item) => item.pdbId.toUpperCase() === pdbId,
    );

    if (!sites.length) {
      return res.status(404).json({
        error: "No sites found for this ligand and PDB ID",
        ligand,
        pdbId,
      });
    }

    res.json({
      ligand,
      pdbId,
      totalSites: sites.length,
      sites,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to load PDB folder",
      details: error.message,
    });
  }
});

// Serve PDB and residue txt files
app.get(/^\/pockets\/(.+)$/, (req, res) => {
  const requestedPath = req.params[0];
  const filePath = safeJoin(POCKET_PDBS_DIR, requestedPath);

  if (!filePath) {
    return res.status(400).json({
      error: "Invalid file path",
    });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: "File not found",
      path: requestedPath,
      fullPath: filePath,
    });
  }

  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`PhosFate API running at http://localhost:${PORT}`);
});
