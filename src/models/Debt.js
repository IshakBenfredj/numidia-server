import mongoose from "mongoose";

const { Schema, model } = mongoose;

const DebtSchema = new Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "المورد مطلوب"],
    },
    totalAmount: {
      type: Number,
      required: [true, "المبلغ الكلي مطلوب"],
      default: 0,
      min: [0, "المبلغ لا يمكن أن يكون سالباً"],
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: Date,
  },
  {
    timestamps: true,
  },
);

export default model("Debt", DebtSchema);
