import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { deleteImage, uploadImageFromBase64 } from "../utils/cloudinary.js";
import Debt from "../models/Debt.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

// POST /api/users/supplier
export const createSupplierByAdmin = async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      password,
      logo,
      businessName,
      commissionRate = 0.05,
      type
    } = req.body;

    if (!name || !phone || !password || !address || !businessName) {
      return res.status(400).json({
        success: false,
        message: "جميع الحقول مطلوبة: الاسم، الهاتف، العنوان، اسم النشاط، كلمة المرور",
      });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "رقم الهاتف مسجل مسبقًا",
      });
    }

    const logoUrl = await uploadImageFromBase64(logo);

    const supplier = await User.create({
      name,
      phone,
      address,
      password,
      role: "supplier",
      logo: logoUrl.url || null,
      businessName,
      type,
      commissionRate: Number(commissionRate),
      isActive: true,
    });

    // إخفاء كلمة المرور من الاستجابة
    const { password: _, ...supplierWithoutPassword } = supplier.toObject();

    res.status(201).json({
      success: true,
      message: "تم إنشاء حساب المورد بنجاح",
      data: supplierWithoutPassword,
    });
  } catch (error) {
    console.error("Create Supplier Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم، يرجى المحاولة لاحقًا",
    });
  }
};

// PUT /api/users/supplier/:id
export const editSupplierByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      address,
      password,
      logo,
      businessName,
      commissionRate,
      isActive,
      type
    } = req.body;

    const supplier = await User.findById(id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({
        success: false,
        message: "المورد غير موجود",
      });
    }

    if (phone && phone !== supplier.phone) {
      const existing = await User.findOne({ phone });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "رقم الهاتف مسجل لمستخدم آخر",
        });
      }
    }

    if (logo && logo.startsWith("data:")) {
      const logoUrl = await uploadImageFromBase64(logo);
      await deleteImage(supplier.logo);
      supplier.logo = logoUrl.url;
    }

    // تحديث الحقول
    supplier.name = name ?? supplier.name;
    supplier.phone = phone ?? supplier.phone;
    supplier.address = address ?? supplier.address;
    supplier.businessName = businessName ?? supplier.businessName;
    supplier.commissionRate =
      commissionRate !== undefined ? Number(commissionRate) : supplier.commissionRate;
    supplier.isActive = isActive !== undefined ? isActive : supplier.isActive;
    supplier.type = type ?? supplier.type;

    if (password) {
      supplier.password = await bcrypt.hash(password, 12);
    }

    await supplier.save();

    const { password: _, ...supplierWithoutPassword } = supplier.toObject();

    res.status(200).json({
      success: true,
      message: "تم تعديل المورد بنجاح",
      data: supplierWithoutPassword,
    });
  } catch (error) {
    console.error("Edit Supplier Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم",
    });
  }
};

// GET /api/users/supplier/:id
export const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await User.findById(id);

    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({
        success: false,
        message: "المورد غير موجود",
      });
    }
    const debts = await Debt.findOne({ supplier: id, isPaid: false });
    const ordersCount = await Order.countDocuments({ supplier: id });
    const productsCount = await Product.countDocuments({ supplier: id });

    supplier._doc.debts = debts.totalAmount;
    supplier._doc.ordersCount = ordersCount;
    supplier._doc.productsCount = productsCount;
    res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    console.error("Get Supplier By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب بيانات المورد",
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password").lean();;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }
    const ordersCount = await Order.countDocuments({trader : id})
    user.ordersCount = ordersCount
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get User By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب بيانات المستخدم",
    });
  }
};

// GET /api/users
export const getAllUsers = async (req, res) => {
  try {
    const { search, role, isActive } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { businessName: { $regex: search, $options: "i" } },
      ];
    }

    if (role && role !== "all") {
      query.role = role;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      results: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Get All Users Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب المستخدمين",
    });
  }
};

// DELETE /api/users/:id
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "لا يمكن حذف حساب الإدارة",
      });
    }

    await User.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "تم حذف المستخدم بنجاح",
    });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في حذف المستخدم",
    });
  }
};