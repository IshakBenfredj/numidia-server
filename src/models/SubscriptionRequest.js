import mongoose from "mongoose";

const { Schema, model } = mongoose;

const SubscriptionRequestSchema = new Schema(
  {
    supplier: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    planType: {
      type: String,
      enum: ["monthly", "yearly", "custom"],
      default: "monthly",
    },
    months: {
      type: Number,
      default: 1,
      min: 1,
    },
    amount: {
      type: Number,
      default: 0,
    },
    receiptImage: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedMonths: {
      type: Number,
      default: 0,
    },
    approvedDays: {
      type: Number,
      default: 0,
    },
    adminNote: {
      type: String,
      trim: true,
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
  { timestamps: true },
);

SubscriptionRequestSchema.index({ supplier: 1, createdAt: -1 });
SubscriptionRequestSchema.index({ status: 1, createdAt: -1 });

export default model("SubscriptionRequest", SubscriptionRequestSchema);
