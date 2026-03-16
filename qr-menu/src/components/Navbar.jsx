import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";

export default function Navbar({ isAdmin, onLogout, session, onEndSession }) {

  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isLoginPage = location.pathname === "/login" || location.pathname === "/admin-login";

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
    if (isAdmin) {
      return (
        <>
          <Link className="nav-link" to="/admin/orders">Orders</Link>
          <Link className="nav-link" to="/admin/tables">Tables</Link>
          <Link className="nav-link" to="/admin/products">Products</Link>
          <Link className="nav-link" to="/admin/products/add">Add Product</Link>
          <button className="nav-btn" onClick={onLogout}>Logout</button>
        </>
      );
    }

    return (
      <>
        <Link className="nav-link" to="/">Home</Link>
        <Link className="nav-link" to="/items">Items</Link>
        <Link className="nav-link" to="/contact">Contact</Link>
        <Link className="nav-link" to="/cart">Cart</Link>
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
