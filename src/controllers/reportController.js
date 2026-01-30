import Report from "../models/Report.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";
import createError from "http-errors";

// POST /api/reports
// Body: { orderId, reportedItems: [{productId, quantity, action: "exchange"|"retour"}], notes? }
export const createReport = async (req, res, next) => {
  try {
    const traderId = req.user._id;
    const { orderId, reportedItems, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw createError(400, "معرف الطلب غير صالح");
    }

    if (!Array.isArray(reportedItems) || reportedItems.length === 0) {
      throw createError(400, "يجب تحديد منتج واحد على الأقل في البلاغ");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw createError(404, "الطلب غير موجود");
    }

    if (order.trader.toString() !== traderId.toString()) {
      throw createError(403, "غير مصرح لك بإنشاء بلاغ على هذا الطلب");
    }

    if (order.status !== "delivered") {
      throw createError(400, "يمكن إنشاء بلاغ فقط على الطلبات المُسلّمة");
    }

    // Validate each reported item
    for (const item of reportedItems) {
      if (!mongoose.Types.ObjectId.isValid(item.product)) {
        throw createError(400, "معرف منتج غير صالح");
      }

      if (!["exchange", "retour"].includes(item.action)) {
        throw createError(400, "نوع الإجراء يجب أن يكون 'exchange' أو 'retour'");
      }

      const orderedProduct = order.products.find(
        (p) => p.product.toString() === item.product.toString()
      );

      if (!orderedProduct) {
        throw createError(400, `المنتج ${item.product} غير موجود في الطلب`);
      }

      if (item.quantity > orderedProduct.quantity) {
        throw createError(400, `الكمية المبلغ عنها تتجاوز الكمية المطلوبة`);
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
      throw createError(400, "معرف الطلب غير صالح");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw createError(404, "الطلب غير موجود");
    }

    // Only admin or the trader who placed the order can see reports
    if (
      userRole !== "admin" &&
      order.trader.toString() !== userId.toString()
    ) {
      throw createError(403, "غير مصرح لك برؤية بلاغات هذا الطلب");
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
export const getMyReports = async (req, res, next) => {
  try {
    if (req.user.role !== "trader") {
      throw createError(403, "هذه الخاصية متاحة للتجار فقط");
    }

    const reports = await Report.find({ trader: req.user._id })
      .populate("order", "totalAmount status createdAt")
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

// PATCH /api/reports/:reportId/status
// Admin only - approve / reject / process
export const updateReportStatus = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      throw createError(403, "غير مصرح - فقط الإدارة يمكنها تعديل حالة البلاغ");
    }

    const { reportId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected", "processed"].includes(status)) {
      throw createError(400, "حالة غير صالحة");
    }

    const report = await Report.findById(reportId);
    if (!report) {
      throw createError(404, "البلاغ غير موجود");
    }

    if (report.status !== "pending") {
      throw createError(400, "لا يمكن تعديل حالة بلاغ تمت معالجته مسبقًا");
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
      throw createError(403, "غير مصرح - فقط الإدارة");
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

export const deleteReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findById(reportId);
    if (!report) {
      throw createError(404, "البلاغ غير موجود");
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
  deleteReport
};