import express from "express";
const router = express.Router();

import {
  createReport,
  getReportsByOrder,
  getMyReports,
  updateReportStatus,
  getPendingReports,
  deleteReport,
} from "../controllers/reportController.js";

import { protect, admin } from "../middlewares/authMiddleware.js";

// Trader routes
router.post("/", protect, createReport);
router.get("/my-reports", protect, getMyReports);
router.get("/order/:orderId", protect, getReportsByOrder);

// Admin only routes
router.get("/pending", protect, admin, getPendingReports);
router.put("/:reportId/status", protect, admin, updateReportStatus);
router.delete("/:reportId", protect, deleteReport);

export default router;
