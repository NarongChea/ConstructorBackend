import mongoose from "mongoose";
import { generateSKU } from "../utils/generators.js";

/**
 * UNITS kept for backward-compatibility and as a default seed list.
 * New variants should reference a UnitType document instead;
 * the `unit` field is then one of that UnitType's measurement symbols.
 */
const LEGACY_UNITS = [
  "piece", "kg", "gram", "bag", "meter", "block",
  "liter", "box", "roll", "pack", "ton", "sheet", "bundle",
  "0.3L", "0.5L", "1L", "4L", "set", "bottle", "screw",
];

// Multi-tier pricing: retail, wholesale, VIP, bulk
const pricingTierSchema = new mongoose.Schema(
  {
    type: {
      type:     String,
      enum:     ["retail", "wholesale", "vip", "bulk"],
      required: true,
    },
    price:       { type: Number, required: true, min: 0 },
    minQty:      { type: Number, default: 1, min: 1 },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const productVariantSchema = new mongoose.Schema(
  {
    productId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Product",
      required: [true, "Product is required"],
      index:    true,
    },

    /**
     * unitTypeId — references the UnitType document that defines what
     * measurements are valid for this kind of product.
     * e.g. UnitType "screw" allows ["gram", "kg", "box"]
     * Optional but strongly recommended for new variants.
     */
    unitTypeId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "UnitType",
      index: true,
      default: null,
    },

    brand:    { type: String, trim: true, default: null },

    /**
     * unit — the measurement symbol chosen from unitTypeId.measurements
     * (or any free-text value for legacy data).
     * Examples: "kg", "gram", "box", "0.3L", "1L"
     */
    unit: {
      type:     String,
      required: [true, "Unit is required"],
      trim:     true,
    },

    /**
     * unitValue — the quantity in that unit.
     * e.g. unit="kg", unitValue=1   → 1 kg
     *      unit="box", unitValue=50 → 1 box contains 50 pieces (informational)
     */
    unitValue: {
      type:     Number,
      required: [true, "Unit value is required"],
      min:      [0.001, "Must be > 0"],
    },

    /**
     * currency — which currency this variant's price/costPrice/pricingTiers
     * are denominated in. One currency per variant (all of its pricing tiers
     * share this currency). Different variants of the same product CAN use
     * different currencies (e.g. retail variant in KHR, imported variant in USD).
     */
    currency: {
      type:    String,
      enum:    ["KHR", "USD"],
      default: "KHR",
    },

    // Default/base price (retail) — kept for backward compatibility
    price:     { type: Number, required: [true, "Price is required"], min: [0, "Cannot be negative"] },
    costPrice: { type: Number, default: 0, min: 0 },

    // Multi-tier pricing: retail, wholesale, VIP, bulk
    pricingTiers: { type: [pricingTierSchema], default: [] },

    // Stock tracked per variant
    stock:    { type: Number, default: 0, min: [0, "Stock cannot be negative"] },
    sku:      { type: String, unique: true, sparse: true, trim: true, uppercase: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

productVariantSchema.index(
  { productId: 1, brand: 1, unit: 1, unitValue: 1 },
  { unique: true }
);

productVariantSchema.pre("save", function (next) {
  if (!this.sku) this.sku = generateSKU();

  // Ensure retail pricing tier always exists and is synced with base price
  const hasRetail = this.pricingTiers.some((t) => t.type === "retail" && t.minQty === 1);
  if (!hasRetail && this.price >= 0) {
    this.pricingTiers.unshift({ type: "retail", price: this.price, minQty: 1 });
  }
  next();
});

/**
 * resolvePrice — returns the best price for a given customer type and quantity.
 * Custom per-user/per-partner prices are resolved in the controller before
 * calling this; this method handles the standard tier logic.
 * NOTE: the returned price is in this.currency — callers must convert to
 * the invoice's display currency using the exchange rate before summing.
 */
productVariantSchema.methods.resolvePrice = function (customerType = "retail", quantity = 1) {
  if (!this.pricingTiers || this.pricingTiers.length === 0) return this.price;

  // Best bulk tier (highest minQty that the quantity satisfies)
  const bulkTiers = this.pricingTiers
    .filter((t) => t.type === "bulk" && t.minQty <= quantity)
    .sort((a, b) => b.minQty - a.minQty);
  if (bulkTiers.length > 0) return bulkTiers[0].price;

  // Match by customer type
  const typeTier = this.pricingTiers.find(
    (t) => t.type === customerType && t.minQty <= quantity
  );
  if (typeTier) return typeTier.price;

  // Fallback to retail
  const retailTier = this.pricingTiers.find((t) => t.type === "retail");
  return retailTier ? retailTier.price : this.price;
};

export const UNIT_LIST = LEGACY_UNITS;
export default mongoose.model("ProductVariant", productVariantSchema);