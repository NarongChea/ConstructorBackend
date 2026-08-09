import { Router } from "express";
import * as C from "../controllers/activityLog.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";

const router = Router();
router.use(authenticate, authorize("admin"));

// IMPORTANT: more specific routes must come before the generic "/:id" route,
// otherwise Express would try to match "resource" as if it were an :id.
router.get("/resource/:resource/:resourceId", C.getResourceHistory);
router.get("/:id",                            C.getLogById);
router.get("/",                                C.getLogs);

export default router;