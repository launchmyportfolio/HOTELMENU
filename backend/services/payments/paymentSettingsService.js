const crypto = require("crypto");
const RestaurantPaymentSettings = require("../../models/RestaurantPaymentSettings");
const {
  sanitizeCredentialInput,
  encryptCredentials,
  decryptCredentials,
  buildCredentialHints
} = require("./credentialCrypto");

const ONLINE_PROVIDERS = new Set(["RAZORPAY", "JUSPAY", "STRIPE", "UPI"]);
const OFFLINE_PROVIDERS = new Set(["CASH", "CARD", "PAY_LATER", "PAY_AT_COUNTER"]);

const DEFAULT_METHODS = [
  {
    methodId: "cash",
    providerName: "CASH",
    displayName: "Cash",
    type: "OFFLINE",
    enabled: true,
    isDefault: true,
    credentialsEncrypted: "",
    credentialHints: {},
    upiId: "",
    qrImageUrl: "",
    instructions: "Pay in cash at counter or when staff arrives.",
    sortOrder: 0
  },
  {
    methodId: "upi",
    providerName: "UPI",
    displayName: "UPI",
    type: "ONLINE",
    enabled: false,
    isDefault: false,
    credentialsEncrypted: "",
    credentialHints: {},
    upiId: "",
    qrImageUrl: "",
    instructions: "",
    sortOrder: 1
  },
  {
    methodId: "card",
    providerName: "CARD",
    displayName: "Card",
    type: "OFFLINE",
    enabled: true,
    isDefault: false,
    credentialsEncrypted: "",
    credentialHints: {},
    upiId: "",
    qrImageUrl: "",
    instructions: "Pay with card at the restaurant counter.",
    sortOrder: 2
  },
  {
    methodId: "pay_at_counter",
    providerName: "PAY_AT_COUNTER",
    displayName: "Pay at Counter",
    type: "OFFLINE",
    enabled: true,
    isDefault: false,
    credentialsEncrypted: "",
    credentialHints: {},
    upiId: "",
    qrImageUrl: "",
    instructions: "Please pay at the billing counter before leaving.",
    sortOrder: 3
  }
];

function normalizeProviderName(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function normalizeMethodType(value = "", providerName = "") {
  const type = String(value || "").trim().toUpperCase();
  if (type === "ONLINE" || type === "OFFLINE") return type;
  if (ONLINE_PROVIDERS.has(providerName)) return "ONLINE";
  return "OFFLINE";
}

function createMethodId(prefix = "method") {
  const slug = String(prefix || "method")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20) || "method";

  const token = crypto.randomUUID
    ? crypto.randomUUID().split("-")[0]
    : crypto.randomBytes(4).toString("hex");
  return `${slug}_${token}`;
}

