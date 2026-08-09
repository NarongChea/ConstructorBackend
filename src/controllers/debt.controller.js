import Debt from "../models/Debt.js";
import DebtRepayment from "../models/DebtRepayment.js";
import * as R from "../utils/response.js";

export const createDebt = async (req, res, next) => {
  try {
    const { type, entityId, entityName, entityPhone, totalAmount, dueDate, note } = req.body;
    const debt = await Debt.create({
      type, entityId, entityName, entityPhone,
      totalAmount, paidAmount: 0, remainingAmount: totalAmount,
      status: "pending", dueDate, note,
      createdBy: req.user._id,
    });
    R.created(res, debt, "Debt recorded");
  } catch (err) { next(err); }
};

export const getDebts = async (req, res, next) => {
  try {
    const { type, status, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (type)   filter.type = type;
    if (status) filter.status = status;
    if (search) filter.entityName = { $regex: search, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [debts, total] = await Promise.all([
      Debt.find(filter)
        .populate("createdBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Debt.countDocuments(filter),
    ]);
    R.success(res, {
      debts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

export const getDebtById = async (req, res, next) => {
  try {
    const debt = await Debt.findById(req.params.id).populate("createdBy", "name");
    if (!debt) return R.notFound(res, "Debt not found");

    const repayments = await DebtRepayment.find({ debtId: debt._id })
      .populate("createdBy", "name")
      .sort({ paidAt: -1 });

    R.success(res, { debt, repayments });
  } catch (err) { next(err); }
};

export const updateDebt = async (req, res, next) => {
  try {
    const { entityName, entityPhone, totalAmount, dueDate, note } = req.body;
    const debt = await Debt.findById(req.params.id);
    if (!debt) return R.notFound(res, "Debt not found");

    // Recalculate remaining & status if totalAmount changed
    if (totalAmount !== undefined) {
      const newTotal = Number(totalAmount);
      debt.totalAmount     = newTotal;
      debt.remainingAmount = newTotal - debt.paidAmount;
      debt.status =
        debt.remainingAmount <= 0  ? "settled" :
        debt.paidAmount > 0        ? "partial"  :
                                     "pending";
    }
    if (entityName  !== undefined) debt.entityName  = entityName;
    if (entityPhone !== undefined) debt.entityPhone = entityPhone;
    if (dueDate     !== undefined) debt.dueDate     = dueDate || null;
    if (note        !== undefined) debt.note        = note;

    await debt.save();
    R.success(res, debt, "Debt updated");
  } catch (err) { next(err); }
};

export const repayDebt = async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    const debt = await Debt.findById(req.params.id);
    if (!debt) return R.notFound(res, "Debt not found");
    if (debt.status === "settled") return R.badRequest(res, "Debt already settled");
    if (amount > debt.remainingAmount)
      return R.badRequest(res, `Amount exceeds remaining (${debt.remainingAmount})`);

    const repayment = await DebtRepayment.create({
      debtId: debt._id, amount, note, paidAt: new Date(), createdBy: req.user._id,
    });

    debt.paidAmount      += amount;
    debt.remainingAmount -= amount;
    debt.status = debt.remainingAmount <= 0 ? "settled" : "partial";
    await debt.save();

    R.success(res, { debt, repayment }, "Repayment recorded");
  } catch (err) { next(err); }
};

export const deleteDebt = async (req, res, next) => {
  try {
    const debt = await Debt.findByIdAndDelete(req.params.id);
    if (!debt) return R.notFound(res, "Debt not found");
    // Also remove repayments
    await DebtRepayment.deleteMany({ debtId: debt._id });
    R.success(res, {}, "Debt deleted");
  } catch (err) { next(err); }
};

export const getDebtSummary = async (req, res, next) => {
  try {
    const summary = await Debt.aggregate([
      {
        $group: {
          _id:             "$type",
          totalAmount:     { $sum: "$totalAmount" },
          totalPaid:       { $sum: "$paidAmount" },
          totalRemaining:  { $sum: "$remainingAmount" },
          count:           { $sum: 1 },
          pendingCount:    { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        },
      },
    ]);
    R.success(res, summary);
  } catch (err) { next(err); }
};