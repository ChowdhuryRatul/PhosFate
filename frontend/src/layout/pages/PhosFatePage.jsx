import BarChart from "../components/BarChart";
import Header from "../components/Header";
import {
  dotPositions,
  outputControls,
  pdbAnnotation,
  phosFatePrediction,
} from "../homePageData";

export default function PhosFatePage({ setPage }) {
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
