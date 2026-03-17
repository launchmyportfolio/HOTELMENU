import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import "./Cart.css";
import { useCustomerSession } from "../context/CustomerSessionContext";

const API_BASE = import.meta.env.VITE_API_URL;

export default function Cart({ session }) {

  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const restaurantId = params.restaurantId;
  const { session: ctxSession } = useCustomerSession();
  const [error, setError] = useState("");
  const [cart, setCart] = useState(() => location.state?.cart || []);

  const tableNumber = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const t = Number(query.get("table"));
    if (Number.isFinite(t) && t > 0) return t;
    return ctxSession?.tableNumber || session?.tableNumber || null;
  }, [location.search, ctxSession, session]);

  const tableQuery = tableNumber ? `?table=${tableNumber}` : "";

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cart]
  );

  function updateQty(id, delta) {
    setCart(prev =>
      prev
        .map(item =>
          item._id === id || item.id === id
            ? { ...item, qty: Math.max(0, item.qty + delta) }
            : item
        )
        .filter(item => item.qty > 0)
    );
  }

  function removeItem(id) {
    setCart(prev => prev.filter(item => item._id !== id && item.id !== id));
  }

  async function handlePlaceOrder() {

    setError("");

    const activeSession = session || ctxSession;

    if (!activeSession) {
      navigate(`/restaurant/${restaurantId}/login${tableQuery}`);
      return;
    }

    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    const orderData = {
      restaurantId,
      tableNumber: activeSession.tableNumber,
      customerName: activeSession.customerName,
      phoneNumber: activeSession.phoneNumber,
      sessionId: activeSession.sessionId,
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

      navigate(`/restaurant/${restaurantId}/status${tableQuery}`, { state: { orderId: data._id } });

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
            <div className="cart-items">

              {cart.map(item => (

                <div key={item._id || item.id} className="cart-card">

                  <div className="cart-card__info">

                    <div className="cart-thumb">
                      {item.image
                        ? <img src={item.image} alt={item.name} />
                        : <span className="placeholder">Img</span>}
                    </div>

                    <div className="cart-meta">
                      <h4>{item.name}</h4>
                      <p className="muted">₹{item.price}</p>

                      <div className="qty-controls">
                        <button onClick={() => updateQty(item._id || item.id, -1)} aria-label="Decrease quantity">-</button>
                        <span>{item.qty}</span>
                        <button onClick={() => updateQty(item._id || item.id, 1)} aria-label="Increase quantity">+</button>
                      </div>
                    </div>

                  </div>

                  <div className="cart-card__actions">
                    <p className="line-total">₹{item.price * item.qty}</p>
                    <button className="remove-btn" onClick={() => removeItem(item._id || item.id)}>Remove</button>
                  </div>

                </div>

              ))}

            </div>

            <div className="checkout-bar">
              <div>
                <p className="muted">Total</p>
                <h3 className="cart-total">₹{total}</h3>
              </div>

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
