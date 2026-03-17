import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useCustomerSession } from "../context/CustomerSessionContext";

export default function Home() {
  const params = useParams();
  const location = useLocation();
  const { session } = useCustomerSession();
  const restaurantId = params.restaurantId;

  const tableNumber = useMemo(() => {
    const query = new URLSearchParams(location.search);
    const t = Number(query.get("table"));
    if (Number.isFinite(t) && t > 0) return t;
    return session?.tableNumber || null;
  }, [location.search, session]);

  const tableQuery = tableNumber ? `?table=${tableNumber}` : "";
  const restaurantPath = `/restaurant/${restaurantId}`;
  return (
    <section className="hero">

      <div className="hero-overlay"></div>

      <div className="hero-content">
        <h1>Welcome to Our Restaurant</h1>

        <p>
          Scan • Order • Enjoy  
          Browse our digital menu and place your order directly from your table.
        </p>

        <div className="hero-buttons">
          <a href={`${restaurantPath}/items${tableQuery}`} className="btn-primary">View Menu</a>
          <a href={`${restaurantPath}/contact${tableQuery}`} className="btn-secondary">Contact Us</a>
        </div>
      </div>

    </section>
  );
}
