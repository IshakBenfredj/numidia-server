// models/Product.js
import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const ProductSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "اسم المنتج مطلوب"],
      unique: true,
      trim: true,
      minlength: [2, "الاسم قصير جداً"],
      maxlength: [100, "الاسم طويل جداً"],
    },
    price: {
      type: Number,
      required: [true, "السعر مطلوب"],
      min: [0, "السعر لا يمكن أن يكون سالباً"],
    },
    oldPrice: {
      type: Number,
      min: [0, "السعر القديم لا يمكن أن يكون سالباً"],
    },
    quantity: {
      type: Number,
      required: [true, "الكمية مطلوبة"],
      min: [0, "الكمية لا يمكن أن تكون سالبة"],
      default: 0,
    },
    minQuantity: {
      type: Number,
      required: [true, "أقل كمية للبيع مطلوبة"],
      min: [1, "أقل كمية يجب أن تكون 1 على الأقل"],
      default: 1,
    },
    category: {
      type: String,
      required: [true, "الفئة مطلوبة"],
    },
    images: {
      type: [String],
      validate: {
        validator: function (arr) {
          return arr.length <= 5;
        },
        message: "يمكن إضافة 5 صور كحد أقصى",
      },
      default: [],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "الوصف طويل جداً (حد أقصى 1000 حرف)"],
      default: "",
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default models.Product || model("Product", ProductSchema);
