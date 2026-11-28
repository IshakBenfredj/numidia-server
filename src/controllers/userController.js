// import User from "../models/User.js";
// import bcrypt from "bcryptjs";
// import { deleteImage, uploadImageFromBase64 } from "../utils/cloudinary.js";
// import Debt from "../models/Debt.js";
// import Order from "../models/Order.js";
// import Product from "../models/Product.js";
// // POST /api/users/supplier
// export const createSupplierByAdmin = async (req, res) => {
//   try {
//     const {
//       name,
//       phone,
//       address,
//       password,
//       logo,
//       businessName,
//       commissionRate = 0.05,
//       type,
//     } = req.body;

//     if (!name?.trim() || !phone?.trim() || !password || !address?.trim()) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "الحقول التالية مطلوبة: الاسم، رقم الهاتف، كلمة المرور، العنوان ",
//       });
//     }

//     if (!type || !["accessoire", "spart_parts"].includes(type)) {
//       return res.status(400).json({
//         success: false,
//         message: "نوع المورد مطلوب ويجب أن يكون: accessoire أو spart_parts",
//       });
//     }

//     const cleanPhone = phone.trim().replace(/[^\d+]/g, "");

//     if (!/^(?:0[5-7]\d{8}|\+213[5-7]\d{8})$/.test(cleanPhone)) {
//       return res.status(400).json({
//         success: false,
//         message: "رقم الهاتف يجب أن يكون رقم جوال جزائري صالح",
//       });
//     }

//     if (password.length < 6) {
//       return res.status(400).json({
//         success: false,
//         message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
//       });
//     }

//     if (
//       Number.isNaN(Number(commissionRate)) ||
//       commissionRate < 0 ||
//       commissionRate > 1
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "نسبة العمولة يجب أن تكون رقمًا بين 0 و 1",
//       });
//     }

//     // ─── Business logic checks ───────────────────────────────
//     const existing = await User.findOne({ phone: cleanPhone });
//     if (existing) {
//       return res.status(409).json({
//         success: false,
//         message: "رقم الهاتف مسجل مسبقًا",
//       });
//     }

//     // Handle logo upload (only if provided)
//     let logoUrl = null;
//     if (logo && typeof logo === "string" && logo.startsWith("data:image")) {
//       const uploadResult = await uploadImageFromBase64(logo);
//       logoUrl = uploadResult?.url || null;
//     }

//     // ─── Create ──────────────────────────────────────────────
//     const supplier = await User.create({
//       name: name.trim(),
//       phone: cleanPhone,
//       password, // will be hashed in pre-save
//       address: address.trim(),
//       role: "supplier",
//       logo: logoUrl,
//       businessName: businessName.trim(),
//       commissionRate: Number(commissionRate),
//       type,
//       isActive: true,
//     });

//     // Remove password from response
//     const { password: _, ...safeSupplier } = supplier.toObject();

//     return res.status(201).json({
//       success: true,
//       message: "تم إنشاء حساب المورد بنجاح",
//       data: safeSupplier,
//     });
//   } catch (error) {
//     console.error("Create Supplier Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "حدث خطأ في الخادم، يرجى المحاولة لاحقًا",
//     });
//   }
// };

// // PUT /api/users/supplier/:id
// export const editSupplierByAdmin = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       name,
//       phone,
//       address,
//       password,
//       logo,
//       businessName,
//       commissionRate,
//       isActive,
//       type,
//     } = req.body;

//     const supplier = await User.findById(id);
//     if (!supplier || supplier.role !== "supplier") {
//       return res.status(404).json({
//         success: false,
//         message: "المورد غير موجود",
//       });
//     }

//     if (phone && phone !== supplier.phone) {
//       const existing = await User.findOne({ phone });
//       if (existing) {
//         return res.status(409).json({
//           success: false,
//           message: "رقم الهاتف مسجل لمستخدم آخر",
//         });
//       }
//     }

