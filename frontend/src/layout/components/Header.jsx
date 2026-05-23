export default function Header({ page, setPage }) {
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
