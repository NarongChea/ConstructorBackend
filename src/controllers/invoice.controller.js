import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import ProductVariant from "../models/ProductVariant.js";
import Product from "../models/Product.js";
import Partner from "../models/Partner.js";
import UserPrice from "../models/Userprice.js";
import StockHistory from "../models/StockHistory.js";
import ActivityLog from "../models/ActivityLog.js";
import { generateInvoiceNumber } from "../utils/generators.js";
import * as R from "../utils/response.js";

async function resolveItemPrice(variant, { userId, partnerId, customerType, quantity }) {
  if (userId || partnerId) {
    const filter = { variantId: variant._id, ...(partnerId ? { partnerId } : { userId }) };
    const custom = await UserPrice.findOne(filter);
    if (custom) return { price: custom.price, priceType: "custom" };
  }
  const tierType = partnerId ? "partner" : (customerType || "retail");
  return {
    price:     variant.resolvePrice(customerType || "retail", quantity),
    priceType: tierType,
  };
}

function computeStatus(total, depositAmount, explicitStatus) {
  if (explicitStatus && explicitStatus !== "auto") return explicitStatus;
  if (depositAmount >= total) return "paid";
  if (depositAmount > 0)      return "partial";
  return "pending";
}

function applyDiscount(subtotal, discountType, discountValue) {
  let amount = 0;
  if (discountType === "percent" && discountValue > 0) amount = (subtotal * discountValue) / 100;
  else if (discountType === "fixed" && discountValue > 0) amount = Math.min(discountValue, subtotal);
  return amount;
}

/**
 * applyCascadingDeposit — for BOTH-currency invoices, a single payment
 * (in one currency) pays down its OWN matching bucket first; any leftover
 * is converted into the other currency and applied there too. The total
 * applied across both buckets can never exceed what's owed in either.
 *
 * Example: totalKHR=500, totalUSD=5, customer pays inputAmount=7 inputCurrency="USD"
 *   → $5 clears the USD bucket completely (5 owed, 5 paid, 0 leftover-in-USD... wait,
 *     7 paid - 5 owed = 2 USD leftover)
 *   → leftover 2 USD converts to KHR using usdToKhrRate, applied to the KHR bucket
 *
 * Returns { depositKHR, depositUSD, remainingKHR, remainingUSD }
 */
function applyCascadingDeposit({ inputAmount, inputCurrency, totalKHR, totalUSD, usdToKhrRate, khrToUsdRate }) {
  let depositKHR = 0, depositUSD = 0;
  let remainingKHR = totalKHR, remainingUSD = totalUSD;

  if (!inputAmount || inputAmount <= 0) {
    return { depositKHR: 0, depositUSD: 0, remainingKHR, remainingUSD };
  }

  if (inputCurrency === "USD") {
    // 1) Pay down the USD bucket first
    depositUSD = Math.min(inputAmount, totalUSD);
    remainingUSD = Math.max(0, totalUSD - depositUSD);
    let leftoverUSD = inputAmount - depositUSD;

    // 2) Convert any leftover USD into KHR and pay down the KHR bucket
    if (leftoverUSD > 0 && totalKHR > 0) {
      const leftoverAsKHR = leftoverUSD * (usdToKhrRate || 4100);
      const appliedKHR = Math.min(leftoverAsKHR, totalKHR);
      depositKHR = appliedKHR;
      remainingKHR = Math.max(0, totalKHR - appliedKHR);
    }
  } else {
    // KHR input — pay down the KHR bucket first
    depositKHR = Math.min(inputAmount, totalKHR);
    remainingKHR = Math.max(0, totalKHR - depositKHR);
    let leftoverKHR = inputAmount - depositKHR;

    // Convert any leftover KHR into USD and pay down the USD bucket
    if (leftoverKHR > 0 && totalUSD > 0) {
      const leftoverAsUSD = leftoverKHR / (khrToUsdRate || 4100);
      const appliedUSD = Math.min(leftoverAsUSD, totalUSD);
      depositUSD = appliedUSD;
      remainingUSD = Math.max(0, totalUSD - appliedUSD);
    }
  }

  return { depositKHR, depositUSD, remainingKHR, remainingUSD };
}

/**
 * convertDepositToInvoiceCurrency — for single-currency (KHR or USD) invoices,
 * the customer may pay the deposit in the OTHER currency (e.g. invoice total
 * is in KHR, customer hands over USD cash). Convert it into the invoice's
 * currency using the correct directional rate before applying.
 */
