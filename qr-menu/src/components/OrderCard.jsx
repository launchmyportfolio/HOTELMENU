const API_BASE = import.meta.env.VITE_API_URL;

export default function OrderCard({ order, refresh, token }) {

  async function updateStatus(status) {

    await fetch(`${API_BASE}/api/orders/${order._id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    refresh();
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

    <div className="order-card">

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
        {order.items.map((i, index) => (
          <div key={index} className="order-line">
            <span>{i.name}</span>
            <span className="muted">x{i.qty}</span>
          </div>
        ))}
      </div>

      <div className="order-total">
        <p className="muted">Total</p>
        <h4>₹{order.total}</h4>
      </div>

      <div className="order-status-row">
        <span className={`status-pill ${order.status?.toLowerCase()}`}>{order.status}</span>
        <div className="order-buttons">
          <button onClick={() => updateStatus("Pending")}>Pending</button>
          <button onClick={() => updateStatus("Cooking")}>Cooking</button>
          <button onClick={() => updateStatus("Ready")}>Ready</button>
          <button onClick={() => updateStatus("Served")}>Served</button>
          <button onClick={() => updateStatus("Completed")}>Completed</button>
        </div>
      </div>

      <button className="delete full-width" onClick={deleteOrder}>
        Delete
      </button>

    </div>

  );
}
