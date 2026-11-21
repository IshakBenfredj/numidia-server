import express from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getMyProducts,
  getAllProducts,
  getProductsBySupplier,
  getProductsByIds,
  bulkCreateProducts,
  bulkUpdatePrices,
} from "../controllers/productController.js";
import { optionalProtect, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.get("/all", optionalProtect, getAllProducts);
router.post("/by-ids", optionalProtect, getProductsByIds);
router.get("/", protect, getMyProducts);
router.get("/supplier/:id", protect, getProductsBySupplier);
router.post("/", protect, createProduct);
router.post("/bulk", protect, bulkCreateProducts);
router.post("/bulk-prices", protect, bulkUpdatePrices);
router.put("/:id", protect, updateProduct);
router.delete("/:id", protect, deleteProduct);
export default router;
