import Supplier from "../models/Supplier.js";
import Purchase from "../models/Purchase.js";
import * as R from "../utils/response.js";

export const createSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.create(req.body);
    R.created(res, supplier, "Supplier added");
  } catch (err) { next(err); }
};

export const getSuppliers = async (req, res, next) => {
  try {
    const filter = req.query.all === "true" ? {} : { isActive: true };
    const suppliers = await Supplier.find(filter).sort({ name: 1 });
    R.success(res, suppliers);
  } catch (err) { next(err); }
};

export const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return R.notFound(res, "Supplier not found");

    const purchases = await Purchase.find({ supplierId: supplier._id })
      .sort({ createdAt: -1 }).limit(20).select("-items");
    R.success(res, { supplier, recentPurchases: purchases });
  } catch (err) { next(err); }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!supplier) return R.notFound(res, "Supplier not found");
    R.success(res, supplier, "Supplier updated");
  } catch (err) { next(err); }
};

export const deleteSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!supplier) return R.notFound(res, "Supplier not found");
    R.success(res, {}, "Supplier deactivated");
  } catch (err) { next(err); }
};
