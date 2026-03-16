import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;
const DEFAULT_RESTAURANT = import.meta.env.VITE_DEFAULT_RESTAURANT_ID || "defaultRestaurant";

export default function MenuManagement({ token, mode = "manage", restaurantId }) {

  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  async function fetchMenu() {
    try {
      const res = await fetch(`${API_BASE}/api/menu?restaurantId=${restaurantId || DEFAULT_RESTAURANT}`);
      const data = await res.json();
      setItems(data);
      setError("");
    } catch (err) {
      setError("Unable to load menu");
    }
  }

  useEffect(() => {
    fetchMenu();
  }, [restaurantId]);

  async function toggleAvailability(id, available) {
    try {
      await fetch(`${API_BASE}/api/menu/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ available })
      });
      fetchMenu();
    } catch (err) {
      setError("Update failed");
    }
  }

  async function deleteItem(id) {
    if (!window.confirm("Delete this item?")) return;
    try {
      await fetch(`${API_BASE}/api/menu/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      fetchMenu();
    } catch (err) {
      setError("Delete failed");
    }
  }

  const heading = mode === "edit" ? "Edit Product" : "Menu Management";

  return (
    <div className="admin-dashboard">
      <h1>{heading}</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="menu-grid">
        {items.map(item => (
          <div key={item._id} className="menu-card">
            <div className="menu-thumb">
              {item.image ? (
                <img src={item.image} alt={item.name} />
              ) : (
                <div className="placeholder">Image</div>
              )}
            </div>

            <div className="menu-info">
              <div className="menu-top">
                <h3>{item.name}</h3>
                <span className="badge">{item.category}</span>
              </div>
              <p className="muted">{item.description}</p>
              <p className="price">₹{item.price}</p>
              <p className={`status-pill ${item.available ? "ok" : "off"}`}>
                {item.available ? "Available" : "Out of Stock"}
              </p>

              <div className="menu-actions">
                <button
                  onClick={() => toggleAvailability(item._id, !item.available)}
                >
                  {item.available ? "Mark Out of Stock" : "Mark Available"}
                </button>

                <Link className="ghost-btn" to={`/owner/products/${item._id}`}>
                  Edit
                </Link>

                <button className="danger" onClick={() => deleteItem(item._id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <p className="info-text">No menu items yet. Add one to get started.</p>
        )}
      </div>
    </div>
  );
}
