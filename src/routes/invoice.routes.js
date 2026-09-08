import { Router } from "express";
import * as C from "../controllers/invoice.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

// Preview (no save)
router.post("/preview",     C.previewInvoice);

// CRUD
router.get ("/",            C.getInvoices);
router.get ("/:id",         C.getInvoiceById);
router.post("/",            logActivity("CREATE", "invoice"), C.createInvoice);

// Patch sub-routes (must come before /:id)
router.patch("/:id/status", authorize("admin"), C.updateInvoiceStatus);
router.patch("/:id/print",  C.markPrinted);

// Full update (deposit, status, note, items)
router.put("/:id",          logActivity("UPDATE", "invoice"), C.updateInvoice);

export default router;
