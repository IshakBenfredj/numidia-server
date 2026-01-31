import mongoose from "mongoose";

const { Schema, model } = mongoose;

const OrderSchema = new Schema(
  {
    trader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "التاجر مطلوب"],
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "المورد مطلوب"],
    },
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: [true, "المنتج مطلوب"],
        },
        quantity: {
          type: Number,
          required: [true, "الكمية مطلوبة"],
          min: [1, "يجب أن تكون الكمية على الأقل 1"],
        },
        priceAtOrder: {
          type: Number,
          required: [true, "السعر عند الطلب مطلوب"],
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: [true, "المبلغ الإجمالي مطلوب"],
      min: [0, "لا يمكن أن يكون المبلغ الإجمالي سالبًا"],
    },
    deductedRetour: {
      type: Number,
      default: 0,
      min: [0, "لا يمكن أن يكون مبلغ الخصم سالبًا"],
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "shipped", "delivered", "cancelled", "retour"],
      default: "pending",
    },
    deliveryPrice: {
      type: Number,
      default: 0,
      min: [0, "لا يمكن أن يكون سعر التوصيل سالبًا"],
    },
    wilaya: {
      type: String,
      required: [true, "الولاية مطلوبة"],
    },
    city: {
      type: String,
    },
    deliveryType: {
      type: String,
      enum: ["home", "office"],
      required: [true, "نوع التوصيل مطلوب"],
    },
    deliveryAddress: {
      type: String,
    },
    debt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Debt",
    },
    linkedReports: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Report",
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Virtual field: reports (all reports linked to this order)
OrderSchema.virtual("reports", {
  ref: "Report",
  localField: "_id",
  foreignField: "order",
  justOne: false, // array of reports
});

// Important: make virtuals appear in toJSON / toObject
OrderSchema.set("toObject", { virtuals: true });
OrderSchema.set("toJSON", { virtuals: true });

export default model("Order", OrderSchema);