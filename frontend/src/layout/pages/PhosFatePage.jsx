import { useMemo, useState } from "react";
import BarChart from "../components/BarChart";
import Header from "../components/Header";
import StructureViewer from "../components/StructureViewer";
import {
  downloadFile,
  downloadSitesCsv,
  downloadSitesJson,
  filenameFromPath,
} from "../downloads";
// import { outputControls } from "../homePageData";
import {
  API_BASE,
  getStoredBindingSite,
  useBindingSites,
} from "../useBindingSites";
import {
  createJob,
  downloadJobArtifact,
  fetchAccountSession,
  getJob,
  supportsSharedAccountCookies,
} from "../accountClient";

const anionLabels = [
  { ligand: "Phosphate", label: "PO4", variant: "blue" },
  { ligand: "Sulfate", label: "SO4", variant: "blue" },
  { ligand: "Chloride", label: "Cl", variant: "blue" },
  { ligand: "Nitrate", label: "NO3", variant: "blue" },
  { ligand: "Carbonate", label: "CO3", variant: "blue" },
];

const outputControls = [
  { key: "viewer", label: "Show 3D viewer" },
  { key: "pdbAnnotation", label: "Show PDB annotation" },
  { key: "phosfate", label: "Show PhosFate re-annotation" },
  { key: "firstShell", label: "Show first-shell residues" },
];

const exampleSequence =
  "MSKVCIIAWVYGRVQGVGFRYTTQYEAKRLGLTGYAKNLDDGSVEVVACGEEGQVEKLMQWLKSGGPRSARVERVLSEPHHPSGELTDFRIRLEHHHHHH";

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

function formatPocketDisplayName(value) {
  const filename = String(value ?? "")
    .split("/")
    .pop();

  const match = filename.match(
    /^([A-Za-z0-9]+)_chain-([A-Za-z0-9]+)_site-([0-9]+)\.pdb$/i,
  );

  if (!match) {
    return filename.replace(/\.pdb$/i, "");
  }

  const [, pdbId, chain, site] = match;

  return `${pdbId.toUpperCase()}_Chain-${chain.toUpperCase()} (Site: ${site})`;
}

const runStageLabels = {
  queued: "Queued",
  esmfold_download: "Downloading ESMFold",
  folding: "Folding",
  fpocket: "Running fpocket",
  embedding_model: "Loading ESM2",
  embedding: "Embedding",
  scoring: "Scoring",
};

