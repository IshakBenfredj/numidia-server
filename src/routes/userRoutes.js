import express from "express";
import {
  createSupplierByAdmin,
  editSupplierByAdmin,
  getAllUsers,
  deleteUser,
  getUserById,
  getSupplierById,
  getUsersByType,
  updateTraderProfile,
  changeTraderPassword,
} from "../controllers/userController.js";
import { admin, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/supplier", protect, admin, createSupplierByAdmin);
router.get("/supplier/type/:type", getUsersByType);
router.put("/supplier/:id", protect, admin, editSupplierByAdmin);
router.get("/", protect, admin, getAllUsers);
router.get("/supplier/:id", protect, admin, getSupplierById);
router.get("/:id", protect, getUserById);
router.delete("/:id", protect, admin, deleteUser);
router.put("/me", protect, updateTraderProfile);
router.put("/me/password", protect, changeTraderPassword);

export default router;
