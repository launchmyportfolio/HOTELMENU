import { useEffect, useMemo, useState } from "react";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

const PROVIDER_OPTIONS = [
  { providerName: "RAZORPAY", label: "Razorpay", type: "ONLINE" },
  { providerName: "JUSPAY", label: "Juspay", type: "ONLINE" },
  { providerName: "STRIPE", label: "Stripe", type: "ONLINE" },
  { providerName: "UPI", label: "UPI", type: "ONLINE" },
  { providerName: "CASH", label: "Cash", type: "OFFLINE" },
  { providerName: "CARD", label: "Card", type: "OFFLINE" },
  { providerName: "PAY_LATER", label: "Pay Later", type: "OFFLINE" },
  { providerName: "PAY_AT_COUNTER", label: "Pay at Counter", type: "OFFLINE" }
];

const CREDENTIAL_FIELD_MAP = {
  RAZORPAY: [
    { key: "keyId", label: "Razorpay Key ID", type: "text" },
    { key: "keySecret", label: "Razorpay Key Secret", type: "password" },
    { key: "webhookSecret", label: "Razorpay Webhook Secret", type: "password" }
  ],
  JUSPAY: [
    { key: "merchantId", label: "Merchant ID", type: "text" },
    { key: "apiKey", label: "Juspay API Key", type: "password" }
  ],
  STRIPE: [
    { key: "publishableKey", label: "Publishable Key", type: "text" },
    { key: "secretKey", label: "Secret Key", type: "password" }
  ]
};
const MAX_QR_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_QR_DATA_URL_LENGTH = 1_500_000;

function normalizeProvider(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
}

function getProviderLabel(providerName = "") {
  const normalized = normalizeProvider(providerName);
  const found = PROVIDER_OPTIONS.find(item => item.providerName === normalized);
  return found?.label || normalized.replace(/_/g, " ");
}

function getDefaultType(providerName = "") {
  const normalized = normalizeProvider(providerName);
  const found = PROVIDER_OPTIONS.find(item => item.providerName === normalized);
  if (found) return found.type;
  if (["RAZORPAY", "JUSPAY", "STRIPE", "UPI"].includes(normalized)) return "ONLINE";
  return "OFFLINE";
}

