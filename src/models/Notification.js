import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const NotificationSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "عنوان الإشعار مطلوب"],
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: [true, "نص الإشعار مطلوب"],
      trim: true,
      maxlength: 500,
    },
    targetGroup: {
      type: String,
      enum: ["all", "traders", "suppliers"],
      default: "all",
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
    data: {
      type: Object,
      default: {},
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ createdAt: -1 });

export default models.Notification || model("Notification", NotificationSchema);
