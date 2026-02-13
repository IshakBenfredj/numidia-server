import User from "../models/User.js";
import jwt from "jsonwebtoken";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};

const sendResponse = (res, statusCode, message, user = null, token = true) => {
  const response = {
    success: statusCode === 200 || statusCode === 201 ? true : false,
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
        logo: user.logo || null,
        businessName: user.businessName || null,
        commissionRate: user.commissionRate || null,
      },
      ...(token && { token: generateToken(user._id) }),
    };
  }

  res.status(statusCode).json(response);
};

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, phone, password, address } = req.body;

    // 1. التحقق من الحقول الأساسية المطلوبة
    if (!phone || !password) {
      return sendResponse(res, 400, "رقم الهاتف وكلمة المرور مطلوبان");
    }

    if (!name?.trim()) {
      return sendResponse(res, 400, "الاسم مطلوب");
    }

    const cleanPhone = phone.trim().replace(/[^\d+]/g, "");

    if (!/^(?:0[5-7]\d{8}|\+213[5-7]\d{8})$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف يجب أن يكون رقم جوال جزائري صالح",
      });
    }

    // 4. التحقق من طول كلمة المرور (السكيما تطلب 6 على الأقل)
    if (password.length < 6) {
      return sendResponse(res, 400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    }

    const existingUser = await User.findOne({ phone: cleanPhone });
    if (existingUser) {
      return sendResponse(res, 409, "رقم الهاتف مسجل مسبقًا");
    }

    const user = await User.create({
      name: name.trim(),
      phone: cleanPhone,
      password,
      address: address ? address.trim() : undefined,
      // role: سيبقى افتراضيًا "trader" حسب السكيما
      // isActive: سيبقى true افتراضيًا
    });

    // 7. الرد الناجح
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

// POST /api/auth/push-token
// export const savePushToken = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const { expoPushToken } = req.body;

//     if (!expoPushToken) {
//       return res.status(400).json({
//         status: "fail",
//         message: "Expo push token is required",
//       });
//     }

//     await User.findByIdAndUpdate(userId, {
//       $addToSet: { tokens: expoPushToken },
//     });

//     res.json({
//       status: "success",
//       message: "Push token saved",
//     });
//   } catch (error) {
//     console.error("Save Push Token Error:", error);
//     res.status(500).json({
//       status: "fail",
//       message: "Failed to save push token",
//     });
//   }
// };
