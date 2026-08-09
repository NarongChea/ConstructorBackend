import ActivityLog from "../models/ActivityLog.js";
import * as R from "../utils/response.js";

// ── List logs (with filters) ────────────────────────────────────────────────
export const getLogs = async (req, res, next) => {
  try {
    const { userId, resource, action, page = 1, limit = 50, startDate, endDate } = req.query;
    const filter = {};
    if (userId)   filter.userId   = userId;
    if (resource) filter.resource = resource;
    if (action)   filter.action   = { $regex: action, $options: "i" };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate)  { const e = new Date(endDate); e.setHours(23,59,59,999); filter.createdAt.$lte = e; }
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ActivityLog.countDocuments(filter),
    ]);
    R.success(res, {
      logs,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

// ── Get a single log entry, including its before/after snapshots ──────────
// Used by the frontend "view diff" button to show exactly what changed.
export const getLogById = async (req, res, next) => {
  try {
    const log = await ActivityLog.findById(req.params.id).populate("userId", "name email");
    if (!log) return R.notFound(res, "Log entry not found");
    R.success(res, log);
  } catch (err) { next(err); }
};

// ── Full history for one specific record (e.g. one invoice's edit trail) ──
// GET /api/activity-logs/resource/:resource/:resourceId
export const getResourceHistory = async (req, res, next) => {
  try {
    const { resource, resourceId } = req.params;
    const logs = await ActivityLog.find({ resource, resourceId })
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
    R.success(res, logs);
  } catch (err) { next(err); }
};