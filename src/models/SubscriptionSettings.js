import mongoose from "mongoose";

const { Schema, model } = mongoose;

const SubscriptionSettingsSchema = new Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
    },
    subscriptionsEnabled: {
      type: Boolean,
      default: false,
    },
    monthlyPrice: {
      type: Number,
      default: 2000,
    },
    yearlyPrice: {
      type: Number,
      default: 20000,
    },
    freeTrialDays: {
      type: Number,
      default: 14,
    },
    ccpNumber: {
      type: String,
      trim: true,
      default: "",
    },
    ccpName: {
      type: String,
      trim: true,
      default: "",
    },
    baridiMobRip: {
      type: String,
      trim: true,
      default: "",
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: "",
    },
    instructions: {
      type: String,
      trim: true,
      default: "",
    },
    // Home Screen Advertising Pricing & Settings (Admin-configured)
    selfAdPrice: {
      type: Number,
      default: 1500,
    },
    adminDesignAdPrice: {
      type: Number,
      default: 3000,
    },
    defaultAdDurationDays: {
      type: Number,
      default: 7,
    },
    adNotificationIntervalHours: {
      type: Number,
      default: 24,
    },
    adDimensionsGuide: {
      type: String,
      trim: true,
      default: "1200 × 750 بكسل (نسبة 16:10 أفقية)",
    },
    // App Version & Google Play Store Update Banner Config
    latestAndroidVersion: {
      type: String,
      trim: true,
      default: "1.0.0",
    },
    latestAndroidBuildNumber: {
      type: Number,
      default: 1,
    },
    playStoreUrl: {
      type: String,
      trim: true,
      default:
        "https://play.google.com/store/apps/details?id=com.numidia.numidia",
    },
    updateTitle: {
      type: String,
      trim: true,
      default: "تحديث جديد متوفر لتطبيق نوميديا",
    },
    updateMessage: {
      type: String,
      trim: true,
      default:
        "يتوفر إصدار جديد من التطبيق يتضمن تحسينات مهمة وميزات جديدة. يرجى التحديث الآن من متجر جوجل للحصول على أفضل تجربة.",
    },
    forceUpdate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default model("SubscriptionSettings", SubscriptionSettingsSchema);