//     if (logo && logo.startsWith("data:")) {
//       const logoUrl = await uploadImageFromBase64(logo);
//       await deleteImage(supplier.logo);
//       supplier.logo = logoUrl.url;
//     }

//     // تحديث الحقول
//     supplier.name = name ?? supplier.name;
//     supplier.phone = phone ?? supplier.phone;
//     supplier.address = address ?? supplier.address;
//     supplier.businessName = businessName ?? supplier.businessName;
//     supplier.commissionRate =
//       commissionRate !== undefined
//         ? Number(commissionRate)
//         : supplier.commissionRate;
//     supplier.isActive = isActive !== undefined ? isActive : supplier.isActive;
//     supplier.type = type ?? supplier.type;

//     if (password) {
//       supplier.password = await bcrypt.hash(password, 12);
//     }

//     await supplier.save();

//     const { password: _, ...supplierWithoutPassword } = supplier.toObject();

//     res.status(200).json({
//       success: true,
//       message: "تم تعديل المورد بنجاح",
//       data: supplierWithoutPassword,
//     });
//   } catch (error) {
//     console.error("Edit Supplier Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "حدث خطأ في الخادم",
//     });
//   }
// };

// // DELETE /api/users/:id
// export const deleteUser = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const user = await User.findById(id);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "المستخدم غير موجود",
//       });
//     }

//     if (user.role === "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "لا يمكن حذف حساب الإدارة",
//       });
//     }

//     await User.findByIdAndDelete(id);

//     res.status(200).json({
//       success: true,
//       message: "تم حذف المستخدم بنجاح",
//     });
//   } catch (error) {
//     console.error("Delete User Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "حدث خطأ في حذف المستخدم",
//     });
//   }
// };

import User from "../models/User.js";
import bcrypt from "bcryptjs";
import Debt from "../models/Debt.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import {
  deleteFileByUrl,
  uploadFile,
  uploadSingleImage,
} from "../utils/r2storage.js";
import Report from "../models/Report.js";
import {
  computeSupplierAutoVerified,
  getOrCreateSettings,
  getVisibleSupplierIds,
} from "./subscriptionController.js";

const normalizeSupplierType = (rawType) => {
  if (!rawType) return "";
  const t = String(rawType).trim();
  if (t === "spare_parts") return "spart_parts";
  if (t === "accessories") return "accessoire";
  return t;
};

const parseOptionalBoolean = (val) => {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
};

const uploadIncomingLogo = async (req) => {
  if (req.file && Buffer.isBuffer(req.file.buffer) && req.file.buffer.length > 0) {
    const mime =
      req.file.mimetype && req.file.mimetype.startsWith("image/")
        ? req.file.mimetype
        : "image/jpeg";
    return uploadFile(req.file.buffer, "logos", null, mime);
  }
  const logo = req.body?.logo;
  if (logo && typeof logo === "string" && logo.startsWith("data:")) {
    return uploadSingleImage(logo, "logos");
  }
  return null;
};

