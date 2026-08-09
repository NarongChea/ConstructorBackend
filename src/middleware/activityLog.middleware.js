import mongoose from "mongoose";
import ActivityLog from "../models/ActivityLog.js";
import { logger } from "../utils/logger.js";

// ── Map resource name → Mongoose model, used to fetch a "before" snapshot ──
// Models are imported lazily (dynamic import) inside the resolver so this
// middleware file doesn't create import-order problems with the rest of the
// app, and so adding a new resource later is a one-line change.
async function getModelForResource(resource) {
  switch (resource) {
    case "invoice":  return (await import("../models/Invoice.js")).default;
    case "employee": return (await import("../models/Employee.js")).default;
    case "debt":     return (await import("../models/Debt.js")).default;
    case "product":  return (await import("../models/Product.js")).default;
    case "variant":  return (await import("../models/ProductVariant.js")).default;
    default:         return null;
  }
}

/**
 * logActivity(action, resource)
 *
 * Express middleware factory. Wraps res.json so that whenever the wrapped
 * route handler responds with `{ success: true, ... }`, an immutable
 * ActivityLog entry is written recording who did what, and — for UPDATE /
 * DELETE actions on resources we know how to look up — a "before" snapshot
 * (fetched prior to the handler running) and an "after" snapshot (taken from
 * the handler's own response payload).
 *
 * This makes every invoice/employee/etc. change auditable: you can always
 * see exactly what the record looked like before and after any edit, and
 * the log entry itself can never be edited or deleted (see ActivityLog.js).
 */
export const logActivity = (action, resource) => async (req, res, next) => {
  // ── Step 1: capture "before" state for UPDATE/DELETE, before the handler runs ──
  let beforeSnapshot = null;
  if ((action === "UPDATE" || action === "DELETE") && req.params.id) {
    try {
      const Model = await getModelForResource(resource);
      if (Model && mongoose.isValidObjectId(req.params.id)) {
        const doc = await Model.findById(req.params.id).lean();
        if (doc) beforeSnapshot = doc;
      }
    } catch (e) {
      logger.error("ActivityLog: failed to capture before-snapshot:", e);
    }
  }

  // ── Step 2: wrap res.json so we log only once the handler actually succeeds ──
  const originalJson = res.json.bind(res);
  res.json = async (data) => {
    if (data?.success && req.user) {
      try {
        const afterSnapshot = action === "DELETE" ? null : (data?.data ?? null);

        await ActivityLog.create({
          userId:     req.user._id,
          userName:   req.user.name,
          action,
          resource,
          resourceId: req.params.id || data?.data?._id,
          before:     beforeSnapshot,
          after:      afterSnapshot,
          details:    { method: req.method, path: req.path, body: req.body },
          ip:         req.ip,
          userAgent:  req.get("user-agent"),
        });
      } catch (e) {
        logger.error("ActivityLog error:", e);
      }
    }
    return originalJson(data);
  };

  next();
};