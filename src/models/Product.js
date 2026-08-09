import mongoose from "mongoose";

// Flexible attribute schema: each product type can store different attributes
// e.g. metal: [{name:"thickness",value:"2mm"},{name:"length",value:"6m"}]
// e.g. cement: [{name:"weight",value:"50kg"},{name:"type",value:"Portland"}]
const attributeSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },   // e.g. "thickness", "weight", "grade"
    value: { type: String, required: true, trim: true },   // e.g. "2mm", "50kg", "Grade A"
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name:        { type: String, required: [true, "Name is required"], trim: true, maxlength: 200 },
    description: { type: String, trim: true },
    categoryId:  {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
      index: true,
    },
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      index: true,
    },
    // Flexible attributes array — each product type defines its own attributes
    // No forced fields like "thickness" for all products
    attributes:        { type: [attributeSchema], default: [] },
    hasVariants:       { type: Boolean, default: true },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    images:            [{ type: String, trim: true }],
    isActive:          { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text" });

export default mongoose.model("Product", productSchema);
