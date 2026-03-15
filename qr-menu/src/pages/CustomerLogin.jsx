import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./CustomerLogin.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function CustomerLogin({ onLogin, session }) {

  const paramsTable = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const t = Number(params.get("table"));
    return Number.isFinite(t) && t > 0 ? t : null;
  }, []);

  const [form, setForm] = useState({
    customerName: "",
    phoneNumber: ""
  });

  const [error, setError] = useState(paramsTable ? "" : "Invalid table QR code.");
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate("/items", { replace: true });
    }
  }, [session, navigate]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!paramsTable) {
      setError("Invalid table QR code.");
      return;
    }
    setError("");

    const payload = {
      tableNumber: paramsTable,
      customerName: form.customerName.trim(),
      phoneNumber: form.phoneNumber.trim()
    };

    if (!payload.customerName || !payload.phoneNumber) {
      setError("Please fill in all fields.");
      return;
    }

    try {

      const res = await fetch(`${API_BASE}/api/customer/session/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to start session.");
      }

      onLogin({
        tableNumber: data.tableNumber,
        customerName: data.customerName,
        phoneNumber: data.phoneNumber,
        sessionId: data.sessionId
      });

      navigate("/items", { replace: true });

    } catch (err) {
      setError(err.message);
    }
  }

  return (

    <div className="login-page">

      <div className="login-overlay"></div>

      <div className="login-card">

        <h1>Start Your Order</h1>
        <p className="login-subtext">Scan the QR at your table to continue.</p>

        {paramsTable && (
          <p className="muted" style={{ marginBottom: "8px" }}>
            Table: <strong>{paramsTable}</strong>
          </p>
        )}

        {error && <p className="login-error">{error}</p>}

        <form className="login-form" onSubmit={handleSubmit}>

          <label>
            Name
            <input
              type="text"
              name="customerName"
              value={form.customerName}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Phone Number
            <input
              type="tel"
              name="phoneNumber"
              value={form.phoneNumber}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" className="login-btn" disabled={!paramsTable}>
            Start Ordering
          </button>

          <p className="login-note">
            Only one active session per table. If your table is occupied, please ask the staff.
          </p>

        </form>

      </div>

    </div>
  );
}
