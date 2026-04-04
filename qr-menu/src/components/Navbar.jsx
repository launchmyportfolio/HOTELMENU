import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";
import { useRestaurantIdFromPath } from "../context/CustomerSessionContext";
import NotificationBell from "./NotificationBell";
import { buildCustomerRoute, buildNotificationsRoute, readTableNumberFromSearch } from "../utils/customerRouting";

const API_BASE = import.meta.env.VITE_API_URL;

export default function Navbar({ isAdmin, onLogout, session, onEndSession, adminMode = false, ownerBranding = null }) {

  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [publicBranding, setPublicBranding] = useState({ restaurantId: "", data: null });
  const location = useLocation();
  const restaurantIdFromPath = useRestaurantIdFromPath(location.pathname);
  const restaurantId = restaurantIdFromPath || session?.restaurantId || "";
  const isLoginPage = location.pathname.includes("/login");
  const isLanding = location.pathname === "/";
  const isAuthPage = isLoginPage || location.pathname === "/owner/register";

  const tableNumber = readTableNumberFromSearch(location.search, session?.tableNumber || null);
  const restaurantHomeUrl = restaurantId ? buildCustomerRoute(restaurantId, "", { tableNumber }) : "/";
  const itemsUrl = restaurantId ? buildCustomerRoute(restaurantId, "items", { tableNumber }) : "/";
  const contactUrl = restaurantId ? buildCustomerRoute(restaurantId, "contact", { tableNumber }) : "/";
  const cartUrl = restaurantId ? buildCustomerRoute(restaurantId, "cart", { tableNumber }) : "/";
  const notificationsUrl = buildNotificationsRoute({
    restaurantId: session?.restaurantId || restaurantId || "",
    tableNumber,
    backTo: `${location.pathname}${location.search}`
  });

  useEffect(() => {
    if (isAdmin || !restaurantId || !API_BASE) {
      return undefined;
    }

    let active = true;
    fetch(`${API_BASE}/api/restaurants/${encodeURIComponent(restaurantId)}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !active) return;
        setPublicBranding({ restaurantId, data });
      })
      .catch(() => {
        if (active) {
          setPublicBranding({ restaurantId, data: null });
        }
      });

    return () => {
      active = false;
    };
  }, [isAdmin, restaurantId]);

  const activeBranding = useMemo(() => {
    if (ownerBranding?.name) return ownerBranding;
    if (publicBranding?.restaurantId === restaurantId && publicBranding?.data?.name) return publicBranding.data;
    return null;
  }, [ownerBranding, publicBranding, restaurantId]);

  useEffect(() => {
    function handleResize() {
      const nextIsMobile = window.innerWidth <= 768;
      setIsMobile(nextIsMobile);
      if (!nextIsMobile) {
        setMenuOpen(false);
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

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
          <Link className="nav-link" to="/owner/home">Dashboard</Link>
          <Link className="nav-link" to="/owner/analytics">Analytics</Link>
          <Link className="nav-link" to="/owner/orders">Orders</Link>
          <Link className="nav-link" to="/owner/tables">Tables</Link>
          <Link className="nav-link" to="/owner/products">Products</Link>
          <Link className="nav-link" to="/owner/products/add">Add Product</Link>
          <Link className="nav-link" to="/owner/settings">Settings</Link>
          <Link className="nav-link" to="/owner/settings/payments">Payments</Link>
          <Link className="nav-link" to="/notifications">Alerts</Link>
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
        <Link className="nav-link" to={restaurantHomeUrl}>Home</Link>
        <Link className="nav-link" to={itemsUrl}>Items</Link>
        <Link className="nav-link" to={contactUrl}>Contact</Link>
        <Link className="nav-link" to={cartUrl}>Cart</Link>
        {session && (
          <Link className="nav-link" to={notificationsUrl} state={{ backTo: `${location.pathname}${location.search}` }}>Alerts</Link>
        )}
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
        <div className="brand-lockup">
          <div className="brand-mark">
            {activeBranding?.logoUrl
              ? <img src={activeBranding.logoUrl} alt={activeBranding?.name || "Restaurant"} />
              : <span>{String(activeBranding?.name || "HotelMenu").slice(0, 2).toUpperCase()}</span>}
          </div>
          <h2 className="logo">{activeBranding?.name || "HotelMenu"}</h2>
        </div>
      </div>

      <div className="nav-right">

        <NotificationBell />

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
