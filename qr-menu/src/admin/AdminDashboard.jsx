import { useEffect, useState } from "react";
import OrderCard from "../components/OrderCard";
import "../styles/Admin.css";

export default function AdminDashboard(){

  const [orders, setOrders] = useState([]);

  async function fetchOrders(){
    const res = await fetch("https://hotelmenu-6752.onrender.com/api/orders");
    const data = await res.json();
    setOrders(data);
  }

  useEffect(() => {
    fetchOrders();

    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);

  }, []);

  return (

    <div className="admin-dashboard">

      <h1>Restaurant Orders</h1>

      <div className="orders-grid">

        {orders.map(order => (
          <OrderCard key={order._id} order={order} refresh={fetchOrders}/>
        ))}

      </div>

    </div>

  );
}