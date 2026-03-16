import AdminLogin from "./AdminLogin";

export default function OwnerRegister({ onLogin, isAdmin }) {
  return <AdminLogin onLogin={onLogin} isAdmin={isAdmin} mode="register" />;
}
