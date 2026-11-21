import express from "express";
const router = express.Router();

import {
  createReport,
  getReportsByOrder,
  getMyReports,
  updateReportStatus,
  getPendingReports,
  deleteReport,
  getReportById,
  getAllReports,
} from "../controllers/reportController.js";

import { protect, admin } from "../middlewares/authMiddleware.js";

// Trader routes
router.post("/", protect, createReport);
router.get("/", protect, getAllReports);
router.get("/my-reports", protect, getMyReports);
router.get("/order/:orderId", protect, getReportsByOrder);

// Report status update (Supplier who owns the report or Admin)
router.get("/pending", protect, admin, getPendingReports);
router.get("/:reportId", protect, getReportById);
router.put("/:reportId/status", protect, updateReportStatus);
router.delete("/:reportId", protect, deleteReport);

export default router;
