import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import QRCode from "qrcode";
import JSZip from "jszip";
import { toPng } from "html-to-image";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;
const TABLE_URL_BASE = (import.meta.env.VITE_PUBLIC_MENU_URL || "https://hotelmenu-4iv.pages.dev").replace(/\/$/, "");
const DEFAULT_RESTAURANT = import.meta.env.VITE_DEFAULT_RESTAURANT_ID || "defaultRestaurant";

export default function TablesDashboard({ token, restaurantId }) {

  const [tables, setTables] = useState([]);
  const [summary, setSummary] = useState({ total: 0, occupied: 0, free: 0 });
  const [totalTables, setTotalTables] = useState(10);
  const [error, setError] = useState("");
  const cardRefs = useRef({});
  const [showQR, setShowQR] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  async function fetchTables() {
    try {
      const [listRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/tables`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/api/admin/tables/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!listRes.ok || !summaryRes.ok) throw new Error("Unable to load tables");

      const listData = await listRes.json();
      const summaryData = await summaryRes.json();
      setTables(listData);
      setSummary(summaryData);
      setTotalTables(summaryData.total || 10);
      setError("");

    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (token) fetchTables();
  }, [token]);

  function getTableUrl(tableNumber) {
    const rid = restaurantId || DEFAULT_RESTAURANT;
    return `${TABLE_URL_BASE}/restaurant/${rid}?table=${tableNumber}`;
  }

  function setCardRef(tableNumber, node) {
    if (node) {
      cardRefs.current[tableNumber] = node;
    }
  }

  async function buildLabeledQrDataUrl(tableNumber) {
    const url = getTableUrl(tableNumber);
    const qrDataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      width: 260,
      color: { dark: "#111111", light: "#FFFFFF" }
    });

    const img = new Image();
    img.src = qrDataUrl;
    await new Promise(resolve => {
      if (img.complete) return resolve();
      img.onload = resolve;
      img.onerror = resolve;
    });

    const canvas = document.createElement("canvas");
    const width = 260;
    const height = 320;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, 260);

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 260, width, 60);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Table Number ${tableNumber}`, width / 2, 290);

    return canvas.toDataURL("image/png");
  }

  async function downloadQr(tableNumber) {
    try {
      const dataUrl = await buildLabeledQrDataUrl(tableNumber);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `table-${tableNumber}-qr.png`;
      link.click();
      setError("");
    } catch (_err) {
      setError("Unable to download QR right now. Please try again.");
    }
  }

  async function downloadAllQrs() {
    if (!tables.length) return;
    setDownloadingAll(true);
    setError("");
    try {
      const zip = new JSZip();
      for (const table of tables) {
        const dataUrl = await buildLabeledQrDataUrl(table.tableNumber);
        const base64 = dataUrl.split(",")[1];
        zip.file(`table-${table.tableNumber}-qr.png`, base64, { base64: true });
      }

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      const blobUrl = URL.createObjectURL(content);
      link.href = blobUrl;
      link.download = "table-qrcodes.zip";
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (_err) {
      setError("Unable to download all QRs right now. Please try again.");
    } finally {
      setDownloadingAll(false);
    }
  }

  async function handleConfig(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/tables/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ totalTables: Number(totalTables) })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to update tables");
      setTables(data.tables);
      setSummary(prev => ({ ...prev, total: data.tables.length, free: data.tables.length - prev.occupied }));
      fetchTables();
    } catch (err) {
      setError(err.message);
    }
  }

  async function forceFree(tableNumber) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/tables/${tableNumber}/free`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Unable to free table");
      fetchTables();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-dashboard">
      <h1>Tables Dashboard</h1>
      {error && <p className="error-text">{error}</p>}

      <h2 color="white">Total Tables</h2>
      <form className="table-form" onSubmit={handleConfig}>
        <label>
          <input
            type="number"
            min="1"
            value={totalTables}
            onChange={e => setTotalTables(e.target.value)}
          />
        </label>
        <button type="submit">Update</button>
      </form>

      <div className="tables-summary">
        <div className="summary-card highlight">Total Tables: {summary.total}</div>
        <div className="summary-card">Occupied: {summary.occupied}</div>
        <div className="summary-card">Free: {summary.free}</div>
      </div>

      <div className="qr-toggle">
        <div className="qr-note">Generate QR codes for printing or replacement.</div>
        <div className="qr-actions">
          <button type="button" onClick={() => setShowQR(prev => !prev)}>
            {showQR ? "Hide Table QR Codes" : "Show Table QR Codes"}
          </button>
          <button
            type="button"
            onClick={downloadAllQrs}
            disabled={downloadingAll}
          >
            {downloadingAll ? "Preparing..." : "Download All QR Codes"}
          </button>
        </div>
      </div>

      <div className="tables-grid">
        {tables.map(table => (
          <div key={table.tableNumber} className="table-card">
            <div className="menu-top">
              <h3>Table {table.tableNumber}</h3>
              <span className={`table-status ${table.status}`}>{table.status === "occupied" ? "Occupied" : "Free"}</span>
            </div>
            {showQR && (
              <>
                <div className="qr-box">
                  <div
                    className="qr-card"
                    ref={node => setCardRef(table.tableNumber, node)}
                  >
                    <div className="qr-canvas">
                      <QRCodeCanvas
                        value={getTableUrl(table.tableNumber)}
                        size={170}
                        bgColor="#ffffff"
                        fgColor="#111111"
                        includeMargin={false}
                      />
                    </div>
                    <div className="qr-label">Table Number {table.tableNumber}</div>
                  </div>
                </div>
                <p className="muted table-link">{getTableUrl(table.tableNumber)}</p>
              </>
            )}
            {table.status === "occupied" && (
              <>
                <p className="muted">{table.customerName}</p>
                <p className="muted">{table.phoneNumber}</p>
              </>
            )}
            <div className="table-actions">
              {showQR && (
                <button className="ghost-btn" onClick={() => downloadQr(table.tableNumber)}>Download QR</button>
              )}
              <button onClick={() => forceFree(table.tableNumber)}>Force Free</button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
