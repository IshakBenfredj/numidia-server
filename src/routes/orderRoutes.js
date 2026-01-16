import express from "express";
import {
  createOrder,
  confirmOrder,
  getSupplierOrders,
  getTraderOrders,
  updateOrderStatus,
  getAllOrders,
} from "../controllers/orderController.js";

import { protect, admin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createOrder);

router.put("/:id/confirm", protect, admin, confirmOrder);

router.get("/supplier", protect, getSupplierOrders);

router.get("/my-orders", protect, getTraderOrders);

router.get("/all", protect, admin, getAllOrders);

router.pull("/:id/status", protect, admin, updateOrderStatus);

export default router;
