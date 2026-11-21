import express from "express";
import {
  broadcastNotification,
  getNotificationHistory,
  getPushStatus,
} from "../controllers/notificationController.js";
import { protect, admin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/broadcast", protect, admin, broadcastNotification);
router.get("/history", protect, admin, getNotificationHistory);
router.get("/status", protect, admin, getPushStatus);

export default router;
