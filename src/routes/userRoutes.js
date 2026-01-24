import express from "express";
import {
  createSupplierByAdmin,
  editSupplierByAdmin,
  getAllUsers,
  deleteUser,
  getUserById,
  getSupplierById,
} from "../controllers/userController.js";
import { admin, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/supplier", protect, admin, createSupplierByAdmin);
router.put("/supplier/:id", protect, admin, editSupplierByAdmin);
router.get("/", protect, admin, getAllUsers);
router.get("/supplier/:id", protect, admin, getSupplierById);
router.get("/:id", protect, admin, getUserById);
router.delete("/:id", protect, admin, deleteUser);

export default router;
