import express from "express";
const router = express.Router();

import {
  createReport,
  getTraderBenefits,
  getReportsByOrder,
  getMyReports,
  updateReportStatus,
  escalateReport,
  getPendingReports,
  deleteReport,
  getReportById,
  getAllReports,
} from "../controllers/reportController.js";

import { protect, admin } from "../middlewares/authMiddleware.js";

// Static routes MUST come before /:reportId
router.post("/", protect, createReport);
router.get("/", protect, getAllReports);
router.get("/my-reports", protect, getMyReports);
router.get("/trader-benefits", protect, getTraderBenefits);
router.get("/trader-benefits/:supplierId", protect, getTraderBenefits);
router.get("/order/:orderId", protect, getReportsByOrder);
router.get("/pending", protect, admin, getPendingReports);

// Report actions
router.get("/:reportId", protect, getReportById);
router.put("/:reportId/status", protect, updateReportStatus);
router.put("/:reportId/escalate", protect, escalateReport);
router.delete("/:reportId", protect, deleteReport);

export default router;
