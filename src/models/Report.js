import mongoose from "mongoose";

const { Schema, model } = mongoose;

const ReportSchema = new Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "الطلب مطلوب"],
    },
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
    reportedItems: [
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
        action: {
          type: String,
          enum: ["exchange", "retour"],
          required: [true, "نوع الإجراء مطلوب (تبادل أو استرداد)"],
        },
      },
    ],
    images: {
      type: [String],
      validate: {
        validator: function (arr) {
          return arr.length <= 2;
        },
        message: "يمكن إرفاق صورتين كحد أقصى لإثبات الضرر",
      },
      default: [],
    },
    totalRetourAmount: {
      type: Number,
      default: 0,
      min: [0, "لا يمكن أن يكون المبلغ الإجمالي للاسترداد سالباً"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "processed", "delivered"],
      default: "pending",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "الملاحظات لا تتجاوز 500 حرف"],
      default: "",
    },
    supplierNote: {
      type: String,
      trim: true,
      maxlength: [500, "رد المورد لا يتجاوز 500 حرف"],
      default: "",
    },
    disputeEscalated: {
      type: Boolean,
      default: false,
    },
    disputeNote: {
      type: String,
      trim: true,
      maxlength: [500, "تفاصيل التصعيد لا تتجاوز 500 حرف"],
      default: "",
    },
    linkedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ReportSchema.index({ order: 1, createdAt: -1 });
ReportSchema.index({ supplier: 1, status: 1, createdAt: -1 });
ReportSchema.index({ trader: 1, supplier: 1, status: 1 });
ReportSchema.index({ disputeEscalated: 1, createdAt: -1 });

// Pre-save hook to calculate totalRetourAmount
ReportSchema.pre("save", async function () {
  let totalRetour = 0;

  const order = await mongoose.model("Order").findById(this.order);
  if (!order) {
    throw new Error("الطلب غير موجود");
  }

  if (order.status !== "delivered") {
    throw new Error("لا يمكن طلب الاسترجاع إلا على الطلبات المُسلّمة");
  }

  for (const item of this.reportedItems) {
    const orderedProduct = order.products.find(
      (p) => p.product.toString() === item.product.toString()
    );

    if (!orderedProduct) {
      throw new Error(`المنتج ${item.product} غير موجود في الطلب`);
    }

    if (item.quantity > orderedProduct.quantity) {
      throw new Error(
        `الكمية المحددة لـ ${item.product} تتجاوز الكمية المطلوبة`
      );
    }

    if (item.action === "retour") {
      totalRetour += item.quantity * orderedProduct.priceAtOrder;
    }
  }

  this.totalRetourAmount = totalRetour;
});

export default model("Report", ReportSchema);
