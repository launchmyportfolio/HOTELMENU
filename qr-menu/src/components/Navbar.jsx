import { Link } from "react-router-dom";

export default function Navbar({ isAdmin, onLogout, session, onEndSession }) {

  return (

    <nav style={styles.nav}>

      <h2 style={styles.logo}>HotelMenu</h2>

      <div style={styles.links}>

        {isAdmin ? (
          <>
            <Link style={styles.link} to="/admin/orders">Orders</Link>
            <Link style={styles.link} to="/admin/add-product">Add Product</Link>
            <Link style={styles.link} to="/admin/edit-product">Edit Product</Link>
            <button style={styles.logout} onClick={onLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link style={styles.link} to="/">Home</Link>
            <Link style={styles.link} to="/items">Items</Link>
            <Link style={styles.link} to="/contact">Contact</Link>
            <Link style={styles.link} to="/admin/login">Admin</Link>
            {session && (
              <>
                <span style={styles.sessionTag}>
                  Table {session.tableNumber} • {session.customerName}
                </span>
                <button style={styles.logout} onClick={onEndSession}>
                  Leave Table
                </button>
              </>
            )}
          </>
        )}
      </div>

    </nav>

  );

}


const styles = {

  nav: {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "70px",

    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",

    padding: "0 40px",

    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(8px)",

    color: "white",
    zIndex: "1000",

    boxSizing: "border-box"
  },
  logo: {
    fontSize: "24px",
    fontWeight: "bold",
    letterSpacing: "1px",
    color: "#ff6b00"
  },

  links: {
    display: "flex",
    gap: "30px",
    justifyContent: "flex-end",
    alignItems: "center"
  },

  link: {
    textDecoration: "none",
    color: "white",
    fontSize: "16px",
    fontWeight: "500",
    transition: "0.3s"
  },
  logout: {
    background: "#ff6b00",
    color: "white",
    border: "none",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600"
  },
  sessionTag: {
    color: "white",
    fontWeight: "600"
  }

};
