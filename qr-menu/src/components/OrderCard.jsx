import { getBillItems, normalizeItemStatus } from "../utils/orderBillUtils";

const API_BASE = import.meta.env.VITE_API_URL;

function normalizePaymentStatus(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "PAID") return "SUCCESS";
  if (["PENDING", "INITIATED", "SUCCESS", "FAILED"].includes(key)) return key;
  return "PENDING";
}

function isUpiOrder(order = {}) {
  const provider = String(order.paymentProvider || order.paymentMethod || "").toUpperCase();
  return provider.includes("UPI")
    || Boolean(String(order.paymentGatewayResponse?.upiId || "").trim())
    || Boolean(String(order.paymentGatewayResponse?.qrImageUrl || "").trim());
}

export default function OrderCard({ order, refresh, token, highlighted = false }) {
  const paymentStatus = normalizePaymentStatus(order.paymentStatus);
  const orderStatusKey = String(order.status || "").trim().toUpperCase();
  const paymentDone = paymentStatus === "SUCCESS";
  const paymentStatusLabel = paymentDone ? "PAID" : paymentStatus;
  const canMarkPayment = (orderStatusKey === "SERVED" || orderStatusKey === "COMPLETED") && !paymentDone;
  const needsUpiApproval = canMarkPayment && paymentStatus === "INITIATED" && isUpiOrder(order);
  const billItems = getBillItems(order);

  async function callOwnerEndpoint(path, payload = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Unable to update payment state.");
    }

    return data;
  }

  async function updateStatus(status) {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to update order status.");
      }

      refresh();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function updateItemStatus(billItemId, status) {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${order._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ billItemId, status })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to update item status.");
      }

      refresh();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function approveUpiPayment() {
    try {
      await callOwnerEndpoint(`/api/orders/${order._id}/payment/approve-upi`);
      refresh();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function markPaymentDone() {
    try {
      await callOwnerEndpoint(`/api/orders/${order._id}/payment/mark-success`);
      refresh();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function deleteOrder() {
    if (!window.confirm("Delete this order?")) return;

    await fetch(`${API_BASE}/api/orders/${order._id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    refresh();
  }

  return (
    <div
      className={`order-card ${highlighted ? "order-card-highlight" : ""}`}
      data-order-card-id={order._id}
    >
      <div className="order-head">
        <div>
          <p className="order-label">Table</p>
          <h3>#{order.tableNumber}</h3>
        </div>
        <div className="order-customer">
          <p className="muted">{order.customerName || "Guest"}</p>
          <p className="muted small">{order.phoneNumber || "N/A"}</p>
        </div>
      </div>

      <div className="order-items">
        {billItems.map((i, index) => (
          <div key={i.billItemId || index} className="order-line">
            <span>
              {i.name} <span className="muted">x{i.qty}</span>
              <span className="muted small"> • {i.category || "General"}</span>
            </span>
            <span className={`status-pill ${String(normalizeItemStatus(i.status)).toLowerCase()}`}>
              {normalizeItemStatus(i.status)}
            </span>
            <div className="order-buttons">
              <button type="button" onClick={() => updateItemStatus(i.billItemId, "Preparing")}>Preparing</button>
              <button type="button" onClick={() => updateItemStatus(i.billItemId, "Ready")}>Ready</button>
              <button type="button" onClick={() => updateItemStatus(i.billItemId, "Served")}>Served</button>
            </div>
          </div>
        ))}
      </div>

      <div className="order-total">
        <p className="muted">Total</p>
        <h4>₹{Number(order.total || 0).toFixed(2)}</h4>
      </div>

      <div className="order-payment">
        <div className="order-payment-row">
          <p className="muted">Payment Method</p>
          <span className={`payment-pill ${String(paymentStatus || "PENDING").toLowerCase()}`}>
            {paymentStatusLabel || "PENDING"}
          </span>
        </div>
        <p className="order-payment-value">{order.paymentMethod || "Not selected"}</p>
        <div className="order-payment-meta">
          <span>{order.paymentProvider || "Not selected"}</span>
          {order.transactionId && <span>Txn: {order.transactionId}</span>}
          {(Number(order.payableTotal || 0) > 0) && (
            <span>Payable: ₹{Number(order.payableTotal || order.total || 0).toFixed(2)}</span>
          )}
        </div>
        {order.paymentInstructions && (
          <p className="order-payment-note">{order.paymentInstructions}</p>
        )}
      </div>

      {canMarkPayment && (
        <div className="order-buttons order-payment-actions">
          {needsUpiApproval ? (
            <button type="button" onClick={approveUpiPayment}>Approve UPI Payment</button>
          ) : (
            <button type="button" onClick={markPaymentDone}>Mark Payment Done</button>
          )}
        </div>
      )}

      <div className="order-status-row">
        <span className={`status-pill ${String(order.status || "").toLowerCase()}`}>{order.status}</span>
        <div className="order-buttons">
          <button onClick={() => updateStatus("Pending")}>Pending</button>
          <button onClick={() => updateStatus("Preparing")}>Preparing</button>
          <button onClick={() => updateStatus("Ready")}>Ready</button>
          <button onClick={() => updateStatus("Served")}>Served</button>
          <button onClick={() => updateStatus("Completed")} disabled={!paymentDone}>
            Completed
          </button>
          <button onClick={() => updateStatus("Rejected")}>Rejected</button>
        </div>
      </div>

      <button className="delete full-width" onClick={deleteOrder}>
        Delete
      </button>
    </div>
  );
}
