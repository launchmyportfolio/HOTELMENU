import { useEffect, useMemo, useState } from "react";
import PaymentBreakdown from "./PaymentBreakdown";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getTodayValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function OwnerAnalytics({ token, restaurant }) {
  const [overview, setOverview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    method: "",
    tableNumber: "",
    status: ""
  });

  async function fetchOverview() {
    if (!token) return;

    setLoadingOverview(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const res = await fetch(`${API_BASE}/api/owner/analytics/overview?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load analytics overview.");
      setOverview(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOverview(false);
    }
  }

  async function fetchTransactions() {
    if (!token) return;

    setLoadingTransactions(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.method) params.set("method", filters.method);
      if (filters.tableNumber) params.set("tableNumber", filters.tableNumber);
      if (filters.status) params.set("status", filters.status);

      const res = await fetch(`${API_BASE}/api/owner/analytics/payments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load payment transactions.");
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setSummary(data.summary || null);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingTransactions(false);
    }
  }

  useEffect(() => {
    fetchOverview();
    fetchTransactions();
    const interval = setInterval(() => {
      fetchOverview();
      fetchTransactions();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filters.from, filters.to, filters.method, filters.tableNumber, filters.status]);

  const activeRangeMetrics = useMemo(() => {
    return overview?.metrics?.custom || overview?.metrics?.month || null;
  }, [overview]);

  return (
    <div className="admin-dashboard">
      <div className="owner-brand-banner">
        <div className="owner-brand-mark">
          {restaurant?.logoUrl
            ? <img src={restaurant.logoUrl} alt={restaurant?.name || "Restaurant"} />
            : <span>{String(restaurant?.name || "HM").slice(0, 2).toUpperCase()}</span>}
        </div>
        <div>
          <p className="owner-brand-label">Revenue Analytics</p>
          <h2 className="owner-brand-name">{restaurant?.name || overview?.restaurant?.name || "Restaurant"}</h2>
        </div>
      </div>

      <h1>Earnings Analytics</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="tables-summary analytics-summary-grid">
        <div className="summary-card highlight">
          <span className="summary-label">Today</span>
          <strong>{formatCurrency(overview?.metrics?.today?.totalRevenue || 0)}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">This Week</span>
          <strong>{formatCurrency(overview?.metrics?.week?.totalRevenue || 0)}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">This Month</span>
          <strong>{formatCurrency(overview?.metrics?.month?.totalRevenue || 0)}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Average Bill</span>
          <strong>{formatCurrency(activeRangeMetrics?.averageBillValue || 0)}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Highest Bill</span>
          <strong>{formatCurrency(activeRangeMetrics?.highestBillAmount || 0)}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Orders</span>
          <strong>{activeRangeMetrics?.totalOrders || 0}</strong>
        </div>
      </div>

      <div className="analytics-filter-card">
        <div className="analytics-filter-grid">
          <label>
            From
            <input type="date" value={filters.from} onChange={event => setFilters(prev => ({ ...prev, from: event.target.value }))} />
          </label>
          <label>
            To
            <input type="date" value={filters.to} onChange={event => setFilters(prev => ({ ...prev, to: event.target.value }))} />
          </label>
          <label>
            Payment Method
            <select value={filters.method} onChange={event => setFilters(prev => ({ ...prev, method: event.target.value }))}>
              <option value="">All</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="NETBANKING">Netbanking</option>
              <option value="WALLET">Wallet</option>
              <option value="OTHER_RAZORPAY">Other Razorpay</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Table Number
            <input
              type="number"
              min="1"
              placeholder="All tables"
              value={filters.tableNumber}
              onChange={event => setFilters(prev => ({ ...prev, tableNumber: event.target.value }))}
            />
          </label>
          <label>
            Payment Status
            <select value={filters.status} onChange={event => setFilters(prev => ({ ...prev, status: event.target.value }))}>
              <option value="">All</option>
              <option value="SUCCESS">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="INITIATED">Initiated</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
          <div className="analytics-filter-actions">
            <button type="button" onClick={() => setFilters({ from: "", to: "", method: "", tableNumber: "", status: "" })}>
              Reset Filters
            </button>
            <button type="button" onClick={() => setFilters(prev => ({ ...prev, from: getTodayValue(), to: getTodayValue() }))}>
              Today
            </button>
          </div>
        </div>
      </div>

      {!loadingOverview && (
        <>
          <PaymentBreakdown data={activeRangeMetrics?.paymentBreakdown || []} />

          <div className="analytics-insight-grid">
            <div className="analytics-insight-card">
              <h3>Paid Bills in Range</h3>
              <strong>{activeRangeMetrics?.paidBills || 0}</strong>
            </div>
            <div className="analytics-insight-card">
              <h3>Most Ordered Item</h3>
              <strong>{activeRangeMetrics?.mostOrderedItem?.name || "No data"}</strong>
              {activeRangeMetrics?.mostOrderedItem && (
                <span>{activeRangeMetrics.mostOrderedItem.quantity} items sold</span>
              )}
            </div>
            <div className="analytics-insight-card">
              <h3>Filtered Transactions</h3>
              <strong>{summary?.totalOrders || 0}</strong>
              <span>{formatCurrency(summary?.totalAmount || 0)} collected</span>
            </div>
          </div>
        </>
      )}

      {(loadingOverview || loadingTransactions) && <p className="info-text">Loading earnings data...</p>}

      <div className="analytics-table-card">
        <div className="analytics-table-head">
          <div>
            <h2>Payments / Settlements</h2>
            <p className="muted">Bill-wise transaction history with payment filters.</p>
          </div>
        </div>

        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Table</th>
                <th>Customer / Items</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Transaction</th>
                <th>Paid At</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(item => (
                <tr key={`${item.orderId}-${item.transactionId || item.billNumber}`}>
                  <td>
                    <strong>{item.billNumber}</strong>
                    <div className="analytics-subline">{item.orderId}</div>
                  </td>
                  <td>{item.tableNumber || "-"}</td>
                  <td>
                    <strong>{item.customerName || "Walk-in"}</strong>
                    <div className="analytics-subline">
                      {(item.items || []).slice(0, 3).map(orderItem => `${orderItem.name} x${orderItem.qty}`).join(", ") || "No items"}
                    </div>
                  </td>
                  <td>{formatCurrency(item.amount)}</td>
                  <td>
                    <strong>{item.paymentMode.replace(/_/g, " ")}</strong>
                    <div className="analytics-subline">{item.paymentMethod || "-"}</div>
                  </td>
                  <td>
                    <span className={`payment-pill ${String(item.paymentStatus || "").toLowerCase()}`}>
                      {item.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <strong>{item.transactionId || "-"}</strong>
                    {item.razorpayOrderId && <div className="analytics-subline">{item.razorpayOrderId}</div>}
                  </td>
                  <td>{formatDateTime(item.paidAt || item.createdAt)}</td>
                </tr>
              ))}
              {!transactions.length && (
                <tr>
                  <td colSpan="8" className="analytics-empty-cell">No transactions found for the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
