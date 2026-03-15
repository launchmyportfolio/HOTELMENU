import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import "./Cart.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function Cart({ session }) {

  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const cart = location.state?.cart || [];

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  async function handlePlaceOrder() {

    setError("");

    if (!session) {
      navigate("/login");
      return;
    }

    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    const orderData = {
      tableNumber: session.tableNumber,
      customerName: session.customerName,
      phoneNumber: session.phoneNumber,
      sessionId: session.sessionId,
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty
      })),
      total
    };

    console.log("Sending order:", orderData);

    try {

      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(orderData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to place order.");
      }

      console.log("Server response:", data);

      navigate("/status", { state: { orderId: data._id } });

    } catch (error) {
      console.error("Order failed:", error);
      setError(error.message);
    }
  }
  return (

    <div className="cart-container">

      <div className="cart-content">

        <h2>Your Cart</h2>
        {error && <p style={{ color: "#d7263d", marginTop: "8px" }}>{error}</p>}

        {cart.length === 0 ? (
          <p className="empty-cart">Your cart is empty</p>
        ) : (
          <>
            <ul className="cart-items">

              {cart.map(item => (

                <li key={item._id || item.id}>

                  <span>{item.name}</span>

                  <span>
                    ₹{item.price} × {item.qty}
                  </span>

                  <span>
                    ₹{item.price * item.qty}
                  </span>

                </li>

              ))}

            </ul>

            <h3 className="cart-total">
              Total: ₹{total}
            </h3>

            <div className="button-wrapper">

              <button
                className="place-order-btn"
                onClick={handlePlaceOrder}
              >
                Place Order
              </button>

            </div>

          </>
        )}

      </div>

    </div>
  );
}
