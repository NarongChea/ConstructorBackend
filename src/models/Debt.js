import mongoose from "mongoose";

const debtSchema = new mongoose.Schema(
  {
    type:            { type: String, enum: ["employee_borrow", "customer_credit"], required: true, index: true },
    entityId:        { type: mongoose.Schema.Types.ObjectId, refPath: "entityModel" },
    entityModel:     { type: String, enum: ["Employee", "Customer"] },
    entityName:      { type: String, required: true, trim: true },
    entityPhone:     { type: String, trim: true },
    totalAmount:     { type: Number, required: true, min: 0 },
    paidAmount:      { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    status:          { type: String, enum: ["pending", "partial", "settled"], default: "pending", index: true },
    dueDate:         { type: Date },
    workDaysOverride:{ type: Number, default: null },   // ← ថ្មី: null = auto from hireDate
    note:            { type: String, trim: true },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Debt", debtSchema);