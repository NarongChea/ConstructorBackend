/**
 * InvoiceForm.jsx
 * ─────────────────────────────────────────────────────────────────
 * Construction materials invoice form.
 * - Selects product → variant → quantity → resolves price by customer type
 * - Shows flexible product attributes (thickness, weight, length…)
 * - Auto-calculates subtotal / discount / total via /api/invoices/preview
 * - Prints with a clean print-only layout (no browser chrome)
 * ─────────────────────────────────────────────────────────────────
 * Expects these env vars (or adjust API_BASE):
 *   VITE_API_BASE=http://localhost:5000/api
 */

import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// ── helpers ───────────────────────────────────────────────────────
const fmt = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const apiFetch = async (path, opts = {}) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
};

// ── empty item template ───────────────────────────────────────────
const emptyItem = () => ({
  _id:       Date.now(),
  productId: "",
  variantId: "",
  quantity:  1,
  priceType: "retail",
  unitPrice: 0,
  // populated after selection
  product:  null,
  variant:  null,
  subtotal: 0,
});

// ═══════════════════════════════════════════════════════════════════
export default function InvoiceForm() {
  const printRef = useRef(null);

  // form state
  const [customerName,  setCustomerName]  = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerType,  setCustomerType]  = useState("retail");
  const [items,         setItems]         = useState([emptyItem()]);
  const [discountType,  setDiscountType]  = useState("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [note,          setNote]          = useState("");
  const [status,        setStatus]        = useState("paid");

  // data from API
  const [products,  setProducts]  = useState([]);
  const [variantMap, setVariantMap] = useState({}); // productId → variants[]

  // calculated preview (from /api/invoices/preview)
  const [preview,   setPreview]   = useState(null);
  const [previewing, setPreviewing] = useState(false);

  // UI state
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(null);   // saved invoice object
  const [error,   setError]   = useState("");

  // ── Load products on mount ──────────────────────────────────────
  useEffect(() => {
    apiFetch("/products?limit=200")
      .then((d) => setProducts(d.data?.products || []))
      .catch(console.error);
  }, []);

  // ── Load variants when a product is selected ────────────────────
  const loadVariants = useCallback(async (productId) => {
    if (variantMap[productId]) return;
    try {
      const d = await apiFetch(`/variants/product/${productId}`);
      setVariantMap((prev) => ({ ...prev, [productId]: d.data || [] }));
    } catch { /* ignore */ }
  }, [variantMap]);

  // ── Auto-preview whenever items / discount / customerType change ─
  const runPreview = useCallback(async (currentItems, ct, dt, dv) => {
    const filled = currentItems.filter((i) => i.variantId && i.quantity > 0);
    if (!filled.length) { setPreview(null); return; }

    setPreviewing(true);
    try {
      const d = await apiFetch("/invoices/preview", {
        method: "POST",
        body: JSON.stringify({
          customerType:  ct,
          items: filled.map((i) => ({
            variantId:  i.variantId,
            quantity:   i.quantity,
            priceType:  i.priceType,
            unitPrice:  i.unitPrice || undefined,
          })),
          discountType:  dt,
          discountValue: parseFloat(dv) || 0,
        }),
      });
      setPreview(d.data);

      // back-fill resolved unit prices into items
      setItems((prev) =>
        prev.map((item) => {
          const pi = d.data.items.find((x) => x.variantId === item.variantId);
          return pi ? { ...item, unitPrice: pi.unitPrice, subtotal: pi.subtotal } : item;
        })
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setPreviewing(false);
    }
  }, []);

  // debounce preview
  const previewTimer = useRef(null);
  const schedulePreview = (nextItems, ct, dt, dv) => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => runPreview(nextItems, ct, dt, dv), 350);
  };

  // ── Item helpers ────────────────────────────────────────────────
  const setItem = (id, patch) => {
    setItems((prev) => {
      const next = prev.map((it) => (it._id === id ? { ...it, ...patch } : it));
      schedulePreview(next, customerType, discountType, discountValue);
      return next;
    });
  };

  const handleProductChange = async (id, productId) => {
    const product = products.find((p) => p._id === productId) || null;
    setItem(id, { productId, product, variantId: "", variant: null, unitPrice: 0, subtotal: 0 });
    if (productId) await loadVariants(productId);
  };

  const handleVariantChange = (id, variantId) => {
    const item = items.find((i) => i._id === id);
    const variants = variantMap[item?.productId] || [];
    const variant = variants.find((v) => v._id === variantId) || null;
    // auto-set base price from tier matching customerType
    const tier = variant?.pricingTiers?.find((t) => t.type === customerType && t.minQty <= 1);
    const unitPrice = tier?.price ?? variant?.price ?? 0;
    setItem(id, { variantId, variant, unitPrice, subtotal: unitPrice * (item?.quantity || 1) });
  };

  const handleQtyChange = (id, qty) => {
    const item = items.find((i) => i._id === id);
    const q = Math.max(1, parseInt(qty) || 1);
    setItem(id, { quantity: q, subtotal: (item?.unitPrice || 0) * q });
  };

  const handlePriceChange = (id, price) => {
    const item = items.find((i) => i._id === id);
    const p = parseFloat(price) || 0;
    setItem(id, { unitPrice: p, subtotal: p * (item?.quantity || 1) });
  };

  const addItem    = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (id) => setItems((prev) => prev.filter((i) => i._id !== id));

  // ── Save invoice ─────────────────────────────────────────────────
  const handleSave = async () => {
    setError("");
    const filled = items.filter((i) => i.variantId && i.quantity > 0);
    if (!filled.length) { setError("Add at least one item."); return; }

    setSaving(true);
    try {
      const d = await apiFetch("/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerType,
          items: filled.map((i) => ({
            variantId: i.variantId,
            quantity:  i.quantity,
            priceType: i.priceType,
            unitPrice: i.unitPrice,
          })),
          discountType,
          discountValue: parseFloat(discountValue) || 0,
          note,
          status,
        }),
      });
      setSaved(d.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Print ────────────────────────────────────────────────────────
  const handlePrint = async () => {
    if (saved) {
      await apiFetch(`/invoices/${saved._id}/print`, { method: "PATCH" }).catch(() => {});
    }
    window.print();
  };

  // ── Computed totals (use preview if available) ───────────────────
  const totals = preview || {
    subtotal:       items.reduce((s, i) => s + (i.subtotal || 0), 0),
    discountAmount: 0,
    total:          items.reduce((s, i) => s + (i.subtotal || 0), 0),
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
      {/* ── Print stylesheet (injected inline) ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { position: fixed; top: 0; left: 0; width: 100%; padding: 32px; background: #fff; }
          .no-print { display: none !important; }
        }
        body { font-family: system-ui, sans-serif; background: #f1f5f9; margin: 0; }
        .container { max-width: 900px; margin: 24px auto; padding: 16px; }
        .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 8px rgba(0,0,0,.1); padding: 24px; margin-bottom: 20px; }
        h2 { margin: 0 0 16px; font-size: 1.25rem; color: #1e293b; }
        label { display: block; font-size: .8rem; color: #475569; margin-bottom: 4px; font-weight: 600; }
        input, select, textarea {
          width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1;
          border-radius: 8px; padding: 8px 10px; font-size: .9rem; color: #1e293b;
          background: #f8fafc;
        }
        input:focus, select:focus { outline: none; border-color: #3b82f6; background: #fff; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 10px; }
        .row > div { flex: 1; }
        .row > div.sm { flex: 0 0 90px; }
        .row > div.xs { flex: 0 0 70px; }
        .row > div.wide { flex: 2; }
        .btn {
          padding: 9px 18px; border: none; border-radius: 8px;
          cursor: pointer; font-size: .9rem; font-weight: 600;
        }
        .btn-primary  { background: #3b82f6; color: #fff; }
        .btn-success  { background: #10b981; color: #fff; }
        .btn-print    { background: #7c3aed; color: #fff; }
        .btn-danger   { background: #ef4444; color: #fff; padding: 6px 12px; font-size: .8rem; }
        .btn-ghost    { background: #e2e8f0; color: #475569; }
        .btn:disabled { opacity: .5; cursor: not-allowed; }
        .attr-pill {
          display: inline-block; background: #dbeafe; color: #1d4ed8;
          border-radius: 12px; padding: 2px 8px; font-size: .72rem; margin: 2px;
        }
        .total-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px; }
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: .9rem; }
        .total-row.grand { font-size: 1.15rem; font-weight: 700; color: #059669; border-top: 2px solid #34d399; margin-top: 8px; padding-top: 8px; }
        .error { color: #dc2626; background: #fef2f2; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; }
        .badge { display: inline-block; border-radius: 6px; padding: 2px 8px; font-size: .75rem; font-weight: 600; }
        .badge-retail    { background: #dbeafe; color: #1d4ed8; }
        .badge-wholesale { background: #fef9c3; color: #854d0e; }
        .badge-vip       { background: #fce7f3; color: #9d174d; }
        .badge-bulk      { background: #dcfce7; color: #166534; }
        /* ── Print layout ── */
        #invoice-print { font-family: 'Segoe UI', sans-serif; }
        .print-header { display: flex; justify-content: space-between; margin-bottom: 24px; }
        .print-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .print-table th, .print-table td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: .85rem; }
        .print-table th { background: #f8fafc; font-weight: 600; }
        .print-totals { max-width: 280px; margin-left: auto; }
        .print-total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: .85rem; }
        .print-total-row.grand { font-size: 1rem; font-weight: 700; border-top: 2px solid #334155; margin-top: 6px; padding-top: 6px; }
      `}</style>

      <div className="container">
        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, color: "#1e293b" }}>🧾 New Invoice</h1>
          <div style={{ display: "flex", gap: 8 }} className="no-print">
            {saved && (
              <button className="btn btn-print" onClick={handlePrint}>🖨 Print Invoice</button>
            )}
            <button className="btn btn-success" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "💾 Save Invoice"}
            </button>
          </div>
        </div>

        {error && <div className="error">⚠ {error}</div>}
        {saved && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: "#166534" }}>
            ✅ Invoice <strong>{saved.invoiceNumber}</strong> saved successfully!
          </div>
        )}

        {/* ── Customer info ── */}
        <div className="card no-print">
          <h2>Customer Information</h2>
          <div className="grid3">
            <div>
              <label>Customer Name</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in Customer" />
            </div>
            <div>
              <label>Phone</label>
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+855 …" />
            </div>
            <div>
              <label>Customer Type</label>
              <select value={customerType} onChange={(e) => {
                setCustomerType(e.target.value);
                schedulePreview(items, e.target.value, discountType, discountValue);
              }}>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="vip">VIP</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Items ── */}
        <div className="card no-print">
          <h2>Invoice Items</h2>

          {items.map((item, idx) => {
            const variants = variantMap[item.productId] || [];
            const attrs    = item.product?.attributes || [];
            const tiers    = item.variant?.pricingTiers || [];

            return (
              <div key={item._id} style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
                  <span style={{ fontWeight: 700, color: "#64748b", fontSize: ".8rem" }}>ITEM {idx + 1}</span>
                  {attrs.map((a) => (
                    <span className="attr-pill" key={a.name}>{a.name}: {a.value}</span>
                  ))}
                  {item.variant && (
                    <span className="attr-pill" style={{ background: "#dcfce7", color: "#166534" }}>
                      Stock: {item.variant.stock}
                    </span>
                  )}
                  <button className="btn btn-danger no-print" style={{ marginLeft: "auto" }}
                    onClick={() => removeItem(item._id)}>✕</button>
                </div>

                <div className="row">
                  {/* Product */}
                  <div className="wide">
                    <label>Product</label>
                    <select value={item.productId} onChange={(e) => handleProductChange(item._id, e.target.value)}>
                      <option value="">— Select product —</option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Variant */}
                  <div className="wide">
                    <label>Variant / SKU</label>
                    <select value={item.variantId} onChange={(e) => handleVariantChange(item._id, e.target.value)}
                      disabled={!item.productId}>
                      <option value="">— Select variant —</option>
                      {variants.map((v) => (
                        <option key={v._id} value={v._id}>
                          {[v.brand, v.unitValue, v.unit, v.sku].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Price type */}
                  <div className="sm">
                    <label>Price Tier</label>
                    <select value={item.priceType} onChange={(e) => {
                      const tier = tiers.find((t) => t.type === e.target.value);
                      const price = tier?.price ?? item.unitPrice;
                      setItem(item._id, { priceType: e.target.value, unitPrice: price, subtotal: price * item.quantity });
                    }}>
                      {["retail", "wholesale", "vip", "bulk", "custom"].map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Unit price */}
                  <div className="sm">
                    <label>Unit Price</label>
                    <input type="number" min="0" step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => handlePriceChange(item._id, e.target.value)} />
                  </div>

                  {/* Qty */}
                  <div className="xs">
                    <label>Qty</label>
                    <input type="number" min="1"
                      value={item.quantity}
                      onChange={(e) => handleQtyChange(item._id, e.target.value)} />
                  </div>

                  {/* Subtotal */}
                  <div className="sm">
                    <label>Subtotal</label>
                    <input readOnly value={fmt(item.subtotal)} style={{ background: "#f0fdf4", fontWeight: 700 }} />
                  </div>
                </div>

                {/* Pricing tiers hint */}
                {tiers.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {tiers.map((t, i) => (
                      <span key={i} className={`badge badge-${t.type}`} style={{ marginRight: 4 }}>
                        {t.type}: ${fmt(t.price)}{t.minQty > 1 ? ` (min ${t.minQty})` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button className="btn btn-ghost" onClick={addItem}>+ Add Item</button>
        </div>

        {/* ── Discount & Note ── */}
        <div className="card no-print">
          <h2>Discount & Note</h2>
          <div className="grid3">
            <div>
              <label>Discount Type</label>
              <select value={discountType} onChange={(e) => {
                setDiscountType(e.target.value);
                schedulePreview(items, customerType, e.target.value, discountValue);
              }}>
                <option value="none">None</option>
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            {discountType !== "none" && (
              <div>
                <label>Discount Value</label>
                <input type="number" min="0" value={discountValue}
                  onChange={(e) => {
                    setDiscountValue(e.target.value);
                    schedulePreview(items, customerType, discountType, e.target.value);
                  }} />
              </div>
            )}
            <div>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label>Note</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              style={{ resize: "vertical" }} placeholder="Additional notes…" />
          </div>
        </div>

        {/* ── Totals ── */}
        <div className="card no-print">
          <div className="total-box">
            {previewing && <p style={{ color: "#64748b", fontSize: ".8rem" }}>Calculating…</p>}
            <div className="total-row">
              <span>Subtotal</span>
              <span>${fmt(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="total-row" style={{ color: "#dc2626" }}>
                <span>Discount ({discountType === "percent" ? `${discountValue}%` : "fixed"})</span>
                <span>-${fmt(totals.discountAmount)}</span>
              </div>
            )}
            <div className="total-row grand">
              <span>TOTAL</span>
              <span>${fmt(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PRINT LAYOUT ═══════════════════════════════════════════ */}
      <div id="invoice-print" ref={printRef}>
        {(() => {
          const inv = saved || { invoiceNumber: "DRAFT", customerName, customerPhone, customerType, note, status };
          const printItems = preview?.items || items.filter((i) => i.variantId);
          return (
            <>
              <div className="print-header">
                <div>
                  <h2 style={{ margin: "0 0 4px", color: "#1e293b", fontSize: "1.3rem" }}>
                    🏗 Construction Store
                  </h2>
                  <p style={{ margin: 0, color: "#64748b", fontSize: ".8rem" }}>
                    Invoice #{inv.invoiceNumber}
                  </p>
                  <p style={{ margin: 0, color: "#64748b", fontSize: ".8rem" }}>
                    Date: {new Date().toLocaleDateString()}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{inv.customerName || "Walk-in Customer"}</p>
                  {inv.customerPhone && <p style={{ margin: 0, color: "#64748b", fontSize: ".8rem" }}>{inv.customerPhone}</p>}
                  <span className={`badge badge-${inv.customerType}`} style={{ marginTop: 4 }}>
                    {inv.customerType?.toUpperCase()}
                  </span>
                </div>
              </div>

              <table className="print-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Attributes</th>
                    <th>SKU</th>
                    <th>Brand</th>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {printItems.map((it, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{it.productName}</td>
                      <td>
                        {(it.attributes || []).map((a) => (
                          <span key={a.name} style={{ display: "block", fontSize: ".75rem", color: "#475569" }}>
                            {a.name}: {a.value}
                          </span>
                        ))}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: ".78rem" }}>{it.sku}</td>
                      <td>{it.brand || "—"}</td>
                      <td>{it.unitValue} {it.unit}</td>
                      <td style={{ textAlign: "right" }}>{it.quantity}</td>
                      <td style={{ textAlign: "right" }}>${fmt(it.unitPrice)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>${fmt(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="print-totals">
                <div className="print-total-row">
                  <span>Subtotal</span>
                  <span>${fmt(totals.subtotal)}</span>
                </div>
                {totals.discountAmount > 0 && (
                  <div className="print-total-row" style={{ color: "#dc2626" }}>
                    <span>Discount</span>
                    <span>-${fmt(totals.discountAmount)}</span>
                  </div>
                )}
                <div className="print-total-row grand">
                  <span>TOTAL</span>
                  <span>${fmt(totals.total)}</span>
                </div>
              </div>

              {inv.note && (
                <p style={{ marginTop: 24, color: "#475569", fontSize: ".8rem" }}>
                  <strong>Note:</strong> {inv.note}
                </p>
              )}
              <p style={{ marginTop: 32, color: "#94a3b8", fontSize: ".75rem", textAlign: "center" }}>
                Thank you for your business — Status: {inv.status?.toUpperCase()}
              </p>
            </>
          );
        })()}
      </div>
    </>
  );
}
