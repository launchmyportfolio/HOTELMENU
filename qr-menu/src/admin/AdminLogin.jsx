import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

export default function AdminLogin() {

  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  const navigate = useNavigate();

  function handleLogin(e) {
    e.preventDefault();

    if(user === "Admin@123" && pass === "Admin@123"){
      navigate("/admin/dashboard");
    } else {
      alert("Invalid Credentials");
    }
  }

  return (
    <div className="admin-login">

      <form className="login-card" onSubmit={handleLogin}>

        <h2>Admin Login</h2>

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