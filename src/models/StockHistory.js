import mongoose from "mongoose";

const stockHistorySchema = new mongoose.Schema(
  {
    variantId:     { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", required: true, index: true },
    productId:     { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    type:          { type: String, enum: ["in", "out", "adjust"], required: true },
    quantity:      { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock:      { type: Number, required: true },
    reason:        { type: String, trim: true },
    referenceId:   { type: mongoose.Schema.Types.ObjectId },
    referenceType: { type: String, enum: ["invoice", "purchase", "manual", "adjustment"] },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

stockHistorySchema.index({ createdAt: -1 });

export default mongoose.model("StockHistory", stockHistorySchema);
