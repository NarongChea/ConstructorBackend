// FIX: was ../models/UserPrice.js — actual file on disk is Userprice.js
import UserPrice from "../models/Userprice.js";
import ProductVariant from "../models/ProductVariant.js";
import * as R from "../utils/response.js";

// ── Get all custom prices for a specific user ──────────────────────────────────
// GET /api/user-prices/user/:userId
export const getPricesForUser = async (req, res, next) => {
  try {
    const prices = await UserPrice.find({ userId: req.params.userId })
      .populate("variantId", "sku unit unitValue price productId")
      .sort({ updatedAt: -1 });
    R.success(res, prices);
  } catch (err) { next(err); }
};

// ── Get all custom prices for a specific partner ───────────────────────────────
// GET /api/user-prices/partner/:partnerId
export const getPricesForPartner = async (req, res, next) => {
  try {
    const prices = await UserPrice.find({ partnerId: req.params.partnerId })
      .populate("variantId", "sku unit unitValue price productId")
      .sort({ updatedAt: -1 });
    R.success(res, prices);
  } catch (err) { next(err); }
};

// ── Get all custom prices for a specific variant ──────────────────────────────
// GET /api/user-prices/variant/:variantId
export const getPricesForVariant = async (req, res, next) => {
  try {
    const prices = await UserPrice.find({ variantId: req.params.variantId })
      .populate("userId",    "name phone")
      .populate("partnerId", "name phone")
      .sort({ price: 1 });
    R.success(res, prices);
  } catch (err) { next(err); }
};

// ── Upsert a custom price ──────────────────────────────────────────────────────
export const upsertUserPrice = async (req, res, next) => {
  try {
    const { variantId, userId, partnerId, price, note } = req.body;

    if (!variantId)          return R.badRequest(res, "variantId is required");
    if (price === undefined) return R.badRequest(res, "price is required");
    if (!!userId === !!partnerId)
      return R.badRequest(res, "Provide exactly one of userId or partnerId");

    const variant = await ProductVariant.findById(variantId);
    if (!variant) return R.notFound(res, "Variant not found");

    const filter = { variantId, ...(userId ? { userId } : { partnerId }) };
    const update = { price, note, createdBy: req.user._id };

    const record = await UserPrice.findOneAndUpdate(filter, update, {
      new:    true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    });

    R.success(res, record, "Custom price saved");
  } catch (err) {
    if (err.message?.includes("Exactly one"))
      return R.badRequest(res, err.message);
    next(err);
  }
};

// ── Delete a custom price ──────────────────────────────────────────────────────
export const deleteUserPrice = async (req, res, next) => {
  try {
    const record = await UserPrice.findByIdAndDelete(req.params.id);
    if (!record) return R.notFound(res, "Custom price not found");
    R.success(res, {}, "Custom price removed");
  } catch (err) { next(err); }
};

// ── Resolve effective price for a user/partner + variant ──────────────────────
export const resolveEffectivePrice = async (req, res, next) => {
  try {
    const { variantId, userId, partnerId, quantity = 1, customerType = "retail" } = req.query;

    if (!variantId) return R.badRequest(res, "variantId is required");

    const variant = await ProductVariant.findById(variantId);
    if (!variant) return R.notFound(res, "Variant not found");

    let customPrice = null;
    if (userId || partnerId) {
      const filter = { variantId, ...(userId ? { userId } : { partnerId }) };
      const record = await UserPrice.findOne(filter);
      if (record) customPrice = record.price;
    }

    const resolvedPrice = customPrice !== null
      ? customPrice
      : variant.resolvePrice(customerType, parseInt(quantity));

    R.success(res, {
      variantId:     variant._id,
      sku:           variant.sku,
      unit:          variant.unit,
      quantity:      parseInt(quantity),
      priceSource:   customPrice !== null ? "custom_price" : "pricing_tier",
      unitPrice:     resolvedPrice,
      subtotal:      resolvedPrice * parseInt(quantity),
      customPrice,
      pricingTiers:  variant.pricingTiers,
    });
  } catch (err) { next(err); }
};