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
      default: "1200 × 600 بكسل (نسبة 2:1 أفقية)",
    },
  },
  { timestamps: true },
);

export default model("SubscriptionSettings", SubscriptionSettingsSchema);
