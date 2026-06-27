import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../utils/nodemailer.js";

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });

const sendResponse = (res, statusCode, message, user = null, token = true) => {
  const response = { success: statusCode < 400, message };
  if (user) {
    response.data = {
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email || null,
        emailVerified: user.emailVerified,
        role: user.role,
        address: user.address || null,
        isActive: user.isActive,
        logo: user.logo || null,
        businessName: user.businessName || null,
        commissionRate: user.commissionRate || null,
        type: user.type || null,
      },
      ...(token && { token: generateToken(user._id) }),
    };
  }
  res.status(statusCode).json(response);
};

const generateOtp = () => crypto.randomInt(100000, 999999).toString();

// In-memory store for pre-registration OTPs
// Key: email, Value: { otp, expiresAt, phone }
const pendingOtps = new Map();

// Cleanup expired entries every 15 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, val] of pendingOtps.entries()) {
    if (now > val.expiresAt) pendingOtps.delete(key);
  }
}, 15 * 60 * 1000);

// ─── SEND REGISTER OTP ───────────────────────────────────────
export const sendRegisterOtp = async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone || !email)
      return sendResponse(res, 400, "رقم الهاتف والبريد الإلكتروني مطلوبان");

    const cleanPhone = phone.trim().replace(/[^\d+]/g, "");
    if (!/^(?:0[5-7]\d{8}|\+213[5-7]\d{8})$/.test(cleanPhone))
      return sendResponse(res, 400, "رقم الهاتف يجب أن يكون رقم جوال جزائري صالح");

    if (await User.findOne({ phone: cleanPhone }))
      return sendResponse(res, 409, "رقم الهاتف مسجل مسبقًا");

    if (await User.findOne({ email: email.toLowerCase() }))
      return sendResponse(res, 409, "البريد الإلكتروني مسجل مسبقًا");

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    pendingOtps.set(email.toLowerCase(), { otp, expiresAt, phone: cleanPhone });

    await sendVerificationEmail(email, otp);
    sendResponse(res, 200, "تم إرسال كود التحقق إلى بريدك الإلكتروني");
  } catch (error) {
    console.error("Send Register OTP Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم");
  }
};

// ─── REGISTER ────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const { name, phone, password, address, email, otp } = req.body;

    if (!name?.trim()) return sendResponse(res, 400, "الاسم مطلوب");
    if (!phone || !password)
      return sendResponse(res, 400, "رقم الهاتف وكلمة المرور مطلوبان");
    if (!email || !otp)
      return sendResponse(res, 400, "البريد الإلكتروني وكود التحقق مطلوبان");

    const cleanPhone = phone.trim().replace(/[^\d+]/g, "");
    if (!/^(?:0[5-7]\d{8}|\+213[5-7]\d{8})$/.test(cleanPhone))
      return sendResponse(res, 400, "رقم الهاتف يجب أن يكون رقم جوال جزائري صالح");

    if (password.length < 6)
      return sendResponse(res, 400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل");

    // ── Verify OTP ──────────────────────────────────────────
    const pending = pendingOtps.get(email.toLowerCase());
    if (!pending)
      return sendResponse(res, 400, "لم يتم طلب كود تحقق لهذا البريد، أعد الإرسال");
    if (pending.otp !== otp)
      return sendResponse(res, 400, "الكود غير صحيح");
    if (new Date() > pending.expiresAt)
      return sendResponse(res, 400, "انتهت صلاحية الكود، أعد الإرسال");

    pendingOtps.delete(email.toLowerCase());

    // ── Final duplicate checks ───────────────────────────────
    if (await User.findOne({ phone: cleanPhone }))
      return sendResponse(res, 409, "رقم الهاتف مسجل مسبقًا");
    if (await User.findOne({ email: email.toLowerCase() }))
      return sendResponse(res, 409, "البريد الإلكتروني مسجل مسبقًا");

    const user = await User.create({
      name: name.trim(),
      phone: cleanPhone,
      password,
      address: address?.trim(),
      email: email.toLowerCase(),
      emailVerified: true, // verified via OTP before account creation
    });

    sendResponse(res, 201, "تم إنشاء الحساب بنجاح", user);
  } catch (error) {
    console.error("Register Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم");
  }
};

// ─── VERIFY EMAIL (for post-registration if needed) ──────────
export const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return sendResponse(res, 400, "البريد والكود مطلوبان");

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+emailVerificationOtp.code +emailVerificationOtp.expiresAt",
    );

    if (!user) return sendResponse(res, 404, "المستخدم غير موجود");
    if (user.emailVerified) return sendResponse(res, 400, "البريد مؤكد بالفعل");

    const { code, expiresAt } = user.emailVerificationOtp || {};
    if (!code || code !== otp) return sendResponse(res, 400, "الكود غير صحيح");
    if (new Date() > expiresAt)
      return sendResponse(res, 400, "انتهت صلاحية الكود");

    user.emailVerified = true;
    user.emailVerificationOtp = undefined;
    await user.save();

    sendResponse(res, 200, "تم تأكيد البريد الإلكتروني بنجاح", user);
  } catch (error) {
    console.error("Verify Email Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم");
  }
};

