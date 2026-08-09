import mongoose from "mongoose";

const debtRepaymentSchema = new mongoose.Schema(
  {
    debtId:    { type: mongoose.Schema.Types.ObjectId, ref: "Debt", required: true, index: true },
    amount:    { type: Number, required: true, min: [0.01, "Amount must be > 0"] },
    note:      { type: String, trim: true },
    paidAt:    { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("DebtRepayment", debtRepaymentSchema);
