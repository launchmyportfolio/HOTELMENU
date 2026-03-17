import { Link } from "react-router-dom";
import "./Landing.css";

export default function Landing() {
  return (
    <div className="landing-page">

      <section className="landing-hero">
        <div className="landing-overlay" />
        <div className="landing-content">
          <p className="eyebrow">Digital-first dining</p>
          <h1>Hotel Menu – Smart QR Ordering System</h1>
          <p className="lede">
            A single platform for owners to manage tables, menus, and orders while guests scan, order,
            and track in real-time.
          </p>

          <div className="landing-actions">
            <Link className="btn-primary" to="/owner/login">Owner Login</Link>
            <Link className="btn-secondary" to="/owner/register">Owner Register</Link>
            <a className="btn-ghost" href="#customer-access">Customer Access</a>
          </div>
        </div>
      </section>

      <section className="landing-grid">
        <div className="landing-card" id="owners">
          <h3>For Restaurant Owners</h3>
          <p>Register your restaurant, manage tables, menu, and track orders in real-time.</p>
          <ul>
            <li>Dashboard for orders and tables</li>
            <li>Quick menu edits and availability</li>
            <li>Staff-friendly controls</li>
          </ul>
          <Link className="text-link" to="/owner/register">Create your account →</Link>
        </div>

        <div className="landing-card" id="customer-access">
          <h3>For Customers</h3>
          <p>Scan the QR code on your table, enter your details, place orders, and track status live.</p>
          <ul>
            <li>Contactless ordering from your seat</li>
            <li>Live updates as your order moves</li>
            <li>No app download required</li>
          </ul>
          <span className="pill">Scan the table QR to begin</span>
        </div>
      </section>

      <section className="landing-features" id="features">
        <h3>Built for modern dining</h3>
        <div className="feature-grid">
          <div className="feature-chip">QR-based ordering</div>
          <div className="feature-chip">Live order tracking</div>
          <div className="feature-chip">Table-based sessions</div>
          <div className="feature-chip">Easy billing</div>
        </div>
      </section>

    </div>
  );
}
