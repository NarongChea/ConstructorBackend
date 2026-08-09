import { Router } from "express";
import * as C from "../controllers/setting.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();
router.use(authenticate);

router.get ("/",               C.getSettings);
router.get ("/exchange-rate",  C.getExchangeRate);
router.put ("/exchange-rate",  C.updateExchangeRate);

export default router;