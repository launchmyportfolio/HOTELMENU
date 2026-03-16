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

    return (
      <>
        <Link className="nav-link" to={`/restaurant/${restaurantId}`}>Home</Link>
        <Link className="nav-link" to={`/restaurant/${restaurantId}/items`}>Items</Link>
        <Link className="nav-link" to={`/restaurant/${restaurantId}/contact`}>Contact</Link>
        <Link className="nav-link" to={`/restaurant/${restaurantId}/cart`}>Cart</Link>
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
