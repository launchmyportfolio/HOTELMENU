import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function AdminLogin({ onLogin, isAdmin, mode = "owner" }) {

  const [form, setForm] = useState({
    username: "",
    name: "",
    ownerName: "",
    email: "",
    password: "",
    phone: "",
    address: ""
  });
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) {
      if (mode === "admin") {
        navigate("/admin/restaurants");
      } else {
        navigate("/owner/home");
      }
    }
  }, [isAdmin, navigate]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    let endpoint = "/api/restaurants/login";
    let payload = {
      email: form.email,
      password: form.password
    };

    if (mode === "register") {
      endpoint = "/api/restaurants/register";
      payload = {
        name: form.name,
        ownerName: form.ownerName,
        email: form.email,
        password: form.password,
        phone: form.phone,
        address: form.address
      };
    }

    if (mode === "admin") {
      endpoint = "/api/admin/login";
      payload = { username: form.username || form.email, password: form.password };
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");

      if (mode === "admin") {
        onLogin(data.token);
        navigate("/admin/restaurants", { replace: true });
      } else {
        onLogin({ token: data.token, restaurant: data.restaurant });
        navigate("/owner/home", { replace: true });
      }

    } catch (err) {
      setError(err.message || "Login failed");
    }
  }

  return (
    <div className="admin-login">

      <form className="login-card" onSubmit={handleSubmit}>

        <h2>{
          mode === "register"
            ? "Owner Register"
            : mode === "admin"
              ? "Admin Login"
              : "Owner Login"
        }</h2>
        {error && <p className="error-text">{error}</p>}

        {mode === "admin" && (
          <input
            type="text"
            name="username"
            placeholder="Admin Username"
            value={form.username}
            onChange={handleChange}
            required
          />
        )}

        {mode === "register" && (
          <>
            <input
              type="text"
              name="name"
              placeholder="Restaurant Name"
              value={form.name}
              onChange={handleChange}
              required
            />
            <input
              type="text"
              name="ownerName"
              placeholder="Owner Name"
              value={form.ownerName}
              onChange={handleChange}
              required
            />
          </>
        )}

        {mode !== "admin" && (
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />
        )}

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
        />

        {mode === "register" && (
          <>
            <input
              type="tel"
              name="phone"
              placeholder="Phone"
              value={form.phone}
              onChange={handleChange}
            />
            <input
              type="text"
              name="address"
              placeholder="Address"
              value={form.address}
              onChange={handleChange}
            />
          </>
        )}

        <button type="submit">{mode === "register" ? "Register" : "Login"}</button>

      </form>

    </div>
  );
}
