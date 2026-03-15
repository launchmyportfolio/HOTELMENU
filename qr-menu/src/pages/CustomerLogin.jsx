import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./CustomerLogin.css";

const API_BASE = "http://localhost:5000";

export default function CustomerLogin({ onLogin, session }) {

  const [form, setForm] = useState({
    tableNumber: "",
    customerName: "",
    phoneNumber: ""
  });

  const [error, setError] = useState("");
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
    setError("");

    const payload = {
      tableNumber: Number(form.tableNumber),
      customerName: form.customerName.trim(),
      phoneNumber: form.phoneNumber.trim()
    };

    if (!payload.tableNumber || !payload.customerName || !payload.phoneNumber) {
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
        <p className="login-subtext">Enter your table to browse the menu.</p>

        {error && <p className="login-error">{error}</p>}

        <form className="login-form" onSubmit={handleSubmit}>

          <label>
            Table Number
            <input
              type="number"
              name="tableNumber"
              value={form.tableNumber}
              onChange={handleChange}
              min="1"
              required
            />
          </label>

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

          <button type="submit" className="login-btn">
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
