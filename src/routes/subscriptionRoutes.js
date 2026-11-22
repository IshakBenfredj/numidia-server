import express from "express";
import {
  getAppVersionConfig,
  getSubscriptionSettings,
  updateSubscriptionSettings,
  getMySubscriptionStatus,
  submitSubscriptionRequest,
  getAllSubscriptionRequests,
  approveSubscriptionRequest,
  rejectSubscriptionRequest,
  getAllSuppliersSubscriptions,
  adminUpdateSupplierSubscription,
} from "../controllers/subscriptionController.js";
import { protect, admin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public endpoint so every user (including guests & unlogged screens) checks for Play Store updates
router.get("/app-version", getAppVersionConfig);

router.get("/settings", protect, getSubscriptionSettings);
router.put("/settings", protect, admin, updateSubscriptionSettings);

router.get("/my-status", protect, getMySubscriptionStatus);
router.post("/requests", protect, submitSubscriptionRequest);

router.get("/requests", protect, admin, getAllSubscriptionRequests);
router.put("/requests/:id/approve", protect, admin, approveSubscriptionRequest);
router.put("/requests/:id/reject", protect, admin, rejectSubscriptionRequest);

router.get("/suppliers", protect, admin, getAllSuppliersSubscriptions);
router.put(
  "/suppliers/:supplierId/activate",
  protect,
  admin,
  adminUpdateSupplierSubscription,
);

export default router;
