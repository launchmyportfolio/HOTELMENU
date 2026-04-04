import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import "./Cart.css";
import { useCustomerSession } from "../context/CustomerSessionContext";
import { useNotifications } from "../context/NotificationContext";
import { API_BASE } from "../utils/apiBase";
import { buildCustomerRoute, readTableNumberFromSearch } from "../utils/customerRouting";
const PLACEHOLDER_RESTAURANT_IDS = new Set(["", "defaultrestaurant", "undefined", "null"]);

function normalizeRestaurantId(value = "") {
  return String(value || "").trim();
}

function isPlaceholderRestaurantId(value = "") {
  return PLACEHOLDER_RESTAURANT_IDS.has(normalizeRestaurantId(value).toLowerCase());
}

function looksLikeMongoObjectId(value = "") {
  return /^[a-f0-9]{24}$/i.test(normalizeRestaurantId(value));
}

export default function Cart({ session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const routeRestaurantId = normalizeRestaurantId(params.restaurantId);
  const { session: ctxSession } = useCustomerSession();
  const { pushLocalToast } = useNotifications() || {};

  const [error, setError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [cart, setCart] = useState(() => location.state?.cart || []);

  const sessionRestaurantId = useMemo(
    () => normalizeRestaurantId(ctxSession?.restaurantId || session?.restaurantId),
    [ctxSession?.restaurantId, session?.restaurantId]
  );

  const checkoutRestaurantId = useMemo(() => {
    if (!isPlaceholderRestaurantId(routeRestaurantId)) {
      if (sessionRestaurantId && sessionRestaurantId !== routeRestaurantId && !looksLikeMongoObjectId(routeRestaurantId)) {
        return sessionRestaurantId;
      }
      return routeRestaurantId;
    }
    return sessionRestaurantId || "";
  }, [routeRestaurantId, sessionRestaurantId]);

  const navigationRestaurantId = useMemo(
    () => routeRestaurantId || checkoutRestaurantId || sessionRestaurantId,
    [routeRestaurantId, checkoutRestaurantId, sessionRestaurantId]
  );

  const tableNumber = useMemo(() => {
    return readTableNumberFromSearch(location.search, ctxSession?.tableNumber || session?.tableNumber || null);
  }, [location.search, ctxSession, session]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cart]
  );

  function handleAddMoreItems() {
    if (!navigationRestaurantId) return;
    navigate(buildCustomerRoute(navigationRestaurantId, "items", { tableNumber }), {
      state: { cart }
    });
  }

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
    const targetRestaurantId = checkoutRestaurantId || normalizeRestaurantId(activeSession?.restaurantId);

    if (!activeSession) {
      if (navigationRestaurantId) {
        navigate(buildCustomerRoute(navigationRestaurantId, "login", { tableNumber }));
      } else {
        navigate("/", { replace: true });
      }
      return;
    }

    if (!targetRestaurantId) {
      setError("Restaurant ID missing. Please restart from your table QR code.");
      return;
    }

    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    const orderData = {
      restaurantId: targetRestaurantId,
      tableNumber: activeSession.tableNumber,
      customerName: activeSession.customerName,
      phoneNumber: activeSession.phoneNumber,
      sessionId: activeSession.sessionId,
      items: cart.map(item => ({
        name: item.name,
        category: item.category || "General",
        price: item.price,
        qty: item.qty
      })),
      total
    };

    try {
      setPlacingOrder(true);

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

      if (activeSession?.sessionId) {
        localStorage.setItem(`latestOrder_${activeSession.sessionId}`, String(data._id));
      }

      pushLocalToast?.({
        title: "Order placed successfully",
        message: "Order sent to kitchen. Payment will be enabled after serving.",
        type: "NEW_ORDER",
        priority: "MEDIUM"
      });

      const nextRestaurantId = navigationRestaurantId || targetRestaurantId;
      navigate(buildCustomerRoute(nextRestaurantId, "status", { tableNumber }), { state: { orderId: data._id } });
    } catch (placeOrderError) {
      console.error("Order failed:", placeOrderError);
      setError(placeOrderError.message);
    } finally {
      setPlacingOrder(false);
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

            <section className="payment-selection-panel">
              <div className="payment-selection-head">
                <h3>Payment After Serving</h3>
                <button
                  type="button"
                  className="add-more-items-btn"
                  onClick={handleAddMoreItems}
                >
                  Add More Items
                </button>
              </div>
              <p className="payment-instructions">
                Place your order now. Once your order is marked served, you will see a <strong>Make Payment</strong> button on the status page.
              </p>
            </section>

            <div className="checkout-bar">
              <div>
                <p className="muted">Subtotal</p>
                <h3 className="cart-total">₹{total.toFixed(2)}</h3>
                <p className="muted payable-total">Payable: ₹{total.toFixed(2)}</p>
              </div>

              <button
                className="place-order-btn"
                onClick={handlePlaceOrder}
                disabled={placingOrder}
              >
                {placingOrder ? "Placing..." : "Place Order"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