function convertDepositToInvoiceCurrency({ inputAmount, inputCurrency, invoiceCurrency, usdToKhrRate, khrToUsdRate }) {
  if (!inputAmount || inputAmount <= 0) return 0;
  if (!inputCurrency || inputCurrency === invoiceCurrency) return inputAmount;
  if (inputCurrency === "USD" && invoiceCurrency === "KHR") return inputAmount * (usdToKhrRate || 4100);
  if (inputCurrency === "KHR" && invoiceCurrency === "USD") return inputAmount / (khrToUsdRate || 4100);
  return inputAmount;
}

// ── Create invoice ─────────────────────────────────────────────────────────────
export const createInvoice = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      invoiceType = "customer",
      partnerId,
      customerName, customerPhone, customerType = "retail",
      items, discountType = "none", discountValue = 0, note, status,
      // The RAW amount + currency the customer actually handed over.
      // Replaces the old single `depositAmount` field — now always paired
      // with the currency it was paid in, so cross-currency conversion works
      // in every mode (KHR, USD, and BOTH).
      depositInputAmount: rawDeposit,
      depositInputCurrency,
      currency = "KHR", // "KHR" | "USD" | "BOTH"
      usdToKhrRate, khrToUsdRate,
    } = req.body;

    if (!items || items.length === 0) {
      await session.abortTransaction();
      return R.badRequest(res, "Invoice must have at least one item");
    }

    if (Number(rawDeposit) > 0 && !depositInputCurrency) {
      await session.abortTransaction();
      return R.badRequest(res, "depositInputCurrency is required when depositInputAmount > 0");
    }

    let partnerDoc = null;
    if (invoiceType === "partner") {
      if (!partnerId) { await session.abortTransaction(); return R.badRequest(res, "partnerId is required for partner invoices"); }
      partnerDoc = await Partner.findById(partnerId).session(session);
      if (!partnerDoc) { await session.abortTransaction(); return R.notFound(res, "Partner not found"); }
      if (!partnerDoc.canBuyFromUs) { await session.abortTransaction(); return R.badRequest(res, "This partner is not configured as a buyer"); }
    }

    const invoiceItems = [];
    // Single-currency accumulator (used when currency is "KHR" or "USD")
    let subtotal = 0;
    // Dual accumulators (used when currency is "BOTH" — each item keeps its own native currency)
    let subtotalKHR = 0;
    let subtotalUSD = 0;

    for (const item of items) {
      // ── Custom item (not in DB) ──
      if (item.isCustom) {
        const unitPrice    = Number(item.unitPrice) || 0;
        const qty          = Number(item.quantity)  || 1;
        const itemSubtotal = qty * unitPrice;
        const itemCurrency = currency === "BOTH" ? (item.currency || "KHR") : currency;

        if (currency === "BOTH") {
          if (itemCurrency === "USD") subtotalUSD += itemSubtotal; else subtotalKHR += itemSubtotal;
        } else {
          subtotal += itemSubtotal;
        }

        invoiceItems.push({
          variantId: null, productId: null, sku: "",
          productName: item.productName || "Custom Item",
          brand: "", unit: "", unitValue: null, unitTypeName: null, attributes: [],
          quantity: qty, priceType: "custom", currency: itemCurrency,
          unitPrice, subtotal: itemSubtotal, isCustom: true,
        });
        continue;
      }

      if (!item.variantId) { await session.abortTransaction(); return R.badRequest(res, "variantId is required for non-custom items"); }

      const variant = await ProductVariant.findById(item.variantId).session(session);
      if (!variant)          { await session.abortTransaction(); return R.notFound(res, `Variant ${item.variantId} not found`); }
      if (!variant.isActive) { await session.abortTransaction(); return R.badRequest(res, `Variant ${variant.sku} is inactive`); }
      if (variant.stock < item.quantity) {
        await session.abortTransaction();
        return R.badRequest(res, `Insufficient stock for SKU: ${variant.sku} (available: ${variant.stock}, requested: ${item.quantity})`);
      }

      let unitPrice, priceType;
      if (item.unitPrice !== undefined) {
        unitPrice = Number(item.unitPrice); priceType = item.priceType || "custom";
      } else {
        const resolved = await resolveItemPrice(variant, {
          userId:    invoiceType === "customer" ? req.user._id : null,
          partnerId: invoiceType === "partner"  ? partnerId    : null,
          customerType, quantity: item.quantity,
        });
        unitPrice = resolved.price; priceType = resolved.priceType;
      }

// ── Sheet-metal (ស័ង្កសី) ─────────────────────────────────────────────
const isSheetMetal = item.isSheetMetal === true;

const segments = isSheetMetal && Array.isArray(item.segments)
  ? item.segments.map((seg) => {
      const length = Number(seg.length) || 0;
      const qty = Number(seg.qty) || 0;

      // effectiveLength is normally the same as length,
      // but keep it if it was calculated by the frontend.
      const effectiveLength =
        Number(seg.effectiveLength) || length;

      const subtotal =
        effectiveLength * qty * unitPrice;

      return {
        length,
        qty,
        type: seg.type || "straight",
        typeLabel: seg.typeLabel || "",
        extra1: Number(seg.extra1) || 0,
        extra2: Number(seg.extra2) || 0,
        effectiveLength,
        subtotal,
      };
    })
  : [];

// For normal products:
//     quantity × unitPrice
//
// For ស័ង្កសី:
//     sum of all segment meters × price per meter
const itemSubtotal = isSheetMetal && segments.length > 0
  ? segments.reduce((sum, seg) => sum + seg.subtotal, 0)
  : item.quantity * unitPrice;

// In BOTH mode, the item's own variant.currency is authoritative.
const itemCurrency =
  currency === "BOTH"
    ? (variant.currency || "KHR")
    : currency;

if (currency === "BOTH") {
  if (itemCurrency === "USD") {
    subtotalUSD += itemSubtotal;
  } else {
    subtotalKHR += itemSubtotal;
  }
} else {
  subtotal += itemSubtotal;
}

const productDoc = await Product
  .findById(variant.productId)
  .select("name attributes")
  .session(session);

let unitTypeName = null;

if (variant.unitTypeId) {
  const { default: UnitType } =
    await import("../models/UnitType.js");

  const ut = await UnitType
    .findById(variant.unitTypeId)
    .select("displayName name")
    .session(session);

  unitTypeName = ut?.displayName || ut?.name || null;
}

invoiceItems.push({
  variantId: variant._id,
  productId: variant.productId,

  sku: variant.sku,
  productName: productDoc?.name || "Unknown",

  brand: variant.brand,
  unit: variant.unit,
  unitValue: variant.unitValue,
  unitTypeName,

  attributes: productDoc?.attributes || [],

  quantity: item.quantity,
  priceType,
  currency: itemCurrency,

  unitPrice,
  subtotal: itemSubtotal,

  isCustom: false,

  // ── IMPORTANT: preserve ស័ង្កសី data ──
  isSheetMetal,
  segments,
});

      const previousStock = variant.stock;
      variant.stock -= item.quantity;
      await variant.save({ session });
      await StockHistory.create([{
        variantId: variant._id, productId: variant.productId,
        type: "out", quantity: item.quantity, previousStock, newStock: variant.stock,
        reason: invoiceType === "partner" ? `Sale to partner — ${partnerDoc.name}` : `Sale invoice — ${customerType} customer`,
        referenceType: "invoice", createdBy: req.user._id,
      }], { session });
    }

    // ── Build the document fields depending on currency mode ──
    let invoiceFields;

    if (currency === "BOTH") {
      const discountAmountKHR = applyDiscount(subtotalKHR, discountType, discountValue);
      const discountAmountUSD = discountType === "percent" ? applyDiscount(subtotalUSD, discountType, discountValue) : 0; // fixed discount only applies to KHR bucket
      const totalKHR = Math.max(0, subtotalKHR - discountAmountKHR);
      const totalUSD = Math.max(0, subtotalUSD - discountAmountUSD);

      // Cap the raw deposit input so it can never exceed the grand total
      // (converted into whichever currency it was paid in, so the cap is fair either way)
      const grandTotalInInputCurrency = depositInputCurrency === "USD"
        ? totalUSD + (totalKHR / (Number(khrToUsdRate) || 4100))
        : totalKHR + (totalUSD * (Number(usdToKhrRate) || 4100));
      const cappedInput = Math.min(Math.max(0, Number(rawDeposit) || 0), grandTotalInInputCurrency);

      // Cascading pay-down: own-currency bucket first, leftover converts to the other bucket
      const { depositKHR, depositUSD, remainingKHR, remainingUSD } = applyCascadingDeposit({
        inputAmount: cappedInput,
        inputCurrency: depositInputCurrency,
        totalKHR, totalUSD,
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
      });

      const bothCovered = remainingKHR === 0 && remainingUSD === 0;
      const anyCovered  = (depositKHR > 0 || depositUSD > 0);
      const invoiceStatus = status && status !== "auto"
        ? status
        : bothCovered ? "paid" : anyCovered ? "partial" : "paid"; // default to "paid" intent unless explicitly pending

      invoiceFields = {
        currency: "BOTH",
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
        subtotal: 0, total: 0, discountAmount: 0, // unused in BOTH mode
        subtotalKHR, subtotalUSD,
        discountAmountKHR, discountAmountUSD,
        totalKHR, totalUSD,
        depositKHR, depositUSD,
        depositInputAmount: cappedInput,
        depositInputCurrency: cappedInput > 0 ? depositInputCurrency : null,
        remainingKHR, remainingUSD,
        depositAmount: 0, remainingAmount: 0, // unused in BOTH mode — see remainingKHR/remainingUSD
        status: invoiceStatus,
      };
    } else {
      // Single-currency path (KHR or USD)
      const discountAmount = applyDiscount(subtotal, discountType, discountValue);
      const total = Math.max(0, subtotal - discountAmount);

      // Convert the deposit into invoice.currency if customer paid in the other currency
      const convertedDeposit = convertDepositToInvoiceCurrency({
        inputAmount: Number(rawDeposit) || 0,
        inputCurrency: depositInputCurrency || currency,
        invoiceCurrency: currency,
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
      });
      const depositAmount   = Math.min(Math.max(0, convertedDeposit), total);
      const remainingAmount = Math.max(0, total - depositAmount);
      const invoiceStatus   = computeStatus(total, depositAmount, status);

      invoiceFields = {
        currency,
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
        subtotal, discountAmount, total,
        subtotalKHR: 0, subtotalUSD: 0, discountAmountKHR: 0, discountAmountUSD: 0, totalKHR: 0, totalUSD: 0,
        depositKHR: 0, depositUSD: 0,
        depositInputAmount: Number(rawDeposit) || 0,
        depositInputCurrency: Number(rawDeposit) > 0 ? (depositInputCurrency || currency) : null,
        depositAmount, remainingAmount,
        remainingKHR: 0, remainingUSD: 0,
        status: invoiceStatus,
      };
    }

    const invoiceNumber = await generateInvoiceNumber(Invoice);

    const [invoice] = await Invoice.create([{
      invoiceNumber, invoiceType,
      partnerId:    invoiceType === "partner"  ? partnerId    : null,
      partnerName:  invoiceType === "partner"  ? partnerDoc.name : null,
      customerName: invoiceType === "partner"  ? partnerDoc.name : (customerName || "Walk-in Customer"),
      customerPhone,
      customerType: invoiceType === "partner"  ? "partner" : customerType,
      items: invoiceItems,
      discountType, discountValue,
      note,
      createdBy: req.user._id,
      ...invoiceFields,
    }], { session });

    await StockHistory.updateMany(
      { referenceType: "invoice", referenceId: null, createdBy: req.user._id },
      { $set: { referenceId: invoice._id } },
      { session }
    );

    await session.commitTransaction();

    const populated = await Invoice.findById(invoice._id)
      .populate("createdBy", "name")
      .populate("partnerId", "name phone");
    R.created(res, populated, "Invoice created");
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ── Update invoice ─────────────────────────────────────────────────────────────
export const updateInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const invoice = await Invoice.findById(id);
    if (!invoice) return R.notFound(res, "Invoice not found");
    if (invoice.status === "cancelled") return R.badRequest(res, "Cannot update a cancelled invoice");

    const {
      note, discountType, discountValue,
      depositInputAmount: rawDeposit, depositInputCurrency,
      status: explicitStatus,
      items,
    } = req.body;

    const currency = invoice.currency; // currency mode is fixed once an invoice is created

    let subtotal = invoice.subtotal, subtotalKHR = invoice.subtotalKHR, subtotalUSD = invoice.subtotalUSD;
    let newItems = invoice.items;

    if (items && items.length > 0) {
      subtotal = 0; subtotalKHR = 0; subtotalUSD = 0;
      newItems  = [];
      for (const item of items) {
        if (item.isCustom) {
          const up  = Number(item.unitPrice) || 0;
          const qty = Number(item.quantity)  || 1;
          const itemCurrency = currency === "BOTH" ? (item.currency || "KHR") : currency;
          if (currency === "BOTH") { if (itemCurrency === "USD") subtotalUSD += qty*up; else subtotalKHR += qty*up; }
          else subtotal += qty * up;
          newItems.push({
            variantId: null, productId: null, sku: "",
            productName: item.productName || "Custom Item",
            brand: "", unit: "", unitValue: null, unitTypeName: null, attributes: [],
            quantity: qty, priceType: "custom", currency: itemCurrency,
            unitPrice: up, subtotal: qty * up, isCustom: true,
          });
        } else {
          const variant = await ProductVariant.findById(item.variantId);
          const productDoc = variant ? await Product.findById(variant.productId).select("name") : null;
          const up  = Number(item.unitPrice) || 0;
          const qty = Number(item.quantity)  || 1;
          const itemCurrency = currency === "BOTH" ? (variant?.currency || "KHR") : currency;
          if (currency === "BOTH") { if (itemCurrency === "USD") subtotalUSD += qty*up; else subtotalKHR += qty*up; }
          else subtotal += qty * up;
          newItems.push({
            variantId:   item.variantId,
            productId:   variant?.productId ?? null,
            sku:         variant?.sku ?? "",
            productName: productDoc?.name ?? item.productName ?? "",
            brand:       variant?.brand  ?? "",
            unit:        variant?.unit   ?? "",
            unitValue:   variant?.unitValue ?? null,
            unitTypeName: null, attributes: [], currency: itemCurrency,
            quantity: qty, priceType: item.priceType || "custom",
            unitPrice: up, subtotal: qty * up, isCustom: false,
          });
        }
      }
    }

    const newDiscountType  = discountType  ?? invoice.discountType;
    const newDiscountValue = discountValue != null ? Number(discountValue) : invoice.discountValue;

    let updateFields;

    if (currency === "BOTH") {
      const discountAmountKHR = applyDiscount(subtotalKHR, newDiscountType, newDiscountValue);
      const discountAmountUSD = newDiscountType === "percent" ? applyDiscount(subtotalUSD, newDiscountType, newDiscountValue) : 0;
      const totalKHR = Math.max(0, subtotalKHR - discountAmountKHR);
      const totalUSD = Math.max(0, subtotalUSD - discountAmountUSD);

      const finalInputCurrency = depositInputCurrency !== undefined ? depositInputCurrency : invoice.depositInputCurrency;
      const finalInputAmount   = rawDeposit != null ? Math.max(0, Number(rawDeposit)) : invoice.depositInputAmount;

      const grandTotalInInputCurrency = finalInputCurrency === "USD"
        ? totalUSD + (totalKHR / invoice.khrToUsdRate)
        : totalKHR + (totalUSD * invoice.usdToKhrRate);
      const cappedInput = Math.min(finalInputAmount, grandTotalInInputCurrency);

      const { depositKHR, depositUSD, remainingKHR, remainingUSD } = applyCascadingDeposit({
        inputAmount: cappedInput,
        inputCurrency: finalInputCurrency,
        totalKHR, totalUSD,
        usdToKhrRate: invoice.usdToKhrRate,
        khrToUsdRate: invoice.khrToUsdRate,
      });

      const bothCovered = remainingKHR === 0 && remainingUSD === 0;
      const anyCovered  = (depositKHR > 0 || depositUSD > 0);
      const newStatus = explicitStatus && explicitStatus !== "auto"
        ? explicitStatus
        : bothCovered ? "paid" : anyCovered ? "partial" : "paid";

      updateFields = {
        ...(items ? { items: newItems, subtotalKHR, subtotalUSD, discountAmountKHR, discountAmountUSD, totalKHR, totalUSD } : {}),
        discountType: newDiscountType, discountValue: newDiscountValue,
        depositKHR, depositUSD,
        depositInputAmount: cappedInput,
        depositInputCurrency: cappedInput > 0 ? finalInputCurrency : null,
        remainingKHR, remainingUSD,
        status: newStatus,
        ...(note != null ? { note } : {}),
      };
    } else {
      const discountAmount = applyDiscount(subtotal, newDiscountType, newDiscountValue);
      const total = Math.max(0, subtotal - discountAmount);

      const finalInputCurrency = depositInputCurrency !== undefined ? depositInputCurrency : (invoice.depositInputCurrency || currency);
      const finalInputAmount   = rawDeposit != null ? Math.max(0, Number(rawDeposit)) : invoice.depositInputAmount;
      const convertedDeposit = convertDepositToInvoiceCurrency({
        inputAmount: finalInputAmount,
        inputCurrency: finalInputCurrency,
        invoiceCurrency: currency,
        usdToKhrRate: invoice.usdToKhrRate,
        khrToUsdRate: invoice.khrToUsdRate,
      });
      const depositAmount   = Math.min(Math.max(0, convertedDeposit), total);
      const remainingAmount = Math.max(0, total - depositAmount);
      const newStatus       = computeStatus(total, depositAmount, explicitStatus);

      updateFields = {
        ...(items ? { items: newItems, subtotal, discountAmount, total } : {}),
        discountType: newDiscountType, discountValue: newDiscountValue,
        depositAmount, remainingAmount,
        depositInputAmount: finalInputAmount,
        depositInputCurrency: finalInputAmount > 0 ? finalInputCurrency : null,
        status: newStatus,
        ...(note != null ? { note } : {}),
      };
    }

    const updated = await Invoice.findByIdAndUpdate(id, updateFields, { new: true })
      .populate("createdBy", "name")
      .populate("partnerId", "name phone");

    R.success(res, updated, "Invoice updated");
  } catch (err) { next(err); }
};

