import mongoose from "mongoose";

const { Schema, model } = mongoose;

const AdsSchema = new Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [100, "العنوان لا يتجاوز 100 حرف"],
      default: "إعلان",
    },
    image: {
      type: {
        url: { type: String, required: [true, "الصورة مطلوبة"] },
      },
      required: [true, "صورة الإعلان مطلوبة"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    clickUrl: {
      type: String,
      trim: true,
      // Optional: link to redirect when clicking the ad
    },
  },
  {
    timestamps: true,
  }
);

export default model("Ads", AdsSchema);