import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema(
  {
    variantId:   { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant" }, // nullable for custom items
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    sku:         String,
    productName: String,
    brand:       String,
    unit:        String,
    unitValue:   Number,
    unitTypeName: String,
    attributes:  [{ name: String, value: String }],
    quantity:    { type: Number, required: true, min: 1 },
    priceType:   {
      type:    String,
      enum:    ["retail", "wholesale", "vip", "bulk", "custom", "partner"],
      default: "retail",
    },
    // The currency THIS item's unitPrice/subtotal are denominated in.
    // Always populated — for KHR/USD-mode invoices it matches invoice.currency;
    // for BOTH-mode invoices, items keep their own native currency.
    currency:    { type: String, enum: ["KHR", "USD"], default: "KHR" },
    unitPrice:   { type: Number, required: true, min: 0 },
    subtotal:    { type: Number, required: true, min: 0 },
    isCustom:    { type: Boolean, default: false },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber:  { type: String, unique: true },
    invoiceType: {
      type:    String,
      enum:    ["customer", "partner"],
      default: "customer",
      index:   true,
    },
    partnerId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Partner",
      default: null,
      index:   true,
    },
    partnerName:   { type: String, trim: true },
    customerName:  { type: String, trim: true, default: "Walk-in Customer" },
    customerPhone: { type: String, trim: true },
    customerType:  { type: String, enum: ["retail", "wholesale", "vip", "partner"], default: "retail" },

    items:          [invoiceItemSchema],

    // ── Currency mode ────────────────────────────────────────────────────────
    // "KHR" / "USD" → single-currency invoice, use subtotal/total/depositAmount below
    // "BOTH"        → dual-currency invoice, use subtotal/totalKHR + subtotalUSD/totalUSD below.
    //                  subtotal/total/discountAmount are left at 0 and unused in this mode.
    currency:     { type: String, enum: ["KHR", "USD", "BOTH"], default: "KHR" },
    // Exchange rates captured at time of invoice creation (for audit/reference)
    usdToKhrRate: { type: Number, default: 4100, min: 1 }, // used when currency === "KHR"
    khrToUsdRate: { type: Number, default: 4100, min: 1 }, // used when currency === "USD"

    // ── Single-currency totals (currency === "KHR" or "USD") ──────────────────
    subtotal:       { type: Number, default: 0, min: 0 },
    discountType:   { type: String, enum: ["fixed", "percent", "none"], default: "none" },
    discountValue:  { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    total:          { type: Number, default: 0, min: 0 },

    // ── Dual-currency totals (currency === "BOTH") ─────────────────────────────
    // Each is the sum of only the items native to that currency — NOT converted.
    subtotalKHR:       { type: Number, default: 0, min: 0 },
    subtotalUSD:       { type: Number, default: 0, min: 0 },
    discountAmountKHR: { type: Number, default: 0, min: 0 },
    discountAmountUSD: { type: Number, default: 0, min: 0 },
    totalKHR:          { type: Number, default: 0, min: 0 },
    totalUSD:          { type: Number, default: 0, min: 0 },

    // ── Deposit ───────────────────────────────────────────────────────────────
    // For "KHR"/"USD" mode: depositAmount is in invoice.currency, remainingAmount likewise.
    //   The customer may pay in the OTHER currency — it gets converted using the
    //   appropriate rate before being applied here, so depositAmount always ends
    //   up expressed in invoice.currency.
    depositAmount:   { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },

    // For "BOTH" mode: a single payment can cascade across both currency buckets
    // (pay its own currency's bucket first, then convert any leftover into the
    // other bucket). depositKHR/depositUSD record how much ended up applied to
    // each bucket. depositInputAmount/depositInputCurrency record what the
    // customer actually handed over, for receipts/audit purposes.
    depositKHR:          { type: Number, default: 0, min: 0 },
    depositUSD:          { type: Number, default: 0, min: 0 },
    depositInputAmount:  { type: Number, default: 0, min: 0 },
    depositInputCurrency:{ type: String, enum: ["KHR", "USD"], default: null },

    // Remaining amounts per bucket when currency === "BOTH" (derived, kept for fast reads)
    remainingKHR: { type: Number, default: 0, min: 0 },
    remainingUSD: { type: Number, default: 0, min: 0 },

    note:      { type: String, trim: true },
    status:    { type: String, enum: ["paid", "partial", "pending", "cancelled"], default: "paid", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    printedAt: { type: Date },
  },
  { timestamps: true }
);

invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ customerName: "text", partnerName: "text" });

export default mongoose.model("Invoice", invoiceSchema);