// ── List invoices ──────────────────────────────────────────────────────────────
export const getInvoices = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20,
      status, startDate, endDate,
      search, invoiceNumber, customerType, invoiceType, partnerId,
      sortBy = "createdAt", order = "desc",
    } = req.query;

    const filter = {};
    if (status)        filter.status        = status;
    if (customerType)  filter.customerType  = customerType;
    if (invoiceType)   filter.invoiceType   = invoiceType;
    if (partnerId)      filter.partnerId     = partnerId;
    // "Search customer" box — matches customerName only
    if (search)         filter.customerName  = { $regex: search, $options: "i" };
    // Dedicated invoice-number box — matches invoiceNumber only, independent of `search`
    if (invoiceNumber)  filter.invoiceNumber = { $regex: invoiceNumber, $options: "i" };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate("createdBy", "name")
        .populate("partnerId", "name phone")
        .sort({ [sortBy]: order === "asc" ? 1 : -1 })
        .skip(skip).limit(parseInt(limit))
        .select("-items"),
      Invoice.countDocuments(filter),
    ]);

    R.success(res, {
      invoices,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

// ── Get invoice by ID ──────────────────────────────────────────────────────────
export const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("createdBy", "name")
      .populate("partnerId", "name phone email");
    if (!invoice) return R.notFound(res, "Invoice not found");
    R.success(res, invoice);
  } catch (err) { next(err); }
};

