import { useEffect, useState } from "react";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function AdminRestaurants({ token }) {
  const [restaurants, setRestaurants] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/restarents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load restaurants");
      setRestaurants(data);
      setError("");
    } catch (err) {
      setError(err.message);
      setRestaurants([]);
    }
  }

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this restaurant?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/restarents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = restaurants.filter(r => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return [
      r.name,
      r.ownerName,
      r.email,
      r.phone,
      r.address
    ].some(val => (val || "").toLowerCase().includes(term));
  });

  return (
    <div className="admin-dashboard">
      <h1>Registered Restaurants</h1>
      {error && <p className="error-text">{error}</p>}
      <div className="table-controls">
        <input
          type="text"
          placeholder="Search by name, owner, email, phone, address"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="table-search"
        />
      </div>

      <div className="table-list">
        <div className="table-row table-head">
          <span>Name</span>
          <span>Owner</span>
          <span>Email</span>
          <span>Phone</span>
          <span>Address</span>
          <span>Actions</span>
        </div>

        {filtered.map(r => (
          <div key={r._id} className="table-row">
            <span className="strong">{r.name}</span>
            <span>{r.ownerName}</span>
            <span>{r.email}</span>
            <span>{r.phone || "—"}</span>
            <span>{r.address || "—"}</span>
            <span className="table-actions">
              <button className="danger" onClick={() => handleDelete(r._id)}>Delete</button>
            </span>
          </div>
        ))}

        {filtered.length === 0 && !error && (
          <p className="info-text" style={{ textAlign: "center", padding: "16px" }}>
            No restaurants match your search.
          </p>
        )}
      </div>

    </div>
  );
}
