import { Router } from "express";
// FIX: was ../controllers/unitType.controller.js — file is Unittype.controller.js
import * as C from "../controllers/Unittype.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

// Public reads (all authenticated users)
router.get("/",    C.getUnitTypes);
router.get("/:id", C.getUnitTypeById);

// Admin writes
router.post  ("/",                              authorize("admin"), logActivity("CREATE", "unitType"), C.createUnitType);
router.patch ("/:id",                           authorize("admin"), logActivity("UPDATE", "unitType"), C.updateUnitType);
router.delete("/:id",                           authorize("admin"), logActivity("DELETE", "unitType"), C.deleteUnitType);

// Manage individual measurements within a unit type
router.post  ("/:id/measurements",              authorize("admin"), C.addMeasurement);
router.delete("/:id/measurements/:symbol",      authorize("admin"), C.removeMeasurement);

export default router;