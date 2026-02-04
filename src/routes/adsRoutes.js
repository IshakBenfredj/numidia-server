import express from "express";
import {
  createAd,
  getAllAds,
  getActiveAds,
  getAdById,
  updateAd,
  deleteAd,
} from "../controllers/adsController.js";
import { admin, protect } from "../middlewares/authMiddleware.js";
const router = express.Router();

router.post("/", protect, admin, createAd);
router.get("/", getAllAds);
router.get("/active", getActiveAds);
router.get("/:id", protect, admin, getAdById);
router.put("/:id", protect, admin, updateAd);
router.delete("/:id", protect, admin, deleteAd);

export default router;
