import { useState } from "react";
import { API_BASE } from "../utils/apiBase";
import "../styles/Admin.css";

export default function AdminCreateRestaurant({ token }) {
  const [form, setForm] = useState({
    name: "",
    ownerName: "",
    email: "",
    password: "",
    phone: "",
    address: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/restaurants/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to create restaurant");
      setSuccess(data.message || `Created restaurant: ${data.restaurant?.name || "Success"}`);
      setForm({ name: "", ownerName: "", email: "", password: "", phone: "", address: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-dashboard">
      <h1>Create Restaurant</h1>
      {error && <p className="error-text">{error}</p>}
      {success && <p className="info-text">{success}</p>}

      <form className="menu-form" onSubmit={handleSubmit} style={{ maxWidth: "640px" }}>
        <label>
          Restaurant Name
          <input name="name" value={form.name} onChange={handleChange} required />
        </label>
        <label>
          Owner Name
          <input name="ownerName" value={form.ownerName} onChange={handleChange} required />
        </label>
        <label>
          Email
          <input type="email" name="email" value={form.email} onChange={handleChange} required />
        </label>
        <label>
          Password
          <input type="password" name="password" value={form.password} onChange={handleChange} required />
        </label>
        <label>
          Phone
          <input name="phone" value={form.phone} onChange={handleChange} />
        </label>
        <label>
          Address
          <input name="address" value={form.address} onChange={handleChange} />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create Restaurant"}</button>
      </form>
    </div>
  );
}
