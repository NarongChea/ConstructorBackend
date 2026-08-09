import { Router } from "express";
// FIX: was ../controllers/partner.controller.js (lowercase p) — file is Partner.controller.js
import * as C from "../controllers/Partner.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

// List & read
router.get("/",                   C.getPartners);
router.get("/:id",                C.getPartnerById);
router.get("/:id/balance",        C.getPartnerBalance);
router.get("/:id/transactions",   C.getPartnerTransactions);

// Admin writes
router.post  ("/",    authorize("admin"), logActivity("CREATE", "partner"), C.createPartner);
router.patch ("/:id", authorize("admin"), logActivity("UPDATE", "partner"), C.updatePartner);
router.delete("/:id", authorize("admin"), logActivity("DELETE", "partner"), C.deletePartner);

export default router;