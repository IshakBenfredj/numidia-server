import express from "express";
import {
  register,
  login,
  getMe,
  verifyEmail,
  resendVerificationOtp,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  sendRegisterOtp,
  savePushToken,
  removePushToken,
} from "../controllers/authController.js";
import { admin, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/push-token", protect, savePushToken);
router.post("/push-token/remove", protect, removePushToken);
router.delete("/push-token", protect, removePushToken);
router.get("/me", protect, getMe);
// routes/authRoutes.js  — add these
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationOtp);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);
router.post("/send-register-otp", sendRegisterOtp);

export default router;
