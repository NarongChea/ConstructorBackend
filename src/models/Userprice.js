import mongoose from "mongoose";

/**
 * UserPrice — stores a custom selling price for a specific product variant
 * that overrides the default price for a particular user or partner.
 *
 * Use cases:
 *  - A regular customer who always gets a negotiated rate
 *  - A partner who gets a special partner price
 *
 * When creating an invoice, the frontend / controller checks this table
 * first; if a custom price exists it uses that, otherwise falls back to
 * the standard pricingTiers on the variant.
 */

const userPriceSchema = new mongoose.Schema(
  {
    variantId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "ProductVariant",
      required: [true, "Variant is required"],
      index:    true,
    },

    // Either a User or a Partner — exactly one should be set
    userId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "User",
      index: true,
      default: null,
    },
    partnerId: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   "Partner",
      index: true,
      default: null,
    },

    price: {
      type:     Number,
      required: [true, "Price is required"],
      min:      [0, "Price cannot be negative"],
    },

    note:      { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Enforce: either userId or partnerId must be set (not both, not neither)
userPriceSchema.pre("validate", function (next) {
  const hasUser    = !!this.userId;
  const hasPartner = !!this.partnerId;
  if (hasUser === hasPartner) {
    return next(new Error("Exactly one of userId or partnerId must be provided"));
  }
  next();
});

// Unique: one price record per variant + user (or variant + partner)
userPriceSchema.index({ variantId: 1, userId:    1 }, { unique: true, sparse: true });
userPriceSchema.index({ variantId: 1, partnerId: 1 }, { unique: true, sparse: true });

export default mongoose.model("UserPrice", userPriceSchema);