import { Router } from "express";
import * as C from "../controllers/stock.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.post("/adjust",  authorize("admin"), logActivity("ADJUST","stock"), C.adjustStock);
router.get ("/history", C.getStockHistory);

export default router;
