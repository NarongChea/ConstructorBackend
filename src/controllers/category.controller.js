import Category from "../models/Category.js";
import Product  from "../models/Product.js";
import * as R from "../utils/response.js";

export const createCategory = async (req, res, next) => {
  try {
    const category = await Category.create(req.body);
    R.created(res, category);
  } catch (err) { next(err); }
};

export const getCategories = async (req, res, next) => {
  try {
    const { all } = req.query;
    const filter = all === "true" ? {} : { isActive: true };
    const categories = await Category.find(filter).sort({ name: 1 });

    // Count active products per category
    const counts = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const result = categories.map(cat => ({
      ...cat.toObject(),
      productCount: countMap[cat._id.toString()] || 0,
    }));

    R.success(res, result);
  } catch (err) { next(err); }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return R.notFound(res, "Category not found");
    R.success(res, category);
  } catch (err) { next(err); }
};

export const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!category) return R.notFound(res, "Category not found");
    R.success(res, category, "Category updated");
  } catch (err) { next(err); }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!category) return R.notFound(res, "Category not found");
    R.success(res, {}, "Category deactivated");
  } catch (err) { next(err); }
};