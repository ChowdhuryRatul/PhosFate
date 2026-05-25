import { useMemo, useState } from "react";
import Header from "../components/Header";
import { anionFilters } from "../homePageData";
import {
  AVAILABLE_LIGANDS,
  storeBindingSite,
  useBindingSites,
} from "../useBindingSites";

export default function AnionPDBPage({ setPage }) {
  const { error, isLoading, manifest, sites } = useBindingSites();
  const [query, setQuery] = useState("");
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

  const visibleSites = filteredSites.slice(0, 25);

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

  const selectForPhosFate = (site) => {
    storeBindingSite(site);
    setPage("phosfate");
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
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search or type a PDB entry"
                value={query}
              />
              <datalist id="anion-pdb-options">
                {sites.slice(0, 80).map((site) => (
                  <option key={site.id} value={site.pdbId} />
                ))}
              </datalist>
              <div className="buttons">
                <button type="button" onClick={() => setQuery("2G25")}>
                  Search example
                </button>
                <button type="button" onClick={() => setQuery("")}>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <button className="primary" type="button" onClick={() => setQuery("")}>
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
                      !filter.includes("Carbonate") &&
                      !filter.includes("High-confidence") &&
                      AVAILABLE_LIGANDS.has(filter.split(" ")[0]) &&
                      activeLigands.has(filter.split(" ")[0])
                    }
                    disabled={
                      filter.includes("Carbonate") ||
                      filter.includes("High-confidence") ||
                      !AVAILABLE_LIGANDS.has(filter.split(" ")[0])
                    }
                    onChange={() => toggleLigand(filter.split(" ")[0])}
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
                  <strong>{ligand.siteCount}</strong>
                  <small>{ligand.projectCount} PDB folders</small>
                </div>
              ))}
            </div>
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
                  : filteredSites.length + " recovered binding-site records"}
              </strong>
              <div className="result-controls">
                <div className="per">PER PAGE</div>
                <select defaultValue="25">
                  <option>25</option>
                  <option>50</option>
                  <option>100</option>
                </select>
                <span className="arrows">
                  <button type="button">←</button>
                  <button type="button">→</button>
                </span>
              </div>
            </div>

            <div className="table-head">
              <div>ID</div>
              <div>POCKET RECORD</div>
              <div>ANION LAYERS</div>
              <div>SAVE</div>
            </div>

            {error ? (
              <div className="empty">
                <p>{error}</p>
              </div>
            ) : (
              <div className="site-list">
                {visibleSites.map((site) => (
                  <button
                    className="site-row"
                    key={site.id}
                    onClick={() => selectForPhosFate(site)}
                    type="button"
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
                    <span>Use</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="download">
            <div className="seg">
              <div className="on">Viewable</div>
              <div>Starred (0)</div>
            </div>
            <div className="download-row">
              <select defaultValue="CSV">
                <option>CSV</option>
                <option>PDB files</option>
                <option>JSON</option>
              </select>
              <button className="gray" type="button">
                Download
              </button>
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
      </main>
    </>
  );
}