// POST /api/users/supplier
export const createSupplierByAdmin = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      name,
      phone,
      address,
      password,
      businessName,
      commissionRate = 0.05,
      type,
    } = body;

    if (!name?.trim() || !phone?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "الحقول التالية مطلوبة: الاسم، رقم الهاتف، كلمة المرور",
      });
    }

    const normalizedType = normalizeSupplierType(type);
    if (!normalizedType || !["accessoire", "spart_parts"].includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: "نوع المورد مطلوب ويجب أن يكون: accessoire أو spart_parts",
      });
    }

    const cleanPhone = String(phone).trim().replace(/[^\d+]/g, "");

    if (!/^(?:0[5-7]\d{8}|\+213[5-7]\d{8})$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "رقم الهاتف يجب أن يكون رقم جوال جزائري صالح",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      });
    }

    let numericCommission = Number(commissionRate);
    if (Number.isNaN(numericCommission)) {
      numericCommission = 0.05;
    } else if (numericCommission > 1 && numericCommission <= 100) {
      numericCommission = numericCommission / 100;
    }

    if (numericCommission < 0 || numericCommission > 1) {
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

    // Handle logo upload (supports both Flutter multipart/form-data file and base64)
    const logoUrl = await uploadIncomingLogo(req);

    const cleanName = String(name).trim();
    const cleanAddress =
      address && String(address).trim() ? String(address).trim() : "غير محدد";
    const cleanBusinessName =
      businessName && String(businessName).trim()
        ? String(businessName).trim()
        : cleanName;

    // ─── Create ──────────────────────────────────────────────
    const supplier = await User.create({
      name: cleanName,
      phone: cleanPhone,
      password: String(password), // will be hashed in pre-save
      address: cleanAddress,
      role: "supplier",
      logo: logoUrl,
      businessName: cleanBusinessName,
      commissionRate: numericCommission,
      type: normalizedType,
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
    const body = req.body || {};
    const {
      name,
      phone,
      address,
      password,
      businessName,
      commissionRate,
      isActive,
      type,
    } = body;

    const supplier = await User.findById(id);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({
        success: false,
        message: "المورد غير موجود",
      });
    }

    const cleanPhone = phone ? String(phone).trim().replace(/[^\d+]/g, "") : "";
    if (cleanPhone && cleanPhone !== supplier.phone) {
      const existing = await User.findOne({ phone: cleanPhone });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "رقم الهاتف مسجل لمستخدم آخر",
        });
      }
      supplier.phone = cleanPhone;
    }

    // Handle logo update (multipart file or base64)
    const newLogoUrl = await uploadIncomingLogo(req);
    if (newLogoUrl) {
      if (supplier.logo) {
        await deleteFileByUrl(supplier.logo);
      }
      supplier.logo = newLogoUrl;
    }

    // Update other fields
    if (name && String(name).trim()) supplier.name = String(name).trim();
    if (address !== undefined && String(address).trim()) {
      supplier.address = String(address).trim();
    }
    if (businessName && String(businessName).trim()) {
      supplier.businessName = String(businessName).trim();
    }

    if (commissionRate !== undefined && commissionRate !== "") {
      let c = Number(commissionRate);
      if (!Number.isNaN(c)) {
        if (c > 1 && c <= 100) c = c / 100;
        supplier.commissionRate = c;
      }
    }

    const parsedActive = parseOptionalBoolean(isActive);
    if (parsedActive !== undefined) {
      supplier.isActive = parsedActive;
    }

    const normalizedType = normalizeSupplierType(type);
    if (normalizedType && ["accessoire", "spart_parts"].includes(normalizedType)) {
      supplier.type = normalizedType;
    }

    if (password && String(password).length >= 6) {
      supplier.password = String(password);
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

// DELETE /api/users/:id
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    if (user.role === "admin") {
      return res.status(403).json({ success: false, message: "لا يمكن حذف حساب الإدارة" });
    }

    // ── 1. Delete logo from R2 ───────────────────────────────
    if (user.logo) {
      await deleteFileByUrl(user.logo).catch(console.error);
    }

    if (user.role === "supplier") {
      // ── 2. Get all supplier's products ──────────────────────
      const products = await Product.find({ supplier: id });
      const productIds = products.map((p) => p._id);

      // ── 3. Delete product images from R2 ────────────────────
      for (const product of products) {
        if (product.images?.length) {
          await Promise.all(
            product.images.map((img) => deleteFileByUrl(img).catch(console.error))
          );
        }
      }

      // ── 4. Get all orders that include supplier's products ───
      const affectedOrders = await Order.find({
        $or: [
          { supplier: id },
          { "products.product": { $in: productIds } },
        ],
      });
      const affectedOrderIds = affectedOrders.map((o) => o._id);

      // ── 5. Delete reports linked to those orders ─────────────
      await Report.deleteMany({
        $or: [
          { order: { $in: affectedOrderIds } },
          { supplier: id },
        ],
      });

      // ── 6. Delete debts linked to supplier ───────────────────
      await Debt.deleteMany({ supplier: id });

      // ── 7. Delete orders ─────────────────────────────────────
      await Order.deleteMany({ _id: { $in: affectedOrderIds } });

      // ── 8. Delete products ───────────────────────────────────
      await Product.deleteMany({ supplier: id });
    }

    if (user.role === "trader") {
      // ── 2. Get all trader's orders ───────────────────────────
      const traderOrders = await Order.find({ trader: id });
      const traderOrderIds = traderOrders.map((o) => o._id);

      // ── 3. Delete reports linked to trader's orders ──────────
      await Report.deleteMany({
        $or: [
          { order: { $in: traderOrderIds } },
          { trader: id },
        ],
      });

      // ── 4. Delete debts from trader's orders ─────────────────
      const debtIds = traderOrders
        .filter((o) => o.debt)
        .map((o) => o.debt);
      if (debtIds.length) {
        await Debt.deleteMany({ _id: { $in: debtIds } });
      }

      // ── 5. Delete trader's orders ────────────────────────────
      await Order.deleteMany({ trader: id });
    }

    // ── Final: delete the user ───────────────────────────────
    await User.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "تم حذف المستخدم وجميع بياناته بنجاح" });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في حذف المستخدم" });
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

    const settings = await getOrCreateSettings();
    const autoVerified = computeSupplierAutoVerified(supplier, settings);

    const enrichedSupplier = {
      ...supplier,
      isVerified: autoVerified,
      kycStatus: autoVerified ? "verified" : "unverified",
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
    if (user.role === "supplier") {
      const settings = await getOrCreateSettings();
      const autoVerified = computeSupplierAutoVerified(user, settings);
      user.isVerified = autoVerified;
      user.kycStatus = autoVerified ? "verified" : "unverified";
    } else {
      user.isVerified = false;
      user.kycStatus = "unverified";
    }
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

    const settings = await getOrCreateSettings();
    users = users.map((user) => {
      if (user.role === "supplier") {
        const deliveredCommission = commissionMap[user._id.toString()] ?? 0;
        const autoVerified = computeSupplierAutoVerified(user, settings);
        return {
          ...user,
          isVerified: autoVerified,
          kycStatus: autoVerified ? "verified" : "unverified",
          deliveredCommission,
        };
      }
      return {
        ...user,
        isVerified: false,
        kycStatus: "unverified",
      };
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
    let suppliers = await User.find({
      role: "supplier",
      type,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Hide unsubscribed / expired suppliers from Traders & Guests when subscriptions are enabled
    if (req.user?.role !== "admin") {
      const { allowedSupplierIdSet } = await getVisibleSupplierIds();
      suppliers = suppliers.filter((s) =>
        allowedSupplierIdSet.has(s._id.toString()),
      );
    }

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

    // Step 3: Attach productCount & automatic verification status to each visible supplier
    const settings = await getOrCreateSettings();
    const enrichedSuppliers = suppliers.map((supplier) => {
      const autoVerified = computeSupplierAutoVerified(supplier, settings);
      return {
        ...supplier,
        isVerified: autoVerified,
        kycStatus: autoVerified ? "verified" : "unverified",
        productCount: countMap[supplier._id.toString()] || 0,
      };
    });

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

// PUT /api/users/:id (Admin toggles isActive or edits user fields & logo via JSON or FormData)
export const adminUpdateUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const {
      name,
      phone,
      address,
      businessName,
      commissionRate,
      isActive,
      type,
      password,
    } = body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    const cleanPhone = phone ? String(phone).trim().replace(/[^\d+]/g, "") : "";
    if (cleanPhone && cleanPhone !== user.phone) {
      const existing = await User.findOne({ phone: cleanPhone });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "رقم الهاتف مسجل لمستخدم آخر",
        });
      }
      user.phone = cleanPhone;
    }

    const newLogoUrl = await uploadIncomingLogo(req);
    if (newLogoUrl) {
      if (user.logo) {
        await deleteFileByUrl(user.logo);
      }
      user.logo = newLogoUrl;
    }

    if (name !== undefined && String(name).trim()) user.name = String(name).trim();
    if (address !== undefined && String(address).trim()) {
      user.address = String(address).trim();
    }
    if (businessName !== undefined && String(businessName).trim()) {
      user.businessName = String(businessName).trim();
    }
    if (
      commissionRate !== undefined &&
      commissionRate !== "" &&
      user.role === "supplier"
    ) {
      let c = Number(commissionRate);
      if (!Number.isNaN(c)) {
        if (c > 1 && c <= 100) c = c / 100;
        user.commissionRate = c;
      }
    }
    if (type !== undefined && user.role === "supplier") {
      const normalizedType = normalizeSupplierType(type);
      if (["accessoire", "spart_parts"].includes(normalizedType)) {
        user.type = normalizedType;
      }
    }
    const parsedActive = parseOptionalBoolean(isActive);
    if (parsedActive !== undefined) {
      user.isActive = parsedActive;
    }
    if (password && String(password).length >= 6) {
      user.password = String(password);
    }

    await user.save();

    const safeUser = user.toObject();
    delete safeUser.password;
    if (safeUser.role === "supplier") {
      const settings = await getOrCreateSettings();
      const autoVerified = computeSupplierAutoVerified(safeUser, settings);
      safeUser.isVerified = autoVerified;
      safeUser.kycStatus = autoVerified ? "verified" : "unverified";
    } else {
      safeUser.isVerified = false;
      safeUser.kycStatus = "unverified";
    }

    res.status(200).json({
      success: true,
      message: "تم تحديث بيانات الحساب بنجاح",
      data: safeUser,
    });
  } catch (error) {
    console.error("Admin Update User Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث الحساب",
    });
  }
};

