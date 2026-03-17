import { Link } from "react-router-dom";
import "../styles/AuthLayout.css";

export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__top">
        <Link to="/" className="home-link">← Back to Home</Link>
      </div>
      <div className="auth-layout__body">
        {children}
      </div>
    </div>
  );
}
