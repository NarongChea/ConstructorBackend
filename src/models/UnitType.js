import mongoose from "mongoose";

/**
 * UnitType defines a category of item (e.g. screw, bottle, piece)
 * and the list of measurement units allowed for that item type.
 *
 * Example:
 *   name: "screw"
 *   measurements: [
 *     { label: "gram",     symbol: "g"   },
 *     { label: "kilogram", symbol: "kg"  },
 *     { label: "box",      symbol: "box" },
 *   ]
 *
 * Example:
 *   name: "bottle"
 *   measurements: [
 *     { label: "0.3L", symbol: "0.3L" },
 *     { label: "0.5L", symbol: "0.5L" },
 *     { label: "1L",   symbol: "1L"   },
 *     { label: "4L",   symbol: "4L"   },
 *   ]
 *
 * Each variant of a product references a UnitType and picks one
 * measurement from its list, then sets its own price for that measurement.
 */

const measurementSchema = new mongoose.Schema(
  {
    label:  { type: String, required: true, trim: true }, // e.g. "gram", "0.3L"
    symbol: { type: String, required: true, trim: true }, // e.g. "g", "0.3L"
    // Optional: base-unit conversion factor (informational only, not used in price calc)
    // e.g. 1 kg = 1000 g → conversionToBase: 1000 for kg if base is gram
    conversionToBase: { type: Number, default: null },
  },
  { _id: false }
);

const unitTypeSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, "Unit type name is required"],
      trim:     true,
      unique:   true,
      lowercase: true,         // stored lowercase; "Screw" → "screw"
    },
    displayName: { type: String, trim: true }, // pretty label for UI, e.g. "Screw"
    measurements: {
      type:    [measurementSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length > 0,
        message:   "At least one measurement is required",
      },
    },
    isActive:  { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("UnitType", unitTypeSchema);