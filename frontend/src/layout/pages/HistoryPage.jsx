import { useEffect, useState } from "react";
import Header from "../components/Header";
import {
  accountLoginUrl,
  fetchAccountSession,
  jobArtifactDownloadUrl,
  listJobs,
  supportsSharedAccountCookies,
} from "../accountClient";

function statusClass(status) {
  if (status === "succeeded") return "status-succeeded";
  if (status === "failed") return "status-failed";
  if (status === "running" || status === "claimed") return "status-running";
  if (status === "cancel_requested" || status === "canceled") {
    return "status-canceled";
  }
  return "";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatResult(job) {
  const summary = job.resultSummary || {};
  if (typeof summary.pocketCount === "number") {
    const ligand = summary.topLigand ? " · top " + summary.topLigand : "";
    const confidence =
      typeof summary.topConfidence === "number"
        ? " · " + Math.round(summary.topConfidence * 100) + "%"
        : "";
    return summary.pocketCount + " pockets" + ligand + confidence;
  }
  return "-";
}

export default function HistoryPage({ setPage }) {
  const [session, setSession] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory() {
    if (!supportsSharedAccountCookies()) {
      setError("StructF history is available on the StructF app hostname.");
      setSession(null);
      setJobs([]);
      return;
    }

    setLoading(true);
    try {
      const nextSession = await fetchAccountSession();
      setSession(nextSession);

      if (nextSession.mode !== "user") {
        setJobs([]);
        setError("");
        return;
      }

      const body = await listJobs({ appSlug: "anionpdb", limit: 30 });
      setJobs(body.jobs || []);
      setError("");
    } catch (loadError) {
      setSession(null);
      setJobs([]);
      setError(loadError.message || "Could not load AnionPDB history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <Header page="history" setPage={setPage} />
      <main className="history-main">
        <section className="history-panel">
          <div className="section-head">
            <span className="badge">JOBS</span>
            <div>
              <h2>AnionPDB history</h2>
              <div className="sub">
                Signed-in StructF runs from the AnionPDB and PhosFate surface.
              </div>
            </div>
          </div>

          <div className="history-actions">
            <button type="button" onClick={loadHistory} disabled={loading}>
              {loading ? "Refreshing" : "Refresh"}
            </button>
            {session?.mode !== "user" ? (
              <a className="primary-link" href={accountLoginUrl()}>
                Sign in
              </a>
            ) : null}
          </div>

          {error ? <div className="history-notice">{error}</div> : null}
          {session && session.mode !== "user" ? (
            <div className="history-notice">
              Sign in to persist AnionPDB and PhosFate runs across browsers.
            </div>
          ) : null}

          <div className="history-table">
            <div className="history-row history-head">
              <div>Job</div>
              <div>Status</div>
              <div>Result</div>
              <div>Created</div>
              <div>Artifact</div>
            </div>
            {jobs.map((job) => (
              <div className="history-row" key={job.id}>
                <div>
                  <strong>{job.publicLabel || job.id}</strong>
                  <span>{job.jobType}</span>
                </div>
                <div>
                  <span className={"status-tag " + statusClass(job.status)}>
                    {job.status}
                  </span>
                </div>
                <div>{formatResult(job)}</div>
                <div>{formatDate(job.createdAt)}</div>
                <div>
                  {job.status === "succeeded" ? (
                    <a href={jobArtifactDownloadUrl(job.id, "result.json")}>
                      Download
                    </a>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
            ))}
            {!jobs.length && !loading ? (
              <div className="history-empty">No signed-in AnionPDB jobs yet.</div>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
