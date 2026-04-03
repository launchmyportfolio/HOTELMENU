import { useEffect, useState } from "react";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
}

export default function OwnerSettings({ token, restaurant, onAuthRefresh, onLogout }) {
  const [profile, setProfile] = useState({
    name: "",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: ""
  });
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return undefined;

    let active = true;
    fetch(`${API_BASE}/api/restaurants/owner/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load owner profile.");
        if (!active) return;
        setProfile({
          name: data.name || "",
          ownerName: data.ownerName || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          logoUrl: data.logoUrl || ""
        });
      })
      .catch(err => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 700 * 1024) {
      setError("Logo image should be under 700KB.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setProfile(prev => ({ ...prev, logoUrl: dataUrl }));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/restaurants/owner/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to update restaurant settings.");

      setMessage(data.message || "Settings updated successfully.");
      onAuthRefresh?.(prev => prev ? { ...prev, restaurant: data.restaurant } : prev);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    setChangingPassword(true);
    setError("");
    setMessage("");

    if (passwordForm.newPassword.length < 8) {
      setChangingPassword(false);
      setError("New password must be at least 8 characters.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setChangingPassword(false);
      setError("New password and confirm password do not match.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/restaurants/owner/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to change password.");

      onAuthRefresh?.({ token: data.token, restaurant: data.restaurant });
      setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setMessage(data.message || "Password changed successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleLogoutAllDevices() {
    if (!window.confirm("Logout all active owner sessions?")) return;

    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/restaurants/owner/logout-all`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to logout all devices.");

      setMessage(data.message || "All sessions logged out.");
      onLogout?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-dashboard">
      <div className="owner-brand-banner">
        <div className="owner-brand-mark">
          {profile.logoUrl
            ? <img src={profile.logoUrl} alt={profile.name || restaurant?.name || "Restaurant"} />
            : <span>{String(profile.name || restaurant?.name || "HM").slice(0, 2).toUpperCase()}</span>}
        </div>
        <div>
          <p className="owner-brand-label">Brand & Account Settings</p>
          <h2 className="owner-brand-name">{profile.name || restaurant?.name || "Restaurant"}</h2>
        </div>
      </div>

      <h1>Owner Settings</h1>
      {error && <p className="error-text">{error}</p>}
      {message && <p className="info-text">{message}</p>}
      {loading && <p className="info-text">Loading owner settings...</p>}

      {!loading && (
        <div className="owner-settings-grid">
          <form className="settings-card" onSubmit={handleSaveProfile}>
            <h2>Branding & Restaurant Profile</h2>
            <label>
              Restaurant Name
              <input value={profile.name} onChange={event => setProfile(prev => ({ ...prev, name: event.target.value }))} required />
            </label>
            <label>
              Owner Name
              <input value={profile.ownerName} onChange={event => setProfile(prev => ({ ...prev, ownerName: event.target.value }))} required />
            </label>
            <label>
              Email
              <input type="email" value={profile.email} onChange={event => setProfile(prev => ({ ...prev, email: event.target.value }))} required />
            </label>
            <label>
              Phone
              <input value={profile.phone} onChange={event => setProfile(prev => ({ ...prev, phone: event.target.value }))} />
            </label>
            <label>
              Address
              <textarea rows="4" value={profile.address} onChange={event => setProfile(prev => ({ ...prev, address: event.target.value }))} />
            </label>
            <label>
              Logo Upload
              <input type="file" accept="image/*" onChange={handleLogoUpload} />
            </label>
            {profile.logoUrl && (
              <div className="settings-logo-preview">
                <img src={profile.logoUrl} alt={profile.name || "Restaurant"} />
              </div>
            )}
            <button type="submit" className="settings-submit-btn" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save Branding"}
            </button>
          </form>

          <form className="settings-card" onSubmit={handleChangePassword}>
            <h2>Security & Account</h2>
            <label>
              Old Password
              <input
                type="password"
                value={passwordForm.oldPassword}
                onChange={event => setPasswordForm(prev => ({ ...prev, oldPassword: event.target.value }))}
                required
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={event => setPasswordForm(prev => ({ ...prev, newPassword: event.target.value }))}
                required
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={event => setPasswordForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                required
              />
            </label>
            <button type="submit" className="settings-submit-btn" disabled={changingPassword}>
              {changingPassword ? "Updating..." : "Change Password"}
            </button>

            <div className="settings-divider" />

            <h3>Session Control</h3>
            <p className="muted">Invalidate every active owner session across devices.</p>
            <button type="button" className="delete full-width" onClick={handleLogoutAllDevices}>
              Logout All Devices
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
