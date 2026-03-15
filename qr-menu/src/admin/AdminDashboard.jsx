import { useEffect, useState } from "react";
import OrderCard from "../components/OrderCard";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function AdminDashboard({ token }){

  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  async function fetchOrders(){
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error("Unable to fetch orders");
      }

      const data = await res.json();
      setOrders(data);
      setError("");

    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  }

  useEffect(() => {
    if (token) {
      fetchOrders();

      const interval = setInterval(fetchOrders, 5000);
      return () => clearInterval(interval);
    }

    return undefined;
  }, [token]);

  return (

    <div className="admin-dashboard">

      <h1>Restaurant Orders</h1>

      {error && <p className="error-text">{error}</p>}

      <div className="orders-grid">

        {orders.map(order => (
          <OrderCard key={order._id} order={order} refresh={fetchOrders} token={token}/>
        ))}

      </div>

    </div>

  );
}
