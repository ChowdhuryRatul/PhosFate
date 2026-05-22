import { useEffect, useState } from "react";
import "../PhosFate.css";

const anionFilters = [
  "Phosphate PO₄³⁻",
  "Sulfate SO₄²⁻",
  "Chloride Cl⁻",
  "Nitrate NO₃⁻",
  "Carbonate CO₃²⁻",
  "High-confidence direct pocket",
];

const outputControls = [
  "Show MolViewer",
  "Show PDB annotation",
  "Show PhosFate re-annotation",
  "Show first-shell residues",
];

const pdbAnnotation = [
  ["PO₄³⁻", "1.00", "100%", "blue"],
  ["SO₄²⁻", "0.00", "0%", ""],
  ["Cl⁻", "0.00", "0%", ""],
  ["NO₃⁻", "0.00", "0%", ""],
  ["CO₃²⁻", "0.00", "0%", ""],
];

const phosFatePrediction = [
  ["PO₄³⁻", "0.64", "64%", "teal"],
  ["SO₄²⁻", "0.22", "22%", "teal"],
  ["Cl⁻", "0.07", "7%", "teal"],
  ["NO₃⁻", "0.05", "5%", "teal"],
  ["CO₃²⁻", "0.02", "2%", "teal"],
];

const dotPositions = [
  ["41%", "26%"],
  ["46%", "20%"],
  ["58%", "30%"],
  ["62%", "48%"],
  ["48%", "68%"],
  ["70%", "58%"],
  ["36%", "55%"],
  ["53%", "42%"],
  ["44%", "51%"],
  ["59%", "63%"],
  ["39%", "73%"],
  ["66%", "22%"],
  ["31%", "41%"],
  ["75%", "36%"],
  ["57%", "77%"],
];

function Header({ page, setPage }) {
  const goTo = (target) => (event) => {
    event.preventDefault();
    setPage(target);
  };

  return (
    <header>
      <div className="brand">
        <h1>AnionPDB</h1>
        <span>
          {page === "anion"
            ? "Anion-binding pocket AI workbench within StructF.studio"
            : "PhosFate phosphate-selectivity re-annotation within StructF.studio"}
        </span>
      </div>
      <nav>
        <a
          className={page === "anion" ? "pill active" : "pill"}
          href="#anion"
          onClick={goTo("anion")}
        >
          AnionPDB
        </a>
        <a className="pill" href="#pocket-search">
          Pocket Search
        </a>
        <a
          className={page === "phosfate" ? "pill active" : "pill"}
          href="#phosfate"
          onClick={goTo("phosfate")}
        >
          PhosFate
        </a>
        <a className="pill" href="#anion-interaction">
          Anion-Interaction
        </a>
        <a className="pill" href="#job-trace">
          Job Trace
        </a>
        <a className="pill" href="#guide">
          Guide
        </a>
        <a className="link" href="#paper">
          Paper
        </a>
        <a className="link" href="#lab">
          ChowdhuryLab
        </a>
        <span className="clear">Clear session</span>
      </nav>
    </header>
  );
}

function AnionPDBPage({ setPage }) {
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

function PhosFatePage({ setPage }) {
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
                  the MolViewer-style structure and predicted anion preference
                  distribution.
                </p>
              </div>
              <button type="button">Upload PDB</button>
            </div>
            <div className="query-field">
              <textarea placeholder="Enter PDB ID, chain, ligand, residue list, or paste pocket coordinates..." />
              <div className="querybar">
                <div className="label">
                  SEARCH QUERY <strong>PhosFate</strong>
                </div>
                <div className="buttons">
                  <button type="button">Example pocket</button>
                  <button type="button">Clear</button>
                </div>
              </div>
            </div>
            <div className="stats">
              <div className="stat">
                POCKETS<strong>1</strong>
              </div>
              <div className="stat">
                ANIONS<strong>5</strong>
              </div>
              <div className="stat">
                MODE<strong>Re-annotate</strong>
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
              <div>1TQN</div>
              <div>1: cytochrome-like phosphate-binding pocket</div>
              <div>Chain A</div>
            </div>
            <div className="seq">
              MALYGTHSHGLFKKLGIPGPTPLFLGNILSYHKGFCMFDMECHKKYGKVWGFYDGQQPVI...
              <br />
              VENYRKLLRFDFLDFFLSTTVPFLLPLLEVNLVCVFPREVTMFLRKSVKRMKESRLEDTQKHR...
            </div>
            <div className="mol">
              <div className="ribbon">
                <span className="helix h1" />
                <span className="helix h2" />
                <span className="helix h3" />
                <span className="helix h4" />
                <span className="loop l1" />
                <span className="loop l2" />
                <span className="loop l3" />
              </div>
              <div className="ligand" />
              <div className="toolbar">
                <div className="tool">↻</div>
                <div className="tool">◎</div>
                <div className="tool">⚒</div>
                <div className="tool">☼</div>
                <div className="tool">☁</div>
                <div className="tool">⌖</div>
              </div>
              <div className="axis" />
              <div className="dots">
                {dotPositions.map(([left, top]) => (
                  <span key={`${left}-${top}`} style={{ left, top }} />
                ))}
              </div>
            </div>
          </div>

          <BarChart
            title="PDB annotation"
            subtitle="crystallographic label distribution"
            bars={pdbAnnotation}
          />
          <BarChart
            title="PhosFate re-annotation"
            subtitle="predicted binding probability distribution"
            bars={phosFatePrediction}
          />

          <div className="download">
            <div className="download-row">
              <select defaultValue="Download report as CSV">
                <option>Download report as CSV</option>
                <option>Download JSON</option>
                <option>Download pocket PDB</option>
                <option>Download figure bundle</option>
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

function BarChart({ title, subtitle, bars }) {
  return (
    <div className="chart-card">
      <div className="chart-head">
        <b>{title}</b>
        <span className="score">{subtitle}</span>
      </div>
      <div className="chart">
        <div className="yaxis">
          <span>1.0</span>
          <span>0.75</span>
          <span>0.50</span>
          <span>0.25</span>
          <span>0</span>
        </div>
        <div className="plot">
          <div className="bars">
            {bars.map(([label, score, height, variant]) => (
              <div className="barwrap" key={label}>
                <div className={`bar ${variant}`} style={{ height }}>
                  <span>{score}</span>
                </div>
                <div>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [page, setPage] = useState(() =>
    window.location.hash === "#phosfate" ? "phosfate" : "anion",
  );

  useEffect(() => {
    document.body.classList.toggle("page-anion", page === "anion");
    document.body.classList.toggle("page-phosfate", page === "phosfate");
    window.history.replaceState(null, "", page === "phosfate" ? "#phosfate" : "#anion");
  }, [page]);

  useEffect(() => {
    const handleHashChange = () => {
      setPage(window.location.hash === "#phosfate" ? "phosfate" : "anion");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return page === "anion" ? (
    <AnionPDBPage setPage={setPage} />
  ) : (
    <PhosFatePage setPage={setPage} />
  );
}
