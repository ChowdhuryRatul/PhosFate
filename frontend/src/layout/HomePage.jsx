import "../PhosFate.css";

export default function PhosFate() {
  return (
    <>
      <header>
        <div className="brand">
          <h1>AnionPDB</h1>
          <span>
            PhosFate phosphate-selectivity re-annotation within StructF.studio
          </span>
        </div>

        <nav>
          <a className="pill" href="#">
            AnionPDB
          </a>
          <a className="pill" href="#">
            Pocket Search
          </a>
          <a className="pill active" href="#">
            PhosFate
          </a>
          <a className="pill" href="#">
            Anion-Interaction
          </a>
          <a className="pill" href="#">
            Job Trace
          </a>
          <a className="pill" href="#">
            Guide
          </a>
          <a className="link" href="#">
            Paper
          </a>
          <a className="link" href="#">
            ChowdhuryLab
          </a>
          <span className="clear">Clear session</span>
        </nav>
      </header>

      <main></main>
    </>
  );
}
