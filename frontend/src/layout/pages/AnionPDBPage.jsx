import Header from "../components/Header";
import { anionFilters } from "../homePageData";

export default function AnionPDBPage({ setPage }) {
  const openPhosFate = (event) => {
    event.preventDefault();
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
                placeholder="Search or type a PDB entry"
              />
              <datalist id="anion-pdb-options">
                <option value="1TQN" />
                <option value="2GOO" />
                <option value="3PLC" />
                <option value="4OM5" />
                <option value="6AU7" />
              </datalist>
              <div className="buttons">
                <button type="button">Search example</button>
                <button type="button">Clear</button>
              </div>
            </div>
          </div>

          <button className="primary" type="button">
            Search AnionPDB
          </button>

          <div className="card">
            <p className="filter-title">
              <span className="dot" /> Filter by original bound anion
            </p>
            <div className="filters">
              {anionFilters.map((filter) => (
                <label className="check" key={filter}>
                  <input type="checkbox" /> {filter}
                </label>
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
              <strong>59,884 unique anion-binding pockets</strong>
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

            <div className="empty">
              <div className="big">59,884</div>
              <p>
                Enter a search term or leave it empty and press Search
                <br />
                to browse all curated anion-binding pockets.
              </p>
            </div>
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
