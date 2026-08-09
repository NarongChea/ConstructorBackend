import { Router } from "express";
import * as C from "../controllers/debt.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get ("/"             , C.getDebts);
router.get ("/summary"      , C.getDebtSummary);
router.get ("/:id"          , C.getDebtById);
router.post("/"             , authorize("admin"), logActivity("CREATE","debt"), C.createDebt);
router.post("/:id/repay"    , authorize("admin"), logActivity("REPAY","debt"),  C.repayDebt);

export default router;
