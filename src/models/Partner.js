import mongoose from "mongoose";

/**
 * Partner — a business entity that can:
 *   - Buy products FROM us  (we issue a sales Invoice to them)
 *   - Sell products TO us   (we record a Purchase from them)
 *
 * The running balance is computed at query time:
 *   balance = totalSalesToPartner - totalPurchasesFromPartner
 *   balance > 0  → partner owes us
 *   balance < 0  → we owe the partner
 *   balance = 0  → settled
 *
 * Flags:
 *   canBuyFromUs  — we can create invoices for this partner
 *   canSellToUs   — we can create purchases from this partner
 * Both can be true at the same time (dual-role partner).
 */

const partnerSchema = new mongoose.Schema(
  {
    name:     { type: String, required: [true, "Partner name is required"], trim: true },
    contact:  { type: String, trim: true },
    phone:    { type: String, trim: true },
    email:    { type: String, trim: true, lowercase: true },
    address:  { type: String, trim: true },
    note:     { type: String, trim: true },

    // Roles — at least one must be true
    canBuyFromUs: { type: Boolean, default: true  }, // partner is a customer
    canSellToUs:  { type: Boolean, default: false }, // partner is also a supplier

    isActive:  { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

partnerSchema.index({ name: "text" });

export default mongoose.model("Partner", partnerSchema);