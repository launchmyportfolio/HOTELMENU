const crypto = require("crypto");

const SECRET_SOURCE = process.env.PAYMENT_SETTINGS_SECRET || "payment-settings-default-secret-change-me";
const KEY = crypto.createHash("sha256").update(String(SECRET_SOURCE)).digest();

function sanitizeCredentialInput(value) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((acc, [key, val]) => {
    const k = String(key || "").trim();
    if (!k) return acc;
    if (val === undefined || val === null || val === "") return acc;
    acc[k] = String(val);
    return acc;
  }, {});
}

function encryptCredentials(credentials = {}) {
  const payload = sanitizeCredentialInput(credentials);
  if (!Object.keys(payload).length) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptCredentials(ciphertext = "") {
  if (!ciphertext) return {};

  try {
    const raw = Buffer.from(String(ciphertext), "base64");
    if (raw.length < 29) return {};

    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8"));
    return sanitizeCredentialInput(parsed);
  } catch (_err) {
    return {};
  }
}

function maskValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  const head = text.slice(0, 2);
  const tail = text.slice(-2);
  return `${head}${"*".repeat(Math.max(text.length - 4, 1))}${tail}`;
}

function buildCredentialHints(credentials = {}) {
  return Object.entries(sanitizeCredentialInput(credentials)).reduce((acc, [key, value]) => {
    acc[key] = maskValue(value);
    return acc;
  }, {});
}

module.exports = {
  sanitizeCredentialInput,
  encryptCredentials,
  decryptCredentials,
  buildCredentialHints
};
