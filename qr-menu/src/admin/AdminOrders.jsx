import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import OrderCard from "../components/OrderCard";
import "../styles/Admin.css";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_URL;

export default function AdminOrders({ token, restaurantId }){

  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [highlightOrderId, setHighlightOrderId] = useState("");
  const location = useLocation();

  const targetOrderId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("highlightOrder") || params.get("orderId") || "";
  }, [location.search]);

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

      const socket = io(API_BASE, { transports: ["websocket", "polling"] });
      socket.on("new-order", payload => {
        if (payload?.restaurantId === restaurantId) {
          fetchOrders();
        }
      });
      socket.on("order-updated", payload => {
        if (payload?.restaurantId === restaurantId) {
          fetchOrders();
        }
      });

      const interval = setInterval(fetchOrders, 5000);
      return () => {
        clearInterval(interval);
        socket.disconnect();
      };
    }

    return undefined;
  }, [token, restaurantId]);

  useEffect(() => {
    if (!targetOrderId || !orders.length) return;
    const node = document.querySelector(`[data-order-card-id="${targetOrderId}"]`);
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightOrderId(targetOrderId);
    const timeout = window.setTimeout(() => setHighlightOrderId(""), 5200);
    return () => window.clearTimeout(timeout);
  }, [orders, targetOrderId]);

  return (

    <div className="admin-dashboard">

      <h1>Restaurant Orders</h1>

      {error && <p className="error-text">{error}</p>}

      <div className="orders-grid">

        {orders.map(order => (
          <OrderCard
            key={order._id}
            order={order}
            refresh={fetchOrders}
            token={token}
            highlighted={highlightOrderId === order._id}
          />
        ))}

      </div>

    </div>

  );
}
