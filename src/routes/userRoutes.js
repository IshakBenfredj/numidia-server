import express from "express";
import multer from "multer";
import {
  createSupplierByAdmin,
  editSupplierByAdmin,
  adminUpdateUserById,
  getAllUsers,
  deleteUser,
  getUserById,
  getSupplierById,
  getUsersByType,
  updateTraderProfile,
  changeTraderPassword,
  updateUserKycStatus,
  submitKycDocuments,
} from "../controllers/userController.js";
import { admin, optionalProtect, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const optionalLogoMultipart = (req, res, next) => {
  if (req.is("multipart/form-data")) {
    return uploadLogo.single("logo")(req, res, next);
  }
  next();
};

router.post("/supplier", protect, admin, optionalLogoMultipart, createSupplierByAdmin);
router.get("/supplier/type/:type", optionalProtect, getUsersByType);
router.put("/supplier/:id", protect, admin, optionalLogoMultipart, editSupplierByAdmin);
router.get("/", protect, admin, getAllUsers);
router.get("/supplier/:id", protect, admin, getSupplierById);
router.put("/me", protect, updateTraderProfile);
router.put("/me/password", protect, changeTraderPassword);
router.put("/me/kyc", protect, submitKycDocuments);
router.get("/:id", protect, getUserById);
router.put("/:id", protect, admin, optionalLogoMultipart, adminUpdateUserById);
router.delete("/:id", protect, admin, deleteUser);
router.put("/:id/kyc-status", protect, admin, updateUserKycStatus);

export default router;
