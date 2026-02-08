import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    phone: {
      type: String,
      required: [true, "رقم الهاتف مطلوب"],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "كلمة المرور مطلوبة"],
      minlength: [6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"],
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, "الاسم لا يمكن أن يتجاوز 100 حرف"],
    },
    address: {
      type: String,
      required: function () {
        return this.role !== "admin";
      },
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: function () {
        return this.role !== "admin";
      },
    },

    logo: {
      type: String,
      default: null,
    },
    businessName: {
      type: String,
      trim: true,
      required: function () {
        return this.role === "supplier";
      },
      maxlength: [150, "اسم النشاط التجاري لا يمكن أن يتجاوز 150 حرف"],
    },
    commissionRate: {
      type: Number,
      min: [0, "نسبة العمولة لا يمكن أن تكون سالبة"],
      max: [1, "نسبة العمولة لا يمكن أن تتجاوز 100%"],
      default: 0.05,
      required: function () {
        return this.role === "supplier";
      },
    },

    role: {
      type: String,
      enum: {
        values: ["trader", "supplier", "admin"],
        message: "الدور يجب أن يكون trader أو supplier أو admin",
      },
      required: [true, "الدور مطلوب"],
      default: "trader",
    },
    type: {
      type: String,
      enum: {
        values: ["accessoire", "spart_parts"],
        message: "نوع المستخدم يجب أن يكون accessoire أو spart parts",
      },
      required: function () {
        return this.role === "supplier";
      },
    },
    tokens: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

UserSchema.index({ phone: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });

export default model("User", UserSchema);
