import express from "express";
import {
  createAd,
  getAllAds,
  getActiveAds,
  getAdById,
  updateAd,
  deleteAd,
  getAdSettings,
  updateAdSettings,
  submitSupplierAdRequest,
  getMyAds,
  approveAdRequest,
  rejectAdRequest,
  notifyTradersForAd,
} from "../controllers/adsController.js";
import { admin, protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Static routes MUST come before /:id
router.get("/active", getActiveAds);
router.get("/settings", protect, getAdSettings);
router.put("/settings", protect, admin, updateAdSettings);
router.post("/supplier-request", protect, submitSupplierAdRequest);
router.get("/my-ads", protect, getMyAds);

router.post("/", protect, admin, createAd);
router.get("/", getAllAds);

router.put("/:id/approve", protect, admin, approveAdRequest);
router.put("/:id/reject", protect, admin, rejectAdRequest);
router.post("/:id/notify-traders", protect, admin, notifyTradersForAd);

router.get("/:id", protect, admin, getAdById);
router.put("/:id", protect, admin, updateAd);
router.delete("/:id", protect, admin, deleteAd);

export default router;
