// What current backend look like
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const DISTANCE_DIR = path.join(DATA_DIR, "Distance-5.0");

const ALLOWED_LIGANDS = ["Chloride", "Nitrate", "Phosphate", "Sulfate"];

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

  return ligand;
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
    pdbId: match[1],
    chain: match[2],
    site: match[3],
  };
}

function buildSiteRecord({ req, ligand, pdbId, file }) {
  const parsed = parseSitePdbFile(file);

  if (!parsed) {
    return null;
  }

  const residueFile = file.replace(".pdb", "_residue_indices.txt");

  const pdbFilePath = safeJoin(DISTANCE_DIR, ligand, pdbId, file);
  const residueFilePath = safeJoin(DISTANCE_DIR, ligand, pdbId, residueFile);

  const residueIndices = readResidueIndices(residueFilePath);
  const apiBase = getApiBase(req);

  const relativePdbPath = `/data/Distance-5.0/${ligand}/${pdbId}/${file}`;
  const relativeResiduePath = `/data/Distance-5.0/${ligand}/${pdbId}/${residueFile}`;

  return {
    id: `${pdbId}_chain-${parsed.chain}_site-${parsed.site}`,
    ligand,
    pdbId,
    chain: parsed.chain,
    site: parsed.site,

    pdbFile: file,
    residueFile,

    // absolute paths so StructureViewer fetches from API, not frontend origin
    pdbPath: `${apiBase}${relativePdbPath}`,
    residuePath: `${apiBase}${relativeResiduePath}`,
    pdbUrl: `${apiBase}${relativePdbPath}`,
    residueUrl: `${apiBase}${relativeResiduePath}`,

    // relative paths
    relativePdbPath,
    relativeResiduePath,

    residueCount: residueIndices.length,
    residueIndices,

    hasPdbFile: Boolean(pdbFilePath && fs.existsSync(pdbFilePath)),
    hasResidueFile: Boolean(residueFilePath && fs.existsSync(residueFilePath)),
  };
}

function scanAllSites(req) {
  const allSites = [];
  const ligandSummaries = [];

  for (const ligand of ALLOWED_LIGANDS) {
    const ligandDir = safeJoin(DISTANCE_DIR, ligand);

    if (!ligandDir || !fs.existsSync(ligandDir)) {
      ligandSummaries.push({
        ligand,
        siteCount: 0,
        projectCount: 0,
      });
      continue;
    }

    const pdbFolders = fs
      .readdirSync(ligandDir)
      .filter((item) => {
        const itemPath = safeJoin(ligandDir, item);
        return (
          itemPath &&
          fs.existsSync(itemPath) &&
          fs.statSync(itemPath).isDirectory()
        );
      })
      .sort();

    let ligandSiteCount = 0;

    for (const pdbId of pdbFolders) {
      const pdbFolder = safeJoin(ligandDir, pdbId);

      if (!pdbFolder) continue;

      const files = fs
        .readdirSync(pdbFolder)
        .filter(
          (file) => file.endsWith(".pdb") && !file.includes("_residue_indices"),
        )
        .sort();

      for (const file of files) {
        const siteRecord = buildSiteRecord({
          req,
          ligand,
          pdbId,
          file,
        });

        if (siteRecord) {
          allSites.push(siteRecord);
          ligandSiteCount += 1;
        }
      }
    }

    ligandSummaries.push({
      ligand,
      siteCount: ligandSiteCount,
      projectCount: pdbFolders.length,
    });
  }

  return {
    ligands: ligandSummaries,
    sites: allSites,
    totalSites: allSites.length,
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "PhosFate workstation API is running",
    dataDir: DATA_DIR,
    distanceDir: DISTANCE_DIR,
  });
});

app.get("/api/binding-sites", (req, res) => {
  try {
    const { ligand, pdbId, chain, site } = req.query;

    let manifest = scanAllSites(req);
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

// selected-site endpoint
app.get("/api/binding-site", (req, res) => {
  try {
    const { ligand, pdbId, chain, site } = req.query;

    if (!ligand || !pdbId || !chain) {
      return res.status(400).json({
        error: "Missing ligand, pdbId, or chain",
        example:
          "/api/binding-site?ligand=Chloride&pdbId=1A2A&chain=A&site=5721",
      });
    }

    const normalizedLigand = normalizeLigand(ligand);
    const normalizedPdbId = String(pdbId).toUpperCase();
    const normalizedChain = String(chain).toUpperCase();

    const pdbFolder = safeJoin(DISTANCE_DIR, normalizedLigand, normalizedPdbId);

    if (!pdbFolder || !fs.existsSync(pdbFolder)) {
      return res.status(404).json({
        error: "PDB folder not found",
        ligand: normalizedLigand,
        pdbId: normalizedPdbId,
        expectedFolder: pdbFolder,
      });
    }

    const files = fs
      .readdirSync(pdbFolder)
      .filter(
        (file) => file.endsWith(".pdb") && !file.includes("_residue_indices"),
      );

    const matchedFile = files.find((file) => {
      const parsed = parseSitePdbFile(file);

      if (!parsed) {
        return false;
      }

      const chainMatches =
        String(parsed.chain).toUpperCase() === normalizedChain;

      const siteMatches = site ? String(parsed.site) === String(site) : true;

      return chainMatches && siteMatches;
    });

    if (!matchedFile) {
      return res.status(404).json({
        error: "No matching binding site found",
        query: {
          ligand: normalizedLigand,
          pdbId: normalizedPdbId,
          chain: normalizedChain,
          site: site || null,
        },
        availableSites: files
          .map((file) => parseSitePdbFile(file))
          .filter(Boolean),
      });
    }

    const siteRecord = buildSiteRecord({
      req,
      ligand: normalizedLigand,
      pdbId: normalizedPdbId,
      file: matchedFile,
    });

    res.json(siteRecord);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to load binding site",
      details: error.message,
    });
  }
});

// all sites for one ligand + PDB folder
app.get("/api/binding-sites/:ligand/:pdbId", (req, res) => {
  try {
    const ligand = normalizeLigand(req.params.ligand);
    const pdbId = String(req.params.pdbId || "").toUpperCase();

    const pdbFolder = safeJoin(DISTANCE_DIR, ligand, pdbId);

    if (!pdbFolder || !fs.existsSync(pdbFolder)) {
      return res.status(404).json({
        error: "PDB folder not found",
        ligand,
        pdbId,
      });
    }

    const files = fs
      .readdirSync(pdbFolder)
      .filter(
        (file) => file.endsWith(".pdb") && !file.includes("_residue_indices"),
      )
      .sort();

    const sites = files
      .map((file) =>
        buildSiteRecord({
          req,
          ligand,
          pdbId,
          file,
        }),
      )
      .filter(Boolean);

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

// Serve actual PDB and residue txt files
app.get(/^\/data\/(.+)$/, (req, res) => {
  const requestedPath = req.params[0];
  const filePath = safeJoin(DATA_DIR, requestedPath);

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