// ─── RESEND VERIFICATION OTP ─────────────────────────────────
export const resendVerificationOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return sendResponse(res, 400, "البريد الإلكتروني مطلوب");

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return sendResponse(res, 404, "المستخدم غير موجود");
    if (user.emailVerified) return sendResponse(res, 400, "البريد مؤكد بالفعل");

    const otp = generateOtp();
    user.emailVerificationOtp = {
      code: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    await user.save();

    await sendVerificationEmail(email, otp);
    sendResponse(res, 200, "تم إرسال كود جديد");
  } catch (error) {
    console.error("Resend OTP Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم");
  }
};

// ─── FORGOT PASSWORD ─────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return sendResponse(res, 400, "البريد الإلكتروني مطلوب");

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return sendResponse(res, 404, "لا يوجد حساب مرتبط بهذا البريد الإلكتروني");

    const otp = generateOtp();
    user.passwordResetOtp = {
      code: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    await user.save();

    await sendPasswordResetEmail(email, otp);
    sendResponse(res, 200, "تم إرسال كود إعادة تعيين كلمة المرور إلى بريدك");
  } catch (error) {
    console.error("Forgot Password Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم");
  }
};

// ─── VERIFY RESET OTP ────────────────────────────────────────
export const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return sendResponse(res, 400, "البريد والكود مطلوبان");

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+passwordResetOtp.code +passwordResetOtp.expiresAt",
    );

    if (!user) return sendResponse(res, 404, "المستخدم غير موجود");

    const { code, expiresAt } = user.passwordResetOtp || {};
    if (!code || code !== otp) return sendResponse(res, 400, "الكود غير صحيح");
    if (new Date() > expiresAt)
      return sendResponse(res, 400, "انتهت صلاحية الكود");

    const resetToken = jwt.sign(
      { id: user._id, purpose: "reset" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    // Clear OTP after successful verification
    user.passwordResetOtp = undefined;
    await user.save();

    res.status(200).json({ success: true, message: "الكود صحيح", resetToken });
  } catch (error) {
    console.error("Verify Reset OTP Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم");
  }
};

// ─── RESET PASSWORD ──────────────────────────────────────────
export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword)
      return sendResponse(res, 400, "البيانات مطلوبة");
    if (newPassword.length < 6)
      return sendResponse(res, 400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل");

    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return sendResponse(res, 400, "رمز إعادة التعيين غير صالح أو منتهي");
    }

    if (payload.purpose !== "reset")
      return sendResponse(res, 400, "رمز غير صالح");

    const user = await User.findById(payload.id);
    if (!user) return sendResponse(res, 404, "المستخدم غير موجود");

    user.password = newPassword;
    await user.save();

    sendResponse(res, 200, "تم تغيير كلمة المرور بنجاح", user);
  } catch (error) {
    console.error("Reset Password Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم");
  }
};

// ─── LOGIN ───────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password)
      return sendResponse(res, 400, "رقم الهاتف وكلمة المرور مطلوبان");

    const user = await User.findOne({ phone }).select("+password");

    if (!user || !(await user.comparePassword(password)))
      return sendResponse(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");

    if (user.role !== "admin" && !user.isActive)
      return sendResponse(res, 403, "الحساب غير مفعل، تواصل مع الإدارة");

    sendResponse(res, 200, "", user);
  } catch (error) {
    console.error("Login Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم، يرجى المحاولة لاحقًا");
  }
};

// ─── GET ME ──────────────────────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return sendResponse(res, 404, "المستخدم غير موجود");
    sendResponse(res, 200, "", user, false);
  } catch (error) {
    console.error("Get Me Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم، يرجى المحاولة لاحقًا");
  }
};

// ─── SAVE PUSH TOKEN ──────────────────────────────────────────
export const savePushToken = async (req, res) => {
  try {
    const { expoPushToken } = req.body;
    if (!expoPushToken) {
      return res.status(400).json({ success: false, message: "رمز الإشعار مطلوب" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    if (!user.tokens.includes(expoPushToken)) {
      user.tokens.push(expoPushToken);
      await user.save();
    }

    res.status(200).json({ success: true, message: "تم حفظ رمز الإشعار بنجاح" });
  } catch (error) {
    console.error("Save Push Token Error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
};