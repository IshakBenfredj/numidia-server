import User from "../models/User.js";
import bcrypt from "bcryptjs";

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

    const supplier = await User.create({
      name,
      phone,
      address,
      password,
      role: "supplier",
      logo: logo || null,
      businessName,
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
    } = req.body;

    const supplier = await User.findById(id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({
        success: false,
        message: "المورد غير موجود",
      });
    }

    // تحقق من تكرار رقم الهاتف إذا تم تغييره
    if (phone && phone !== supplier.phone) {
      const existing = await User.findOne({ phone });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "رقم الهاتف مسجل لمستخدم آخر",
        });
      }
    }

    // تحديث الحقول
    supplier.name = name ?? supplier.name;
    supplier.phone = phone ?? supplier.phone;
    supplier.address = address ?? supplier.address;
    supplier.businessName = businessName ?? supplier.businessName;
    supplier.logo = logo ?? supplier.logo;
    supplier.commissionRate =
      commissionRate !== undefined ? Number(commissionRate) : supplier.commissionRate;
    supplier.isActive = isActive !== undefined ? isActive : supplier.isActive;

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
      .select("-password") // إخفاء كلمة المرور تلقائيًا
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