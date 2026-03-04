import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import "./Status.css";

export default function Status() {

  const [status, setStatus] = useState("received");
  const location = useLocation();
  const orderId = location.state?.orderId;

  // Demo status change simulation
  useEffect(() => {

    async function fetchStatus() {

      const res = await fetch("http://localhost:5000/api/orders");
      const data = await res.json();

      const order = data.find(o => o._id === orderId);
      if (order) {
        if (order.status === "Pending") setStatus("received");
        if (order.status === "Cooking") setStatus("preparing");
        if (order.status === "Ready") setStatus("ready");
        if(order.status === "Served") setStatus("served");
      }
    }

    fetchStatus();

    const interval = setInterval(fetchStatus, 3000);

    return () => clearInterval(interval);

  }, [orderId]);

  return (

    <section className="status-section">

  <div className="status-overlay"></div>

  <div className="status-container">

    <h1 className="status-heading">Order Status</h1>

    <p className="status-subtext">
      Track the progress of your order
    </p>

    <div className="status-cards">

      <div className={`status-card ${status === "received" ? "status-active" : ""}`}>
        Order Received
      </div>

      <div className={`status-card ${status === "preparing" ? "status-active" : ""}`}>
        Preparing
      </div>

      <div className={`status-card ${status === "ready" ? "status-active" : ""}`}>
        Ready to Serve
      </div>

    </div>

  </div>

</section>
  );
}