function isTruthy(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildMethodMap(methods = []) {
  return new Map(
    methods.map(method => [String(method.methodId || "").trim(), method]).filter(([id]) => Boolean(id))
  );
}

function sanitizeMethod(method = {}, existingMap = new Map(), index = 0) {
  const incomingMethodId = String(method.methodId || "").trim();
  const existingMethod = incomingMethodId ? existingMap.get(incomingMethodId) : null;
  const providerName = normalizeProviderName(method.providerName || existingMethod?.providerName || "CASH");
  const methodId = incomingMethodId || createMethodId(providerName.toLowerCase());
  const credentialsInput = sanitizeCredentialInput(method.credentials);
  const hasNewCredentials = Object.keys(credentialsInput).length > 0;
  const existingProvider = normalizeProviderName(existingMethod?.providerName || "");
  const providerChanged = Boolean(existingMethod && existingProvider && existingProvider !== providerName);

  return {
    methodId,
    providerName,
    displayName: String(method.displayName || existingMethod?.displayName || providerName.replace(/_/g, " ")).trim(),
    type: normalizeMethodType(method.type || existingMethod?.type, providerName),
    enabled: method.enabled === undefined ? (existingMethod?.enabled !== false) : isTruthy(method.enabled),
    isDefault: method.isDefault === undefined ? Boolean(existingMethod?.isDefault) : isTruthy(method.isDefault),
    credentialsEncrypted: hasNewCredentials
      ? encryptCredentials(credentialsInput)
      : providerChanged
        ? ""
      : String(existingMethod?.credentialsEncrypted || ""),
    credentialHints: hasNewCredentials
      ? buildCredentialHints(credentialsInput)
      : providerChanged
        ? {}
      : (existingMethod?.credentialHints || {}),
    upiId: String(method.upiId ?? existingMethod?.upiId ?? "").trim(),
    qrImageUrl: String(method.qrImageUrl ?? existingMethod?.qrImageUrl ?? "").trim(),
    instructions: String(method.instructions ?? existingMethod?.instructions ?? "").trim(),
    sortOrder: toNumber(method.sortOrder, existingMethod?.sortOrder ?? index)
  };
}

function dedupeMethods(methods = []) {
  const map = new Map();
  methods.forEach((method, index) => {
    const safeMethod = method?.toObject ? method.toObject() : method;
    const key = String(safeMethod?.methodId || "").trim();
    if (!key) return;
    const normalizedSortOrder = toNumber(safeMethod?.sortOrder, index);

    if (!map.has(key)) {
      map.set(key, { ...safeMethod, sortOrder: normalizedSortOrder });
      return;
    }

    const existing = map.get(key);
    map.set(key, {
      ...existing,
      ...safeMethod,
      sortOrder: Math.min(toNumber(existing.sortOrder, index), normalizedSortOrder)
    });
  });
  return [...map.values()].sort((a, b) => toNumber(a.sortOrder) - toNumber(b.sortOrder));
}

function ensureSingleDefault(methods = [], options = {}) {
  if (!methods.length) return methods;

  const preferLatest = options.preferLatest !== false;
  const methodPosition = new Map();
  methods.forEach((method, index) => {
    methodPosition.set(String(method?.methodId || ""), index);
  });

  const enabledMethods = methods.filter(method => method.enabled !== false);
  const candidatePool = enabledMethods.length ? enabledMethods : methods;
  const defaultCandidates = candidatePool.filter(method => method.isDefault === true);

  let targetDefaultMethodId = "";

  if (defaultCandidates.length) {
    const selected = preferLatest
      ? defaultCandidates.reduce((best, method) => {
        if (!best) return method;

        const bestPosition = toNumber(methodPosition.get(String(best.methodId || "")), 0);
        const currentPosition = toNumber(methodPosition.get(String(method.methodId || "")), 0);
        const bestSortOrder = toNumber(best.sortOrder, bestPosition);
        const currentSortOrder = toNumber(method.sortOrder, currentPosition);

        if (currentSortOrder > bestSortOrder) return method;
        if (currentSortOrder < bestSortOrder) return best;
        return currentPosition >= bestPosition ? method : best;
      }, null)
      : defaultCandidates[0];

    targetDefaultMethodId = String(selected?.methodId || "");
  }

  if (!targetDefaultMethodId) {
    targetDefaultMethodId = String(candidatePool[0]?.methodId || methods[0]?.methodId || "");
  }

  return methods.map(method => ({
    ...method,
    isDefault: String(method.methodId || "") === targetDefaultMethodId
  }));
}

function normalizeSettingsMethods(settings = {}) {
  const sourceMethods = Array.isArray(settings.enabledMethods) ? settings.enabledMethods : [];
  const plainMethods = sourceMethods.map((method, index) => {
    const safeMethod = method?.toObject ? method.toObject() : method;
    return {
      ...safeMethod,
      sortOrder: toNumber(safeMethod?.sortOrder, index)
    };
  });

  const dedupedMethods = dedupeMethods(plainMethods);
  const normalizedMethods = ensureSingleDefault(dedupedMethods, { preferLatest: true });
  const normalizedDefaultMap = new Map(
    normalizedMethods.map(method => [String(method.methodId || ""), method.isDefault === true])
  );

  const hasDefaultMismatch = dedupedMethods.some(method => {
    const key = String(method.methodId || "");
    return (method.isDefault === true) !== Boolean(normalizedDefaultMap.get(key));
  });

  return {
    normalizedMethods,
    hadDuplicates: plainMethods.length !== dedupedMethods.length,
    hasDefaultMismatch
  };
}

function isUpiLikeMethod(method = {}) {
  const providerName = normalizeProviderName(method.providerName || "");
  return providerName.includes("UPI")
    || Boolean(String(method.upiId || "").trim())
    || Boolean(String(method.qrImageUrl || "").trim());
}

function buildDefaultSettingsPayload(restaurantId) {
  return {
    restaurantId: String(restaurantId),
    enabledMethods: DEFAULT_METHODS.map((method, index) => ({ ...method, sortOrder: index })),
    allowCOD: true,
    allowPayAtCounter: true,
    minimumOnlineAmount: 0,
    convenienceFee: 0,
    paymentInstructions: ""
  };
}

async function getOrCreatePaymentSettings(restaurantId) {
  const key = String(restaurantId || "").trim();
  if (!key) throw new Error("restaurantId is required");

  let settings = await RestaurantPaymentSettings.findOne({ restaurantId: key });
  if (!settings) {
    settings = await RestaurantPaymentSettings.create(buildDefaultSettingsPayload(key));
  }
  return settings;
}

async function upsertPaymentSettings(restaurantId, payload = {}) {
  const key = String(restaurantId || "").trim();
  if (!key) throw new Error("restaurantId is required");

  const current = await getOrCreatePaymentSettings(key);
  const existingMap = buildMethodMap(current.enabledMethods || []);
  const incomingMethods = Array.isArray(payload.enabledMethods) ? payload.enabledMethods : current.enabledMethods;
  const sanitizedMethods = incomingMethods.map((method, index) => sanitizeMethod(method, existingMap, index));
  const dedupedMethods = ensureSingleDefault(dedupeMethods(sanitizedMethods));

  current.enabledMethods = dedupedMethods;
  current.allowCOD = payload.allowCOD === undefined ? current.allowCOD : isTruthy(payload.allowCOD);
  current.allowPayAtCounter = payload.allowPayAtCounter === undefined
    ? current.allowPayAtCounter
    : isTruthy(payload.allowPayAtCounter);
  current.minimumOnlineAmount = Math.max(0, toNumber(payload.minimumOnlineAmount, current.minimumOnlineAmount || 0));
  current.convenienceFee = Math.max(0, toNumber(payload.convenienceFee, current.convenienceFee || 0));
  current.paymentInstructions = payload.paymentInstructions === undefined
    ? String(current.paymentInstructions || "")
    : String(payload.paymentInstructions || "");

  current.enabledMethods = current.enabledMethods.map(method => {
    const safeMethod = method?.toObject ? method.toObject() : method;
    const providerName = normalizeProviderName(safeMethod.providerName || "");

    if (providerName === "CASH" && current.allowCOD === false) {
      return { ...safeMethod, enabled: false, isDefault: false };
    }

    if (providerName === "PAY_AT_COUNTER" && current.allowPayAtCounter === false) {
      return { ...safeMethod, enabled: false, isDefault: false };
    }

    return safeMethod;
  });
  current.enabledMethods = ensureSingleDefault(dedupeMethods(current.enabledMethods));

  await current.save();
  return current;
}

async function togglePaymentMethod(restaurantId, methodId, enabled) {
  const settings = await getOrCreatePaymentSettings(restaurantId);
  const target = String(methodId || "").trim();
  if (!target) throw new Error("methodId is required");

  let found = false;
  let blockedReason = "";
  settings.enabledMethods = settings.enabledMethods.map(method => {
    if (String(method.methodId) !== target) return method;
    found = true;
    const providerName = normalizeProviderName(method.providerName || "");
    const nextEnabled = enabled === undefined ? !method.enabled : isTruthy(enabled);

    if (providerName === "CASH" && settings.allowCOD === false && nextEnabled) {
      blockedReason = "Enable Allow COD to activate Cash payment method";
      return { ...method.toObject(), enabled: false, isDefault: false };
    }

    if (providerName === "PAY_AT_COUNTER" && settings.allowPayAtCounter === false && nextEnabled) {
      blockedReason = "Enable Pay at Counter toggle to activate this method";
      return { ...method.toObject(), enabled: false, isDefault: false };
    }

    return {
      ...method.toObject(),
      enabled: nextEnabled,
      isDefault: nextEnabled === false ? false : method.isDefault
    };
  });

  if (!found) {
    throw new Error("Payment method not found");
  }

  if (blockedReason) {
    throw new Error(blockedReason);
  }

  settings.enabledMethods = ensureSingleDefault(dedupeMethods(settings.enabledMethods));
  await settings.save();
  return settings;
}

async function deletePaymentMethod(restaurantId, methodId) {
  const settings = await getOrCreatePaymentSettings(restaurantId);
  const target = String(methodId || "").trim();
  if (!target) throw new Error("methodId is required");

  const previousCount = settings.enabledMethods.length;
  settings.enabledMethods = settings.enabledMethods.filter(method => String(method.methodId) !== target);
  if (settings.enabledMethods.length === previousCount) {
    throw new Error("Payment method not found");
  }

  settings.enabledMethods = ensureSingleDefault(dedupeMethods(settings.enabledMethods));
  await settings.save();
  return settings;
}

function buildAdminSafeMethod(method = {}) {
  return {
    methodId: method.methodId,
    providerName: method.providerName,
    displayName: method.displayName,
    type: method.type,
    enabled: method.enabled !== false,
    isDefault: method.isDefault === true,
    hasCredentials: Boolean(method.credentialsEncrypted),
    credentialHints: method.credentialHints || {},
    upiId: method.upiId || "",
    qrImageUrl: method.qrImageUrl || "",
    instructions: method.instructions || "",
    sortOrder: toNumber(method.sortOrder, 0)
  };
}

function buildAdminSafeSettings(settings) {
  if (!settings) return null;
  const payload = settings.toObject ? settings.toObject() : settings;
  return {
    restaurantId: payload.restaurantId,
    enabledMethods: dedupeMethods(payload.enabledMethods || []).map(buildAdminSafeMethod),
    allowCOD: payload.allowCOD !== false,
    allowPayAtCounter: payload.allowPayAtCounter !== false,
    minimumOnlineAmount: toNumber(payload.minimumOnlineAmount, 0),
    convenienceFee: toNumber(payload.convenienceFee, 0),
    paymentInstructions: String(payload.paymentInstructions || ""),
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt
  };
}

function buildCustomerSafeMethod(method = {}, settings = {}) {
  const isUpiLike = isUpiLikeMethod(method);
  return {
    methodId: method.methodId,
    providerName: method.providerName,
    displayName: method.displayName,
    type: method.type,
    enabled: method.enabled !== false,
    isDefault: method.isDefault === true,
    upiId: isUpiLike ? String(method.upiId || "") : "",
    qrImageUrl: isUpiLike ? String(method.qrImageUrl || "") : "",
    instructions: String(method.instructions || settings.paymentInstructions || "")
  };
}

function buildFallbackMethod(settings = {}) {
  return {
    methodId: "pay_at_counter",
    providerName: "PAY_AT_COUNTER",
    displayName: "Pay at Counter",
    type: "OFFLINE",
    enabled: true,
    isDefault: true,
    upiId: "",
    qrImageUrl: "",
    instructions: String(settings.paymentInstructions || "Please pay at the counter before leaving.")
  };
}

function isMethodAllowedBySettings(method = {}, settings = {}) {
  const providerName = normalizeProviderName(method.providerName || "");
  if (providerName === "CASH" && settings.allowCOD === false) {
    return false;
  }
  if (providerName === "PAY_AT_COUNTER" && settings.allowPayAtCounter === false) {
    return false;
  }
  return true;
}

async function getCustomerPaymentOptions(restaurantId) {
  const settings = await getOrCreatePaymentSettings(restaurantId);
  const { normalizedMethods, hadDuplicates, hasDefaultMismatch } = normalizeSettingsMethods(settings);

  if (hadDuplicates || hasDefaultMismatch) {
    settings.enabledMethods = normalizedMethods;
    await settings.save();
  }

  const safeSettings = buildAdminSafeSettings({
    ...(settings.toObject ? settings.toObject() : settings),
    enabledMethods: normalizedMethods
  });

  console.log("[payment-options] Payment settings fetched", {
    restaurantId: safeSettings?.restaurantId,
    methods: (safeSettings?.enabledMethods || []).map(method => ({
      methodId: method.methodId,
      providerName: method.providerName,
      type: method.type,
      enabled: method.enabled,
      isDefault: method.isDefault
    }))
  });

  let methods = (safeSettings.enabledMethods || [])
    .filter(method => method.enabled && isMethodAllowedBySettings(method, safeSettings))
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      const orderDiff = toNumber(a.sortOrder, 0) - toNumber(b.sortOrder, 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.displayName || "").localeCompare(String(b.displayName || ""));
    })
    .map(method => buildCustomerSafeMethod(method, safeSettings));

  if (!methods.length) {
    methods = [buildFallbackMethod(safeSettings)];
  }

  const defaultMethod = methods.find(method => method.isDefault) || methods[0];
  methods = methods.map(method => ({
    ...method,
    isDefault: method.methodId === defaultMethod.methodId
  }));

  methods = methods.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""));
  });

  console.log("[payment-options] Enabled methods returned", {
    restaurantId: safeSettings?.restaurantId,
    methods: methods.map(method => ({
      methodId: method.methodId,
      providerName: method.providerName,
      type: method.type,
      enabled: method.enabled,
      isDefault: method.isDefault
    }))
  });

  return {
    restaurantId: safeSettings.restaurantId,
    methods,
    defaultMethodId: defaultMethod.methodId,
    allowCOD: safeSettings.allowCOD,
    allowPayAtCounter: safeSettings.allowPayAtCounter,
    minimumOnlineAmount: safeSettings.minimumOnlineAmount,
    convenienceFee: safeSettings.convenienceFee,
    paymentInstructions: safeSettings.paymentInstructions
  };
}

