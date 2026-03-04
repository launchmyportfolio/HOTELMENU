import { useLocation, useNavigate } from "react-router-dom";
import "./Cart.css";

export default function Cart() {

  const location = useLocation();
  const navigate = useNavigate();
  const cart = location.state?.cart || [];

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  async function handlePlaceOrder() {
    const orderData = {
      tableNumber: 1,
      items: cart.map(item => ({
        name: item.name,
        price: item.price,
        qty: item.qty
      })),
      total
    };

    console.log("Sending order:", orderData);

    try {

      const res = await fetch("http://localhost:5000/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(orderData)
      });

      const data = await res.json();

      console.log("Server response:", data);

      navigate("/status", { state: { orderId: data._id } });

    } catch (error) {
      console.error("Order failed:", error);
    }
  }
  return (

    <div className="cart-container">

      <div className="cart-content">

        <h2>Your Cart</h2>

        {cart.length === 0 ? (
          <p className="empty-cart">Your cart is empty</p>
        ) : (
          <>
            <ul className="cart-items">

              {cart.map(item => (

                <li key={item.id}>

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