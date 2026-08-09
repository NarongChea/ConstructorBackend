import UnitType from "../models/UnitType.js";
import * as R from "../utils/response.js";

// ── List all unit types ────────────────────────────────────────────────────────
export const getUnitTypes = async (req, res, next) => {
  try {
    const { isActive } = req.query;
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    else filter.isActive = true;

    const unitTypes = await UnitType.find(filter).sort({ name: 1 });
    R.success(res, unitTypes);
  } catch (err) { next(err); }
};

// ── Get single unit type ───────────────────────────────────────────────────────
export const getUnitTypeById = async (req, res, next) => {
  try {
    const unitType = await UnitType.findById(req.params.id);
    if (!unitType) return R.notFound(res, "Unit type not found");
    R.success(res, unitType);
  } catch (err) { next(err); }
};

// ── Create unit type ───────────────────────────────────────────────────────────
// Body: { name, displayName?, measurements: [{label, symbol, conversionToBase?}] }
export const createUnitType = async (req, res, next) => {
  try {
    const { name, displayName, measurements } = req.body;

    if (!measurements || measurements.length === 0)
      return R.badRequest(res, "At least one measurement is required");

    const unitType = await UnitType.create({
      name,
      displayName: displayName || name,
      measurements,
      createdBy: req.user._id,
    });
    R.created(res, unitType, "Unit type created");
  } catch (err) {
    if (err.code === 11000) return R.badRequest(res, `Unit type "${req.body.name}" already exists`);
    next(err);
  }
};

// ── Update unit type (name, displayName, replace measurements list) ────────────
// Body: { displayName?, measurements? }
export const updateUnitType = async (req, res, next) => {
  try {
    const allowed = ["displayName", "measurements", "isActive"];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    if (updates.measurements !== undefined && updates.measurements.length === 0)
      return R.badRequest(res, "At least one measurement is required");

    const unitType = await UnitType.findByIdAndUpdate(
      req.params.id, updates, { new: true, runValidators: true }
    );
    if (!unitType) return R.notFound(res, "Unit type not found");
    R.success(res, unitType, "Unit type updated");
  } catch (err) { next(err); }
};

// ── Add a measurement to an existing unit type ─────────────────────────────────
// Body: { label, symbol, conversionToBase? }
export const addMeasurement = async (req, res, next) => {
  try {
    const { label, symbol, conversionToBase } = req.body;
    if (!label || !symbol) return R.badRequest(res, "label and symbol are required");

    const unitType = await UnitType.findById(req.params.id);
    if (!unitType) return R.notFound(res, "Unit type not found");

    const exists = unitType.measurements.some(
      (m) => m.symbol.toLowerCase() === symbol.toLowerCase()
    );
    if (exists) return R.badRequest(res, `Measurement "${symbol}" already exists`);

    unitType.measurements.push({ label, symbol, conversionToBase });
    await unitType.save();
    R.success(res, unitType, "Measurement added");
  } catch (err) { next(err); }
};

// ── Remove a measurement from a unit type ─────────────────────────────────────
// DELETE /api/unit-types/:id/measurements/:symbol
export const removeMeasurement = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const unitType = await UnitType.findById(req.params.id);
    if (!unitType) return R.notFound(res, "Unit type not found");

    const before = unitType.measurements.length;
    unitType.measurements = unitType.measurements.filter(
      (m) => m.symbol.toLowerCase() !== symbol.toLowerCase()
    );

    if (unitType.measurements.length === 0)
      return R.badRequest(res, "Cannot remove the last measurement — unit type must have at least one");

    if (unitType.measurements.length === before)
      return R.notFound(res, `Measurement "${symbol}" not found`);

    await unitType.save();
    R.success(res, unitType, "Measurement removed");
  } catch (err) { next(err); }
};

// ── Soft-delete (deactivate) unit type ────────────────────────────────────────
export const deleteUnitType = async (req, res, next) => {
  try {
    const unitType = await UnitType.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!unitType) return R.notFound(res, "Unit type not found");
    R.success(res, {}, "Unit type deactivated");
  } catch (err) { next(err); }
};