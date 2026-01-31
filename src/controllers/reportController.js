import Report from "../models/Report.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";

const createError = (res, status, message) => {
  res.status(status).json({ success: false, message });
};
// POST /api/reports
// Body: { orderId, reportedItems: [{productId, quantity, action: "exchange"|"retour"}], notes? }
export const createReport = async (req, res, next) => {
  try {
    const traderId = req.user._id;
    const { orderId, reportedItems, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw createError(res, 400, "معرف الطلب غير صالح");
    }

    if (!Array.isArray(reportedItems) || reportedItems.length === 0) {
      throw createError(res, 400, "يجب تحديد منتج واحد على الأقل في البلاغ");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw createError(res, 404, "الطلب غير موجود");
    }

    if (order.trader.toString() !== traderId.toString()) {
      throw createError(res, 403, "غير مصرح لك بإنشاء بلاغ على هذا الطلب");
    }

    if (order.status !== "delivered") {
      throw createError(res, 400, "يمكن إنشاء بلاغ فقط على الطلبات المُسلّمة");
    }

    // Validate each reported item
    for (const item of reportedItems) {
      if (!mongoose.Types.ObjectId.isValid(item.product)) {
        throw createError(res, 400, "معرف منتج غير صالح");
      }

      if (!["exchange", "retour"].includes(item.action)) {
        throw createError(
          res,
          400,
          "نوع الإجراء يجب أن يكون 'exchange' أو 'retour'",
        );
      }

      const orderedProduct = order.products.find(
        (p) => p.product.toString() === item.product.toString(),
      );

      if (!orderedProduct) {
        throw createError(
          res,
          400,
          `المنتج ${item.product} غير موجود في الطلب`,
        );
      }

      if (item.quantity > orderedProduct.quantity) {
        throw createError(
          res,
          400,
          `الكمية المبلغ عنها تتجاوز الكمية المطلوبة`,
        );
      }
    }

    const report = await Report.create({
      order: orderId,
      trader: traderId,
      reportedItems,
      notes: notes || "",
    });

    // The totalRetourAmount is auto-calculated in pre-save hook

    res.status(201).json({
      success: true,
      message: "تم إنشاء البلاغ بنجاح",
      report,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/order/:orderId
// Get all reports for a specific order (admin + trader who owns it)
export const getReportsByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw createError(res, 400, "معرف الطلب غير صالح");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw createError(res, 404, "الطلب غير موجود");
    }

    // Only admin or the trader who placed the order can see reports
    if (userRole !== "admin" && order.trader.toString() !== userId.toString()) {
      throw createError(res, 403, "غير مصرح لك برؤية بلاغات هذا الطلب");
    }

    const reports = await Report.find({ order: orderId })
      .populate("trader", "name phone")
      .populate("reportedItems.product", "name price images")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/my-reports
// Get all reports created by the current trader
// GET /api/reports/my-supplier-reports
// Returns all reports related to orders where the current user is the supplier
export const getMyReports = async (req, res, next) => {
  try {
    // Ensure the user is a supplier
    if (req.user.role !== "supplier") {
      return res.status(403).json({
        success: false,
        message: "هذه الخاصية متاحة للموردين فقط",
      });
    }

    const supplierId = req.user._id;

    const reports = await Report.find({})
      .populate({
        path: "order",
        match: { supplier: supplierId },
        select: "totalAmount status createdAt trader",
        populate: {
          path: "trader",
          select: "name phone",
        },
      })
      .populate("trader", "name phone")
      .populate("reportedItems.product", "name price images")
      .sort({ createdAt: -1 })
      .lean();

    const filteredReports = reports.filter((report) => report.order !== null);

    res.status(200).json({
      success: true,
      count: filteredReports.length,
      reports: filteredReports,
    });
  } catch (err) {
    next(err);
  }
};

export const getReportById = async (req, res, next) => {
  try {
    const { reportId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      throw createError(res, 400, "معرف البلاغ غير صالح");
    }

    const report = await Report.findById(reportId)
      .populate("trader", "name phone")
      .populate({
        path: "order",
        select: "totalAmount status createdAt trader supplier",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "supplier", select: "name phone" },
        ],
      })
      .populate({
        path: "linkedOrder",
        select: "totalAmount status createdAt",
      })
      .populate("reportedItems.product", "name price images")
      .lean();

    if (!report) {
      throw createError(res, 404, "البلاغ غير موجود");
    }

    res.status(200).json({
      success: true,
      report,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/reports/:reportId/status
// Admin only - approve / reject / process
export const updateReportStatus = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      throw createError(
        res,
        403,
        "غير مصرح - فقط الإدارة يمكنها تعديل حالة البلاغ",
      );
    }

    const { reportId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected", "pending", "delivered"].includes(status)) {
      throw createError(res, 400, "حالة غير صالحة");
    }

    const report = await Report.findById(reportId);
    if (!report) {
      throw createError(res, 404, "البلاغ غير موجود");
    }

    report.status = status;
    await report.save();

    res.status(200).json({
      success: true,
      message: `تم تحديث حالة البلاغ إلى ${status}`,
      report,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/pending
// Admin only - get all pending reports
export const getPendingReports = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      throw createError(res, 403, "غير مصرح - فقط الإدارة");
    }

    const reports = await Report.find({ status: "pending" })
      .populate("order", "totalAmount status createdAt")
      .populate("trader", "name phone")
      .populate("reportedItems.product", "name price images")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (err) {
    next(err);
  }
};

export const getAllReports = async (req, res, next) => {
  try {
    const reports = await Report.find()
      .populate("order", "totalAmount status createdAt")
      .populate("trader", "name phone")
      .populate("reportedItems.product", "name price images")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findById(reportId);
    if (!report) {
      throw createError(res, 404, "البلاغ غير موجود");
    }
    await report.deleteOne();
    res.status(200).json({
      success: true,
      message: "تم حذف البلاغ بنجاح",
    });
  } catch (err) {
    next(err);
  }
};

export default {
  createReport,
  getReportsByOrder,
  getMyReports,
  updateReportStatus,
  getPendingReports,
  deleteReport,
};
