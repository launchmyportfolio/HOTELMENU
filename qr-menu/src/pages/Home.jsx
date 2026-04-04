import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useCustomerSession } from "../context/CustomerSessionContext";
import { API_BASE } from "../utils/apiBase";
import { buildCustomerRoute, readTableNumberFromSearch } from "../utils/customerRouting";

export default function Home() {
  const params = useParams();
  const location = useLocation();
  const { session } = useCustomerSession();
  const restaurantId = params.restaurantId;
  const [restaurant, setRestaurant] = useState(null);

  const tableNumber = useMemo(() => {
    return readTableNumberFromSearch(location.search, session?.tableNumber || null);
  }, [location.search, session]);

  const itemsUrl = buildCustomerRoute(restaurantId, "items", { tableNumber });
  const contactUrl = buildCustomerRoute(restaurantId, "contact", { tableNumber });

  useEffect(() => {
    if (!restaurantId) return undefined;
    let active = true;

    fetch(`${API_BASE}/api/restaurants/${encodeURIComponent(restaurantId)}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !active) return;
        setRestaurant(data);
      })
      .catch(() => {
        if (active) setRestaurant(null);
      });

    return () => {
      active = false;
    };
  }, [restaurantId]);

  return (
    <section className="hero">

      <div className="hero-overlay"></div>

      <div className="hero-content">
        <h1>Welcome to {restaurant?.name || "Our Restaurant"}</h1>

        {restaurant?.publicMessage && (
          <p className="error-text" style={{ maxWidth: "680px", margin: "12px auto" }}>
            {restaurant.publicMessage}
          </p>
        )}

        {!restaurant?.publicMessage && restaurant?.orderRestrictionMessage && (
          <p className="info-text" style={{ maxWidth: "680px", margin: "12px auto" }}>
            {restaurant.orderRestrictionMessage}
          </p>
        )}

        <p>
          Scan • Order • Enjoy  
          Browse our digital menu and place your order directly from your table.
        </p>

        <div className="hero-buttons">
          {!restaurant?.publicMessage && restaurant?.canAcceptNewOrders !== false && (
            <Link to={itemsUrl} className="btn-primary">View Menu</Link>
          )}
          <Link to={contactUrl} className="btn-secondary">Contact Us</Link>
        </div>
      </div>

    </section>
  );
}
