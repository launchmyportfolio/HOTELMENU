import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import "./PaymentReceipt.css";
import { buildPaymentSuccessRoute, buildReceiptRoute } from "../utils/customerRouting";

const API_BASE = import.meta.env.VITE_API_URL;

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getRestaurantMonogram(name = "") {
  const cleaned = String(name || "").trim();
  if (!cleaned) return "HM";
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "HM";
}

export default function Receipt() {
  const { restaurantId = "", receiptId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const autoPrintedRef = useRef(false);

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const token = String(searchParams.get("token") || "").trim();
  const shouldPrint = searchParams.get("print") === "1";

  useEffect(() => {
    let active = true;

    async function fetchReceipt() {
      if (!receiptId || !token) {
        setError("Receipt details are missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE}/api/receipts/${encodeURIComponent(receiptId)}?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Unable to load receipt.");
        }
        if (!active) return;
        setReceipt(data);
      } catch (fetchErr) {
        if (!active) return;
        setError(fetchErr.message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchReceipt();
    return () => {
      active = false;
    };
  }, [receiptId, token]);

  useEffect(() => {
    if (!shouldPrint || loading || error || !receipt || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    window.setTimeout(() => {
      window.print();
    }, 300);
  }, [shouldPrint, loading, error, receipt]);

  const successUrl = useMemo(() => {
    if (!receipt) return "/";
    return buildPaymentSuccessRoute(restaurantId, {
      orderId: receipt.orderId,
      receiptId,
      token,
      tableNumber: receipt.tableNumber || null
    });
  }, [receipt, receiptId, restaurantId, token]);

  const shareUrl = useMemo(() => {
    if (!receiptId || !token || typeof window === "undefined") return "";
    return `${window.location.origin}${buildReceiptRoute(restaurantId, receiptId, { token })}`;
  }, [receiptId, restaurantId, token]);

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Unable to copy receipt link. Please copy it from the address bar.");
    }
  }

  return (
    <section className="payment-receipt-page">
      <div className="payment-receipt-overlay" />
      <div className="payment-receipt-shell invoice-shell">
        {loading && <p className="payment-receipt-info">Loading receipt...</p>}

        {!loading && error && (
          <div className="payment-error-card">
            <h1>Unable to Load Receipt</h1>
            <p>{error}</p>
            <div className="receipt-action-row">
              <button type="button" className="receipt-btn secondary" onClick={() => window.location.reload()}>
                Retry
              </button>
              <button type="button" className="receipt-btn" onClick={() => navigate("/")}>
                Home
              </button>
            </div>
          </div>
        )}

        {!loading && !error && receipt && (
          <>
            <div className="invoice-toolbar print-hidden">
              <button type="button" className="receipt-btn ghost" onClick={() => navigate(successUrl)}>
                Back to Success Page
              </button>
              <button type="button" className="receipt-btn secondary" onClick={() => window.print()}>
                Download / Print PDF
              </button>
              <button type="button" className="receipt-btn ghost" onClick={handleCopyLink}>
                {copied ? "Receipt Link Copied" : "Copy Receipt Link"}
              </button>
            </div>

            <article className="invoice-card">
              <header className="invoice-header">
                <div className="invoice-brand">
                  {receipt.restaurantSnapshot?.logoUrl
                    ? <img src={receipt.restaurantSnapshot.logoUrl} alt={receipt.restaurantSnapshot?.name || "Restaurant"} />
                    : <span>{getRestaurantMonogram(receipt.restaurantSnapshot?.name)}</span>}
                  <div>
                    <h1>{receipt.restaurantSnapshot?.name || "Restaurant"}</h1>
                    {receipt.restaurantSnapshot?.address && (
                      <p>{receipt.restaurantSnapshot.address}</p>
                    )}
                  </div>
                </div>

                <div className="invoice-meta">
                  <span className="paid-pill">PAID</span>
                  <p>Receipt #{receipt.receiptNumber}</p>
                  <p>Bill {receipt.billNumber || receipt.orderId}</p>
                </div>
              </header>

              <section className="invoice-grid">
                <div>
                  <span className="invoice-label">Table</span>
                  <strong>{receipt.tableNumber || "-"}</strong>
                </div>
                <div>
                  <span className="invoice-label">Order ID</span>
                  <strong>{receipt.orderId}</strong>
                </div>
                <div>
                  <span className="invoice-label">Payment Method</span>
                  <strong>{receipt.paymentMethod || receipt.paymentProvider || "-"}</strong>
                </div>
                <div>
                  <span className="invoice-label">Paid At</span>
                  <strong>{formatDateTime(receipt.paidAt || receipt.generatedAt)}</strong>
                </div>
                <div>
                  <span className="invoice-label">Transaction ID</span>
                  <strong>{receipt.razorpayPaymentId || receipt.transactionId || "-"}</strong>
                </div>
                <div>
                  <span className="invoice-label">Razorpay Order ID</span>
                  <strong>{receipt.razorpayOrderId || "-"}</strong>
                </div>
              </section>

              <section className="invoice-table-wrap">
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(receipt.items || []).map((item, index) => (
                      <tr key={`${receipt._id}-item-${item.name}-${index}`}>
                        <td>{item.name}</td>
                        <td>{item.category || "General"}</td>
                        <td>{item.qty}</td>
                        <td>{formatCurrency(item.unitPrice)}</td>
                        <td>{formatCurrency(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="invoice-totals">
                <div className="invoice-total-row">
                  <span>Subtotal</span>
                  <strong>{formatCurrency(receipt.subtotal)}</strong>
                </div>
                <div className="invoice-total-row">
                  <span>GST / Taxes</span>
                  <strong>{formatCurrency(receipt.gstAmount || receipt.taxAmount || 0)}</strong>
                </div>
                <div className="invoice-total-row">
                  <span>Convenience Fee</span>
                  <strong>{formatCurrency(receipt.convenienceFee)}</strong>
                </div>
                <div className="invoice-total-row grand-total">
                  <span>Final Amount Paid</span>
                  <strong>{formatCurrency(receipt.finalAmount)}</strong>
                </div>
              </section>

              <footer className="invoice-footer">
                <p>Payment Status: Paid</p>
                <p>Thank you for visiting. Have a great day and visit us again.</p>
              </footer>
            </article>
          </>
        )}
      </div>
    </section>
  );
}