function createMethodId(providerName = "method") {
  const base = normalizeProvider(providerName).toLowerCase() || "method";
  return `${base}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function toNumberInput(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(String(event?.target?.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = dataUrl;
  });
}

async function compressQrImage(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  if (!sourceDataUrl) return "";

  const image = await loadImageFromDataUrl(sourceDataUrl);
  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
  const width = Math.max(1, Math.round((image.width || 1) * scale));
  const height = Math.max(1, Math.round((image.height || 1) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return sourceDataUrl;
  context.drawImage(image, 0, 0, width, height);

  // JPEG keeps payloads much smaller than raw PNG/base64 for uploads.
  return canvas.toDataURL("image/jpeg", 0.82);
}

function sanitizeMethodPayload(method, index) {
  const credentials = method?.credentials && typeof method.credentials === "object"
    ? Object.entries(method.credentials).reduce((acc, [key, value]) => {
      const k = String(key || "").trim();
      const v = String(value || "").trim();
      if (k && v) acc[k] = v;
      return acc;
    }, {})
    : {};

  const payload = {
    methodId: String(method.methodId || "").trim() || createMethodId(method.providerName),
    providerName: normalizeProvider(method.providerName || "CASH"),
    displayName: String(method.displayName || "").trim() || getProviderLabel(method.providerName),
    type: String(method.type || getDefaultType(method.providerName)).toUpperCase() === "ONLINE" ? "ONLINE" : "OFFLINE",
    enabled: method.enabled !== false,
    isDefault: method.isDefault === true,
    upiId: String(method.upiId || "").trim(),
    qrImageUrl: String(method.qrImageUrl || "").trim(),
    instructions: String(method.instructions || "").trim(),
    sortOrder: Number.isFinite(Number(method.sortOrder)) ? Number(method.sortOrder) : index
  };

  if (Object.keys(credentials).length) {
    payload.credentials = credentials;
  }

  return payload;
}

function normalizeSettingsPayload(payload = {}) {
  const methods = Array.isArray(payload.enabledMethods) ? payload.enabledMethods : [];
  return {
    restaurantId: payload.restaurantId || "",
    enabledMethods: methods.map((method, index) => ({
      methodId: method.methodId || createMethodId(method.providerName),
      providerName: normalizeProvider(method.providerName || "CASH"),
      displayName: method.displayName || getProviderLabel(method.providerName),
      type: method.type === "ONLINE" ? "ONLINE" : "OFFLINE",
      enabled: method.enabled !== false,
      isDefault: method.isDefault === true,
      hasCredentials: Boolean(method.hasCredentials),
      credentialHints: method.credentialHints || {},
      credentials: method.credentials && typeof method.credentials === "object" ? method.credentials : {},
      upiId: method.upiId || "",
      qrImageUrl: method.qrImageUrl || "",
      instructions: method.instructions || "",
      sortOrder: Number.isFinite(Number(method.sortOrder)) ? Number(method.sortOrder) : index
    })),
    allowCOD: payload.allowCOD !== false,
    allowPayAtCounter: payload.allowPayAtCounter !== false,
    minimumOnlineAmount: toNumberInput(payload.minimumOnlineAmount, 0),
    convenienceFee: toNumberInput(payload.convenienceFee, 0),
    paymentInstructions: payload.paymentInstructions || "",
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt
  };
}

export default function PaymentSettings({ token, restaurantId }) {
  const [settings, setSettings] = useState(() => normalizeSettingsPayload({ enabledMethods: [] }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMethod, setEditorMethod] = useState(null);

  const sortedMethods = useMemo(() => {
    return [...(settings.enabledMethods || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }, [settings.enabledMethods]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = window.setTimeout(() => setSuccessMessage(""), 2800);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!token || !restaurantId) return undefined;
    let active = true;

    async function fetchSettings() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/admin/payment-settings/${restaurantId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load payment settings");
        if (!active) return;
        setSettings(normalizeSettingsPayload(data));
        setHasUnsavedChanges(false);
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSettings();
    return () => {
      active = false;
    };
  }, [token, restaurantId]);

  function updateSettingsField(field, value) {
    setHasUnsavedChanges(true);
    setSettings(prev => ({ ...prev, [field]: value }));
  }

  function upsertMethodInState(nextMethod) {
    setHasUnsavedChanges(true);
    setSettings(prev => {
      const currentMethods = Array.isArray(prev.enabledMethods) ? prev.enabledMethods : [];
      const existingIndex = currentMethods.findIndex(item => String(item.methodId) === String(nextMethod.methodId));

      let methods = [];
      if (existingIndex === -1) {
        methods = [...currentMethods, { ...nextMethod, sortOrder: currentMethods.length }];
      } else {
        methods = currentMethods.map((item, index) => (index === existingIndex ? { ...item, ...nextMethod } : item));
      }

      if (nextMethod.isDefault) {
        methods = methods.map(item => ({ ...item, isDefault: item.methodId === nextMethod.methodId }));
      }

      return {
        ...prev,
        enabledMethods: methods
      };
    });
  }

  function toggleMethod(methodId) {
    setHasUnsavedChanges(true);
    setSettings(prev => ({
      ...prev,
      enabledMethods: (prev.enabledMethods || []).map(method => {
        if (method.methodId !== methodId) return method;

        const provider = normalizeProvider(method.providerName);
        if (provider === "CASH" && prev.allowCOD === false) {
          setError("Enable Allow COD to activate Cash payment.");
          return method;
        }
        if (provider === "PAY_AT_COUNTER" && prev.allowPayAtCounter === false) {
          setError("Enable Pay at Counter toggle to activate this method.");
          return method;
        }

        return { ...method, enabled: !method.enabled, isDefault: method.enabled ? false : method.isDefault };
      })
    }));
  }

  function setDefaultMethod(methodId) {
    setHasUnsavedChanges(true);
    setSettings(prev => ({
      ...prev,
      enabledMethods: (prev.enabledMethods || []).map(method => ({
        ...method,
        isDefault: method.methodId === methodId
      }))
    }));
  }

  function removeMethod(methodId) {
    if (!window.confirm("Remove this payment method?")) return;
    setHasUnsavedChanges(true);
    setSettings(prev => ({
      ...prev,
      enabledMethods: (prev.enabledMethods || []).filter(method => method.methodId !== methodId)
    }));
  }

  function openEditor(method = null, providerName = "CASH") {
    if (method) {
      setEditorMethod({
        ...method,
        credentials: method.credentials || {}
      });
      setIsEditorOpen(true);
      setError("");
      return;
    }

    const normalizedProvider = normalizeProvider(providerName);
    const nextMethod = {
      methodId: createMethodId(normalizedProvider),
      providerName: normalizedProvider,
      displayName: getProviderLabel(normalizedProvider),
      type: getDefaultType(normalizedProvider),
      enabled: true,
      isDefault: (settings.enabledMethods || []).length === 0,
      hasCredentials: false,
      credentialHints: {},
      credentials: {},
      upiId: "",
      qrImageUrl: "",
      instructions: "",
      sortOrder: (settings.enabledMethods || []).length
    };

    setEditorMethod(nextMethod);
    setIsEditorOpen(true);
    setError("");
  }

  function closeEditor() {
    setIsEditorOpen(false);
    setEditorMethod(null);
  }

  function onEditorFieldChange(field, value) {
    setEditorMethod(prev => {
      if (!prev) return prev;

      if (field === "providerName") {
        const normalizedProvider = normalizeProvider(value);
        return {
          ...prev,
          providerName: normalizedProvider,
          type: getDefaultType(normalizedProvider),
          displayName: prev.displayName || getProviderLabel(normalizedProvider)
        };
      }

      if (field === "type") {
        return {
          ...prev,
          type: String(value || "").toUpperCase() === "ONLINE" ? "ONLINE" : "OFFLINE"
        };
      }

      return {
        ...prev,
        [field]: value
      };
    });
  }

  function onEditorCredentialChange(key, value) {
    setEditorMethod(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        credentials: {
          ...(prev.credentials || {}),
          [key]: value
        }
      };
    });
  }

  async function handleQrUpload(file) {
    if (!file) return;
    if (file.size > MAX_QR_UPLOAD_BYTES) {
      setError("QR image is too large. Please upload an image smaller than 4MB.");
      return;
    }

    try {
      const result = await compressQrImage(file);
      if (!result) {
        setError("Unable to process QR image.");
        return;
      }
      if (result.length > MAX_QR_DATA_URL_LENGTH) {
        setError("QR image is still too large after compression. Please use a smaller image.");
        return;
      }

      setEditorMethod(prev => prev ? { ...prev, qrImageUrl: result } : prev);
      setError("");
    } catch {
      setError("Unable to process QR image. Please try another file.");
    }
  }

  function saveEditorChanges() {
    if (!editorMethod) return;
    if (!String(editorMethod.displayName || "").trim()) {
      setError("Display name is required");
      return;
    }
    upsertMethodInState(editorMethod);
    closeEditor();
  }

  function ensureSingleDefault(methods = []) {
    const enabledMethods = methods.filter(method => method.enabled !== false);
    if (!enabledMethods.length && methods.length > 0) {
      return methods.map((method, index) => ({ ...method, isDefault: index === 0 }));
    }

    const existingDefault = enabledMethods.find(method => method.isDefault);
    const defaultId = existingDefault?.methodId || enabledMethods[0]?.methodId;
    return methods.map(method => ({
      ...method,
      isDefault: method.methodId === defaultId
    }));
  }

  async function handleSaveAll() {
    if (!restaurantId) return;

    setSaving(true);
    setError("");

    try {
      const methods = ensureSingleDefault((settings.enabledMethods || []).map((method, index) => {
        const providerName = normalizeProvider(method.providerName);
        const blockedByCod = providerName === "CASH" && settings.allowCOD === false;
        const blockedByCounter = providerName === "PAY_AT_COUNTER" && settings.allowPayAtCounter === false;
        return {
          ...method,
          enabled: blockedByCod || blockedByCounter ? false : method.enabled !== false,
          isDefault: blockedByCod || blockedByCounter ? false : method.isDefault,
          sortOrder: index
        };
      }));

      const payload = {
        enabledMethods: methods.map((method, index) => sanitizeMethodPayload(method, index)),
        allowCOD: settings.allowCOD,
        allowPayAtCounter: settings.allowPayAtCounter,
        minimumOnlineAmount: Math.max(0, toNumberInput(settings.minimumOnlineAmount, 0)),
        convenienceFee: Math.max(0, toNumberInput(settings.convenienceFee, 0)),
        paymentInstructions: String(settings.paymentInstructions || "").trim()
      };

      const res = await fetch(`${API_BASE}/api/admin/payment-settings/${restaurantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save payment settings");

      setSettings(normalizeSettingsPayload(data));
      setHasUnsavedChanges(false);
      setSuccessMessage("Payment settings saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const credentialFields = useMemo(() => {
    const provider = normalizeProvider(editorMethod?.providerName || "");
    return CREDENTIAL_FIELD_MAP[provider] || [];
  }, [editorMethod?.providerName]);

  return (
    <div className="admin-dashboard payment-settings-page">
      <h1>Payment Settings</h1>
      <p className="info-text">For Razorpay production, enter your live `key_id`, live `key_secret`, and the webhook secret from the same live account.</p>

      {error && <p className="error-text">{error}</p>}
      {successMessage && <div className="payment-save-toast">{successMessage}</div>}

      {loading ? (
        <p className="info-text">Loading payment settings...</p>
      ) : (
        <div className="payment-settings-layout">
          <section className="payment-global-panel glass-card">
            <h2>Global Rules</h2>

            <label className="setting-switch">
              <span>Allow COD</span>
              <input
                type="checkbox"
                checked={settings.allowCOD}
                onChange={event => updateSettingsField("allowCOD", event.target.checked)}
              />
            </label>

            <label className="setting-switch">
              <span>Allow Pay at Counter</span>
              <input
                type="checkbox"
                checked={settings.allowPayAtCounter}
                onChange={event => updateSettingsField("allowPayAtCounter", event.target.checked)}
              />
            </label>

            <label className="setting-field">
              <span>Minimum online amount (INR)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.minimumOnlineAmount}
                onChange={event => updateSettingsField("minimumOnlineAmount", event.target.value)}
              />
            </label>

            <label className="setting-field">
              <span>Convenience fee (INR)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.convenienceFee}
                onChange={event => updateSettingsField("convenienceFee", event.target.value)}
              />
            </label>

            <label className="setting-field">
              <span>Default payment instructions</span>
              <textarea
                rows="3"
                value={settings.paymentInstructions}
                onChange={event => updateSettingsField("paymentInstructions", event.target.value)}
                placeholder="Pay and show receipt to waiter."
              />
            </label>

            <div className="quick-add">
              <p>Add Payment Method</p>
              <div className="quick-add-buttons">
                {PROVIDER_OPTIONS.map(option => (
                  <button
                    key={option.providerName}
                    type="button"
                    onClick={() => openEditor(null, option.providerName)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="payment-save-btn"
              onClick={handleSaveAll}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            {hasUnsavedChanges && (
              <p className="info-text" style={{ marginTop: "8px" }}>
                Unsaved changes detected. Click Save Settings to apply these methods for customer checkout.
              </p>
            )}
          </section>

          <section className="payment-methods-panel">
            <h2>Configured Methods</h2>

            {!sortedMethods.length && (
              <p className="info-text">No methods added yet. Add one from the panel.</p>
            )}

            <div className="payment-methods-grid">
              {sortedMethods.map(method => (
                <article
                  key={method.methodId}
                  className={`payment-method-card glass-card ${method.enabled ? "enabled" : "disabled"}`}
                >
                  <div className="payment-method-head">
                    <div>
                      <h3>{method.displayName}</h3>
                      <p>{getProviderLabel(method.providerName)} • {method.type}</p>
                    </div>
                    <span className={`payment-state-pill ${method.enabled ? "on" : "off"}`}>
                      {method.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>

                  <div className="payment-method-meta">
                    {method.isDefault && <span className="default-badge">Default</span>}
                    {method.hasCredentials && <span className="credentials-badge">Credentials saved</span>}
                    {method.providerName === "UPI" && method.upiId && <span className="credentials-badge">UPI ID: {method.upiId}</span>}
                  </div>

                  {method.instructions && <p className="method-note">{method.instructions}</p>}

                  {!!Object.keys(method.credentialHints || {}).length && (
                    <div className="credential-hints">
                      {Object.entries(method.credentialHints || {}).map(([key, value]) => (
                        <p key={`${method.methodId}-${key}`}><strong>{key}:</strong> {value}</p>
                      ))}
                    </div>
                  )}

                  <div className="payment-method-actions">
                    <button type="button" onClick={() => toggleMethod(method.methodId)}>
                      {method.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDefaultMethod(method.methodId)}
                      disabled={method.enabled === false}
                    >
                      Set as Default
                    </button>
                    <button type="button" onClick={() => openEditor(method)}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => removeMethod(method.methodId)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {isEditorOpen && editorMethod && (
        <div className="payment-editor-overlay" onClick={closeEditor}>
          <div className="payment-editor-modal glass-card" onClick={event => event.stopPropagation()}>
            <h3>Edit Payment Method</h3>

            <label className="setting-field">
              <span>Display Name</span>
              <input
                type="text"
                value={editorMethod.displayName}
                onChange={event => onEditorFieldChange("displayName", event.target.value)}
              />
            </label>

            <label className="setting-field">
              <span>Provider</span>
              <select
                value={editorMethod.providerName}
                onChange={event => onEditorFieldChange("providerName", event.target.value)}
              >
                {PROVIDER_OPTIONS.map(option => (
                  <option key={option.providerName} value={option.providerName}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="setting-field">
              <span>Type</span>
              <select
                value={editorMethod.type}
                onChange={event => onEditorFieldChange("type", event.target.value)}
              >
                <option value="ONLINE">ONLINE</option>
                <option value="OFFLINE">OFFLINE</option>
              </select>
            </label>

            <label className="setting-switch">
              <span>Enabled</span>
              <input
                type="checkbox"
                checked={editorMethod.enabled}
                onChange={event => onEditorFieldChange("enabled", event.target.checked)}
              />
            </label>

            <label className="setting-switch">
              <span>Set as default</span>
              <input
                type="checkbox"
                checked={editorMethod.isDefault}
                onChange={event => onEditorFieldChange("isDefault", event.target.checked)}
              />
            </label>

            {normalizeProvider(editorMethod.providerName) === "UPI" && (
              <>
                <label className="setting-field">
                  <span>UPI ID</span>
                  <input
                    type="text"
                    value={editorMethod.upiId}
                    onChange={event => onEditorFieldChange("upiId", event.target.value)}
                    placeholder="merchant@upi"
                  />
                </label>

                <label className="setting-field">
                  <span>QR Image URL / Base64</span>
                  <input
                    type="text"
                    value={editorMethod.qrImageUrl}
                    onChange={event => onEditorFieldChange("qrImageUrl", event.target.value)}
                    placeholder="https://... or uploaded image data"
                  />
                </label>

                <label className="setting-field">
                  <span>Upload QR Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={event => handleQrUpload(event.target.files?.[0])}
                  />
                </label>
              </>
            )}

            {credentialFields.map(field => (
              <label key={field.key} className="setting-field">
                <span>{field.label}</span>
                <input
                  type={field.type}
                  value={editorMethod.credentials?.[field.key] || ""}
                  onChange={event => onEditorCredentialChange(field.key, event.target.value)}
                  placeholder={editorMethod.credentialHints?.[field.key]
                    ? `Existing: ${editorMethod.credentialHints[field.key]}`
                    : ""}
                />
              </label>
            ))}

            <label className="setting-field">
              <span>Instructions</span>
              <textarea
                rows="3"
                value={editorMethod.instructions}
                onChange={event => onEditorFieldChange("instructions", event.target.value)}
                placeholder="Payment instructions shown to customer."
              />
            </label>

            <div className="payment-editor-actions">
              <button type="button" className="ghost-btn" onClick={closeEditor}>Cancel</button>
              <button type="button" onClick={saveEditorChanges}>Apply Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
