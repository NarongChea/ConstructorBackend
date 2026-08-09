import express      from "express";
import helmet       from "helmet";
import cors         from "cors";
import morgan       from "morgan";
import cookieParser from "cookie-parser";
import rateLimit    from "express-rate-limit";

import authRoutes        from "./routes/auth.routes.js";
import categoryRoutes    from "./routes/category.routes.js";
import locationRoutes    from "./routes/location.routes.js";
import productRoutes     from "./routes/product.routes.js";
import variantRoutes     from "./routes/variant.routes.js";
import stockRoutes       from "./routes/stock.routes.js";
import invoiceRoutes     from "./routes/invoice.routes.js";
import employeeRoutes    from "./routes/employee.routes.js";
import salaryRoutes      from "./routes/salary.routes.js";
import debtRoutes        from "./routes/debt.routes.js";
import supplierRoutes    from "./routes/supplier.routes.js";
import purchaseRoutes    from "./routes/purchase.routes.js";
import dashboardRoutes   from "./routes/dashboard.routes.js";
import reportRoutes      from "./routes/report.routes.js";
import activityLogRoutes from "./routes/activityLog.routes.js";
// ── New routes added in this update ──────────────────────────────────────────
// FIX: filenames are case-sensitive on Linux; match exact filenames on disk
import unitTypeRoutes    from "./routes/Unittype.routes.js";   // was: unitType.routes.js
import partnerRoutes     from "./routes/Partner.routes.js";    // was: partner.routes.js
import userPriceRoutes   from "./routes/Userprice.routes.js";  // was: userPrice.routes.js
import settingRoutes     from "./routes/setting.routes.js";    // NEW: exchange rate + global settings
import { errorHandler }  from "./middleware/errorHandler.middleware.js";
import invoiceRouter from './routes/invoice.routes.js'

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: 'https://narongchea.github.io', // your frontend
  credentials: true
}))

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  message:  { success: false, message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use("/api", limiter);

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Server is running", timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",          authRoutes);
app.use("/api/categories",    categoryRoutes);
app.use("/api/locations",     locationRoutes);
app.use("/api/products",      productRoutes);
app.use("/api/variants",      variantRoutes);
app.use("/api/stock",         stockRoutes);
app.use("/api/invoices",      invoiceRoutes);
app.use("/api/employees",     employeeRoutes);
app.use("/api/salaries",      salaryRoutes);
app.use("/api/debts",         debtRoutes);
app.use("/api/suppliers",     supplierRoutes);
app.use("/api/purchases",     purchaseRoutes);
app.use("/api/dashboard",     dashboardRoutes);
app.use("/api/reports",       reportRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use('/api/invoices', invoiceRouter)
// ── New ───────────────────────────────────────────────────────────────────────
app.use("/api/unit-types",    unitTypeRoutes);  // GET/POST/PATCH/DELETE unit types & measurements
app.use("/api/partners",      partnerRoutes);   // partner CRUD + balance + transactions
app.use("/api/user-prices",   userPriceRoutes); // custom per-user/partner prices
app.use("/api/settings",      settingRoutes);   // exchange rate + global settings

// ── 404 handler ───────────────────────────────────────────────────────────────
app.all("*", (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;