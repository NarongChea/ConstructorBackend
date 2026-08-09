import Employee from "../models/Employee.js";
import * as R from "../utils/response.js";

export const createEmployee = async (req, res, next) => {
  try {
    const body = {
      ...req.body,
      baseSalary: Number(req.body.baseSalary),
    }
    const employee = await Employee.create(body);
    R.created(res, employee, "Employee created");
  } catch (err) { next(err); }
};

export const getEmployees = async (req, res, next) => {
  try {
    const filter = req.query.all === "true" ? {} : { isActive: true };
    const employees = await Employee.find(filter).sort({ name: 1 });
    R.success(res, employees);
  } catch (err) { next(err); }
};

export const getEmployeeById = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return R.notFound(res, "Employee not found");
    R.success(res, employee);
  } catch (err) { next(err); }
};

export const updateEmployee = async (req, res, next) => {
  try {
    const allowedFields = ["name", "phone", "role", "baseSalary", "hireDate", "isActive", "note"];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (updates.baseSalary !== undefined) updates.baseSalary = Number(updates.baseSalary);
    const employee = await Employee.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    });
    if (!employee) return R.notFound(res, "Employee not found");
    R.success(res, employee, "Employee updated");
  } catch (err) { next(err); }
};

export const deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!employee) return R.notFound(res, "Employee not found");
    R.success(res, {}, "Employee deactivated");
  } catch (err) { next(err); }
};