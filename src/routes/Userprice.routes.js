import { Router } from "express";
// FIX: was ../controllers/userPrice.controller.js — file is Userprice.controller.js
import * as C from "../controllers/Userprice.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize }    from "../middleware/role.middleware.js";

const router = Router();
router.use(authenticate);

// Resolve effective price (used during invoice creation)
router.get("/resolve",                  C.resolveEffectivePrice);

// View prices
router.get("/user/:userId",             C.getPricesForUser);
router.get("/partner/:partnerId",       C.getPricesForPartner);
router.get("/variant/:variantId",       C.getPricesForVariant);

// Admin: set / remove custom prices
router.put   ("/",    authorize("admin"), C.upsertUserPrice);
router.delete("/:id", authorize("admin"), C.deleteUserPrice);

export default router;