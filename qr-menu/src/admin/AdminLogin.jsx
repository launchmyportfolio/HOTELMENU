import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

export default function AdminLogin({ onLogin, isAdmin }) {

  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    if (isAdmin) navigate("/admin/dashboard");
  }, [isAdmin, navigate]);

  async function handleLogin(e) {
    e.preventDefault();

    setError("");

    try {
      const res = await fetch("http://localhost:5000/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });

      if (!res.ok) {
        throw new Error("Invalid credentials");
      }

      const data = await res.json();
      onLogin(data.token);
      navigate("/admin/dashboard");

    } catch (err) {
      setError(err.message || "Login failed");
    }
  }

  return (
    <div className="admin-login">

      <form className="login-card" onSubmit={handleLogin}>

        <h2>Admin Login</h2>
        {error && <p className="error-text">{error}</p>}

        <input
          type="text"
          placeholder="Username"
          value={user}
          onChange={e => setUser(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={pass}
          onChange={e => setPass(e.target.value)}
        />

        <button type="submit">Login</button>

      </form>

    </div>
  );
}