// PUT /api/users/:id/kyc-status (Admin only - Suppliers only; automatic on activation)
export const updateUserKycStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionRate, kycNotes } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    if (user.role !== "supplier") {
      user.isVerified = false;
      user.kycStatus = "unverified";
      await user.save();
      return res.status(400).json({
        success: false,
        message: "التوثيق خاص بحسابات الموردين فقط ولا يشمل التجار",
      });
    }

    if (typeof commissionRate === "number") user.commissionRate = commissionRate;
    if (typeof kycNotes === "string") user.kycNotes = kycNotes;

    const settings = await getOrCreateSettings();
    const autoVerified = computeSupplierAutoVerified(user, settings);
    user.isVerified = autoVerified;
    user.kycStatus = autoVerified ? "verified" : "unverified";

    await user.save();

    res.status(200).json({
      success: true,
      message: "تم تحديث حالة التوثيق التلقائي للمورد",
      data: user,
    });
  } catch (error) {
    console.error("Update KYC Status Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء تحديث حالة التوثيق",
    });
  }
};

// PUT /api/users/me/kyc (Suppliers only; auto-verified when active)
export const submitKycDocuments = async (req, res) => {
  try {
    const userId = req.user._id;
    const { commercialRegister, taxId, identityCardImage } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    if (user.role !== "supplier") {
      return res.status(403).json({
        success: false,
        message: "توثيق الحساب خاص بالموردين فقط ولا يخص التجار",
      });
    }

    if (commercialRegister) user.commercialRegister = commercialRegister;
    if (taxId) user.taxId = taxId;
    if (identityCardImage) user.identityCardImage = identityCardImage;

    await user.save();

    res.status(200).json({
      success: true,
      message: "تم حفظ بيانات المورد، والتوثيق مفعّل تلقائياً للحسابات المفعلة",
      data: user,
    });
  } catch (error) {
    console.error("Submit KYC Error:", error);
    res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء حفظ البيانات",
    });
  }
};
