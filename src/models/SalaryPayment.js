import mongoose from "mongoose";

const salaryPaymentSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    amount:     { type: Number, required: true, min: 0 },
    month:      { type: Number, required: true, min: 1, max: 12 },
    year:       { type: Number, required: true },
    paidAt:     { type: Date, default: Date.now },
    note:       { type: String, trim: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

salaryPaymentSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model("SalaryPayment", salaryPaymentSchema);
