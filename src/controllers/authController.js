import User from "../models/User.js";
import jwt from "jsonwebtoken";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};

const sendResponse = (res, statusCode, message, user = null, token = true) => {
  const response = {
    status: statusCode === 200 || statusCode === 201 ? "success" : "fail",
    message,
  };

  if (user) {
    response.data = {
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        address: user.address || null,
        isActive: user.isActive,
        storeLogo: user.storeLogo || null,
        businessName: user.businessName || null,
        commissionRate: user.commissionRate || null,
        pendingCommissions: user.pendingCommissions || 0,
      },
      ...(token && { token: generateToken(user._id) }),
    };
  }

  res.status(statusCode).json(response);
};

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, phone, address, password } = req.body;

    if (!phone || !password) {
      return sendResponse(res, 400, "رقم الهاتف وكلمة المرور مطلوبان");
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return sendResponse(res, 409, "رقم الهاتف مسجل مسبقًا");
    }

    const user = await User.create({
      name: name || "مستخدم جديد",
      phone,
      address,
      password,
    });

    sendResponse(res, 201, "تم إنشاء الحساب بنجاح", user);
  } catch (error) {
    console.error("Register Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم، يرجى المحاولة لاحقًا");
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return sendResponse(res, 400, "رقم الهاتف وكلمة المرور مطلوبان");
    }

    const user = await User.findOne({ phone }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return sendResponse(res, 401, "رقم الهاتف أو كلمة المرور غير صحيحة");
    }

    if (user.role !== "admin" && !user.isActive) {
      return sendResponse(res, 403, "الحساب غير مفعل، تواصل مع الإدارة");
    }

    sendResponse(res, 200, "", user);
  } catch (error) {
    console.error("Login Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم، يرجى المحاولة لاحقًا");
  }
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return sendResponse(res, 404, "المستخدم غير موجود");
    }

    sendResponse(res, 200, "", user, false);
  } catch (error) {
    console.error("Get Me Error:", error);
    sendResponse(res, 500, "حدث خطأ في الخادم، يرجى المحاولة لاحقًا");
  }
};