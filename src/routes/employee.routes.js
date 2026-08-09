import { Router } from "express";
import * as C from "../controllers/employee.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();
router.use(authenticate);

router.get   ("/",    C.getEmployees);
router.get   ("/:id", C.getEmployeeById);
router.post  ("/",    authorize("admin"), logActivity("CREATE","employee"), C.createEmployee);
router.patch ("/:id", authorize("admin"), logActivity("UPDATE","employee"), C.updateEmployee);
router.delete("/:id", authorize("admin"), logActivity("DELETE","employee"), C.deleteEmployee);

export default router;
