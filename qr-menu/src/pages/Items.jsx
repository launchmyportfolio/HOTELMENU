import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Items.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function Items() {

  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchMenu() {
      try {
        const res = await fetch(`${API_BASE}/api/menu`);
        const data = await res.json();
        setMenu(data);
      } catch (err) {
        console.error("Failed to load menu", err);
      } finally {
        setLoading(false);
      }
    }

    fetchMenu();
  }, []);

  function increase(id) {
    const item = menu.find(i => i._id === id);
    if (!item) return;

    setCounts(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));

    setCart(prev => {
      const existing = prev.find(p => p._id === id);

      if (existing) {
        return prev.map(p =>
          p._id === id ? { ...p, qty: p.qty + 1 } : p
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
          p._id === id ? { ...p, qty: p.qty - 1 } : p
        )
        .filter(p => p.qty > 0)
    );
  }

  function handleCheckout() {
    navigate("/cart", { state: { cart } });
  }

  function renderStars(rating = 4.5) {

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

        {loading && <p className="info-text">Loading menu...</p>}

        {!loading && menu.map(item => (

          <div className="card" key={item._id}>

            <div className="badge">{item.category}</div>

            <img src={item.image} alt={item.name} />

            <div className="card-content">

              <h3>{item.name}</h3>
              <p className="muted">{item.description}</p>

              <div className="rating">
                {renderStars(item.rating)} ({item.rating || 4.5})
              </div>

              <p>₹{item.price}</p>

              {!item.available && (
                <p className="muted">Out of Stock</p>
              )}

              {item.available && (
                counts[item._id] > 0 ? (
                  <div className="qty-box">
                    <button onClick={() => decrease(item._id)}>-</button>
                    <span>{counts[item._id]}</span>
                    <button onClick={() => increase(item._id)}>+</button>
                  </div>
                ) : (
                  <button
                    className="add-btn"
                    onClick={() => increase(item._id)}
                  >
                    ADD
                  </button>
                )
              )}

            </div>

          </div>

        ))}

        {!loading && menu.length === 0 && (
          <p className="info-text">No menu items available yet.</p>
        )}

      </div>

    </div>
  );
}
