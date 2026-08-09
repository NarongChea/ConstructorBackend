import { Router } from "express";
import * as C from "../controllers/salary.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.post("/pay",             authorize("admin"), logActivity("PAY","salary"), C.paySalary);
router.get ("/history",         C.getSalaryHistory);
router.get ("/summary/monthly", C.getMonthlySalarySummary);

export default router;
