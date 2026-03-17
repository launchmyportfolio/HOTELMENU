import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";
import { useRestaurantIdFromPath } from "../context/CustomerSessionContext";

export default function Navbar({ isAdmin, onLogout, session, onEndSession, adminMode = false }) {

  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const restaurantId = useRestaurantIdFromPath(location.pathname);
  const isLoginPage = location.pathname.includes("/login");
  const isLanding = location.pathname === "/";
  const isAuthPage = isLoginPage || location.pathname === "/owner/register";

  const tableNumber = (() => {
    const params = new URLSearchParams(location.search);
    const t = Number(params.get("table"));
    if (Number.isFinite(t) && t > 0) return t;
    return session?.tableNumber || null;
  })();

  const tableSuffix = tableNumber ? `?table=${tableNumber}` : "";
  const restaurantBase = restaurantId ? `/restaurant/${restaurantId}` : "/";

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  if (isLoginPage) {
    return (
      <nav className="nav">
        <div className="nav-left">
          <h2 className="logo">HotelMenu</h2>
        </div>
      </nav>
    );
  }

  function renderLinks() {
    if (isAuthPage) {
      return null;
    }

    if (isAdmin && adminMode) {
      return (
        <>
          <Link className="nav-link" to="/admin/restaurants">Restaurants</Link>
          <Link className="nav-link" to="/admin/restaurants/new">Create Restaurant</Link>
          <button className="nav-btn" onClick={onLogout}>Logout</button>
        </>
      );
    }

    if (isAdmin) {
      return (
        <>
          <Link className="nav-link" to="/owner/orders">Orders</Link>
          <Link className="nav-link" to="/owner/tables">Tables</Link>
          <Link className="nav-link" to="/owner/products">Products</Link>
          <Link className="nav-link" to="/owner/products/add">Add Product</Link>
          <button className="nav-btn" onClick={onLogout}>Logout</button>
        </>
      );
    }

    if (isLanding) {
      return (
        <>
          <Link className="nav-link" to="/owner/login">Owner Login</Link>
          <Link className="nav-link" to="/owner/register">Owner Register</Link>
          <a className="nav-link" href="#customer-access">Customer Access</a>
        </>
      );
    }

    return (
      <>
        <Link className="nav-link" to={`${restaurantBase}${tableSuffix}`}>Home</Link>
        <Link className="nav-link" to={`${restaurantBase}/items${tableSuffix}`}>Items</Link>
        <Link className="nav-link" to={`${restaurantBase}/contact${tableSuffix}`}>Contact</Link>
        <Link className="nav-link" to={`${restaurantBase}/cart${tableSuffix}`}>Cart</Link>
        {session && (
          <>
            <span className="session-tag">
              Table {session.tableNumber} • {session.customerName}
            </span>
            <button className="nav-btn" onClick={onEndSession}>
              Leave Table
            </button>
          </>
        )}
      </>
    );
  }

  return (

    <nav className="nav">

      <div className="nav-left">
        <h2 className="logo">HotelMenu</h2>
      </div>

      <div className="nav-right">

        {isMobile && (
          <button
            className="hamburger"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(prev => !prev)}
          >
            <span />
            <span />
            <span />
          </button>
        )}

        <div className={`links ${isMobile ? (menuOpen ? "open" : "closed") : "desktop"}`}>
          {renderLinks()}
        </div>

      </div>

    </nav>

  );

}
