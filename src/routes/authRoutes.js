import express from "express";
import {
  register,
  login,
  getMe,
  // savePushToken,
} from "../controllers/authController.js";
import { admin, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
// router.post("/push-token", protect, savePushToken);
router.get("/me", protect, getMe);

export default router;
