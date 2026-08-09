import SalaryPayment from "../models/SalaryPayment.js";
import Employee from "../models/Employee.js";
import * as R from "../utils/response.js";

export const paySalary = async (req, res, next) => {
  try {
    const { employeeId, amount, month, year, note } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) return R.notFound(res, "Employee not found");

    const exists = await SalaryPayment.findOne({ employeeId, month, year });
    if (exists) return R.badRequest(res, `Salary for ${month}/${year} already paid for this employee`);

    const payment = await SalaryPayment.create({
      employeeId, amount, month, year, note, createdBy: req.user._id,
    });

    R.created(res, payment, "Salary paid");
  } catch (err) { next(err); }
};

export const getSalaryHistory = async (req, res, next) => {
  try {
    const { employeeId, year, month, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (employeeId) filter.employeeId = employeeId;
    if (year) filter.year = parseInt(year);
    if (month) filter.month = parseInt(month);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [payments, total] = await Promise.all([
      SalaryPayment.find(filter)
        .populate("employeeId", "name role")
        .populate("createdBy", "name")
        .sort({ year: -1, month: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      SalaryPayment.countDocuments(filter),
    ]);

    R.success(res, {
      payments,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

export const getMonthlySalarySummary = async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const summary = await SalaryPayment.aggregate([
      { $match: { year: parseInt(year) } },
      { $group: { _id: "$month", totalPaid: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    R.success(res, summary);
  } catch (err) { next(err); }
};
