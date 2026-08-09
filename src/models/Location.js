import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true, unique: true },
    zone:        { type: String, trim: true },
    description: { type: String, trim: true },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Location", locationSchema);