// ── Get invoice edit/payment history from ActivityLog ─────────────────────────
export const getInvoiceHistory = async (req, res, next) => {
  try {
    const logs = await ActivityLog.find({ resource: "invoice", resourceId: req.params.id })
      .sort({ createdAt: -1 }).limit(50);
    R.success(res, logs);
  } catch (err) { next(err); }
};

// ── Update invoice status only ─────────────────────────────────────────────────
export const updateInvoiceStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["paid", "partial", "pending", "cancelled"].includes(status))
      return R.badRequest(res, "Invalid status");

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return R.notFound(res, "Invoice not found");

    const fields = { status };

    if (invoice.currency === "BOTH") {
      if (status === "paid") {
        fields.remainingKHR = 0; fields.remainingUSD = 0;
        fields.depositKHR = invoice.totalKHR; fields.depositUSD = invoice.totalUSD;
      } else if (status === "pending") {
        fields.remainingKHR = invoice.totalKHR; fields.remainingUSD = invoice.totalUSD;
        fields.depositKHR = 0; fields.depositUSD = 0;
        fields.depositInputAmount = 0; fields.depositInputCurrency = null;
      }
    } else {
      if (status === "paid")    { fields.depositAmount = invoice.total; fields.remainingAmount = 0; }
      if (status === "pending") { fields.depositAmount = 0; fields.remainingAmount = invoice.total; fields.depositInputAmount = 0; fields.depositInputCurrency = null; }
    }

    const updated = await Invoice.findByIdAndUpdate(req.params.id, fields, { new: true });
    R.success(res, updated, "Invoice status updated");
  } catch (err) { next(err); }
};

