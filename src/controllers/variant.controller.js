import mongoose from "mongoose";
import ProductVariant from "../models/ProductVariant.js";
import StockHistory from "../models/StockHistory.js";
import * as R from "../utils/response.js";

export const createVariant = async (req, res, next) => {
  try {
    // pricingTiers: [
    //   { type:"retail",    price:100, minQty:1 },
    //   { type:"wholesale", price:85,  minQty:50 },
    //   { type:"vip",       price:80,  minQty:1 },
    //   { type:"bulk",      price:75,  minQty:200, description:"Min 200 pieces" },
    // ]
    // currency: "KHR" | "USD" — denominates price, costPrice, and all pricingTiers for this variant
    const variant = await ProductVariant.create({ ...req.body });
    R.created(res, variant, "Variant created");
  } catch (err) { next(err); }
};

export const getVariantsByProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const variants = await ProductVariant.find({ productId, isActive: true })
      .sort({ brand: 1, unit: 1, unitValue: 1 });
    R.success(res, variants);
  } catch (err) { next(err); }
};

export const getVariantById = async (req, res, next) => {
  try {
    const variant = await ProductVariant.findById(req.params.id)
      .populate("productId", "name categoryId attributes");
    if (!variant) return R.notFound(res, "Variant not found");
    R.success(res, variant);
  } catch (err) { next(err); }
};

export const updateVariant = async (req, res, next) => {
  try {
    // FIX: "currency" and "unitTypeId" were missing here, so changing a
    // variant's currency (KHR/USD) from the product form silently did nothing.
    const allowedFields = [
      "brand", "unit", "unitValue", "unitTypeId",
      "price", "costPrice", "currency",
      "pricingTiers",  // multi-tier pricing
      "isActive",
    ];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const variant = await ProductVariant.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    });
    if (!variant) return R.notFound(res, "Variant not found");
    R.success(res, variant, "Variant updated");
  } catch (err) { next(err); }
};

export const deleteVariant = async (req, res, next) => {
  try {
    const variant = await ProductVariant.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!variant) return R.notFound(res, "Variant not found");
    R.success(res, {}, "Variant deactivated");
  } catch (err) { next(err); }
};

// GET /api/variants/low-stock — variants where stock <= product.lowStockThreshold
export const getLowStockVariants = async (req, res, next) => {
  try {
    const variants = await ProductVariant.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $match: {
          $expr: { $lte: ["$stock", "$product.lowStockThreshold"] },
        },
      },
      {
        $project: {
          _id: 1,
          sku: 1,
          brand: 1,
          unit: 1,
          unitValue: 1,
          currency: 1,
          stock: 1,
          productId: 1,
          productName: "$product.name",
          lowStockThreshold: "$product.lowStockThreshold",
        },
      },
      { $sort: { stock: 1 } },
    ]);
    R.success(res, { variants, total: variants.length });
  } catch (err) { next(err); }
};

// Resolve price for a given variant based on customer type and quantity
// GET /api/variants/:id/price?customerType=wholesale&quantity=100
export const resolveVariantPrice = async (req, res, next) => {
  try {
    const { customerType = "retail", quantity = 1 } = req.query;
    const variant = await ProductVariant.findById(req.params.id);
    if (!variant) return R.notFound(res, "Variant not found");

    const resolvedPrice = variant.resolvePrice(customerType, parseInt(quantity));
    R.success(res, {
      variantId:    variant._id,
      sku:          variant.sku,
      customerType,
      currency:     variant.currency,
      quantity:     parseInt(quantity),
      unitPrice:    resolvedPrice,
      subtotal:     resolvedPrice * parseInt(quantity),
      pricingTiers: variant.pricingTiers,
    });
  } catch (err) { next(err); }
};