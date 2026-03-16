import { useParams } from "react-router-dom";
const DEFAULT_RESTAURANT = import.meta.env.VITE_DEFAULT_RESTAURANT_ID || "defaultRestaurant";

export default function Home() {
  const params = useParams();
  const restaurantId = params.restaurantId || DEFAULT_RESTAURANT;
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
          <a href={`/restaurant/${restaurantId}/items`} className="btn-primary">View Menu</a>
          <a href={`/restaurant/${restaurantId}/contact`} className="btn-secondary">Contact Us</a>
        </div>
      </div>

    </section>
  );
}
