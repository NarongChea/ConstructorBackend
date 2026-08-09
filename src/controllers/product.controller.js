import mongoose from "mongoose";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import * as R from "../utils/response.js";

export const createProduct = async (req, res, next) => {
  try {
    // attributes: [{name:"thickness",value:"2mm"},{name:"length",value:"6m"}]
    const product = await Product.create({ ...req.body });
    R.created(res, product, "Product created");
  } catch (err) { next(err); }
};

export const getProducts = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, search, category, location,
      isActive, sortBy = "createdAt", order = "desc",
    } = req.query;

    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    else filter.isActive = true;
    if (category) filter.categoryId = category;
    if (location) filter.locationId = location;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const sort = { [sortBy]: order === "asc" ? 1 : -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("categoryId", "name")
        .populate("locationId", "name zone")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(filter),
    ]);

    R.success(res, {
      products,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("categoryId", "name")
      .populate("locationId", "name zone");
    if (!product) return R.notFound(res, "Product not found");

    const variants = await ProductVariant.find({ productId: product._id, isActive: true })
      .sort({ brand: 1, unit: 1 });
    R.success(res, { product, variants });
  } catch (err) { next(err); }
};

export const updateProduct = async (req, res, next) => {
  try {
    const allowedFields = [
      "name", "description", "categoryId", "locationId",
      "attributes",          // flexible attributes array
      "hasVariants", "lowStockThreshold", "images", "isActive",
    ];
    const updates = {};
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    }).populate("categoryId", "name").populate("locationId", "name zone");

    if (!product) return R.notFound(res, "Product not found");
    R.success(res, product, "Product updated");
  } catch (err) { next(err); }
};

export const deleteProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true, session }
    );
    if (!product) { await session.abortTransaction(); return R.notFound(res, "Product not found"); }

    await ProductVariant.updateMany({ productId: req.params.id }, { isActive: false }, { session });
    await session.commitTransaction();
    R.success(res, {}, "Product deactivated");
  } catch (err) { await session.abortTransaction(); next(err); }
  finally { session.endSession(); }
};

export const getLowStockProducts = async (req, res, next) => {
  try {
    const variants = await ProductVariant.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $match: {
          $expr: { $lte: ["$stock", "$product.lowStockThreshold"] },
          "product.isActive": true,
        },
      },
      {
        $project: {
          sku: 1, brand: 1, unit: 1, unitValue: 1, stock: 1, pricingTiers: 1,
          "product.name": 1, "product.lowStockThreshold": 1, "product.attributes": 1,
        },
      },
    ]);
    R.success(res, variants);
  } catch (err) { next(err); }
};