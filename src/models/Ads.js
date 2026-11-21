import mongoose from "mongoose";

const { Schema, model } = mongoose;

const AdsSchema = new Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [120, "العنوان لا يتجاوز 120 حرف"],
      default: "إعلان",
    },
    image: {
      url: { type: String, default: "" },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    clickUrl: {
      type: String,
      trim: true,
      default: "",
    },
    // Supplier ad request & approval fields
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    creationMode: {
      type: String,
      enum: ["self_made", "admin_design", "admin_direct"],
      default: "admin_direct",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    // What tapping the ad opens on Trader Home
    targetType: {
      type: String,
      enum: [
        "product",
        "product_collection",
        "supplier_profile",
        "external_url",
        "none",
      ],
      default: "none",
    },
    targetProduct: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    targetProducts: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    targetSupplier: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Supplier instructions & payment receipt
    designNotes: {
      type: String,
      trim: true,
      maxlength: [1000, "ملاحظات التصميم لا تتجاوز 1000 حرف"],
      default: "",
    },
    referenceImage: {
      type: String,
      default: "",
    },
    receiptImage: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      default: 0,
    },
    durationDays: {
      type: Number,
      default: 7,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    // Periodic push notifications to Traders ONLY
    notifyTradersPeriodically: {
      type: Boolean,
      default: true,
    },
    notificationIntervalHours: {
      type: Number,
      default: 24,
    },
    lastNotifiedAt: {
      type: Date,
      default: null,
    },
    notificationsSentCount: {
      type: Number,
      default: 0,
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: [500, "ملاحظة الإدارة لا تتجاوز 500 حرف"],
      default: "",
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

AdsSchema.index({ approvalStatus: 1, createdAt: -1 });
AdsSchema.index({ isActive: 1, expiresAt: 1 });
AdsSchema.index({ supplier: 1, createdAt: -1 });

export default model("Ads", AdsSchema);
