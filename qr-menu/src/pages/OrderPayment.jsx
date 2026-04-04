import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import "./OrderPayment.css";
import { useCustomerSession } from "../context/CustomerSessionContext";
import { useNotifications } from "../context/NotificationContext";
import { API_BASE } from "../utils/apiBase";
import { buildCustomerRoute, buildPaymentSuccessRoute } from "../utils/customerRouting";
import { getBillItems, normalizeItemStatus } from "../utils/orderBillUtils";
let razorpayScriptPromise = null;

function normalizeProviderName(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
}

function isUpiMethod(method) {
  const safeMethod = method && typeof method === "object" ? method : {};
  const provider = normalizeProviderName(safeMethod.providerName || "");
  return provider.includes("UPI")
    || Boolean(String(safeMethod.upiId || "").trim())
    || Boolean(String(safeMethod.qrImageUrl || "").trim());
}

function isRazorpayMethod(method) {
  const safeMethod = method && typeof method === "object" ? method : {};
  return normalizeProviderName(safeMethod.providerName || "") === "RAZORPAY";
}

function normalizePaymentStatus(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "PAID") return "SUCCESS";
  if (["PENDING", "INITIATED", "SUCCESS", "FAILED"].includes(key)) return key;
  return "PENDING";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise(resolve => {
      const existing = document.querySelector("script[data-razorpay-checkout='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.razorpayCheckout = "true";
      script.onload = () => resolve(Boolean(window.Razorpay));
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    }).then(result => {
      if (!result) {
        razorpayScriptPromise = null;
      }
      return result;
    });
  }

  return razorpayScriptPromise;
}

