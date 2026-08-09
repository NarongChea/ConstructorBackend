import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Category", categorySchema);
