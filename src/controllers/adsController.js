import Ads from "../models/Ads.js";
import { uploadImageFromBase64, deleteImage } from "../utils/cloudinary.js";
import mongoose from "mongoose";

// CREATE - Upload new ad with image (base64)
export const createAd = async (req, res) => {
  try {
    const { title, imageBase64, clickUrl, isActive } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: "صورة الإعلان (base64) مطلوبة",
      });
    }

    // Upload image to Cloudinary
    const uploadedImage = await uploadImageFromBase64(imageBase64);

    const ad = await Ads.create({
      title: title || "إعلان جديد",
      image: {
        url: uploadedImage.url,
        public_id: uploadedImage.public_id,
      },
      clickUrl: clickUrl || null,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      message: "تم إنشاء الإعلان بنجاح",
      ad,
    });
  } catch (error) {
    console.error("Create Ad Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل إنشاء الإعلان",
    });
  }
};

// READ ALL - Get all ads (admin or public)
export const getAllAds = async (req, res) => {
  try {
    const ads = await Ads.find().sort({ createdAt: -1 }).select("-__v").lean();

    res.status(200).json({
      success: true,
      count: ads.length,
      ads,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الإعلانات",
    });
  }
};

export const getActiveAds = async (req, res) => {
  try {
    const ads = await Ads.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: ads.length,
      ads,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الإعلانات",
    });
  }
};

// READ ONE
export const getAdById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id).select("-__v").lean();

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    res.status(200).json({
      success: true,
      ad,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الإعلان",
    });
  }
};

// UPDATE - Can replace image or update other fields
export const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, imageBase64, clickUrl, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id);

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    let updatedImage = ad.image;

    // If new image provided → upload & delete old one
    if (imageBase64) {
      const newImage = await uploadImageFromBase64(imageBase64);
      // Delete old image if exists
      if (ad.image?.public_id) {
        await deleteImage(ad.image.public_id).catch((err) =>
          console.error("Failed to delete old ad image:", err),
        );
      }
      updatedImage = {
        url: newImage.url,
        public_id: newImage.public_id,
      };
    }

    const updatedAd = await Ads.findByIdAndUpdate(
      id,
      {
        title: title !== undefined ? title : ad.title,
        image: updatedImage,
        clickUrl: clickUrl !== undefined ? clickUrl : ad.clickUrl,
        isActive: isActive !== undefined ? isActive : ad.isActive,
      },
      { new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      message: "تم تحديث الإعلان بنجاح",
      ad: updatedAd,
    });
  } catch (error) {
    console.error("Update Ad Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل تحديث الإعلان",
    });
  }
};

// DELETE
export const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id);

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    // Delete image from Cloudinary
    if (ad.image?.public_id) {
      await deleteImage(ad.image.public_id).catch((err) =>
        console.error("Failed to delete ad image:", err),
      );
    }

    await Ads.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "تم حذف الإعلان بنجاح",
    });
  } catch (error) {
    console.error("Delete Ad Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل حذف الإعلان",
    });
  }
};