export default function OrderPayment() {
  const { restaurantId: routeRestaurantId = "", orderId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useCustomerSession();
  const { pushLocalToast } = useNotifications() || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderInfo, setOrderInfo] = useState(null);
  const [methods, setMethods] = useState([]);
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [initiationPayload, setInitiationPayload] = useState(null);
  const [utr, setUtr] = useState("");
  const [proofFileName, setProofFileName] = useState("");
  const [proofDataUrl, setProofDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const redirectLockRef = useRef(false);

  const tableFromQuery = Number(searchParams.get("table") || 0);
  const activeRestaurantId = String(routeRestaurantId || session?.restaurantId || "").trim();
  const activeTableNumber = Number(tableFromQuery || session?.tableNumber || 0);
  const activeSessionId = String(session?.sessionId || "").trim();

  const selectedMethod = useMemo(() => {
    const safeMethods = Array.isArray(methods)
      ? methods.filter(method => method && typeof method === "object")
      : [];
    return safeMethods.find(method => String(method.methodId) === String(selectedMethodId)) || safeMethods[0] || null;
  }, [methods, selectedMethodId]);

  const selectedMethodIsUpi = useMemo(() => isUpiMethod(selectedMethod), [selectedMethod]);
  const selectedMethodIsRazorpay = useMemo(() => isRazorpayMethod(selectedMethod), [selectedMethod]);
  const paymentStatus = normalizePaymentStatus(orderInfo?.paymentStatus || "PENDING");
  const paymentAlreadyCompleted = paymentStatus === "SUCCESS";
  const upiUnderReview = selectedMethodIsUpi && paymentStatus === "INITIATED";

  const backToOrderUrl = useMemo(() => {
    return buildCustomerRoute(activeRestaurantId, "status", { tableNumber: activeTableNumber || null });
  }, [activeRestaurantId, activeTableNumber]);
  const paymentFailedUrl = useMemo(() => {
    return buildCustomerRoute(activeRestaurantId, "payment-failed", {
      tableNumber: activeTableNumber || null,
      query: {
        orderId
      }
    });
  }, [activeRestaurantId, activeTableNumber, orderId]);

  const resolvePaymentSuccessUrl = useCallback((payload = {}) => {
    if (payload?.paymentSuccessUrl) {
      return String(payload.paymentSuccessUrl);
    }

    const receiptId = String(payload?.receiptId || orderInfo?.receiptId || "").trim();
    const token = String(payload?.receiptShareToken || orderInfo?.receiptShareToken || "").trim();
    if (!activeRestaurantId || !receiptId || !token) {
      return backToOrderUrl;
    }

    return buildPaymentSuccessRoute(activeRestaurantId, {
      orderId,
      receiptId,
      token,
      tableNumber: activeTableNumber || null
    });
  }, [activeRestaurantId, activeTableNumber, backToOrderUrl, orderId, orderInfo?.receiptId, orderInfo?.receiptShareToken]);

  const goToPaymentSuccess = useCallback((payload = {}) => {
    if (redirectLockRef.current) return;
    redirectLockRef.current = true;
    const targetUrl = resolvePaymentSuccessUrl(payload);
    window.setTimeout(() => navigate(targetUrl, { replace: true }), 700);
  }, [navigate, resolvePaymentSuccessUrl]);

  const goToPaymentFailed = useCallback(() => {
    if (redirectLockRef.current) return;
    redirectLockRef.current = true;
    window.setTimeout(() => navigate(paymentFailedUrl, { replace: true }), 700);
  }, [navigate, paymentFailedUrl]);

  const syncOrderStateFromResponse = useCallback((data = {}) => {
    setOrderInfo(prev => prev ? {
      ...prev,
      billItems: Array.isArray(data.billItems) ? data.billItems : prev.billItems || [],
      paymentStatus: String(data.paymentStatus || prev.paymentStatus || "PENDING"),
      paymentMethod: String(data.paymentMethod || prev.paymentMethod || ""),
      paymentProvider: String(data.paymentProvider || prev.paymentProvider || ""),
      paymentMethodId: String(data.paymentMethodId || prev.paymentMethodId || ""),
      transactionId: String(data.transactionId || prev.transactionId || ""),
      receiptId: String(data.receiptId || prev.receiptId || ""),
      receiptNumber: String(data.receiptNumber || prev.receiptNumber || ""),
      receiptShareToken: String(data.receiptShareToken || prev.receiptShareToken || ""),
      receiptUrl: String(data.receiptUrl || prev.receiptUrl || ""),
      paymentSuccessUrl: String(data.paymentSuccessUrl || prev.paymentSuccessUrl || ""),
      payableTotal: Number(data.payableTotal || prev.payableTotal || prev.total || 0),
      total: Number(data.total || prev.total || 0),
      paymentLocked: normalizePaymentStatus(data.paymentStatus || prev.paymentStatus || "PENDING") === "SUCCESS"
    } : prev);
  }, []);

  async function fetchPaymentData() {
    if (!orderId || !activeRestaurantId || !activeSessionId || !activeTableNumber) {
      setError("Session details missing. Please go back to order status page and retry.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      console.log("[OrderPayment] Fetching payment-options", {
        orderId,
        restaurantId: activeRestaurantId,
        tableNumber: activeTableNumber,
        sessionId: activeSessionId
      });

      const url = `${API_BASE}/api/orders/${encodeURIComponent(orderId)}/payment-options`
        + `?restaurantId=${encodeURIComponent(activeRestaurantId)}`
        + `&tableNumber=${encodeURIComponent(String(activeTableNumber))}`
        + `&sessionId=${encodeURIComponent(activeSessionId)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to load payment options.");
      }

      const serverMethods = Array.isArray(data.methods)
        ? data.methods.filter(method => method && typeof method === "object")
        : [];

      console.log("[OrderPayment] payment-options response methods", serverMethods.map(method => ({
        methodId: method.methodId,
        providerName: method.providerName,
        type: method.type,
        enabled: method.enabled,
        isDefault: method.isDefault
      })));

      setOrderInfo({
        orderId: data.orderId,
        status: data.status,
        total: Number(data.total || 0),
        payableTotal: Number(data.payableTotal || data.total || 0),
        billItems: Array.isArray(data.billItems) ? data.billItems : [],
        paymentStatus: String(data.paymentStatus || "PENDING"),
        paymentMethodId: String(data.paymentMethodId || ""),
        paymentMethod: String(data.paymentMethod || ""),
        paymentProvider: String(data.paymentProvider || ""),
        transactionId: String(data.transactionId || ""),
        receiptId: String(data.receiptId || ""),
        receiptNumber: String(data.receiptNumber || ""),
        receiptShareToken: String(data.receiptShareToken || ""),
        receiptUrl: String(data.receiptUrl || ""),
        paymentSuccessUrl: String(data.paymentSuccessUrl || ""),
        paymentLocked: data.paymentLocked === true,
        paymentLockMessage: String(data.paymentLockMessage || ""),
        paymentInstructions: String(data.paymentInstructions || "")
      });

      setMethods(serverMethods);

      const defaultMethod = serverMethods.find(method => method.isDefault)
        || serverMethods.find(method => String(method.methodId) === String(data.defaultMethodId || ""))
        || serverMethods[0];

      console.log("[OrderPayment] Selected default payment method", {
        methodId: defaultMethod?.methodId,
        providerName: defaultMethod?.providerName,
        displayName: defaultMethod?.displayName
      });

      setSelectedMethodId(defaultMethod?.methodId || "");
      setInitiationPayload(null);
    } catch (fetchErr) {
      setError(fetchErr.message);
      setMethods([]);
      setOrderInfo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPaymentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, activeRestaurantId, activeSessionId, activeTableNumber]);

  useEffect(() => {
    if (!orderId || redirectLockRef.current) return undefined;
    if (paymentStatus !== "INITIATED") return undefined;

    let active = true;

    async function pollOrderStatus() {
      try {
        const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        syncOrderStateFromResponse(data);
        const nextStatus = String(data.paymentStatus || "").toUpperCase();
        if (nextStatus === "SUCCESS" && data.receiptId && data.receiptShareToken) {
          setSuccessPulse(true);
          pushLocalToast?.({
            title: "Payment successful",
            message: "Your payment was approved successfully.",
            type: "PAYMENT_SUCCESS",
            priority: "MEDIUM"
          });
          goToPaymentSuccess(data);
        } else if (nextStatus === "FAILED") {
          pushLocalToast?.({
            title: "Payment failed",
            message: "Payment verification failed. Please retry.",
            type: "PAYMENT_FAILED",
            priority: "HIGH"
          });
          goToPaymentFailed();
        }
      } catch {
        // polling is best-effort only
      }
    }

    pollOrderStatus();
    const interval = window.setInterval(pollOrderStatus, 4000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [goToPaymentFailed, goToPaymentSuccess, orderId, paymentStatus, pushLocalToast, syncOrderStateFromResponse]);

  async function handleCopyUpiId() {
    const upiId = String(selectedMethod?.upiId || "").trim();
    if (!upiId) return;

    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Unable to copy UPI ID. Please copy it manually.");
    }
  }

  async function handleProofUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 700 * 1024) {
      setError("Screenshot must be under 700KB.");
      return;
    }

    try {
      const preview = await fileToDataUrl(file);
      setProofFileName(file.name);
      setProofDataUrl(preview);
      setError("");
    } catch {
      setError("Unable to read screenshot file.");
    }
  }

  async function verifyRazorpayPayment(payload = {}) {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/payments/razorpay/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          restaurantId: activeRestaurantId,
          tableNumber: activeTableNumber,
          sessionId: activeSessionId,
          paymentMethodId: selectedMethod?.methodId || "",
          status: payload.status,
          failureReason: payload.failureReason || "",
          razorpay_order_id: payload.razorpay_order_id || "",
          razorpay_payment_id: payload.razorpay_payment_id || "",
          razorpay_signature: payload.razorpay_signature || ""
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to verify Razorpay payment.");
      }

      setInitiationPayload(prev => ({
        ...(prev || {}),
        ...data,
        message: data.message || prev?.message || "Payment verification completed."
      }));

      syncOrderStateFromResponse(data);

      const nextStatus = String(data.paymentStatus || "").toUpperCase();
      if (nextStatus === "SUCCESS") {
        setSuccessPulse(true);
        pushLocalToast?.({
          title: "Payment successful",
          message: "Razorpay payment verified successfully.",
          type: "PAYMENT_SUCCESS",
          priority: "MEDIUM"
        });
        goToPaymentSuccess(data);
      } else if (nextStatus === "FAILED") {
        pushLocalToast?.({
          title: "Payment failed",
          message: "Razorpay payment failed. Please try again.",
          type: "PAYMENT_FAILED",
          priority: "HIGH"
        });
        goToPaymentFailed();
      }
    } catch (verifyErr) {
      setError(verifyErr.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInitiateRazorpayCheckout() {
    setSubmitting(true);
    setError("");

    let checkoutOpened = false;
    try {
      const res = await fetch(`${API_BASE}/api/payments/razorpay/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId,
          restaurantId: activeRestaurantId,
          tableNumber: activeTableNumber,
          sessionId: activeSessionId,
          paymentMethodId: selectedMethod?.methodId || ""
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to create Razorpay order.");
      }

      setInitiationPayload(data);
      syncOrderStateFromResponse(data);

      if (String(data.paymentStatus || "").toUpperCase() === "SUCCESS") {
        setSuccessPulse(true);
        pushLocalToast?.({
          title: "Payment completed",
          message: "Payment already marked successful.",
          type: "PAYMENT_SUCCESS",
          priority: "MEDIUM"
        });
        goToPaymentSuccess(data);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || typeof window.Razorpay !== "function") {
        throw new Error("Unable to load Razorpay checkout. Please check internet and retry.");
      }

      const razorpayDetails = data?.razorpay || {};
      if (!razorpayDetails.keyId || !razorpayDetails.orderId || !razorpayDetails.amount) {
        throw new Error("Razorpay order payload is incomplete. Please try again.");
      }

      const contact = String(session?.phoneNumber || "").trim();
      const customerName = String(session?.customerName || "").trim();
      let failureHandled = false;

      const razorpay = new window.Razorpay({
        key: razorpayDetails.keyId,
        amount: Number(razorpayDetails.amount || 0),
        currency: String(razorpayDetails.currency || "INR"),
        name: String(razorpayDetails.name || "HotelMenu"),
        description: String(razorpayDetails.description || `Payment for order ${orderId}`),
        order_id: String(razorpayDetails.orderId || ""),
        method: razorpayDetails.method && typeof razorpayDetails.method === "object"
          ? razorpayDetails.method
          : {
              upi: true,
              card: true,
              netbanking: true,
              wallet: true
            },
        notes: razorpayDetails.notes && typeof razorpayDetails.notes === "object"
          ? razorpayDetails.notes
          : {},
        prefill: {
          name: customerName,
          contact
        },
        theme: {
          color: "#ff7a18"
        },
        modal: {
          ondismiss: () => {
            if (failureHandled) return;
            setSubmitting(false);
            setError("Payment window was closed. You can retry.");
            pushLocalToast?.({
              title: "Payment cancelled",
              message: "Checkout was closed before payment completed.",
              type: "PAYMENT_FAILED",
              priority: "MEDIUM"
            });
            goToPaymentFailed();
          }
        },
        handler: async response => {
          failureHandled = true;
          await verifyRazorpayPayment(response || {});
        }
      });

      razorpay.on("payment.failed", async response => {
        failureHandled = true;
        const errorDescription = String(response?.error?.description || response?.error?.reason || "Payment failed");
        await verifyRazorpayPayment({
          status: "FAILED",
          failureReason: errorDescription,
          razorpay_order_id: String(response?.error?.metadata?.order_id || ""),
          razorpay_payment_id: String(response?.error?.metadata?.payment_id || "")
        });
      });

      checkoutOpened = true;
      razorpay.open();
    } catch (checkoutErr) {
      setError(checkoutErr.message);
    } finally {
      if (!checkoutOpened) {
        setSubmitting(false);
      }
    }
  }

  async function handleInitiatePayment() {
    if (!selectedMethod) {
      setError("Please select a payment method.");
      return;
    }

    if (paymentAlreadyCompleted) {
      setError("Payment is already completed for this order.");
      return;
    }

    if (selectedMethodIsRazorpay) {
      await handleInitiateRazorpayCheckout();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/payment/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurantId: activeRestaurantId,
          tableNumber: activeTableNumber,
          sessionId: activeSessionId,
          paymentMethodId: selectedMethod.methodId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to initiate payment.");
      }

      setInitiationPayload(data);
      syncOrderStateFromResponse(data);

      if (String(data.paymentStatus || "").toUpperCase() === "SUCCESS") {
        setSuccessPulse(true);
        pushLocalToast?.({
          title: "Payment completed",
          message: "Payment was recorded successfully.",
          type: "PAYMENT_SUCCESS",
          priority: "MEDIUM"
        });
        goToPaymentSuccess(data);
      }
    } catch (submitErr) {
      setError(submitErr.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmUpi() {
    if (!selectedMethod || !selectedMethodIsUpi) {
      setError("Please select a UPI payment method.");
      return;
    }

    if (!utr.trim()) {
      setError("Please enter UTR / transaction reference.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/payment/confirm-upi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurantId: activeRestaurantId,
          tableNumber: activeTableNumber,
          sessionId: activeSessionId,
          paymentMethodId: selectedMethod.methodId,
          utr: utr.trim(),
          paymentProof: proofDataUrl
            ? { imageUrl: proofDataUrl, fileName: proofFileName }
            : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to submit UPI confirmation.");
      }

      pushLocalToast?.({
        title: "UPI under review",
        message: "UTR and proof submitted. The restaurant will verify and approve it shortly.",
        type: "SYSTEM_ALERT",
        priority: "MEDIUM"
      });

      setInitiationPayload(prev => ({
        ...(prev || {}),
        ...data,
        message: data.message || "UPI payment submitted."
      }));

      syncOrderStateFromResponse(data);
    } catch (confirmErr) {
      setError(confirmErr.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOnline(status) {
    if (!selectedMethod) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/payment/verify-online`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurantId: activeRestaurantId,
          tableNumber: activeTableNumber,
          sessionId: activeSessionId,
          paymentMethodId: selectedMethod.methodId,
          status,
          transactionId: initiationPayload?.transactionId || orderInfo?.transactionId || ""
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to verify payment.");
      }

      syncOrderStateFromResponse(data);

      if (String(data.paymentStatus || "").toUpperCase() === "SUCCESS") {
        setSuccessPulse(true);
        pushLocalToast?.({
          title: "Payment successful",
          message: "Payment verified successfully.",
          type: "PAYMENT_SUCCESS",
          priority: "MEDIUM"
        });
        goToPaymentSuccess(data);
      }

      if (String(data.paymentStatus || "").toUpperCase() === "FAILED") {
        pushLocalToast?.({
          title: "Payment failed",
          message: "Payment failed. Please retry.",
          type: "PAYMENT_FAILED",
          priority: "HIGH"
        });
        goToPaymentFailed();
      }
    } catch (verifyErr) {
      setError(verifyErr.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="order-payment-page">
      <div className="order-payment-overlay"></div>
      <div className={`order-payment-shell ${successPulse ? "success-pulse" : ""}`}>
        <div className="order-payment-head">
          <h1>Make Payment</h1>
          <button type="button" className="order-back-btn" onClick={() => navigate(backToOrderUrl)}>
            Back to Order
          </button>
        </div>

        {error && <p className="order-payment-error">{error}</p>}

        {loading && <p className="order-payment-info">Loading payment options...</p>}

        {!loading && orderInfo && (
          <>
            <div className="order-summary-card">
              <div>
                <p className="label">Order</p>
                <strong>#{orderInfo.orderId}</strong>
              </div>
              <div>
                <p className="label">Amount</p>
                <strong>₹{Number(orderInfo.payableTotal || orderInfo.total || 0).toFixed(2)}</strong>
              </div>
              <div>
                <p className="label">Payment Status</p>
                <strong className={`state-text ${String(paymentStatus).toLowerCase()}`}>{paymentStatus}</strong>
              </div>
            </div>

            <div className="order-summary-card">
              {getBillItems(orderInfo).map((item, index) => (
                <div key={`${orderInfo.orderId}-bill-item-${item.billItemId || index}`}>
                  <p className="label">{item.name} x{item.qty}</p>
                  <strong>{normalizeItemStatus(item.status)}</strong>
                </div>
              ))}
            </div>

            {orderInfo.paymentLocked && (
              <p className="order-payment-info">{orderInfo.paymentLockMessage || "Payment is currently locked."}</p>
            )}

            {paymentAlreadyCompleted && orderInfo?.receiptId && orderInfo?.receiptShareToken && (
              <div className="gateway-card">
                <p className="order-payment-info">
                  Payment is already complete. You can view the final receipt and confirmation page now.
                </p>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => goToPaymentSuccess(orderInfo)}
                >
                  View Payment Receipt
                </button>
              </div>
            )}

            {!orderInfo.paymentLocked && (
              <>
                <div className="method-grid">
                  {methods.map(method => {
                    const selected = String(method.methodId) === String(selectedMethod?.methodId);
                    return (
                      <button
                        key={method.methodId}
                        type="button"
                        className={`method-card ${selected ? "selected" : ""}`}
                        onClick={() => setSelectedMethodId(method.methodId)}
                      >
                        <div>
                          <p className="method-title">{method.displayName}</p>
                          <p className="method-meta">{method.providerName} • {method.type}</p>
                        </div>
                        {method.isDefault && <span className="default-tag">Default</span>}
                      </button>
                    );
                  })}
                </div>

                {(selectedMethod?.instructions || orderInfo.paymentInstructions) && (
                  <p className="order-payment-info">
                    {selectedMethod?.instructions || orderInfo.paymentInstructions}
                  </p>
                )}

                {selectedMethodIsRazorpay && (
                  <div className="gateway-card">
                    <p className="order-payment-info">
                      Secure checkout powered by Razorpay. Click Pay to open the payment gateway.
                    </p>
                  </div>
                )}

                {selectedMethodIsUpi && (
                  <div className="upi-glass-card">
                    <p className="upi-label">Pay using any UPI app</p>
                    <p className="order-payment-info">
                      Complete the transfer first, then submit the UTR or screenshot below. The restaurant will verify it before marking the bill paid.
                    </p>
                    {selectedMethod?.upiId && (
                      <div className="upi-row">
                        <span>UPI ID: {selectedMethod.upiId}</span>
                        <button type="button" className="copy-btn" onClick={handleCopyUpiId}>
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}

                    {selectedMethod?.qrImageUrl && (
                      <div className="upi-qr-wrap">
                        <img src={selectedMethod.qrImageUrl} alt="UPI QR" />
                      </div>
                    )}

                    <div className="upi-confirm-grid">
                      <input
                        type="text"
                        placeholder="Enter UTR / transaction reference"
                        value={utr}
                        onChange={event => setUtr(event.target.value)}
                      />
                      <label className="proof-upload">
                        Upload Screenshot (optional)
                        <input type="file" accept="image/*" onChange={handleProofUpload} />
                      </label>
                    </div>

                    {proofFileName && <p className="order-payment-info">Attached: {proofFileName}</p>}

                    {upiUnderReview && (
                      <p className="order-payment-info">
                        UPI verification is in progress. Please wait while the restaurant checks your UTR or screenshot.
                      </p>
                    )}

                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={handleConfirmUpi}
                      disabled={submitting || paymentAlreadyCompleted || upiUnderReview}
                    >
                      {upiUnderReview ? "UPI Under Review" : "Submit UTR / Payment Proof"}
                    </button>
                  </div>
                )}

                {initiationPayload?.requiresGatewayVerification && !selectedMethodIsUpi && !selectedMethodIsRazorpay && (
                  <div className="gateway-card">
                    <p className="order-payment-info">
                      Gateway payment initiated. Complete checkout and verify result.
                    </p>
                    <div className="gateway-actions">
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => handleVerifyOnline("SUCCESS")}
                        disabled={submitting || paymentAlreadyCompleted}
                      >
                        Mark Gateway Success
                      </button>
                      <button
                        type="button"
                        className="action-btn danger"
                        onClick={() => handleVerifyOnline("FAILED")}
                        disabled={submitting || paymentAlreadyCompleted}
                      >
                        Mark Gateway Failed
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="action-btn"
                  onClick={handleInitiatePayment}
                  disabled={submitting || paymentAlreadyCompleted || upiUnderReview}
                >
                  {submitting
                    ? "Processing..."
                    : paymentAlreadyCompleted
                      ? "Payment Completed"
                      : upiUnderReview
                        ? "UPI Under Review"
                        : selectedMethodIsRazorpay
                          ? "Pay with Razorpay"
                          : selectedMethodIsUpi
                            ? "Continue with UPI"
                        : "Pay Now"}
                </button>

                {initiationPayload?.message && (
                  <p className="order-payment-info">{initiationPayload.message}</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
