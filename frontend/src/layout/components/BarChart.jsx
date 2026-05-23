export default function BarChart({ title, subtitle, bars }) {
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
