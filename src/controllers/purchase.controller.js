import mongoose from "mongoose";
import Purchase from "../models/Purchase.js";
import ProductVariant from "../models/ProductVariant.js";
import StockHistory from "../models/StockHistory.js";
import Supplier from "../models/Supplier.js";
import Partner from "../models/Partner.js";
import * as R from "../utils/response.js";

// ── Create purchase (from supplier OR partner) ────────────────────────────────
/**
 * Body:
 *   sourceType: "supplier" | "partner"  (default: "supplier")
 *   supplierId: ObjectId  (required when sourceType = "supplier")
 *   partnerId:  ObjectId  (required when sourceType = "partner")
 *   items: [{ variantId, quantity, unitCost }]
 *   note: String
 */
export const createPurchase = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { sourceType = "supplier", supplierId, partnerId, items, note } = req.body;

    if (!items || items.length === 0) {
      await session.abortTransaction();
      return R.badRequest(res, "Purchase must have at least one item");
    }

    if (sourceType !== "supplier" && sourceType !== "partner") {
      await session.abortTransaction();
      return R.badRequest(res, 'sourceType must be "supplier" or "partner"');
    }

    // Resolve source name
    let supplierName = null;
    let partnerName  = null;
    let partnerDoc   = null;

    if (sourceType === "supplier") {
      if (!supplierId) {
        await session.abortTransaction();
        return R.badRequest(res, "supplierId is required for supplier purchases");
      }
      const supplier = await Supplier.findById(supplierId).session(session);
      if (!supplier) { await session.abortTransaction(); return R.notFound(res, "Supplier not found"); }
      supplierName = supplier.name;

    } else {
      // sourceType === "partner"
      if (!partnerId) {
        await session.abortTransaction();
        return R.badRequest(res, "partnerId is required for partner purchases");
      }
      partnerDoc = await Partner.findById(partnerId).session(session);
      if (!partnerDoc) { await session.abortTransaction(); return R.notFound(res, "Partner not found"); }
      if (!partnerDoc.canSellToUs) {
        await session.abortTransaction();
        return R.badRequest(res, "This partner is not configured as a seller");
      }
      partnerName = partnerDoc.name;
    }

    // Process items
    let totalCost = 0;
    const purchaseItems = [];

    for (const item of items) {
      const variant = await ProductVariant.findById(item.variantId).session(session);
      if (!variant) {
        await session.abortTransaction();
        return R.notFound(res, `Variant ${item.variantId} not found`);
      }

      const itemSubtotal = item.quantity * item.unitCost;
      totalCost += itemSubtotal;

      const productDoc = await mongoose.model("Product")
        .findById(variant.productId).select("name").session(session);

      purchaseItems.push({
        variantId: variant._id,
        sku:       variant.sku,
        name:      productDoc?.name || "Unknown",
        quantity:  item.quantity,
        unitCost:  item.unitCost,
        subtotal:  itemSubtotal,
      });

      const previousStock = variant.stock;
      variant.stock += item.quantity;
      if (item.unitCost > 0) variant.costPrice = item.unitCost;
      await variant.save({ session });

      await StockHistory.create(
        [{
          variantId:     variant._id,
          productId:     variant.productId,
          type:          "in",
          quantity:      item.quantity,
          previousStock,
          newStock:      variant.stock,
          reason:        sourceType === "partner"
            ? `Purchase from partner — ${partnerName}`
            : "Purchase from supplier",
          referenceType: "purchase",
          createdBy:     req.user._id,
        }],
        { session }
      );
    }

    const [purchase] = await Purchase.create(
      [{
        sourceType,
        supplierId:   sourceType === "supplier" ? supplierId : null,
        supplierName: sourceType === "supplier" ? supplierName : null,
        partnerId:    sourceType === "partner"  ? partnerId : null,
        partnerName:  sourceType === "partner"  ? partnerName : null,
        items: purchaseItems,
        totalCost,
        note,
        createdBy: req.user._id,
      }],
      { session }
    );

    await session.commitTransaction();
    R.created(res, purchase, "Purchase recorded & stock updated");
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ── List purchases ─────────────────────────────────────────────────────────────
export const getPurchases = async (req, res, next) => {
  try {
    const {
      supplierId, partnerId, sourceType,
      startDate, endDate, page = 1, limit = 20,
    } = req.query;

    const filter = {};
    if (sourceType)  filter.sourceType  = sourceType;
    if (supplierId)  filter.supplierId  = supplierId;
    if (partnerId)   filter.partnerId   = partnerId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = e;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [purchases, total] = await Promise.all([
      Purchase.find(filter)
        .populate("createdBy", "name")
        .populate("supplierId", "name")
        .populate("partnerId", "name phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-items"),
      Purchase.countDocuments(filter),
    ]);

    R.success(res, {
      purchases,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

// ── Get purchase by ID ─────────────────────────────────────────────────────────
export const getPurchaseById = async (req, res, next) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate("createdBy", "name")
      .populate("supplierId", "name contact phone")
      .populate("partnerId", "name phone email");
    if (!purchase) return R.notFound(res, "Purchase not found");
    R.success(res, purchase);
  } catch (err) { next(err); }
};