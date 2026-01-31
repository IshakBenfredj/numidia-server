import Order from "../models/Order.js";
import Debt from "../models/Debt.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Report from "../models/Report.js";
import mongoose from "mongoose";

export const createOrder = async (req, res) => {
  try {
    const trader = req.user._id;
    const {
      products: orderedProducts,
      supplier,
      wilaya,
      city,
      deliveryType,
      deliveryAddress,
      deliveryPrice,
    } = req.body;

    console.log("بيانات الطلب المستلمة:", req.body);

    if (
      !orderedProducts ||
      !Array.isArray(orderedProducts) ||
      orderedProducts.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "يجب إضافة منتجات واحد على الأقل",
      });
    }

    if (
      !wilaya ||
      !deliveryType ||
      !deliveryPrice ||
      (deliveryType === "home" && !city)
    ) {
      return res.status(400).json({
        success: false,
        message: "معلومات التوصيل مطلوبة (الولاية، نوع التوصيل)",
      });
    }

    if (!["home", "office"].includes(deliveryType)) {
      return res.status(400).json({
        success: false,
        message: "نوع التوصيل يجب أن يكون 'منزل' أو 'مكتب'",
      });
    }

    // Calculate original total from products
    let originalTotal = 0;
    const populatedProducts = await Promise.all(
      orderedProducts.map(async ({ productId, quantity }) => {
        const product = await Product.findById(productId);
        if (!product) {
          throw new Error(`المنتج ${productId} غير موجود`);
        }

        if (product.quantity < quantity) {
          throw new Error(`الكمية المطلوبة لـ ${product.name} غير متوفرة`);
        }

        originalTotal += quantity * product.price;

        return {
          product: productId,
          quantity,
          priceAtOrder: product.price,
        };
      }),
    );

    const cancelledOrderIds = await Order.distinct("_id", {
      status: "cancelled",
    });

    console.log("معرفات الطلبات الملغاة:", cancelledOrderIds);

    const approvedReports = await Report.find({
      trader: trader,
      status: "approved",
      $or: [{ linkedOrder: null }, { linkedOrder: { $in: cancelledOrderIds } }],
    }).populate("order", "supplier");

    console.log("البلاغات المعتمدة المسترجعة:", approvedReports);

    let deductedRetour = 0;
    const linkedReports = [];

    const filteredReports = approvedReports.filter(
      (report) => report.order.supplier.toString() === supplier.toString(),
    );

    for (const report of filteredReports) {
      deductedRetour += report.totalRetourAmount;
      report.linkedOrder = new mongoose.Types.ObjectId();
      await report.save();
      linkedReports.push(report._id);
    }

    const order = await Order.create({
      trader,
      supplier,
      products: populatedProducts,
      totalAmount: originalTotal,
      deductedRetour,
      wilaya,
      city,
      deliveryType,
      deliveryAddress: deliveryAddress || "",
      deliveryPrice,
      linkedReports,
    });

    // Update reports with actual order ID
    for (const report of filteredReports) {
      report.linkedOrder = order._id;
      await report.save();
    }

    res.status(201).json({
      success: true,
      message: "تم إنشاء الطلب بنجاح",
      order,
    });
  } catch (error) {
    console.error("خطأ في إنشاء الطلب:", error);
    res.status(400).json({
      success: false,
      message: error.message || "فشل إنشاء الطلب",
    });
  }
};

export const confirmOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "غير مصرح - فقط الإدارة يمكنها تأكيد الطلبات",
      });
    }

    const order = await Order.findById(id).populate("supplier");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود",
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "لا يمكن تأكيد الطلب في حالته الحالية",
      });
    }

    // Check stock again before confirming (in case it changed)
    for (const item of order.products) {
      const product = await Product.findById(item.product);
      if (!product || product.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `الكمية غير متوفرة للمنتج ${product?.name || item.product}`,
        });
      }
    }

    // Deduct stock now
    await Promise.all(
      order.products.map(async (item) => {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity },
        });
      })
    );

    order.status = "confirmed";

    let debt = await Debt.findOne({
      supplier: order.supplier._id,
      isPaid: false,
    });

    const effectiveTotal = order.deductedRetour
      ? order.totalAmount - order.deductedRetour
      : order.totalAmount;

    if (!debt) {
      debt = await Debt.create({
        supplier: order.supplier._id,
        totalAmount: effectiveTotal * Number(order.supplier.commissionRate),
      });
    } else {
      debt.totalAmount += effectiveTotal * Number(order.supplier.commissionRate);
      await debt.save();
    }

    order.debt = debt ? debt._id : null;
    await order.save();

    res.status(200).json({
      success: true,
      message: "تم تأكيد الطلب بنجاح وخصم المخزون",
      order,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل تأكيد الطلب",
    });
  }
};