function resolveMethodForOrder(settings, requestedMethodId = "") {
  const safeSettings = buildAdminSafeSettings(settings);
  const methods = ensureSingleDefault(
    dedupeMethods((safeSettings?.enabledMethods || [])
      .filter(method => method.enabled && isMethodAllowedBySettings(method, safeSettings))),
    { preferLatest: true }
  );
  const requested = String(requestedMethodId || "").trim();

  if (!methods.length) {
    return buildFallbackMethod(safeSettings || {});
  }

  if (requested) {
    const exact = methods.find(method => String(method.methodId) === requested);
    if (exact) return exact;
  }

  const byDefault = methods.find(method => method.isDefault);
  return byDefault || methods[0];
}

function getMethodCredentials(method = {}, settings = {}) {
  const docMethods = settings?.enabledMethods || [];
  const found = docMethods.find(item => String(item.methodId) === String(method.methodId));
  const encrypted = found?.credentialsEncrypted || method.credentialsEncrypted || "";
  return decryptCredentials(encrypted);
}

module.exports = {
  ONLINE_PROVIDERS,
  OFFLINE_PROVIDERS,
  normalizeProviderName,
  normalizeMethodType,
  createMethodId,
  getOrCreatePaymentSettings,
  upsertPaymentSettings,
  togglePaymentMethod,
  deletePaymentMethod,
  buildAdminSafeSettings,
  getCustomerPaymentOptions,
  resolveMethodForOrder,
  getMethodCredentials
};
