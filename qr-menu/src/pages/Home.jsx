export default function Home() {
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
          <a href="/items" className="btn-primary">View Menu</a>
          <a href="/contact" className="btn-secondary">Contact Us</a>
        </div>
      </div>

    </section>
  );
}