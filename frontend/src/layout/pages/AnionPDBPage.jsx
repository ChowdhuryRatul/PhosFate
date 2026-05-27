import { useMemo, useState } from "react";
import Header from "../components/Header";
import { downloadFile, downloadPdbTar, downloadPdbZip } from "../downloads";
import { anionFilters } from "../homePageData";
import {
  AVAILABLE_LIGANDS,
  storeBindingSite,
  useBindingSites,
} from "../useBindingSites";

const formatCount = (count) => new Intl.NumberFormat("en-US").format(count);

export default function AnionPDBPage({ setPage }) {
  const { error, isLoading, manifest, sites } = useBindingSites();
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [selectedSiteIds, setSelectedSiteIds] = useState(() => new Set());
  const [downloadError, setDownloadError] = useState("");
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [activeLigands, setActiveLigands] = useState(() =>
    new Set(AVAILABLE_LIGANDS),
  );

  const openPhosFate = (event) => {
    event.preventDefault();
    setPage("phosfate");
  };

  const filteredSites = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sites.filter((site) => {
      const ligandMatches = activeLigands.has(site.ligand);
      if (!ligandMatches) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        site.id,
        site.ligand,
        site.pdbId,
        site.chain,
        String(site.site),
        site.residueIndices.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeLigands, query, sites]);

  const recoveredResultCount = useMemo(() => {
    const ligands = manifest?.ligands ?? [];
    return ligands.reduce((total, ligand) => {
      if (!activeLigands.has(ligand.ligand)) {
        return total;
      }

      return total + (ligand.recoveredSiteCount ?? ligand.siteCount ?? 0);
    }, 0);
  }, [activeLigands, manifest]);
  const hasQuery = Boolean(query.trim());
  const resultCount = hasQuery || !recoveredResultCount
    ? filteredSites.length
    : recoveredResultCount;
  const resultCountLabel = hasQuery
    ? "indexed binding-site records"
    : "recovered binding-site records";

  const totalPages = Math.max(1, Math.ceil(filteredSites.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const visibleSites = filteredSites.slice(
    safeCurrentPage * pageSize,
    safeCurrentPage * pageSize + pageSize,
  );
  const canGoBack = safeCurrentPage > 0;
  const canGoForward = safeCurrentPage < totalPages - 1;
  const selectedSites = useMemo(
    () => filteredSites.filter((site) => selectedSiteIds.has(site.id)),
    [filteredSites, selectedSiteIds],
  );
  const allVisibleSitesSelected =
    visibleSites.length > 0 &&
    visibleSites.every((site) => selectedSiteIds.has(site.id));
  const filteredPdbPaths = useMemo(
    () => filteredSites.map((site) => site.pdbPath).filter(Boolean),
    [filteredSites],
  );

  const updateQuery = (value) => {
    setQuery(value);
    setCurrentPage(0);
  };

  const updatePageSize = (value) => {
    setPageSize(Number(value));
    setCurrentPage(0);
  };

  const toggleLigand = (ligand) => {
    setActiveLigands((currentLigands) => {
      const nextLigands = new Set(currentLigands);
      if (nextLigands.has(ligand)) {
        nextLigands.delete(ligand);
      } else {
        nextLigands.add(ligand);
      }
      return nextLigands;
    });
  };

  const toggleSelectedSite = (siteId) => {
    setSelectedSiteIds((currentSiteIds) => {
      const nextSiteIds = new Set(currentSiteIds);

      if (nextSiteIds.has(siteId)) {
        nextSiteIds.delete(siteId);
      } else {
        nextSiteIds.add(siteId);
      }

      return nextSiteIds;
    });
  };

  const toggleVisibleSites = () => {
    setSelectedSiteIds((currentSiteIds) => {
      const nextSiteIds = new Set(currentSiteIds);

      if (allVisibleSitesSelected) {
        visibleSites.forEach((site) => nextSiteIds.delete(site.id));
      } else {
        visibleSites.forEach((site) => nextSiteIds.add(site.id));
      }

      return nextSiteIds;
    });
  };

  const selectForPhosFate = (site) => {
    storeBindingSite(site);
    setPage("phosfate");
  };

  const downloadSelectedPdbFiles = async () => {
    if (!selectedSites.length && !filteredPdbPaths.length) {
      return;
    }

    setDownloadError("");
    setIsPreparingDownload(true);

    try {
      if (selectedSites.length) {
        await downloadPdbZip(selectedSites, "anionpdb-selected-pdb-files.zip");
      } else {
        await downloadPdbTar(filteredPdbPaths, "anionpdb-filtered-pdb-files.tar");
      }
    } catch (downloadError) {
      setDownloadError(downloadError.message);
    } finally {
      setIsPreparingDownload(false);
    }
  };

  return (
    <>
      <Header page="anion" setPage={setPage} />
      <main>
        <section>
          <div className="section-head">
            <span className="badge">INPUT</span>
            <div>
              <h2>AnionPDB search</h2>
              <div className="sub">
                Search experimentally resolved anion–protein pockets by PDB ID,
                anion type, residue motif, coordination number, or local
                binding-pocket chemistry. Leave the query empty and press Search
                to page through all records.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="pdb-picker">
              <label htmlFor="anion-pdb-entry">PDB ENTRY</label>
              <input
                id="anion-pdb-entry"
                list="anion-pdb-options"
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Search or type a PDB entry"
                value={query}
              />
              <datalist id="anion-pdb-options">
                {sites.slice(0, 80).map((site) => (
                  <option key={site.id} value={site.pdbId} />
                ))}
              </datalist>
              <div className="buttons">
                <button type="button" onClick={() => updateQuery("2G25")}>
                  Search example
                </button>
                <button type="button" onClick={() => updateQuery("")}>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <button
            className="primary"
            type="button"
            onClick={() => updateQuery("")}
          >
            Browse recovered sites
          </button>

          <div className="card">
            <p className="filter-title">
              <span className="dot" /> Filter by original bound anion
            </p>
            <div className="filters">
              {anionFilters.map((filter) => (
                <label className="check" key={filter}>
                  <input
                    checked={
                      AVAILABLE_LIGANDS.has(filter.split(" ")[0]) &&
                      activeLigands.has(filter.split(" ")[0])
                    }
                    disabled={!AVAILABLE_LIGANDS.has(filter.split(" ")[0])}
                    onChange={() => {
                      toggleLigand(filter.split(" ")[0]);
                      setCurrentPage(0);
                    }}
                    type="checkbox"
                  />{" "}
                  {filter}
                </label>
              ))}
            </div>
          </div>

          <div className="card data-summary">
            <p className="filter-title">
              <span className="dot" /> Recovered Distance-5.0 data
            </p>
            <div className="summary-grid">
              {(manifest?.ligands ?? []).map((ligand) => (
                <div className="summary-item" key={ligand.ligand}>
                  <span>{ligand.ligand}</span>
                  <strong>
                    {formatCount(ligand.recoveredSiteCount ?? ligand.siteCount)}
                  </strong>
                  <small>
                    PDB files across{" "}
                    {formatCount(
                      ligand.recoveredProjectCount ?? ligand.projectCount,
                    )}{" "}
                    folders
                  </small>
                  <small>{formatCount(ligand.siteCount)} indexed records</small>
                </div>
              ))}
            </div>
          </div>

          <div className="tool-grid">
            <a
              className="mini phosfate-action"
              href="#phosfate"
              onClick={openPhosFate}
            >
              <b>PhosFate</b>
              <span>
                PhosFate predicted re-annotations of anion binding probability
                in AnionPDB.
              </span>
            </a>
          </div>
        </section>

        <section>
          <div className="section-head">
            <span className="badge">OUTPUT</span>
            <div>
              <h2>AnionPDB</h2>
              <div className="sub">
                Curated anion-binding pocket records from experimentally
                resolved protein structures. Press Search to load records.
              </div>
            </div>
          </div>

          <div className="result-card">
            <div className="result-top">
              <strong>
                {isLoading
                  ? "Loading recovered binding sites"
                  : formatCount(resultCount) + " " + resultCountLabel}
              </strong>
              <div className="result-controls">
                <div className="per">PER PAGE</div>
                <select
                  onChange={(event) => updatePageSize(event.target.value)}
                  value={String(pageSize)}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <span className="arrows">
                  <button
                    disabled={!canGoBack}
                    onClick={() => setCurrentPage(safeCurrentPage - 1)}
                    type="button"
                  >
                    ←
                  </button>
                  <button
                    disabled={!canGoForward}
                    onClick={() => setCurrentPage(safeCurrentPage + 1)}
                    type="button"
                  >
                    →
                  </button>
                </span>
              </div>
            </div>

            <div className="table-head">
              <div>ID</div>
              <div>POCKET RECORD</div>
              <div>ANION LAYERS</div>
              <div>DOWNLOAD</div>
              <div>USE</div>
              <label className="select-all">
                <span>SELECT</span>
                <input
                  checked={allVisibleSitesSelected}
                  disabled={!visibleSites.length}
                  onChange={toggleVisibleSites}
                  type="checkbox"
                />
              </label>
            </div>

            {error ? (
              <div className="empty">
                <p>{error}</p>
              </div>
            ) : (
              <div className="site-list">
                {visibleSites.map((site) => (
                  <div
                    className="site-row"
                    key={site.id}
                  >
                    <span>{site.pdbId}</span>
                    <span>
                      <b>{site.id}</b>
                      <small>
                        chain {site.chain} · site {site.site} · residues{" "}
                        {site.residueIndices.slice(0, 6).join(", ")}
                      </small>
                    </span>
                    <span>{site.ligand}</span>
                    <button
                      className="row-link"
                      onClick={() => downloadFile(site.pdbPath)}
                      type="button"
                    >
                      Download
                    </button>
                    <button
                      className="row-link"
                      onClick={() => selectForPhosFate(site)}
                      type="button"
                    >
                      Use
                    </button>
                    <label className="row-check" aria-label={"Select " + site.id}>
                      <input
                        checked={selectedSiteIds.has(site.id)}
                        onChange={() => toggleSelectedSite(site.id)}
                        type="checkbox"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="download bulk-download">
            <button
              className="bulk-download-button"
              disabled={
                isPreparingDownload ||
                (!selectedSites.length && !filteredPdbPaths.length)
              }
              onClick={downloadSelectedPdbFiles}
              type="button"
            >
              {isPreparingDownload
                ? "Preparing download"
                : selectedSites.length
                  ? "Download Selected"
                  : "Download All"}
            </button>
            {selectedSites.length ? (
              <p className="bulk-download-count">
                {formatCount(selectedSites.length)} selected
              </p>
            ) : filteredPdbPaths.length ? (
              <p className="bulk-download-count">
                {formatCount(filteredPdbPaths.length)} filtered PDB files
              </p>
            ) : null}
            {downloadError ? (
              <p className="download-error">{downloadError}</p>
            ) : null}
          </div>

        </section>
      </main>
    </>
  );
}
