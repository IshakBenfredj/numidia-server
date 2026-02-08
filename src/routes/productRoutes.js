import express from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,
  getAllProducts,
  getProductsBySupplier,
} from "../controllers/productController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.get("/all", getAllProducts);
router.get("/", protect, getMyProducts);
router.get("/supplier/:id", protect, getProductsBySupplier);
router.post("/", protect, createProduct);
router.put("/:id", protect, updateProduct);
router.delete("/:id", protect, deleteProduct);
export default router;
