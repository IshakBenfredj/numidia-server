import express from "express";
import {
  createOrderParcel,
  getShipmentTracking,
  getSupportedCouriers,
} from "../controllers/deliveryController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/couriers", getSupportedCouriers);
router.post("/create-parcel", protect, createOrderParcel);
router.get("/track/:trackingNumber", protect, getShipmentTracking);

export default router;
