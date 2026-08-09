import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    phone:      { type: String, trim: true },
    role:       { type: String, trim: true },
    baseSalary: { type: Number, default: 0, min: 0 },
    hireDate:   { type: Date, default: Date.now },   // ← ថ្មី
    isActive:   { type: Boolean, default: true },
    note:       { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Employee", employeeSchema);