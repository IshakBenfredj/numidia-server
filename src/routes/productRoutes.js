import express from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,
  getAllProducts,
} from "../controllers/productController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.get("/all", getAllProducts);
router.get("/", protect, getMyProducts);
router.post("/", protect, createProduct);
router.put("/:id", protect, updateProduct);
router.delete("/:id", protect, deleteProduct);
export default router;
