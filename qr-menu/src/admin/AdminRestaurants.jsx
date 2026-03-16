import { useEffect, useState } from "react";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function AdminRestaurants({ token }) {
  const [restaurants, setRestaurants] = useState([]);
  const [error, setError] = useState("");

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

  return (
    <div className="admin-dashboard">
      <h1>Registered Restaurants</h1>
      {error && <p className="error-text">{error}</p>}
      <div className="menu-grid">
        {restaurants.map(r => (
          <div key={r._id} className="menu-card">
            <div className="menu-info">
              <div className="menu-top">
                <h3>{r.name}</h3>
                <span className="badge">{r.ownerName}</span>
              </div>
              <p className="muted">{r.email}</p>
              {r.phone && <p className="muted">{r.phone}</p>}
              {r.address && <p className="muted">{r.address}</p>}
              <div className="menu-actions" style={{ marginTop: "8px" }}>
                <button className="danger" onClick={() => handleDelete(r._id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {restaurants.length === 0 && !error && (
          <p className="info-text">No restaurants registered yet.</p>
        )}
      </div>
    </div>
  );
}
