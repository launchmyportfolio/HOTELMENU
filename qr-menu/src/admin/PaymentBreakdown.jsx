function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

const CHART_COLORS = {
  CASH: "#f59e0b",
  UPI: "#22c55e",
  CARD: "#3b82f6",
  NETBANKING: "#8b5cf6",
  WALLET: "#ec4899",
  OTHER_RAZORPAY: "#f97316",
  OTHER: "#94a3b8"
};

export default function PaymentBreakdown({ data = [] }) {
  const total = data.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const segments = [];
  let cursor = 0;

  data.forEach(item => {
    const amount = Number(item.amount || 0);
    if (amount <= 0 || total <= 0) return;
    const portion = (amount / total) * 100;
    const color = CHART_COLORS[item.method] || CHART_COLORS.OTHER;
    segments.push(`${color} ${cursor}% ${cursor + portion}%`);
    cursor += portion;
  });

  const pieBackground = segments.length
    ? `conic-gradient(${segments.join(", ")})`
    : "conic-gradient(#94a3b8 0% 100%)";

  return (
    <div className="analytics-chart-grid">
      <div className="analytics-chart-card">
        <h3>Payment Mix</h3>
        <div className="analytics-donut-wrap">
          <div className="analytics-donut" style={{ background: pieBackground }}>
            <div className="analytics-donut-hole">
              <span>Total</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="analytics-chart-card">
        <h3>Breakdown by Method</h3>
        <div className="analytics-bars">
          {data.length === 0 && <p className="muted">No paid transactions in this range yet.</p>}
          {data.map(item => {
            const amount = Number(item.amount || 0);
            const ratio = total > 0 ? Math.max((amount / total) * 100, 4) : 0;
            const color = CHART_COLORS[item.method] || CHART_COLORS.OTHER;
            return (
              <div className="analytics-bar-row" key={item.method}>
                <div className="analytics-bar-meta">
                  <span>{item.method.replace(/_/g, " ")}</span>
                  <strong>{formatCurrency(amount)}</strong>
                </div>
                <div className="analytics-bar-track">
                  <div className="analytics-bar-fill" style={{ width: `${ratio}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
