export default function Header({ page, setPage }) {
  const goTo = (target) => (event) => {
    event.preventDefault();
    setPage(target);
  };

  return (
    <header>
      <div className="brand">
        <a className="brand-home" href="#anion" onClick={goTo("anion")}>
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
          href="#anion"
          onClick={goTo("anion")}
        >
          AnionPDB pocket search
        </a>
        <a
          className={page === "phosfate" ? "pill active" : "pill"}
          href="#phosfate"
          onClick={goTo("phosfate")}
        >
          PhosFate pocket scoring
        </a>
        <a className="pill" href="#guide">
          Guide
        </a>
        <details className="nav-dropdown">
          <summary>FTP access</summary>
          <div className="nav-panel">
            The complete AnionPDB database download details will be provided
            after release.
          </div>
        </details>
        <details className="nav-dropdown">
          <summary>Cite AnionPDB</summary>
          <div className="nav-panel">
            Re-annotation of Anion-Binding Pockets using Binding Probability
            Distributions in AnionPDB. Arunraj B., Priyanshu Gupta, Riza
            Danurdoro, Curwen Pei Hong Tan, Narayana R. Aluru, Manish Kumar,
            and Ratul Chowdhury* (Under Review)
          </div>
        </details>
        <a className="link" href="#lab">
          ChowdhuryLab
        </a>
      </nav>
    </header>
  );
}