const STRUCTF_JOB_TYPE = "anionpdb.phosfate.run";
const STRUCTF_TERMINAL_STATUSES = new Set([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

function formatRunProgress(event) {
  const label = runStageLabels[event?.stage] || "Running";
  const count =
    event?.step && event?.total ? ` ${event.step}/${event.total}` : "";

  return {
    stage: label + count,
    message: event?.message || "Running PhosFate...",
  };
}

function structfProgressMessage(job) {
  const status = job?.status || "queued";
  if (status === "queued") {
    return { stage: "Queued", message: "Waiting for the StructF runner..." };
  }
  if (status === "claimed") {
    return { stage: "Claimed", message: "StructF runner claimed this job." };
  }
  if (status === "running") {
    return { stage: "Running", message: "Running PhosFate through StructF..." };
  }
  if (status === "succeeded") {
    return { stage: "Complete", message: "StructF PhosFate job completed." };
  }
  return { stage: status, message: "StructF job status: " + status };
}

function unwrapStructFPhosFateArtifact(artifact) {
  const result = artifact?.result && typeof artifact.result === "object"
    ? artifact.result
    : artifact;

  if (!result || typeof result !== "object" || !Array.isArray(result.pockets)) {
    throw new Error("StructF result artifact did not include PhosFate pockets.");
  }

  return result;
}

export default function PhosFatePage({ setPage }) {
  const { manifest, sites } = useBindingSites();
  const [storedSite] = useState(() => getStoredBindingSite());
  const [queryOverride, setQueryOverride] = useState(exampleSequence);
  const [jobName, setJobName] = useState("9SV1_1");
  const [phosFateResult, setPhosFateResult] = useState(null);
  const [selectedPredictionIndex, setSelectedPredictionIndex] = useState(0);
  const [runStatus, setRunStatus] = useState("");
  const [runProgress, setRunProgress] = useState(null);
  const [runError, setRunError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [downloadType, setDownloadType] = useState("csv");
  const [visibleOutputs, setVisibleOutputs] = useState({
    viewer: true,
    pdbAnnotation: true,
    phosfate: true,
    firstShell: false,
  });

  const selectedSite = useMemo(() => {
    const hydratedStoredSite =
      storedSite && sites.find((site) => site.id === storedSite.id);

    return (
      hydratedStoredSite ??
      storedSite ??
      sites.find((site) => site.ligand === "Phosphate") ??
      sites[0] ??
      null
    );
  }, [sites, storedSite]);

  const activeSite =
    phosFateResult?.pockets?.[selectedPredictionIndex] ??
    phosFateResult?.selectedSite ??
    selectedSite;

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
    () => manifest?.ligands?.find((item) => item.ligand === activeSite?.ligand),
    [manifest, activeSite],
  );
  const pdbAnnotationBars = useMemo(
    () => buildPdbAnnotationBars(activeSite),
    [activeSite],
  );
  const phosFatePredictionBars = useMemo(
    () => buildPhosFatePredictionBars(activeSite),
    [activeSite],
  );
  const selectedPdbFile = filenameFromPath(activeSite?.pdbPath);
  const downloadSelectedSite = () => {
    if (!activeSite) {
      return;
    }

    if (downloadType === "json") {
      downloadSitesJson([activeSite], activeSite.id + ".json");
      return;
    }

    if (downloadType === "pdb") {
      downloadFile(activeSite.pdbPath);
      return;
    }

    downloadSitesCsv([activeSite], activeSite.id + ".csv");
  };

  const applyPhosFateResult = (finalPayload, statusPrefix = "Completed") => {
    setPhosFateResult(finalPayload);
    setSelectedPredictionIndex(0);
    setRunStatus(
      statusPrefix +
        " " +
        (finalPayload.pockets?.length ?? 0) +
        " pocket predictions for " +
        finalPayload.jobName +
        ".",
    );
    setRunProgress({
      stage: "Complete",
      message:
        "Completed " +
        (finalPayload.pockets?.length ?? 0) +
        " pocket predictions.",
    });
  };

  const runDirectPhosFate = async (payload) => {
    const response = await fetch(API_BASE + "/api/phosfate/run?stream=1", {
      method: "POST",
      headers: {
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.details || data.error || "PhosFate run failed.");
    }

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Browser does not support PhosFate progress streaming.");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalPayload = null;

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const event = JSON.parse(line);

        if (event.type === "progress") {
          const progress = formatRunProgress(event);
          setRunProgress(progress);
          setRunStatus(progress.message);
        } else if (event.type === "complete") {
          finalPayload = event.payload;
        } else if (event.type === "error") {
          throw new Error(event.details || event.error || "PhosFate run failed.");
        }
      }

      if (done) {
        break;
      }
    }

    if (!finalPayload) {
      throw new Error("PhosFate run ended without a result.");
    }

    applyPhosFateResult(finalPayload);
  };

  const runStructFPhosFate = async (payload) => {
    const created = await createJob({
      appSlug: "anionpdb",
      jobType: STRUCTF_JOB_TYPE,
      inputSummary: payload,
      publicLabel: "PhosFate " + payload.jobName,
      idempotencyKey:
        "phosfate-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 8),
    });

    const jobId = created.job?.id;
    if (!jobId) {
      throw new Error("StructF account API did not return a job id.");
    }

    setRunStatus("StructF job " + jobId + " created.");
    setRunProgress({ stage: "Queued", message: "Waiting for the StructF runner..." });

    const started = Date.now();
    while (true) {
      const body = await getJob(jobId);
      const job = body.job;
      const progress = structfProgressMessage(job);
      setRunProgress(progress);
      setRunStatus(progress.message);

      if (!STRUCTF_TERMINAL_STATUSES.has(job.status)) {
        if (Date.now() - started > 60 * 60 * 1000) {
          throw new Error("StructF PhosFate job timed out.");
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      if (job.status !== "succeeded") {
        throw new Error(
          job.errorMessage || job.errorCode || "StructF job ended with " + job.status,
        );
      }

      const artifact = await downloadJobArtifact(job.id, "result.json");
      applyPhosFateResult(unwrapStructFPhosFateArtifact(artifact), "Completed StructF");
      return;
    }
  };

  const runPhosFate = async () => {
    const sequence = String(queryOverride || "").replace(/\s+/g, "").toUpperCase();

    setRunError("");
    setRunStatus("");
    setRunProgress(null);

    if (!sequence) {
      setRunError("Protein sequence is required.");
      return;
    }

    const payload = {
      jobName,
      sequence,
      topK: 5,
      distance: 5.0,
    };

    setIsRunning(true);
    setRunStatus("Starting PhosFate inference...");

    try {
      let useStructF = false;
      if (supportsSharedAccountCookies()) {
        try {
          const session = await fetchAccountSession();
          useStructF = session?.mode === "user";
        } catch {
          useStructF = false;
        }
      }

      if (useStructF) {
        await runStructFPhosFate(payload);
      } else {
        await runDirectPhosFate(payload);
      }
    } catch (error) {
      setRunError(error.message || String(error));
      setRunStatus("");
      setRunProgress(null);
    } finally {
      setIsRunning(false);
    }
  };

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
                Enter a protein sequence. PhosFate predicts the structure,
                detects pockets, and scores anion-binding probabilities across
                five classes.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="search-top">
              <div>
                <h3>Run a sequence through PhosFate</h3>
                <p>
                  The run creates a predicted structure, detects candidate
                  pockets, and returns a probability distribution for each
                  pocket.
                </p>
              </div>
              <label className="job-name">
                Job name
                <input
                  onChange={(event) => setJobName(event.target.value)}
                  value={jobName}
                />
              </label>
            </div>
            <div className="query-field">
              <textarea
                onChange={(event) => setQueryOverride(event.target.value)}
                placeholder="Paste a protein sequence using one-letter amino acid codes..."
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
                      setQueryOverride(exampleSequence);
                      setJobName("9SV1_1");
                    }}
                  >
                    Example sequence
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQueryOverride("");
                      setPhosFateResult(null);
                      setSelectedPredictionIndex(0);
                      setRunStatus("");
                      setRunError("");
                    }}
                  >
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
                ACTIVE ANION<strong>{activeSite?.ligand ?? "..."}</strong>
              </div>
              <div className="stat">
                MODE
                <strong>
                  {phosFateResult ? "Inference result" : "Recovered data"}
                </strong>
              </div>
            </div>
          </div>

          <button
            className="primary"
            disabled={isRunning}
            onClick={runPhosFate}
            type="button"
          >
            {isRunning ? "Running PhosFate..." : "Run PhosFate"}
          </button>

          {runStatus ? (
            <div className="run-status">
              {runProgress?.stage ? <strong>{runProgress.stage}</strong> : null}
              <span>{runStatus}</span>
            </div>
          ) : null}
          {runError ? <div className="run-error">{runError}</div> : null}

          {phosFateResult?.pockets?.length ? (
            <div className="prediction-picker">
              {phosFateResult.pockets.map((pocket, index) => (
                <button
                  className={index === selectedPredictionIndex ? "active" : ""}
                  key={pocket.id}
                  onClick={() => setSelectedPredictionIndex(index)}
                  type="button"
                >
                  <span>Pocket {pocket.rank}</span>
                  <strong>{pocket.ligand}</strong>
                  <em>{Math.round((pocket.confidence ?? 0) * 100)}%</em>
                </button>
              ))}
            </div>
          ) : null}

          <div className="card">
            <p className="filter-title">
              <span className="dot" /> Output controls
            </p>
            <div className="filters">
              {outputControls.map((control) => (
                <label className="check" key={control.key}>
                  <input
                    type="checkbox"
                    checked={visibleOutputs[control.key]}
                    onChange={(event) => {
                      setVisibleOutputs((previous) => ({
                        ...previous,
                        [control.key]: event.target.checked,
                      }));
                    }}
                  />{" "}
                  {control.label}
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
                3D structure, detected pocket residues, and PhosFate
                probability distribution.
              </div>
            </div>
          </div>

          <div className="viewer-card">
            <div className="viewer-top">
              <div>Sequence of</div>
              <div>{activeSite?.pdbId ?? "..."}</div>
              <div>
                {activeSite
                  ? activeSite.ligand + " binding site " + activeSite.site
                  : "Recovered Distance-5.0 pocket"}
              </div>
              <div>Chain {activeSite?.chain ?? "..."}</div>
            </div>
            <div className="seq">
              {activeSite ? (
                <>
                  Residue indices:{" "}
                  {Array.isArray(activeSite.residueIndices) &&
                  activeSite.residueIndices.length > 0
                    ? activeSite.residueIndices
                        .slice(
                          0,
                          visibleOutputs.firstShell
                            ? activeSite.residueIndices.length
                            : 6,
                        )
                        .join(", ")
                    : "No residue index data"}
                </>
              ) : (
                "Loading recovered residue indices..."
              )}

              <br />

              {activeSite
                ? phosFateResult
                  ? activeSite.id
                  : formatPocketDisplayName(selectedPdbFile)
                : "<site>.pdb"}
              <br />
            </div>
            {visibleOutputs.viewer ? (
              <StructureViewer
                label={activeSite?.id}
                pdbId={phosFateResult ? null : activeSite?.pdbId}
                structurePath={activeSite?.pdbPath}
                showResidueLabels={visibleOutputs.firstShell}
              />
            ) : null}
          </div>

          {activeSite ? (
            <div className="site-detail-card">
              <div>
                <span>
                  {phosFateResult
                    ? "Selected PhosFate prediction"
                    : "Selected recovered pocket"}
                </span>
                <strong>
                  {activeSite
                    ? phosFateResult
                      ? activeSite.id
                      : formatPocketDisplayName(selectedPdbFile)
                    : "<site>.pdb"}
                </strong>
              </div>
              <dl>
                <div>
                  <dt>Ligand</dt>
                  <dd>{activeSite.ligand}</dd>
                </div>
                <div>
                  <dt>{phosFateResult ? "Confidence" : "PDB folder"}</dt>
                  <dd>
                    {phosFateResult
                      ? Math.round((activeSite.confidence ?? 0) * 100) + "%"
                      : activeSite.pdbId}
                  </dd>
                </div>
                <div>
                  <dt>Residues</dt>
                  <dd>{activeSite.residueCount}</dd>
                </div>
                <div>
                  <dt>{phosFateResult ? "fpocket" : "Ligand set"}</dt>
                  <dd>
                    {phosFateResult
                      ? "Pocket " + activeSite.fpocketId
                      : (ligandSummary?.siteCount ?? 0) + " usable sites"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {visibleOutputs.pdbAnnotation ? (
            <BarChart
              title="PDB annotation"
              subtitle="crystallographic ligand label"
              bars={pdbAnnotationBars}
            />
          ) : null}

          {visibleOutputs.phosfate ? (
            <BarChart
              title="PhosFate re-annotation"
              subtitle="predicted binding probability distribution"
              bars={phosFatePredictionBars}
              emptyMessage="No PhosFate score table is present for this pocket yet."
            />
          ) : null}

          <div className="download">
            <div className="download-row">
              <select
                onChange={(event) => setDownloadType(event.target.value)}
                value={downloadType}
              >
                <option value="csv">Download report as CSV</option>
                <option value="json">Download JSON</option>
                <option value="pdb">
                  {selectedPdbFile || "Download pocket PDB"}
                </option>
              </select>
              <button
                className="gray"
                disabled={!activeSite}
                onClick={downloadSelectedSite}
                type="button"
              >
                Download
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
