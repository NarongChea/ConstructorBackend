import Invoice from "../models/Invoice.js";
import ProductVariant from "../models/ProductVariant.js";
import Employee from "../models/Employee.js";
import Debt from "../models/Debt.js";
import StockHistory from "../models/StockHistory.js";
import * as R from "../utils/response.js";

export const getDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      todaySales,
      monthSales,
      totalInvoices,
      activeEmployees,
      totalStock,
      lowStockVariants,
      pendingDebts,
      recentInvoices,
    ] = await Promise.all([
      // Today sales
      Invoice.aggregate([
        { $match: { status: "paid", createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]),

      // This month sales
      Invoice.aggregate([
        { $match: { status: "paid", createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
      ]),

      // Total invoices
      Invoice.countDocuments({ status: { $ne: "cancelled" } }),

      // Active employees
      Employee.countDocuments({ isActive: true }),

      // Total stock value
      ProductVariant.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, totalItems: { $sum: "$stock" }, totalValue: { $sum: { $multiply: ["$stock", "$price"] } } } },
      ]),

      // Low stock count
      ProductVariant.aggregate([
        { $match: { isActive: true } },
        { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "product" } },
        { $unwind: "$product" },
        { $match: { $expr: { $lte: ["$stock", "$product.lowStockThreshold"] } } },
        { $count: "count" },
      ]),

      // Pending debts
      Debt.aggregate([
        { $match: { status: { $in: ["pending", "partial"] } } },
        { $group: { _id: null, totalRemaining: { $sum: "$remainingAmount" }, count: { $sum: 1 } } },
      ]),

      // Recent 5 invoices
      Invoice.find({ status: { $ne: "cancelled" } })
        .sort({ createdAt: -1 }).limit(5)
        .select("invoiceNumber customerName total status createdAt")
        .populate("createdBy", "name"),
    ]);

    R.success(res, {
      sales: {
        today:    { total: todaySales[0]?.total || 0,  count: todaySales[0]?.count || 0 },
        thisMonth:{ total: monthSales[0]?.total || 0,  count: monthSales[0]?.count || 0 },
        totalInvoices,
      },
      inventory: {
        totalItems:    totalStock[0]?.totalItems || 0,
        totalValue:    totalStock[0]?.totalValue || 0,
        lowStockCount: lowStockVariants[0]?.count || 0,
      },
      employees: { active: activeEmployees },
      debts: {
        pendingCount:     pendingDebts[0]?.count || 0,
        totalRemaining:   pendingDebts[0]?.totalRemaining || 0,
      },
      recentInvoices,
    });
  } catch (err) { next(err); }
};
