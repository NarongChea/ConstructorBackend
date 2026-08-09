import { Router } from "express";
import * as C from "../controllers/supplier.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get   ("/",    C.getSuppliers);
router.get   ("/:id", C.getSupplierById);
router.post  ("/",    authorize("admin"), logActivity("CREATE","supplier"), C.createSupplier);
router.patch ("/:id", authorize("admin"), logActivity("UPDATE","supplier"), C.updateSupplier);
router.delete("/:id", authorize("admin"), logActivity("DELETE","supplier"), C.deleteSupplier);

export default router;
