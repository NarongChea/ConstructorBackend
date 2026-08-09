import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema(
  {
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", required: true },
    sku:       String,
    name:      String,
    quantity:  { type: Number, required: true, min: 1 },
    unitCost:  { type: Number, required: true, min: 0 },
    subtotal:  { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    /**
     * sourceType:
     *   "supplier" — purchased from a regular Supplier
     *   "partner"  — purchased from a Partner (who also buys from us)
     */
    sourceType: {
      type:    String,
      enum:    ["supplier", "partner"],
      default: "supplier",
      index:   true,
    },

    // For supplier purchases
    supplierId:   { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", index: true, default: null },
    supplierName: { type: String, trim: true },

    // For partner purchases
    partnerId:   { type: mongoose.Schema.Types.ObjectId, ref: "Partner", index: true, default: null },
    partnerName: { type: String, trim: true },

    items:     [purchaseItemSchema],
    totalCost: { type: Number, required: true, min: 0 },
    note:      { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

purchaseSchema.index({ createdAt: -1 });

export default mongoose.model("Purchase", purchaseSchema);