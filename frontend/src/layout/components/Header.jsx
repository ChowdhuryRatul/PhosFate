import { useState } from "react";
import AccountStatus from "./AccountStatus";

export default function Header({ page, setPage }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const pagePath = {
    anion: "/home",
    phosfate: "/PhosFate",
    history: "/History",
  };

  const goTo = (target) => (event) => {
    event.preventDefault();
    setOpenDropdown(null);
    setPage(target);
  };

  return (
    <header>
      <div className="brand">
        <a className="brand-home" href={pagePath.anion} onClick={goTo("anion")}>
          <h1>AnionPDB</h1>
        </a>
        <span>
          {page === "phosfate"
            ? "Anion pocket design workbench within StructF.studio"
            : "Anion-binding pocket AI workbench within StructF.studio"}
        </span>
      </div>
      <nav>
        <a
          className={page === "anion" ? "pill active" : "pill"}
          href={pagePath.anion}
          onClick={goTo("anion")}
        >
          AnionPDB pocket search
        </a>
        <a
          className={page === "phosfate" ? "pill active" : "pill"}
          href={pagePath.phosfate}
          onClick={goTo("phosfate")}
        >
          PhosFate pocket scoring
        </a>
        <a
          className={page === "history" ? "pill active" : "pill"}
          href={pagePath.history}
          onClick={goTo("history")}
        >
          History
        </a>
        <button
          type="button"
          className="pill"
          onClick={() => setShowGuide(true)}
        >
          Guide
        </button>
        <details
          className="nav-dropdown"
          open={openDropdown === "ftp"}
          onToggle={(event) => {
            if (event.currentTarget.open) {
              setOpenDropdown("ftp");
            }
          }}
        >
          <summary>FTP access</summary>
          <div className="nav-panel">
            <strong>Download AnionPDB PDB files</strong>
            <ol>
              <li>
                Open AnionPDB pocket search and filter by anion type or PDB ID.
              </li>
              <li>
                Use a row Download button to save one binding-site PDB file.
              </li>
              <li>
                Select rows, then use Download Selected to export a ZIP of those
                PDB files.
              </li>
              <li>
                Leave rows unselected and use Download All to export the current
                filtered PDB set as a TAR archive.
              </li>
            </ol>
          </div>
        </details>
        <details
          className="nav-dropdown"
          open={openDropdown === "cite"}
          onToggle={(event) => {
            if (event.currentTarget.open) {
              setOpenDropdown("cite");
            }
          }}
        >
          <summary>Cite AnionPDB</summary>
          <div className="nav-panel">
            Re-annotation of Anion-Binding Pockets using Binding Probability
            Distributions in AnionPDB. Arunraj B., Priyanshu Gupta, Riza
            Danurdoro, Curwen Pei Hong Tan, Narayana R. Aluru, Manish Kumar, and
            Ratul Chowdhury* (Under Review)
          </div>
        </details>
        <a className="link" href="/home#lab">
          ChowdhuryLab
        </a>
        <AccountStatus />
      </nav>
      {showGuide ? (
        <div className="guide-modal-backdrop">
          <main className="guide-modal">
            <button className="guide-got" onClick={() => setShowGuide(false)}>
              Got it
            </button>

            <div className="guide-kicker">QUICK GUIDE</div>
            <h1 className="guide-title">What can I do here?</h1>

            <p className="guide-intro">
              AnionPDB is a protein–anion pocket AI workbench — browse curated
              anion-binding pockets, download native PDB pocket annotations,
              re-score pocket selectivity with PhosFate, and evaluate new
              protein pockets directly from sequence.
            </p>

            <section className="guide-grid">
              <article className="guide-card">
                <div className="guide-num">01</div>
                <h2>Explore AnionPDB</h2>
                <p>
                  Browse curated anion-binding protein pockets and download
                  pocket environments as PDB files. Each record includes
                  annotations for the natively bound anion, including phosphate,
                  sulfate, chloride, nitrate, and carbonate.
                </p>
              </article>

              <article className="guide-card">
                <div className="guide-num">02</div>
                <h2>Re-score pockets</h2>
                <p>
                  Use the PhosFate model to re-score AnionPDB pockets and
                  estimate what other anions may also bind to a given pocket
                  beyond the natively crystallized or experimentally annotated
                  anion.
                </p>
              </article>

              <article className="guide-card">
                <div className="guide-num">03</div>
                <h2>Evaluate new pockets</h2>
                <p>
                  Submit any user-input protein pocket or whole-protein sequence
                  to predict anion-binding preference directly, using learned
                  pocket features and probability scores across the five
                  AnionPDB anion classes.
                </p>
              </article>
            </section>

            <div className="guide-brand">
              AnionPDB / PhosFate within StructF.studio
            </div>
          </main>
        </div>
      ) : null}
    </header>
  );
}