// ── Mark printed ───────────────────────────────────────────────────────────────
export const markPrinted = async (req, res, next) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { printedAt: new Date() }, { new: true });
    if (!invoice) return R.notFound(res, "Invoice not found");
    R.success(res, invoice, "Marked as printed");
  } catch (err) { next(err); }
};

// ── Preview invoice (no save) ──────────────────────────────────────────────────
export const previewInvoice = async (req, res, next) => {
  try {
    const { invoiceType = "customer", partnerId, customerType = "retail", items = [], discountType, discountValue, currency = "KHR" } = req.body;
    if (!items.length) return R.badRequest(res, "No items provided");

    const previewItems = [];
    let subtotal = 0, subtotalKHR = 0, subtotalUSD = 0;

    for (const item of items) {
      if (item.isCustom) {
        const up = Number(item.unitPrice) || 0;
        const qty = Number(item.quantity) || 1;
        const itemCurrency = currency === "BOTH" ? (item.currency || "KHR") : currency;
        if (currency === "BOTH") { if (itemCurrency === "USD") subtotalUSD += qty*up; else subtotalKHR += qty*up; }
        else subtotal += qty * up;
        previewItems.push({
          variantId: null, productId: null, sku: "", productName: item.productName || "Custom Item",
          brand: "", unit: "", unitValue: null, unitTypeName: null, attributes: [], availableStock: null,
          quantity: qty, priceType: "custom", currency: itemCurrency, unitPrice: up, subtotal: qty * up, pricingTiers: [], isCustom: true,
        });
        continue;
      }

      const variant = await ProductVariant.findById(item.variantId).populate("productId", "name attributes").populate("unitTypeId", "displayName name");
      if (!variant) return R.notFound(res, `Variant ${item.variantId} not found`);

      let unitPrice, priceType;
      if (item.unitPrice !== undefined) {
        unitPrice = item.unitPrice; priceType = item.priceType || "custom";
      } else {
        const resolved = await resolveItemPrice(variant, {
          userId:    invoiceType === "customer" ? req.user._id : null,
          partnerId: invoiceType === "partner"  ? partnerId    : null,
          customerType, quantity: item.quantity,
        });
        unitPrice = resolved.price; priceType = resolved.priceType;
      }

      const itemSubtotal = item.quantity * unitPrice;
      const itemCurrency = currency === "BOTH" ? (variant.currency || "KHR") : currency;
      if (currency === "BOTH") { if (itemCurrency === "USD") subtotalUSD += itemSubtotal; else subtotalKHR += itemSubtotal; }
      else subtotal += itemSubtotal;

      previewItems.push({
        variantId: variant._id, productId: variant.productId?._id,
        sku: variant.sku, productName: variant.productId?.name || "Unknown",
        brand: variant.brand, unit: variant.unit, unitValue: variant.unitValue,
        unitTypeName: variant.unitTypeId?.displayName || variant.unitTypeId?.name || null,
        attributes: variant.productId?.attributes || [], availableStock: variant.stock,
        quantity: item.quantity, priceType, currency: itemCurrency, unitPrice, subtotal: itemSubtotal, pricingTiers: variant.pricingTiers, isCustom: false,
      });
    }

    if (currency === "BOTH") {
      const discountAmountKHR = applyDiscount(subtotalKHR, discountType, discountValue);
      const discountAmountUSD = discountType === "percent" ? applyDiscount(subtotalUSD, discountType, discountValue) : 0;
      R.success(res, {
        invoiceType, partnerId, customerType, currency, items: previewItems,
        subtotalKHR, subtotalUSD, discountAmountKHR, discountAmountUSD,
        totalKHR: Math.max(0, subtotalKHR - discountAmountKHR),
        totalUSD: Math.max(0, subtotalUSD - discountAmountUSD),
      });
      return;
    }

    const discountAmount = applyDiscount(subtotal, discountType, discountValue);
    const total = Math.max(0, subtotal - discountAmount);
    R.success(res, {
      invoiceType, partnerId, customerType, currency, items: previewItems, subtotal,
      discountType: discountType || "none", discountValue: discountValue || 0, discountAmount, total,
    });
  } catch (err) { next(err); }
};