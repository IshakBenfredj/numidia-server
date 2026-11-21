import express from "express";
import {
  getAdminDashboardAnalytics,
  getPendingOrdersCount,
  getPendingReportsCount,
  getNewUsersToday,
  getDashboardAnalyticsTabs,
  getPopularCategories,
} from "../controllers/analyticsController.js";

import { protect, admin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public algorithm-based popular categories
router.get("/popular-categories", getPopularCategories);

// Main dashboard endpoint (recommended - one call gets everything)
router.get("/dashboard", protect, admin, getAdminDashboardAnalytics);
router.get("/tabs", protect, getDashboardAnalyticsTabs);

// Optional granular endpoints
router.get("/pending-orders", protect, admin, getPendingOrdersCount);
router.get("/pending-reports", protect, admin, getPendingReportsCount);
router.get("/new-users-today", protect, admin, getNewUsersToday);

export default router;
