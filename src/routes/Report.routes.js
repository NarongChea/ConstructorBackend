import { Router } from "express";
import * as C from "../controllers/report.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();
router.use(authenticate);

// Sales reports
router.get("/daily",             C.getDailySalesReport);
router.get("/monthly",           C.getMonthlySalesReport);
router.get("/yearly",            C.getYearlySalesReport);
router.get("/best-selling",      C.getBestSellingProducts);
router.get("/revenue-vs-cost",   C.getRevenueVsCost);

// Partner-specific reports
router.get("/partner-sales",     C.getPartnerSalesReport);     // invoices we issued to partners
router.get("/partner-purchases", C.getPartnerPurchasesReport); // what we bought from partners

// Spending report (suppliers + partners combined)
router.get("/spending",          C.getSpendingReport);

export default router;