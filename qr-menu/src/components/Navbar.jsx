import { Link } from "react-router-dom";

export default function Navbar() {

  return (

    <nav style={styles.nav}>

      <h2 style={styles.logo}>HotelMenu</h2>

      <div style={styles.links}>

        <Link style={styles.link} to="/">Home</Link>
        <Link style={styles.link} to="/items">Items</Link>
        <Link style={styles.link} to="/contact">Contact</Link>
        <Link style={styles.link} to="/admin/login">Admin</Link>
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

};