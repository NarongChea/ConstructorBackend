import { Router } from "express";
import * as C from "../controllers/product.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get ("/low-stock",  C.getLowStockProducts);
router.get ("/",           C.getProducts);
router.get ("/:id",        C.getProductById);
router.post("/",           authorize("admin"), logActivity("CREATE","product"), C.createProduct);
router.patch("/:id",       authorize("admin"), logActivity("UPDATE","product"), C.updateProduct);
router.delete("/:id",      authorize("admin"), logActivity("DELETE","product"), C.deleteProduct);

export default router;
