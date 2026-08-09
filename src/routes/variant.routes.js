import { Router } from "express";
import * as C from "../controllers/variant.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get   ("/low-stock",           C.getLowStockVariants);   // ← ADD THIS FIRST
router.get   ("/product/:productId",  C.getVariantsByProduct);
router.get   ("/:id/price",           C.resolveVariantPrice);
router.get   ("/:id",                 C.getVariantById);
router.post  ("/",                    authorize("admin"), logActivity("CREATE","variant"), C.createVariant);
router.patch ("/:id",                 authorize("admin"), logActivity("UPDATE","variant"), C.updateVariant);
router.delete("/:id",                 authorize("admin"), logActivity("DELETE","variant"), C.deleteVariant);

export default router;