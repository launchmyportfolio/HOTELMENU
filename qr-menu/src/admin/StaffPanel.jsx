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

export default function StaffPanel({ token }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({ total: 0, occupied: 0, free: 0 });
  const [error, setError] = useState("");
  const { pushLocalToast } = useNotifications() || {};

  async function fetchData() {
    try {
      const [ordersRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/orders`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/api/admin/tables/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const ordersData = await ordersRes.json();
      const summaryData = await summaryRes.json();
      if (!ordersRes.ok) throw new Error(ordersData.error || "Unable to load orders");
      if (!summaryRes.ok) throw new Error(summaryData.error || "Unable to load table summary");

      setOrders(ordersData);
      setSummary(summaryData);
      setError("");
    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  }

  async function updateStatus(orderId, status) {
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
        title: "Staff action completed",
        message: `Order moved to ${status}.`,
        type: status === "Completed" ? "PAYMENT_SUCCESS" : "ORDER_SERVED",
        priority: "MEDIUM"
      });

      fetchData();
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
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markPaymentDone(orderId) {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/payment/mark-success`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to mark payment done");

      pushLocalToast?.({
        title: "Payment updated",
        message: "Payment marked as completed.",
        type: "PAYMENT_SUCCESS",
        priority: "MEDIUM"
      });

      fetchData();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!token) return undefined;
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, [token]);

  const staffOrders = useMemo(() => {
    return orders.filter(order => {
      const status = String(order.status || "").toLowerCase();
      return status === "ready" || status === "served" || status === "completed";
    });
  }, [orders]);

  return (
    <div className="admin-dashboard">
      <h1>Staff Panel</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="tables-summary">
        <div className="summary-card highlight">Active Tables: {summary.occupied}</div>
        <div className="summary-card">Free Tables: {summary.free}</div>
        <div className="summary-card">Total Tables: {summary.total}</div>
      </div>

      <div className="orders-grid">
        {staffOrders.map(order => {
          const paymentStatus = normalizePaymentStatus(order.paymentStatus);
          const paymentDone = paymentStatus === "SUCCESS";
          const paymentStatusLabel = paymentDone ? "PAID" : paymentStatus;
          const orderStatus = String(order.status || "").toUpperCase();
          const canMarkPayment = (orderStatus === "SERVED" || orderStatus === "COMPLETED") && !paymentDone;

          return (
            <article key={order._id} className="order-card">
              <div className="order-head">
                <div>
                  <p className="order-label">Table</p>
                  <h3>#{order.tableNumber}</h3>
                </div>
                <span className={`status-pill ${String(order.status || "").toLowerCase()}`}>{order.status}</span>
              </div>

              <p className="muted">{order.customerName}</p>

              <div className="order-payment-meta">
                <span>{order.paymentMethod || "Not selected"}</span>
                <span className={`payment-pill ${String(paymentStatus || "PENDING").toLowerCase()}`}>
                  {paymentStatusLabel || "PENDING"}
                </span>
              </div>

              <div className="order-items">
                {getBillItems(order).map((item, idx) => (
                  <div className="order-line" key={`${order._id}-staff-${item.billItemId || idx}`}>
                    <span>
                      {item.name} <span className="muted">x{item.qty}</span>
                      <span className="muted small"> • {item.category || "General"}</span>
                    </span>
                    <span className={`status-pill ${String(normalizeItemStatus(item.status)).toLowerCase()}`}>
                      {normalizeItemStatus(item.status)}
                    </span>
                    <button type="button" onClick={() => updateItemStatus(order._id, item.billItemId, "Served")}>
                      Serve Item
                    </button>
                  </div>
                ))}
              </div>

              <div className="order-buttons">
                <button type="button" onClick={() => updateStatus(order._id, "Served")}>
                  Mark Served
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(order._id, "Completed")}
                  disabled={!paymentDone}
                >
                  Complete Order
                </button>
                {canMarkPayment && (
                  <button type="button" onClick={() => markPaymentDone(order._id)}>
                    Mark Payment Done
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!staffOrders.length && !error && (
        <p className="info-text">No ready/served orders waiting for staff action.</p>
      )}
    </div>
  );
}
