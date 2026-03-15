import { useEffect, useState } from "react";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function TablesDashboard({ token }) {

  const [tables, setTables] = useState([]);
  const [summary, setSummary] = useState({ total: 0, occupied: 0, free: 0 });
  const [totalTables, setTotalTables] = useState(10);
  const [error, setError] = useState("");

  async function fetchTables() {
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/tables`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/api/admin/tables/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!listRes.ok || !summaryRes.ok) throw new Error("Unable to load tables");

      const listData = await listRes.json();
      const summaryData = await summaryRes.json();
      setTables(listData);
      setSummary(summaryData);
      setTotalTables(summaryData.total || 10);
      setError("");

    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (token) fetchTables();
  }, [token]);

  async function handleConfig(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/tables/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ totalTables: Number(totalTables) })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to update tables");
      setTables(data.tables);
      setSummary(prev => ({ ...prev, total: data.tables.length, free: data.tables.length - prev.occupied }));
      fetchTables();
    } catch (err) {
      setError(err.message);
    }
  }

  async function forceFree(tableNumber) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/tables/${tableNumber}/free`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Unable to free table");
      fetchTables();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-dashboard">
      <h1>Tables Dashboard</h1>
      {error && <p className="error-text">{error}</p>}

      <form className="table-form" onSubmit={handleConfig}>
        <label>
          Total Tables
          <input
            type="number"
            min="1"
            value={totalTables}
            onChange={e => setTotalTables(e.target.value)}
          />
        </label>
        <button type="submit">Update</button>
      </form>

      <div className="tables-summary">
        <div className="summary-card">Total Tables: {summary.total}</div>
        <div className="summary-card">Occupied: {summary.occupied}</div>
        <div className="summary-card">Free: {summary.free}</div>
      </div>

      <div className="tables-grid">
        {tables.map(table => (
          <div key={table.tableNumber} className="table-card">
            <div className="menu-top">
              <h3>Table {table.tableNumber}</h3>
              <span className={`table-status ${table.status}`}>{table.status === "occupied" ? "Occupied" : "Free"}</span>
            </div>
            {table.status === "occupied" && (
              <>
                <p className="muted">{table.customerName}</p>
                <p className="muted">{table.phoneNumber}</p>
              </>
            )}
            <div className="table-actions">
              <button onClick={() => forceFree(table.tableNumber)}>Force Free</button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
