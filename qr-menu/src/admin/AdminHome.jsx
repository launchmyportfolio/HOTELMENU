import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

export default function AdminHome({ onLogout }) {

  const navigate = useNavigate();

  const cards = useMemo(() => ([
    { title: "Orders", description: "View and update restaurant orders", path: "/owner/orders" },
    { title: "Tables", description: "Monitor and free tables", path: "/owner/tables" },
    { title: "Products", description: "Manage the menu items", path: "/owner/products" },
    { title: "Add Product", description: "Create a new menu item", path: "/owner/products/add" }
  ]), [navigate, onLogout]);

  function handleClick(card) {
    if (card.action) return card.action();
    if (card.path) navigate(card.path);
  }

  return (
    <div className="admin-dashboard">
      <h1>Owner Dashboard</h1>

      <div className="admin-home-grid">
        {cards.map(card => (
          <div
            key={card.title}
            className="admin-home-card"
            role="button"
            tabIndex={0}
            onClick={() => handleClick(card)}
            onKeyDown={e => (e.key === "Enter" || e.key === " ") && handleClick(card)}
          >
            <h3>{card.title}</h3>
            <p className="muted">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
