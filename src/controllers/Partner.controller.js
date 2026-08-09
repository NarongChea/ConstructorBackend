import mongoose from "mongoose";
import Partner from "../models/Partner.js";
import Invoice from "../models/Invoice.js";
import Purchase from "../models/Purchase.js";
import * as R from "../utils/response.js";

// ── List partners ──────────────────────────────────────────────────────────────
export const getPartners = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, search,
      canBuyFromUs, canSellToUs, isActive,
    } = req.query;

    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    else filter.isActive = true;
    if (canBuyFromUs !== undefined) filter.canBuyFromUs = canBuyFromUs === "true";
    if (canSellToUs  !== undefined) filter.canSellToUs  = canSellToUs  === "true";
    if (search) filter.$text = { $search: search };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [partners, total] = await Promise.all([
      Partner.find(filter).sort({ name: 1 }).skip(skip).limit(parseInt(limit)),
      Partner.countDocuments(filter),
    ]);

    R.success(res, {
      partners,
      pagination: {
        total, page: parseInt(page), limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

// ── Get single partner ─────────────────────────────────────────────────────────
export const getPartnerById = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return R.notFound(res, "Partner not found");
    R.success(res, partner);
  } catch (err) { next(err); }
};

// ── Create partner ─────────────────────────────────────────────────────────────
export const createPartner = async (req, res, next) => {
  try {
    const { name, contact, phone, email, address, note, canBuyFromUs, canSellToUs } = req.body;

    if (!canBuyFromUs && !canSellToUs)
      return R.badRequest(res, "Partner must have at least one role: canBuyFromUs or canSellToUs");

    const partner = await Partner.create({
      name, contact, phone, email, address, note,
      canBuyFromUs: canBuyFromUs ?? true,
      canSellToUs:  canSellToUs  ?? false,
      createdBy: req.user._id,
    });
    R.created(res, partner, "Partner created");
  } catch (err) { next(err); }
};

// ── Update partner ─────────────────────────────────────────────────────────────
export const updatePartner = async (req, res, next) => {
  try {
    const allowed = ["name", "contact", "phone", "email", "address", "note", "canBuyFromUs", "canSellToUs", "isActive"];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    // Ensure at least one role remains
    if (updates.canBuyFromUs === false && updates.canSellToUs === false)
      return R.badRequest(res, "Partner must keep at least one role");

    const partner = await Partner.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    });
    if (!partner) return R.notFound(res, "Partner not found");
    R.success(res, partner, "Partner updated");
  } catch (err) { next(err); }
};

// ── Soft-delete partner ────────────────────────────────────────────────────────
export const deletePartner = async (req, res, next) => {
  try {
    const partner = await Partner.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!partner) return R.notFound(res, "Partner not found");
    R.success(res, {}, "Partner deactivated");
  } catch (err) { next(err); }
};

// ── Partner balance ────────────────────────────────────────────────────────────
/**
 * GET /api/partners/:id/balance
 *
 * Computes:
 *   totalSales     — sum of paid invoices we issued TO the partner
 *   totalPurchases — sum of purchases we made FROM the partner
 *   balance        = totalSales - totalPurchases
 *
 *   balance > 0  → partner owes us
 *   balance < 0  → we owe the partner  (abs value)
 *   balance = 0  → settled
 */
export const getPartnerBalance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const partnerId = new mongoose.Types.ObjectId(id);

    const partner = await Partner.findById(partnerId);
    if (!partner) return R.notFound(res, "Partner not found");

    const [salesAgg, purchasesAgg] = await Promise.all([
      // Sales invoices issued to this partner (status = paid)
      Invoice.aggregate([
        { $match: { partnerId, status: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]),
      // Purchases we made from this partner
      Purchase.aggregate([
        { $match: { partnerId } },
        { $group: { _id: null, total: { $sum: "$totalCost" }, count: { $sum: 1 } } },
      ]),
    ]);

    const totalSales     = salesAgg[0]?.total     || 0;
    const salesCount     = salesAgg[0]?.count     || 0;
    const totalPurchases = purchasesAgg[0]?.total || 0;
    const purchasesCount = purchasesAgg[0]?.count || 0;
    const balance        = totalSales - totalPurchases;

    R.success(res, {
      partner: { _id: partner._id, name: partner.name },
      totalSales,
      salesCount,
      totalPurchases,
      purchasesCount,
      balance,
      status: balance > 0 ? "partner_owes_us" : balance < 0 ? "we_owe_partner" : "settled",
      // Human-readable: how much the owing party needs to pay
      amountDue: Math.abs(balance),
    });
  } catch (err) { next(err); }
};

// ── Partner transaction history ────────────────────────────────────────────────
/**
 * GET /api/partners/:id/transactions?startDate&endDate&page&limit
 *
 * Returns both sales invoices (partner bought from us) and purchases
 * (we bought from partner) in reverse-chronological order.
 */
export const getPartnerTransactions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const partnerId = new mongoose.Types.ObjectId(id);
    const { startDate, endDate, page = 1, limit = 20 } = req.query;

    const partner = await Partner.findById(partnerId);
    if (!partner) return R.notFound(res, "Partner not found");

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [sales, purchases] = await Promise.all([
      Invoice.find({ partnerId, ...dateFilter })
        .select("invoiceNumber total status createdAt items")
        .sort({ createdAt: -1 }),
      Purchase.find({ partnerId, ...dateFilter })
        .select("totalCost note createdAt items")
        .sort({ createdAt: -1 }),
    ]);

    // Merge and tag each transaction type
    const transactions = [
      ...sales.map((s) => ({
        type:      "sale",          // we sold to partner
        direction: "incoming",      // money comes in
        _id:       s._id,
        reference: s.invoiceNumber,
        amount:    s.total,
        status:    s.status,
        itemCount: s.items?.length || 0,
        date:      s.createdAt,
      })),
      ...purchases.map((p) => ({
        type:      "purchase",      // we bought from partner
        direction: "outgoing",      // money goes out
        _id:       p._id,
        reference: null,
        amount:    p.totalCost,
        status:    "completed",
        itemCount: p.items?.length || 0,
        date:      p.createdAt,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Manual pagination after merge
    const totalCount = transactions.length;
    const paginated  = transactions.slice(skip, skip + parseInt(limit));

    R.success(res, {
      partner: { _id: partner._id, name: partner.name },
      transactions: paginated,
      pagination: {
        total: totalCount,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};