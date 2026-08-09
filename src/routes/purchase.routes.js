import { Router } from "express";
import * as C from "../controllers/purchase.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get ("/"   , C.getPurchases);
router.get ("/:id", C.getPurchaseById);
router.post("/"   , authorize("admin"), logActivity("CREATE","purchase"), C.createPurchase);

export default router;
