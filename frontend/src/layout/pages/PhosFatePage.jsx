import { useMemo, useState } from "react";
import BarChart from "../components/BarChart";
import Header from "../components/Header";
import StructureViewer from "../components/StructureViewer";
import { outputControls } from "../homePageData";
import { getStoredBindingSite, useBindingSites } from "../useBindingSites";

const anionLabels = [
  { ligand: "Phosphate", label: "PO4", variant: "blue" },
  { ligand: "Sulfate", label: "SO4", variant: "blue" },
  { ligand: "Chloride", label: "Cl", variant: "blue" },
  { ligand: "Nitrate", label: "NO3", variant: "blue" },
  { ligand: "Carbonate", label: "CO3", variant: "blue" },
];

function toBarValue(value) {
  const rounded = Math.max(0, Math.min(1, value));
  return [rounded.toFixed(2), Math.round(rounded * 100) + "%"];
}

function normalizeAnionKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readScoreFromMap(scoreMap, ligand, label) {
  if (!scoreMap || typeof scoreMap !== "object") {
    return null;
  }

  const acceptedKeys = new Set(
    [ligand, label, ligand?.toLowerCase(), label?.toLowerCase()].map(
      normalizeAnionKey,
    ),
  );
  const match = Object.entries(scoreMap).find(([key]) =>
    acceptedKeys.has(normalizeAnionKey(key)),
  );

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function findScoreMap(site, candidates) {
  const readPath = (source, path) =>
    path.split(".").reduce((value, key) => value?.[key], source);

  return candidates
    .map((key) => readPath(site, key))
    .find((value) => value && typeof value === "object");
}

function buildBarsFromScores(scoreMap, variant) {
  if (!scoreMap) {
    return null;
  }

  const values = anionLabels.map(({ ligand, label }) =>
    readScoreFromMap(scoreMap, ligand, label),
  );

  if (values.every((value) => value === null)) {
    return null;
  }

  return anionLabels.map(({ label }, index) => {
    const value = values[index] ?? 0;
    const [score, height] = toBarValue(value);

    return [label, score, height, value > 0 ? variant : ""];
  });
}

function buildPdbAnnotationBars(site) {
  const scoreMap = findScoreMap(site, [
    "pdbAnnotationScores",
    "pdb_annotation_scores",
    "pdbScores",
    "annotationScores",
    "scores.pdbAnnotation",
    "scores.pdb",
  ]);
  const scoredBars = buildBarsFromScores(scoreMap, "blue");

  if (scoredBars) {
    return scoredBars;
  }

  return anionLabels.map(({ ligand, label, variant }) => {
    const value = site?.ligand === ligand ? 1 : 0;
    const [score, height] = toBarValue(value);

    return [label, score, height, value ? variant : ""];
  });
}

function buildPhosFatePredictionBars(site) {
  const scoreMap = findScoreMap(site, [
    "phosFateScores",
    "phosfateScores",
    "phosfate_scores",
    "reannotationScores",
    "reAnnotationScores",
    "predictionScores",
    "scores.phosFate",
    "scores.phosfate",
    "scores.prediction",
  ]);

  return buildBarsFromScores(scoreMap, "teal");
}

export default function PhosFatePage({ setPage }) {
  const { manifest, sites } = useBindingSites();
  const [storedSite, setStoredSite] = useState(() => getStoredBindingSite());
  const [queryOverride, setQueryOverride] = useState(null);

  const selectedSite = useMemo(
    () => {
      const hydratedStoredSite =
        storedSite && sites.find((site) => site.id === storedSite.id);

      return (
        hydratedStoredSite ??
        storedSite ??
        sites.find((site) => site.ligand === "Phosphate") ??
        sites[0] ??
        null
      );
    },
    [sites, storedSite],
  );

  const query = useMemo(() => {
    if (queryOverride !== null) {
      return queryOverride;
    }

    if (!selectedSite) {
      return "";
    }

    return [
      selectedSite.pdbId,
      "chain " + selectedSite.chain,
      selectedSite.ligand,
      "site " + selectedSite.site,
      "residues " + selectedSite.residueIndices.join(", "),
    ].join(" · ");
  }, [queryOverride, selectedSite]);

  const ligandSummary = useMemo(
    () => manifest?.ligands?.find((item) => item.ligand === selectedSite?.ligand),
    [manifest, selectedSite],
  );
  const pdbAnnotationBars = useMemo(
    () => buildPdbAnnotationBars(selectedSite),
    [selectedSite],
  );
  const phosFatePredictionBars = useMemo(
    () => buildPhosFatePredictionBars(selectedSite),
    [selectedSite],
  );

  return (
    <>
      <Header page="phosfate" setPage={setPage} />
      <main>
        <section>
          <div className="section-head">
            <span className="badge">INPUT</span>
            <div>
              <h2>PhosFate pocket query</h2>
              <div className="sub">
                Enter a PDB ID, chain, residue range, or upload a pocket file.
                PhosFate compares the crystallographic anion annotation with
                re-annotated binding probabilities across five anions.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="search-top">
              <div>
                <h3>Search or upload a pocket</h3>
                <p>
                  Example: 1TQN chain A pocket around PO₄³⁻. The query loads
                  the interactive 3D structure and predicted anion preference
                  distribution.
                </p>
              </div>
              <button type="button">Upload PDB</button>
            </div>
            <div className="query-field">
              <textarea
                onChange={(event) => setQueryOverride(event.target.value)}
                placeholder="Enter PDB ID, chain, ligand, residue list, or paste pocket coordinates..."
                value={query}
              />
              <div className="querybar">
                <div className="label">
                  SEARCH QUERY <strong>PhosFate</strong>
                </div>
                <div className="buttons">
                  <button
                    type="button"
                    onClick={() => {
                      setStoredSite(
                        sites.find((site) => site.ligand === "Phosphate") ??
                          selectedSite,
                      );
                      setQueryOverride(null);
                    }}
                  >
                    Example pocket
                  </button>
                  <button type="button" onClick={() => setQueryOverride("")}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
            <div className="stats">
              <div className="stat">
                RECOVERED SITES<strong>{manifest?.totalSites ?? "..."}</strong>
              </div>
              <div className="stat">
                ACTIVE ANION<strong>{selectedSite?.ligand ?? "..."}</strong>
              </div>
              <div className="stat">
                MODE<strong>Use recovered data</strong>
              </div>
            </div>
          </div>

          <button className="primary" type="button">
            Run PhosFate
          </button>

          <div className="card">
            <p className="filter-title">
              <span className="dot" /> Output controls
            </p>
            <div className="filters">
              {outputControls.map((control, index) => (
                <label className="check" key={control}>
                  <input type="checkbox" defaultChecked={index < 3} /> {control}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="section-head">
            <span className="badge">OUTPUT</span>
            <div>
              <h2>Queried pocket</h2>
              <div className="sub">
                3D structure, original PDB anion label, and PhosFate
                probability-based re-annotation.
              </div>
            </div>
          </div>

          <div className="viewer-card">
            <div className="viewer-top">
              <div>Sequence of</div>
              <div>{selectedSite?.pdbId ?? "..."}</div>
              <div>
                {selectedSite
                  ? selectedSite.ligand + " binding site " + selectedSite.site
                  : "Recovered Distance-5.0 pocket"}
              </div>
              <div>Chain {selectedSite?.chain ?? "..."}</div>
            </div>
            <div className="seq">
              {selectedSite
                ? "Residue indices: " +
                  selectedSite.residueIndices.slice(0, 28).join(", ")
                : "Loading recovered residue indices..."}
              <br />
              {selectedSite
                ? selectedSite.pdbPath
                : "data/Distance-5.0/<ligand>/<pdb>/<site>.pdb"}
            </div>
            <StructureViewer
              label={selectedSite?.id}
              pdbId={selectedSite?.pdbId}
              structurePath={selectedSite?.pdbPath}
            />
          </div>

          {selectedSite ? (
            <div className="site-detail-card">
              <div>
                <span>Selected recovered pocket</span>
                <strong>{selectedSite.id}</strong>
              </div>
              <dl>
                <div>
                  <dt>Ligand</dt>
                  <dd>{selectedSite.ligand}</dd>
                </div>
                <div>
                  <dt>PDB folder</dt>
                  <dd>{selectedSite.pdbId}</dd>
                </div>
                <div>
                  <dt>Residues</dt>
                  <dd>{selectedSite.residueCount}</dd>
                </div>
                <div>
                  <dt>Ligand set</dt>
                  <dd>{ligandSummary?.siteCount ?? 0} usable sites</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <BarChart
            title="PDB annotation"
            subtitle="crystallographic ligand label"
            bars={pdbAnnotationBars}
          />
          <BarChart
            title="PhosFate re-annotation"
            subtitle="predicted binding probability distribution"
            bars={phosFatePredictionBars}
            emptyMessage="No PhosFate score table is present for this pocket yet."
          />

          <div className="download">
            <div className="download-row">
              <select defaultValue="Download report as CSV">
                <option>Download report as CSV</option>
                <option>Download JSON</option>
                <option>{selectedSite?.pdbPath ?? "Download pocket PDB"}</option>
                <option>
                  {selectedSite?.residuePath ?? "Download residue indices"}
                </option>
              </select>
              <button className="gray" type="button">
                Download
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
