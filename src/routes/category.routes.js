import { Router } from "express";
import * as C from "../controllers/category.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get   ("/",    C.getCategories);
router.get   ("/:id", C.getCategoryById);
router.post  ("/",    authorize("admin"), logActivity("CREATE","category"), C.createCategory);
router.patch ("/:id", authorize("admin"), logActivity("UPDATE","category"), C.updateCategory);
router.delete("/:id", authorize("admin"), logActivity("DELETE","category"), C.deleteCategory);

export default router;
