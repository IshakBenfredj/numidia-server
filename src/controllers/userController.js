import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { deleteImage, uploadImageFromBase64 } from "../utils/cloudinary.js";
import Debt from "../models/Debt.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";
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
      type,
    } = req.body;

    if (!name?.trim() || !phone?.trim() || !password || !address?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "الحقول التالية مطلوبة: الاسم، رقم الهاتف، كلمة المرور، العنوان ",
      });
    }

    if (!type || !["accessoire", "spart_parts"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "نوع المورد مطلوب ويجب أن يكون: accessoire أو spart_parts",
      });
    }

    const cleanPhone = phone.trim().replace(/[^\d+]/g, "");

    if (!/^(?:0[5-7]\d{8}|\+213[5-7]\d{8})$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف يجب أن يكون رقم جوال جزائري صالح",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      });
    }

    if (
      Number.isNaN(Number(commissionRate)) ||
      commissionRate < 0 ||
      commissionRate > 1
    ) {
      return res.status(400).json({
        success: false,
        message: "نسبة العمولة يجب أن تكون رقمًا بين 0 و 1",
      });
    }

    // ─── Business logic checks ───────────────────────────────
    const existing = await User.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "رقم الهاتف مسجل مسبقًا",
      });
    }

    // Handle logo upload (only if provided)
    let logoUrl = null;
    if (logo && typeof logo === "string" && logo.startsWith("data:image")) {
      const uploadResult = await uploadImageFromBase64(logo);
      logoUrl = uploadResult?.url || null;
    }

    // ─── Create ──────────────────────────────────────────────
    const supplier = await User.create({
      name: name.trim(),
      phone: cleanPhone,
      password, // will be hashed in pre-save
      address: address.trim(),
      role: "supplier",
      logo: logoUrl,
      businessName: businessName.trim(),
      commissionRate: Number(commissionRate),
      type,
      isActive: true,
    });

    // Remove password from response
    const { password: _, ...safeSupplier } = supplier.toObject();

    return res.status(201).json({
      success: true,
      message: "تم إنشاء حساب المورد بنجاح",
      data: safeSupplier,
    });
  } catch (error) {
    console.error("Create Supplier Error:", error);
    return res.status(500).json({
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
      type,
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
      commissionRate !== undefined
        ? Number(commissionRate)
        : supplier.commissionRate;
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

    const supplier = await User.findById(id).select("-password -tokens").lean();

    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({
        success: false,
        message: "المورد غير موجود",
      });
    }

    // Only delivered orders linked to an UNPAID debt
    const deliveredCommissionResult = await Order.aggregate([
      {
        $match: {
          supplier: supplier._id,
          status: "delivered",
          debt: { $exists: true, $ne: null }, // has debt reference
        },
      },
      {
        $lookup: {
          from: "debts",
          localField: "debt",
          foreignField: "_id",
          as: "debtDoc",
        },
      },
      {
        $match: {
          "debtDoc.isPaid": false, // only keep if the debt is unpaid
        },
      },
      {
        $project: {
          effectiveAmount: {
            $subtract: ["$totalAmount", { $ifNull: ["$deductedRetour", 0] }],
          },
        },
      },
      {
        $project: {
          commission: {
            $multiply: [
              "$effectiveAmount",
              { $ifNull: [supplier.commissionRate, 0.05] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$commission" },
        },
      },
    ]);

    const deliveredCommission = Math.round(
      deliveredCommissionResult[0]?.total || 0,
    );

    const debtsResult = await Debt.findOne(
      { supplier: supplier._id, isPaid: false },
      "totalAmount",
    ).lean();

    const ordersCount = await Order.countDocuments({ supplier: supplier._id });
    const productsCount = await Product.countDocuments({
      supplier: supplier._id,
    });

    const enrichedSupplier = {
      ...supplier,
      deliveredCommission,
      currentDebt: debtsResult?.totalAmount || 0,
      ordersCount,
      productsCount,
    };

    res.status(200).json({
      success: true,
      data: enrichedSupplier,
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
    const user = await User.findById(id).select("-password").lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }
    const ordersCount = await Order.countDocuments({ trader: id });
    user.ordersCount = ordersCount;
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

    // Fetch filtered users
    let users = await User.find(query).sort({ createdAt: -1 }).lean();

    // Only if we have suppliers in result → compute their delivered commission
    const suppliers = users.filter((u) => u.role === "supplier");

    let commissionMap = {};

    if (suppliers.length > 0) {
      const supplierIds = suppliers.map((u) => u._id);

      const commissionsAgg = await Order.aggregate([
        {
          $match: {
            supplier: { $in: supplierIds },
            status: "delivered",
            debt: { $exists: true, $ne: null },
          },
        },
        {
          $lookup: {
            from: "debts",
            localField: "debt",
            foreignField: "_id",
            as: "debtDoc",
          },
        },
        {
          $match: {
            "debtDoc.isPaid": false,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "supplier",
            foreignField: "_id",
            as: "supplierDoc",
          },
        },
        { $unwind: { path: "$supplierDoc", preserveNullAndEmptyArrays: true } },
        {
          $set: {
            effectiveAmount: {
              $subtract: ["$totalAmount", { $ifNull: ["$deductedRetour", 0] }],
            },
          },
        },
        {
          $set: {
            commission: {
              $multiply: [
                "$effectiveAmount",
                { $ifNull: ["$supplierDoc.commissionRate", 0.05] },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$supplier",
            deliveredCommission: { $sum: "$commission" },
          },
        },
        {
          $project: {
            _id: 1,
            deliveredCommission: { $round: ["$deliveredCommission", 0] },
          },
        },
      ]);

      commissionMap = commissionsAgg.reduce((acc, doc) => {
        acc[doc._id.toString()] = doc.deliveredCommission;
        return acc;
      }, {});
    }

    users = users.map((user) => {
      if (user.role === "supplier") {
        const deliveredCommission = commissionMap[user._id.toString()] ?? 0;
        return {
          ...user,
          deliveredCommission,
        };
      }
      return user;
    });

    res.status(200).json({
      success: true,
      results: users.length,
      data: users,
    });
  } catch (error) {
    console.error("getAllUsers error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب المستخدمين",
    });
  }
};

export const getUsersByType = async (req, res) => {
  try {
    const { type } = req.params;

    if (!["accessoire", "spart_parts"].includes(type)) {
      return res.json({
        success: false,
        message: "نوع غير صالح. يجب أن يكون accessoire أو spare_parts",
      });
    }

    // Step 1: Find active suppliers of this type
    const suppliers = await User.find({
      role: "supplier",
      type,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Step 2: Get product count for each supplier (efficient with aggregation)
    const supplierIds = suppliers.map((s) => s._id);

    const productCounts = await Product.aggregate([
      {
        $match: {
          supplier: { $in: supplierIds },
          isActive: true, // optional: only count active products
        },
      },
      {
        $group: {
          _id: "$supplier",
          count: { $sum: 1 },
        },
      },
    ]);

    // Create a quick lookup map: supplierId → count
    const countMap = productCounts.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});

    // Step 3: Attach productCount to each supplier
    const enrichedSuppliers = suppliers.map((supplier) => ({
      ...supplier,
      productCount: countMap[supplier._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      data: enrichedSuppliers,
    });
  } catch (error) {
    console.error("Get Suppliers By Type Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ في جلب الموردين",
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

// PUT /api/users/me (trader updates own profile)
export const updateTraderProfile = async (req, res) => {
  try {
    const userId = req.user._id; // from protect middleware
    const { name, phone, address, oldPassword, newPassword } = req.body;

    // Fetch current user
    const trader = await User.findById(userId);
    if (!trader || trader.role !== "trader") {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بتعديل هذا الحساب",
      });
    }

    // Phone uniqueness check
    if (phone && phone !== trader.phone) {
      const existing = await User.findOne({ phone });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "رقم الهاتف مسجل لمستخدم آخر",
        });
      }
    }

    // Update allowed fields
    trader.name = name ?? trader.name;
    trader.phone = phone ?? trader.phone;
    trader.address = address ?? trader.address;

    // Password change (requires old password)
    if (newPassword) {
      if (!oldPassword) {
        return res.json({
          success: false,
          message: "كلمة المرور القديمة مطلوبة للتغيير",
        });
      }

      const isMatch = await trader.comparePassword(oldPassword);
      if (!isMatch) {
        return res.json({
          success: false,
          message: "كلمة المرور القديمة غير صحيحة",
        });
      }

      if (newPassword.length < 6) {
        return res.json({
          success: false,
          message: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل",
        });
      }

      trader.password = await bcrypt.hash(newPassword, 12);
    }

    await trader.save();

    // Return updated user without password
    const { password: _, ...updatedUser } = trader.toObject();

    res.status(200).json({
      success: true,
      message: "تم تحديث الملف الشخصي بنجاح",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update Trader Profile Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث الملف الشخصي",
    });
  }
};

// PUT /api/users/me/password (change password only)
export const changeTraderPassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(userId).select("+password");
    console.log("!user", !user);
    console.log("user.role", user.role);
    console.log(!user || user.role !== "trader");
    if (!user || user.role !== "trader") {
      return res.status(500).json({
        success: false,
        message: "غير مصرح لك بتغيير كلمة المرور",
      });
    }

    if (!oldPassword || !newPassword) {
      return res.status(500).json({
        success: false,
        message: "كلمة المرور القديمة والجديدة مطلوبة",
      });
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(500).json({
        success: false,
        message: "كلمة المرور القديمة غير صحيحة",
      });
    }

    if (newPassword.length < 6) {
      return res.status(500).json({
        success: false,
        message: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.status(200).json({
      success: true,
      message: "تم تغيير كلمة المرور بنجاح",
    });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تغيير كلمة المرور",
    });
  }
};
