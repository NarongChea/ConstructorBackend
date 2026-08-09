import Location from "../models/Location.js";
import * as R from "../utils/response.js";

export const createLocation = async (req, res, next) => {
  try {
    const location = await Location.create(req.body);
    R.created(res, location);
  } catch (err) { next(err); }
};

export const getLocations = async (req, res, next) => {
  try {
    const filter = req.query.all === "true" ? {} : { isActive: true };
    const locations = await Location.find(filter).sort({ zone: 1, name: 1 });
    R.success(res, locations);
  } catch (err) { next(err); }
};

export const getLocationById = async (req, res, next) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) return R.notFound(res, "Location not found");
    R.success(res, location);
  } catch (err) { next(err); }
};

export const updateLocation = async (req, res, next) => {
  try {
    const location = await Location.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!location) return R.notFound(res, "Location not found");
    R.success(res, location, "Location updated");
  } catch (err) { next(err); }
};

export const deleteLocation = async (req, res, next) => {
  try {
    const location = await Location.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!location) return R.notFound(res, "Location not found");
    R.success(res, {}, "Location deactivated");
  } catch (err) { next(err); }
};
