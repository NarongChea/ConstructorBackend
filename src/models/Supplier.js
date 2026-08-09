import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    contact:  { type: String, trim: true },
    phone:    { type: String, trim: true },
    email:    { type: String, trim: true, lowercase: true },
    address:  { type: String, trim: true },
    note:     { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Supplier", supplierSchema);
