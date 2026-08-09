import mongoose from "mongoose";

// Simple key/value settings store.
// Currently only used for: { key: "exchangeRate", value: 4100 }
// (KHR per 1 USD), but kept generic so more settings can be added later
// without a schema migration.
const settingSchema = new mongoose.Schema(
  {
    key: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
    },
    value: {
      type:     mongoose.Schema.Types.Mixed,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Setting", settingSchema);