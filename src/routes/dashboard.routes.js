import { Router } from "express";
import * as C from "../controllers/dashboard.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();
router.use(authenticate);
router.get("/", C.getDashboard);

export default router;
