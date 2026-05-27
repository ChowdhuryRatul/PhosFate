import { useState } from "react";

export default function Header({ page, setPage }) {
  const [openDropdown, setOpenDropdown] = useState(null);

  const pagePath = {
    anion: "/home",
    phosfate: "/PhosFate",
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
            ? "PhosFate phosphate-selectivity re-annotation within StructF.studio"
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
        <a className="pill" href="/home#guide">
          Guide
        </a>
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
      </nav>
    </header>
  );
}
