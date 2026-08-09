import Invoice from "../models/Invoice.js";
import ProductVariant from "../models/ProductVariant.js";
import Purchase from "../models/Purchase.js";
import Partner from "../models/Partner.js";
import * as R from "../utils/response.js";

// ── Daily sales report ─────────────────────────────────────────────────────────
// GET /api/reports/daily?startDate=&endDate=
export const getDailySalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const report = await Invoice.aggregate([
      { $match: { status: "paid", createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id:           { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue:       { $sum: "$total" },
          invoiceCount:  { $sum: 1 },
          avgOrderValue: { $avg: "$total" },
          // Break down by type
          customerSales: {
            $sum: { $cond: [{ $eq: ["$invoiceType", "customer"] }, "$total", 0] },
          },
          partnerSales: {
            $sum: { $cond: [{ $eq: ["$invoiceType", "partner"] }, "$total", 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    R.success(res, report);
  } catch (err) { next(err); }
};

// ── Monthly sales report ───────────────────────────────────────────────────────
// GET /api/reports/monthly?year=2024
export const getMonthlySalesReport = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const start = new Date(`${year}-01-01`);
    const end   = new Date(`${year}-12-31T23:59:59.999Z`);

    const [sales, purchases] = await Promise.all([
      Invoice.aggregate([
        { $match: { status: "paid", createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:          { $month: "$createdAt" },
            revenue:      { $sum: "$total" },
            invoiceCount: { $sum: 1 },
            partnerSales: {
              $sum: { $cond: [{ $eq: ["$invoiceType", "partner"] }, "$total", 0] },
            },
            customerSales: {
              $sum: { $cond: [{ $eq: ["$invoiceType", "customer"] }, "$total", 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Purchase.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:              { $month: "$createdAt" },
            totalCost:        { $sum: "$totalCost" },
            purchaseCount:    { $sum: 1 },
            supplierSpend:    {
              $sum: { $cond: [{ $eq: ["$sourceType", "supplier"] }, "$totalCost", 0] },
            },
            partnerSpend: {
              $sum: { $cond: [{ $eq: ["$sourceType", "partner"] }, "$totalCost", 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const months = Array.from({ length: 12 }, (_, i) => {
      const s = sales.find((r) => r._id === i + 1)     || { revenue: 0, invoiceCount: 0, partnerSales: 0, customerSales: 0 };
      const p = purchases.find((r) => r._id === i + 1) || { totalCost: 0, purchaseCount: 0, supplierSpend: 0, partnerSpend: 0 };
      return {
        month:         i + 1,
        revenue:       s.revenue,
        invoiceCount:  s.invoiceCount,
        customerSales: s.customerSales,
        partnerSales:  s.partnerSales,
        totalCost:     p.totalCost,
        purchaseCount: p.purchaseCount,
        supplierSpend: p.supplierSpend,
        partnerSpend:  p.partnerSpend,
        profit:        s.revenue - p.totalCost,
      };
    });

    R.success(res, { year: parseInt(year), months });
  } catch (err) { next(err); }
};

// ── Yearly sales report ────────────────────────────────────────────────────────
// GET /api/reports/yearly?startYear=2022&endYear=2025
export const getYearlySalesReport = async (req, res, next) => {
  try {
    const currentYear = new Date().getFullYear();
    const startYear   = parseInt(req.query.startYear) || currentYear - 3;
    const endYear     = parseInt(req.query.endYear)   || currentYear;

    const start = new Date(`${startYear}-01-01`);
    const end   = new Date(`${endYear}-12-31T23:59:59.999Z`);

    const [sales, purchases] = await Promise.all([
      Invoice.aggregate([
        { $match: { status: "paid", createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:          { $year: "$createdAt" },
            revenue:      { $sum: "$total" },
            invoiceCount: { $sum: 1 },
            partnerSales: {
              $sum: { $cond: [{ $eq: ["$invoiceType", "partner"] }, "$total", 0] },
            },
            customerSales: {
              $sum: { $cond: [{ $eq: ["$invoiceType", "customer"] }, "$total", 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Purchase.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:           { $year: "$createdAt" },
            totalCost:     { $sum: "$totalCost" },
            purchaseCount: { $sum: 1 },
            supplierSpend: {
              $sum: { $cond: [{ $eq: ["$sourceType", "supplier"] }, "$totalCost", 0] },
            },
            partnerSpend: {
              $sum: { $cond: [{ $eq: ["$sourceType", "partner"] }, "$totalCost", 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const years = [];
    for (let y = startYear; y <= endYear; y++) {
      const s = sales.find((r) => r._id === y)     || { revenue: 0, invoiceCount: 0, partnerSales: 0, customerSales: 0 };
      const p = purchases.find((r) => r._id === y) || { totalCost: 0, purchaseCount: 0, supplierSpend: 0, partnerSpend: 0 };
      years.push({
        year:          y,
        revenue:       s.revenue,
        invoiceCount:  s.invoiceCount,
        customerSales: s.customerSales,
        partnerSales:  s.partnerSales,
        totalCost:     p.totalCost,
        purchaseCount: p.purchaseCount,
        supplierSpend: p.supplierSpend,
        partnerSpend:  p.partnerSpend,
        profit:        s.revenue - p.totalCost,
      });
    }

    R.success(res, { startYear, endYear, years });
  } catch (err) { next(err); }
};

// ── Best-selling products ──────────────────────────────────────────────────────
// GET /api/reports/best-selling?startDate=&endDate=&limit=10
export const getBestSellingProducts = async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    const match = { status: "paid" };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        match.createdAt.$lte = e;
      }
    }

    const report = await Invoice.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id:           "$items.variantId",
          productName:   { $first: "$items.productName" },
          brand:         { $first: "$items.brand" },
          unit:          { $first: "$items.unit" },
          unitValue:     { $first: "$items.unitValue" },
          unitTypeName:  { $first: "$items.unitTypeName" },
          sku:           { $first: "$items.sku" },
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue:  { $sum: "$items.subtotal" },
          orderCount:    { $sum: 1 },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) },
    ]);

    R.success(res, report);
  } catch (err) { next(err); }
};

// ── Revenue vs Cost ────────────────────────────────────────────────────────────
// GET /api/reports/revenue-vs-cost?year=2024
export const getRevenueVsCost = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const start = new Date(`${year}-01-01`);
    const end   = new Date(`${year}-12-31T23:59:59.999Z`);

    const [revenue, cost] = await Promise.all([
      Invoice.aggregate([
        { $match: { status: "paid", createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Purchase.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$totalCost" } } },
      ]),
    ]);

    const totalRevenue = revenue[0]?.total || 0;
    const totalCost    = cost[0]?.total    || 0;
    R.success(res, {
      year: parseInt(year),
      totalRevenue,
      totalCost,
      grossProfit:  totalRevenue - totalCost,
      profitMargin: totalRevenue > 0
        ? (((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(2)
        : 0,
    });
  } catch (err) { next(err); }
};

// ── Sales to partners report ───────────────────────────────────────────────────
// GET /api/reports/partner-sales?startDate=&endDate=&partnerId=
export const getPartnerSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, partnerId } = req.query;

    const match = { invoiceType: "partner", status: "paid" };
    if (partnerId) match.partnerId = new (await import("mongoose")).default.Types.ObjectId(partnerId);
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        match.createdAt.$lte = e;
      }
    }

    const [summary, byPartner] = await Promise.all([
      // Overall summary
      Invoice.aggregate([
        { $match: match },
        {
          $group: {
            _id:          null,
            totalRevenue: { $sum: "$total" },
            invoiceCount: { $sum: 1 },
            avgOrderValue:{ $avg: "$total" },
          },
        },
      ]),
      // Per-partner breakdown
      Invoice.aggregate([
        { $match: match },
        {
          $group: {
            _id:          "$partnerId",
            partnerName:  { $first: "$partnerName" },
            totalRevenue: { $sum: "$total" },
            invoiceCount: { $sum: 1 },
          },
        },
        { $sort: { totalRevenue: -1 } },
        {
          $lookup: {
            from: "partners", localField: "_id", foreignField: "_id",
            as: "partner",
          },
        },
        {
          $project: {
            partnerName:  1,
            totalRevenue: 1,
            invoiceCount: 1,
            "partner.phone": 1,
          },
        },
      ]),
    ]);

    R.success(res, {
      summary: {
        totalRevenue:  summary[0]?.totalRevenue  || 0,
        invoiceCount:  summary[0]?.invoiceCount  || 0,
        avgOrderValue: summary[0]?.avgOrderValue || 0,
      },
      byPartner,
    });
  } catch (err) { next(err); }
};

// ── Purchases from partners report ────────────────────────────────────────────
// GET /api/reports/partner-purchases?startDate=&endDate=&partnerId=
export const getPartnerPurchasesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, partnerId } = req.query;

    const match = { sourceType: "partner" };
    if (partnerId) match.partnerId = new (await import("mongoose")).default.Types.ObjectId(partnerId);
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        match.createdAt.$lte = e;
      }
    }

    const [summary, byPartner] = await Promise.all([
      Purchase.aggregate([
        { $match: match },
        {
          $group: {
            _id:           null,
            totalSpend:    { $sum: "$totalCost" },
            purchaseCount: { $sum: 1 },
          },
        },
      ]),
      Purchase.aggregate([
        { $match: match },
        {
          $group: {
            _id:           "$partnerId",
            partnerName:   { $first: "$partnerName" },
            totalSpend:    { $sum: "$totalCost" },
            purchaseCount: { $sum: 1 },
          },
        },
        { $sort: { totalSpend: -1 } },
      ]),
    ]);

    R.success(res, {
      summary: {
        totalSpend:    summary[0]?.totalSpend    || 0,
        purchaseCount: summary[0]?.purchaseCount || 0,
      },
      byPartner,
    });
  } catch (err) { next(err); }
};

// ── Spending report (suppliers + partners) ─────────────────────────────────────
// GET /api/reports/spending?startDate=&endDate=&year=
export const getSpendingReport = async (req, res, next) => {
  try {
    const { startDate, endDate, year } = req.query;

    let start, end;
    if (year) {
      start = new Date(`${year}-01-01`);
      end   = new Date(`${year}-12-31T23:59:59.999Z`);
    } else {
      start = startDate
        ? new Date(startDate)
        : new Date(new Date().setDate(new Date().getDate() - 30));
      end = endDate ? new Date(endDate) : new Date();
      end.setHours(23, 59, 59, 999);
    }

    const [summary, bySource, byMonth] = await Promise.all([
      // Overall totals
      Purchase.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:           null,
            totalSpend:    { $sum: "$totalCost" },
            purchaseCount: { $sum: 1 },
            supplierSpend: {
              $sum: { $cond: [{ $eq: ["$sourceType", "supplier"] }, "$totalCost", 0] },
            },
            partnerSpend: {
              $sum: { $cond: [{ $eq: ["$sourceType", "partner"] }, "$totalCost", 0] },
            },
          },
        },
      ]),

      // Per-supplier / per-partner breakdown
      Purchase.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:           { sourceType: "$sourceType", sourceId: { $ifNull: ["$supplierId", "$partnerId"] } },
            sourceName:    { $first: { $ifNull: ["$supplierName", "$partnerName"] } },
            sourceType:    { $first: "$sourceType" },
            totalSpend:    { $sum: "$totalCost" },
            purchaseCount: { $sum: 1 },
          },
        },
        { $sort: { totalSpend: -1 } },
      ]),

      // Monthly trend within the period
      Purchase.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:           { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            totalSpend:    { $sum: "$totalCost" },
            purchaseCount: { $sum: 1 },
            supplierSpend: {
              $sum: { $cond: [{ $eq: ["$sourceType", "supplier"] }, "$totalCost", 0] },
            },
            partnerSpend: {
              $sum: { $cond: [{ $eq: ["$sourceType", "partner"] }, "$totalCost", 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    R.success(res, {
      period:  { start, end },
      summary: {
        totalSpend:    summary[0]?.totalSpend    || 0,
        purchaseCount: summary[0]?.purchaseCount || 0,
        supplierSpend: summary[0]?.supplierSpend || 0,
        partnerSpend:  summary[0]?.partnerSpend  || 0,
      },
      bySource,
      byMonth,
    });
  } catch (err) { next(err); }
};