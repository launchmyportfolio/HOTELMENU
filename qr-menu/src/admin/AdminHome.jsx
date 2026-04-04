import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../utils/apiBase";
import "../styles/Admin.css";

export default function AdminHome({ token, restaurant }) {

  const navigate = useNavigate();
  const [alerts, setAlerts] = useState({
    activeTables: 0,
    pendingOrders: 0,
    readyOrders: 0,
    criticalAlerts: 0
  });
  const [error, setError] = useState("");

  const cards = useMemo(() => ([
    { title: "Analytics", description: "Track revenue, paid bills, and payment trends", path: "/owner/analytics" },
    { title: "Orders", description: "View and update restaurant orders", path: "/owner/orders" },
    { title: "Tables", description: "Monitor and free tables", path: "/owner/tables" },
    { title: "Products", description: "Manage the menu items", path: "/owner/products" },
    { title: "Add Product", description: "Create a new menu item", path: "/owner/products/add" },
    { title: "Owner Settings", description: "Update branding, profile, and password", path: "/owner/settings" },
    { title: "Payment Settings", description: "Configure Razorpay, UPI, Cash and more", path: "/owner/settings/payments" },
    { title: "Notification Center", description: "Review alerts and mark them as read", path: "/notifications" }
  ]), []);

  useEffect(() => {
    if (!token) return undefined;

    async function fetchAlerts() {
      try {
        const [ordersRes, summaryRes, criticalRes] = await Promise.all([
          fetch(`${API_BASE}/api/orders`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_BASE}/api/admin/tables/summary`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_BASE}/api/notifications/owner?role=ADMIN&priority=CRITICAL&limit=20`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        const ordersData = await ordersRes.json();
        const summaryData = await summaryRes.json();
        const criticalData = await criticalRes.json();

        if (!ordersRes.ok || !summaryRes.ok || !criticalRes.ok) {
          throw new Error("Unable to load smart alerts");
        }

        const pendingOrders = ordersData.filter(order => String(order.status || "").toLowerCase() === "pending").length;
        const readyOrders = ordersData.filter(order => String(order.status || "").toLowerCase() === "ready").length;
        const criticalAlerts = Array.isArray(criticalData.notifications) ? criticalData.notifications.length : 0;

        setAlerts({
          activeTables: Number(summaryData.occupied || 0),
          pendingOrders,
          readyOrders,
          criticalAlerts
        });
        setError("");
      } catch (err) {
        setError(err.message);
      }
    }

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [token]);

  function handleClick(card) {
    if (card.action) return card.action();
    if (card.path) navigate(card.path);
  }

  return (
    <div className="admin-dashboard">
      {restaurant && (
        <div className="owner-brand-banner">
          <div className="owner-brand-mark">
            {restaurant.logoUrl
              ? <img src={restaurant.logoUrl} alt={restaurant.name || "Restaurant"} />
              : <span>{String(restaurant.name || "HM").slice(0, 2).toUpperCase()}</span>}
          </div>
          <div>
            <p className="owner-brand-label">Owner Panel</p>
            <h2 className="owner-brand-name">{restaurant.name || "Restaurant"}</h2>
          </div>
        </div>
      )}
      <h1>Owner Dashboard</h1>
      {restaurant?.canAcceptNewOrders === false && (
        <p className="error-text">
          Subscription payment is pending. You can access the dashboard, but new customer orders are currently blocked until admin marks payment as paid.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}

      <div className="tables-summary">
        <div className="summary-card highlight">Active Tables: {alerts.activeTables}</div>
        <div className="summary-card">Pending Orders: {alerts.pendingOrders}</div>
        <div className="summary-card">Ready Orders: {alerts.readyOrders}</div>
        <div className={`summary-card ${alerts.criticalAlerts > 0 ? "critical-alert-card" : ""}`}>
          Critical Alerts: {alerts.criticalAlerts}
        </div>
      </div>

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
