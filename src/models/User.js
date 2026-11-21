import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
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
    },
    commissionRate: {
      type: Number,
      default: 0,
    },
    // Subscription System (نظام الاشتراكات الشهري / السنوي مع تجربة مجانية)
    subscriptionStatus: {
      type: String,
      enum: ["trial", "active", "expired"],
      default: "trial",
    },
    subscriptionPlan: {
      type: String,
      enum: ["trial", "monthly", "yearly", "custom"],
      default: "trial",
    },
    trialEndsAt: {
      type: Date,
      default: null,
    },
    subscriptionStartDate: {
      type: Date,
      default: null,
    },
    subscriptionEndDate: {
      type: Date,
      default: null,
    },

    role: {
      type: String,
      enum: {
        values: ["trader", "supplier", "admin"],
        message: "الدور يجب أن يكون trader أو supplier أو admin",
      },
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
    // Add these fields to UserSchema
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationOtp: {
      code: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },
    passwordResetOtp: {
      code: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },
    // KYC Verification (توثيق الحسابات)
    isVerified: {
      type: Boolean,
      default: false,
    },
    kycStatus: {
      type: String,
      enum: ["unverified", "pending", "verified", "rejected"],
      default: "unverified",
    },
    commercialRegister: {
      type: String,
      trim: true,
      default: null,
    },
    taxId: {
      type: String,
      trim: true,
      default: null,
    },
    identityCardImage: {
      type: String,
      default: null,
    },
    kycNotes: {
      type: String,
      trim: true,
      default: "",
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
