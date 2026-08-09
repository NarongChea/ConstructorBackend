import mongoose from "mongoose";
import ProductVariant from "../models/ProductVariant.js";
import StockHistory from "../models/StockHistory.js";
import * as R from "../utils/response.js";

const createStockRecord = async (variant, type, quantity, reason, referenceId, referenceType, userId, session) => {
  const previousStock = variant.stock;
  const newStock = type === "in"
    ? previousStock + quantity
    : type === "out"
    ? previousStock - quantity
    : quantity; // adjust = set directly

  if (newStock < 0) throw new Error("Insufficient stock");

  variant.stock = newStock;
  await variant.save({ session });

  await StockHistory.create([{
    variantId: variant._id, productId: variant.productId,
    type, quantity: Math.abs(type === "adjust" ? quantity - previousStock : quantity),
    previousStock, newStock, reason, referenceId, referenceType,
    createdBy: userId,
  }], { session });

  return { previousStock, newStock };
};

export const adjustStock = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { variantId, type, quantity, reason } = req.body;
    if (!["in", "out", "adjust"].includes(type)) {
      return R.badRequest(res, "type must be in | out | adjust");
    }
    if (quantity === undefined || quantity < 0) return R.badRequest(res, "quantity must be >= 0");

    const variant = await ProductVariant.findById(variantId).session(session);
    if (!variant) { await session.abortTransaction(); return R.notFound(res, "Variant not found"); }

    const result = await createStockRecord(variant, type, quantity, reason, null, "manual", req.user._id, session);
    await session.commitTransaction();
    R.success(res, { variantId, ...result }, "Stock updated");
  } catch (err) {
    await session.abortTransaction();
    if (err.message === "Insufficient stock") return R.badRequest(res, err.message);
    next(err);
  } finally { session.endSession(); }
};

export const getStockHistory = async (req, res, next) => {
  try {
    const { variantId, productId, type, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (variantId) filter.variantId = variantId;
    if (productId) filter.productId = productId;
    if (type) filter.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [history, total] = await Promise.all([
      StockHistory.find(filter)
        .populate("variantId", "sku brand unit unitValue")
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockHistory.countDocuments(filter),
    ]);

    R.success(res, {
      history,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

export { createStockRecord };
