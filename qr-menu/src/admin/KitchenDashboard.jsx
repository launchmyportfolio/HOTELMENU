import { useEffect, useMemo, useState } from "react";
import "../styles/Admin.css";
import { useNotifications } from "../context/NotificationContext";
import { getBillItems, normalizeItemStatus } from "../utils/orderBillUtils";

const API_BASE = import.meta.env.VITE_API_URL;

function normalizePaymentStatus(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "PAID") return "SUCCESS";
  if (["PENDING", "INITIATED", "SUCCESS", "FAILED"].includes(key)) return key;
  return "PENDING";
}

export default function KitchenDashboard({ token }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const { pushLocalToast } = useNotifications() || {};

  async function fetchOrders() {
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load orders");
      setOrders(data);
      setError("");
    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  }

  async function updateOrder(orderId, status) {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to update order");

      pushLocalToast?.({
        title: "Kitchen status updated",
        message: `Order moved to ${status}.`,
        type: status === "Ready" ? "ORDER_READY" : "ORDER_PREPARING",
        priority: status === "Ready" ? "HIGH" : "MEDIUM"
      });

      fetchOrders();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateItemStatus(orderId, billItemId, status) {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ billItemId, status })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to update item");
      fetchOrders();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!token) return undefined;
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const kitchenOrders = useMemo(() => {
    return orders.filter(order => {
      const status = String(order.status || "").toLowerCase();
      return status === "pending" || status === "cooking" || status === "preparing" || status === "ready";
    });
  }, [orders]);

  return (
    <div className="admin-dashboard">
      <h1>Kitchen Dashboard</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="orders-grid">
        {kitchenOrders.map(order => {
          const paymentStatus = normalizePaymentStatus(order.paymentStatus);
          const paymentStatusLabel = paymentStatus === "SUCCESS" ? "PAID" : paymentStatus;
          return (
            <article key={order._id} className="order-card">
            <div className="order-head">
              <div>
                <p className="order-label">Table</p>
                <h3>#{order.tableNumber}</h3>
              </div>
              <span className={`status-pill ${String(order.status || "").toLowerCase()}`}>{order.status}</span>
            </div>

            <div className="order-items">
              {getBillItems(order).map((item, idx) => (
                <div className="order-line" key={`${order._id}-${item.billItemId || idx}`}>
                  <span>
                    {item.name} <span className="muted">x{item.qty}</span>
                    <span className="muted small"> • {item.category || "General"}</span>
                  </span>
                  <span className={`status-pill ${String(normalizeItemStatus(item.status)).toLowerCase()}`}>
                    {normalizeItemStatus(item.status)}
                  </span>
                  <div className="order-buttons">
                    <button type="button" onClick={() => updateItemStatus(order._id, item.billItemId, "Preparing")}>
                      Start
                    </button>
                    <button type="button" onClick={() => updateItemStatus(order._id, item.billItemId, "Ready")}>
                      Ready
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="order-total">
              <p className="muted">Total</p>
              <h4>₹{Number(order.total || 0).toFixed(2)}</h4>
            </div>

            <div className="order-payment-meta">
              <span>{order.paymentMethod || "Pay at Counter"}</span>
              <span className={`payment-pill ${String(paymentStatus || "PENDING").toLowerCase()}`}>
                {paymentStatusLabel || "PENDING"}
              </span>
            </div>

            <div className="order-buttons">
              <button type="button" onClick={() => updateOrder(order._id, "Preparing")}>
                Start Preparing
              </button>
              <button type="button" onClick={() => updateOrder(order._id, "Ready")}>
                Mark Ready
              </button>
            </div>
            </article>
          );
        })}
      </div>

      {!kitchenOrders.length && !error && (
        <p className="info-text">No active kitchen orders right now.</p>
      )}
    </div>
  );
}