// ──────────────────────────────────────────────
// New: Get orders for a specific user (trader or supplier)
// ──────────────────────────────────────────────
export const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "معرف المستخدم غير صالح",
      });
    }

    const user = await User.findById(userId).select("role name phone");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    let query = {};

    if (user.role === "trader") {
      query.trader = userId;
    } else if (user.role === "supplier") {
      query.supplier = userId;
    } else {
      return res.status(400).json({
        success: false,
        message: "هذا المستخدم ليس تاجر ولا مورد",
      });
    }

    const orders = await Order.find(query)
      .populate("trader", "name phone")
      .populate("supplier", "name phone")
      .populate("products.product", "name price images")
      .populate({
        path: "reports",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "reportedItems.product", select: "name price images" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      orders,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("خطأ في جلب طلبات المستخدم:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الطلبات",
    });
  }
};

// ──────────────────────────────────────────────
// Get all orders (admin) — with reports
// ──────────────────────────────────────────────
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("trader", "name phone")
      .populate("supplier", "name phone")
      .populate("products.product", "name price images")
      .populate({
        path: "reports",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "reportedItems.product", select: "name price images" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الطلبات",
    });
  }
};

// ──────────────────────────────────────────────
// Get single order by ID — with reports
// ──────────────────────────────────────────────
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate("trader", "name phone")
      .populate("supplier")
      .populate("products.product", "name price images")
      .populate({
        path: "linkedReports",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "reportedItems.product", select: "name price images" },
        ],
      })
      .populate({
        path: "reports",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "reportedItems.product", select: "name price images" },
        ],
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود",
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الطلب",
    });
  }
};

// ──────────────────────────────────────────────
// Get supplier orders — with reports
// ──────────────────────────────────────────────
export const getSupplierOrders = async (req, res) => {
  try {
    const supplierId = req.user._id;

    const orders = await Order.find({ supplier: supplierId })
      .populate("trader", "name phone")
      .populate("products.product", "name price images")
      .populate({
        path: "reports",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "reportedItems.product", select: "name price images" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الطلبات",
    });
  }
};

// ──────────────────────────────────────────────
// Get trader orders — with reports
// ──────────────────────────────────────────────
export const getTraderOrders = async (req, res) => {
  try {
    const traderId = req.user._id;

    const orders = await Order.find({ trader: traderId })
      .populate("supplier", "name phone")
      .populate("products.product", "name price images")
      .populate({
        path: "reports",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "reportedItems.product", select: "name price images" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الطلبات",
    });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود",
      });
    }
    if (userRole !== "admin" && order.trader.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بحذف هذا الطلب",
      });
    }
    if (order.status !== "pending" && order.status !== "cancelled") {
      return res.status(400).json({
        success: false,
        message: "لا يمكن حذف الطلب بعد التأكيد أو الشحن",
      });
    }

    // Restore inventory
    await Promise.all(
      order.products.map(async (item) => {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { quantity: item.quantity },
        });
      }),
    );

    // Unlink reports if any
    if (order.linkedReports && order.linkedReports.length > 0) {
      await Report.updateMany(
        { _id: { $in: order.linkedReports } },
        { $set: { linkedOrder: null, status: "approved" } },
      );
    }

    await Order.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "تم حذف الطلب بنجاح واستعادة المخزون وإعادة ربط البلاغات",
    });
  } catch (error) {
    console.error("خطأ في حذف الطلب:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل حذف الطلب",
    });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
      "retour",
    ];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "حالة الطلب غير صالحة",
      });
    }

    const order = await Order.findById(id).populate("supplier");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود",
      });
    }

    const previousStatus = order.status;
    order.status = status;

    if (["delivered", "confirmed", "shipped"].includes(status)) {
      if (["cancelled", "retour", "pending"].includes(previousStatus)) {
        for (const item of order.products) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { quantity: -item.quantity },
          });
        }

        const debt = await Debt.findById(order.debt);
        if (debt) {
          debt.totalAmount += order.totalAmount * order.supplier.commissionRate;
          await debt.save();
        }
      }
    }

    if (["cancelled", "retour", "pending"].includes(status)) {
      if (
        ["confirmed", "delivered", "shipped"].includes(
          previousStatus,
        )
      ) {
        for (const item of order.products) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { quantity: item.quantity },
          });
        }

        const debt = await Debt.findById(order.debt);
        if (debt) {
          debt.totalAmount -= order.totalAmount * order.supplier.commissionRate;
          await debt.save();
        }

        // Unlink reports if cancelled or retour
        await Report.updateMany(
          { linkedOrder: order._id },
          { $set: { linkedOrder: null, status: "approved" } },
        );
      }
    }

    const orderUpdated = await order.save();

    res.status(200).json({
      success: true,
      message: `تم تغيير حالة الطلب إلى ${status}`,
      order: orderUpdated,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل تحديث حالة الطلب",
    });
  }
};

export default {
  createOrder,
  confirmOrder,
  getUserOrders,
  getAllOrders,
  getOrderById,
  getSupplierOrders,
  getTraderOrders,
  deleteOrder,
  updateOrderStatus,
};
