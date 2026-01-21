import express from "express";
import {
  createOrder,
  confirmOrder,
  getSupplierOrders,
  getTraderOrders,
  updateOrderStatus,
  getAllOrders,
  getOrderById,
  deleteOrder,
} from "../controllers/orderController.js";

import { protect, admin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createOrder);

router.put("/:id/confirm", protect, admin, confirmOrder);

router.get("/supplier", protect, getSupplierOrders);

router.get("/my-orders", protect, getTraderOrders);

router.get("/all", protect, admin, getAllOrders);

router.get("/:id", protect, getOrderById);

router.put("/:id/status", protect, admin, updateOrderStatus);

router.delete("/:id", protect, deleteOrder); 

export default router;
