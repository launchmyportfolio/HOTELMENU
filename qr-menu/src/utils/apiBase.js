function normalizeBaseUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\/+$/, "");
}

function resolveApiBase() {
  const envBase = normalizeBaseUrl(import.meta.env.VITE_API_URL || "");
  if (envBase) {
    return envBase;
  }

  if (typeof window !== "undefined") {
    return normalizeBaseUrl(window.location.origin || "");
  }

  return "";
}

export const API_BASE = resolveApiBase();
