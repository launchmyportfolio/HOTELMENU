import { useState } from "react";
import { useNavigate } from "react-router-dom";
import menuData from "../data/menuData";
import "./Items.css";

export default function Items() {

  const [cart, setCart] = useState([]);
  const [counts, setCounts] = useState({});
  const navigate = useNavigate();

function increase(id) {
  const item = menuData.find(i => i.id === id);

  setCounts(prev => ({
    ...prev,
    [id]: (prev[id] || 0) + 1
  }));

  setCart(prev => {
    const existing = prev.find(p => p.id === id);

    if (existing) {
      return prev.map(p =>
        p.id === id ? { ...p, qty: p.qty + 1 } : p
      );
    }

    return [...prev, { ...item, qty: 1 }];
  });
}
function decrease(id) {
  setCounts(prev => ({
    ...prev,
    [id]: Math.max((prev[id] || 0) - 1, 0)
  }));

  setCart(prev =>
    prev
      .map(p =>
        p.id === id ? { ...p, qty: p.qty - 1 } : p
      )
      .filter(p => p.qty > 0)
  );
}

  function handleAdd(item) {

    const qty = counts[item.id] || 0;
    if (qty === 0) return;

    setCart(prev => {

      const existing = prev.find(p => p.id === item.id);

      if (existing) {
        return prev.map(p =>
          p.id === item.id
            ? { ...p, qty: p.qty + qty }
            : p
        );
      }

      return [...prev, { ...item, qty }];
    });

    setCounts(prev => ({ ...prev, [item.id]: 0 }));
  }

  function handleCheckout() {
    navigate("/cart", { state: { cart } });
  }

  function renderStars(rating) {

    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    return (
      <>
        {"⭐".repeat(fullStars)}
        {halfStar && "⭐"}
        {"☆".repeat(emptyStars)}
      </>
    );
  }

  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);

  return (

    <div className="items-page">

      <div className="cart-info">
        🛒 {totalItems} items
        {totalItems > 0 && (
          <button className="checkout-btn" onClick={handleCheckout}>
            View Cart
          </button>
        )}
      </div>

      <div className="items-grid">

        {menuData.map(item => (

          <div className="card" key={item.id}>

            <div className="badge">{item.category}</div>

            <img src={item.image} alt={item.name} />

            <div className="card-content">

              <h3>{item.name}</h3>

              <div className="rating">
                {renderStars(item.rating)} ({item.rating})
              </div>

              <p>₹{item.price}</p>

              {counts[item.id] > 0 ? (
                <div className="qty-box">
                  <button onClick={() => decrease(item.id)}>-</button>
                  <span>{counts[item.id]}</span>
                  <button onClick={() => increase(item.id)}>+</button>
                </div>
              ) : (
                <button
                  className="add-btn"
                  onClick={() => increase(item.id)}
                >
                  ADD
                </button>
              )}

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}