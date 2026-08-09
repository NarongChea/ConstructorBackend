import { Router } from "express";
import * as C from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";
import { logActivity }  from "../middleware/activityLog.middleware.js";

const router = Router();

router.post("/login",  C.login);
router.post("/logout", authenticate, C.logout);
router.get ("/me",     authenticate, C.getMe);
router.patch("/change-password", authenticate, C.changePassword);

// Admin only: manage users
router.post  ("/users",     authenticate, authorize("admin"), logActivity("CREATE", "user"), C.createUser);
router.get   ("/users",     authenticate, authorize("admin"), C.getUsers);
router.patch ("/users/:id", authenticate, authorize("admin"), logActivity("UPDATE", "user"), C.updateUser);

export default router;
