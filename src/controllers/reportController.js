import Report from "../models/Report.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { sendPushNotification } from "../utils/pushNotifications.js";
import { deleteFileByUrl, uploadMultipleImages } from "../utils/r2storage.js";

const RETURN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const createError = (res, status, message) => {
  res.status(status).json({ success: false, message });
};

// POST /api/reports
// Body: { orderId, reportedItems: [{product, quantity, action: "exchange"|"retour"}], notes?, images? (max 2 base64) }
export const createReport = async (req, res, next) => {
  try {
    const traderId = req.user._id;
    const { orderId, reportedItems, notes, images = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return createError(res, 400, "معرف الطلب غير صالح");
    }

    if (!Array.isArray(reportedItems) || reportedItems.length === 0) {
      return createError(res, 400, "يجب تحديد منتج واحد على الأقل");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return createError(res, 404, "الطلب غير موجود");
    }

    if (order.trader.toString() !== traderId.toString()) {
      return createError(res, 403, "غير مصرح لك بتقديم طلب استرجاع على هذه الطلبية");
    }

    if (order.status !== "delivered") {
      return createError(
        res,
        400,
        "يمكن طلب الاسترجاع أو الاستبدال فقط على الطلبيات المُسلّمة"
      );
    }

    // 7-day return window check from delivery/update time
    const deliveredRefTime = new Date(order.updatedAt || order.createdAt).getTime();
    if (Date.now() - deliveredRefTime > RETURN_WINDOW_DAYS * DAY_MS) {
      return createError(
        res,
        400,
        `انتهت مهلة طلب الاسترجاع أو الاستبدال (${RETURN_WINDOW_DAYS} أيام من تاريخ التسليم)`
      );
    }

    // Fetch all existing non-rejected reports for this order to prevent duplicate abuse
    const existingReports = await Report.find({
      order: orderId,
      status: { $ne: "rejected" },
    }).lean();

    const alreadyReportedByProduct = new Map();
    for (const prev of existingReports) {
      for (const prevItem of prev.reportedItems || []) {
        const pid = prevItem.product?.toString();
        if (!pid) continue;
        alreadyReportedByProduct.set(
          pid,
          (alreadyReportedByProduct.get(pid) || 0) + (Number(prevItem.quantity) || 0)
        );
      }
    }

    // Validate each reported item
    for (const item of reportedItems) {
      const pid = String(item.product || "");
      if (!mongoose.Types.ObjectId.isValid(pid)) {
        return createError(res, 400, "معرف منتج غير صالح");
      }

      if (!["exchange", "retour"].includes(item.action)) {
        return createError(
          res,
          400,
          "نوع الإجراء يجب أن يكون 'exchange' أو 'retour'"
        );
      }

      const orderedProduct = order.products.find(
        (p) => p.product.toString() === pid
      );

      if (!orderedProduct) {
        return createError(res, 400, `المنتج ${pid} غير موجود في الطلبية`);
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 0);
      const previouslyReported = alreadyReportedByProduct.get(pid) || 0;
      const remainingQty = Math.max(0, orderedProduct.quantity - previouslyReported);

      if (qty > remainingQty) {
        return createError(
          res,
          400,
          remainingQty === 0
            ? "تم تقديم طلب استرجاع مسبقاً لكامل كمية هذا المنتج"
            : `الكمية المتبقية المتاحة للاسترجاع لهذا المنتج هي ${remainingQty} فقط`
        );
      }
    }

    // Upload up to 2 proof images to R2
    let uploadedProofUrls = [];
    if (Array.isArray(images) && images.length > 0) {
      const validBase64 = images
        .filter((img) => typeof img === "string" && img.startsWith("data:image"))
        .slice(0, 2);
      if (validBase64.length > 0) {
        uploadedProofUrls = await uploadMultipleImages(validBase64, "reports");
      }
    }

    const report = await Report.create({
      order: orderId,
      supplier: order.supplier,
      trader: traderId,
      reportedItems,
      images: uploadedProofUrls,
      notes: notes || "",
    });

    // Notify Supplier directly about the return/exchange request
    try {
      const supplierUser = await User.findById(order.supplier)
        .select("tokens")
        .lean();
      const tokens = Array.isArray(supplierUser?.tokens)
        ? supplierUser.tokens.filter(Boolean)
        : [];
      if (tokens.length > 0) {
        const traderName = req.user?.name || "تاجر";
        sendPushNotification(
          tokens,
          "طلب استرجاع / استبدال جديد",
          `أرسل ${traderName} طلب استرجاع أو استبدال على إحدى الطلبيات.`,
          { reportId: report._id.toString(), type: "NEW_REPORT" }
        );
      }
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: "تم إرسال طلب الاسترجاع والاستبدال بنجاح",
      report,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/trader-benefits (Trader gets approved refund credit & waiting replacement pieces grouped by supplier)
// Optional param /:supplierId for single supplier
export const getTraderBenefits = async (req, res, next) => {
  try {
    const traderId = req.user._id;
    const requestedSupplierId = req.params.supplierId || null;

    const cancelledOrderIds = await Order.distinct("_id", {
      status: "cancelled",
    });

    const query = {
      trader: traderId,
      status: "approved",
      $or: [
        { linkedOrder: null },
        { linkedOrder: { $in: cancelledOrderIds } },
      ],
    };

    if (
      requestedSupplierId &&
      mongoose.Types.ObjectId.isValid(requestedSupplierId)
    ) {
      query.supplier = requestedSupplierId;
    }

    const approvedReports = await Report.find(query)
      .populate("supplier", "name businessName phone")
      .populate("reportedItems.product", "name price images")
      .sort({ createdAt: -1 })
      .lean();

    const bySupplier = {};

    for (const rep of approvedReports) {
      const supObj = rep.supplier;
      const supId =
        (supObj && typeof supObj === "object" ? supObj._id : supObj)?.toString() ||
        "";
      if (!supId) continue;

      if (!bySupplier[supId]) {
        bySupplier[supId] = {
          supplierId: supId,
          supplierName:
            supObj && typeof supObj === "object"
              ? supObj.businessName || supObj.name || "المورد"
              : "المورد",
          totalRetourCredit: 0,
          pendingExchanges: [],
          reportsCount: 0,
        };
      }

      bySupplier[supId].totalRetourCredit += Number(rep.totalRetourAmount) || 0;
      bySupplier[supId].reportsCount += 1;

      for (const item of rep.reportedItems || []) {
        if (item.action === "exchange") {
          const prod = item.product;
          const prodId =
            (prod && typeof prod === "object" ? prod._id : prod)?.toString() ||
            "";
          const prodName =
            prod && typeof prod === "object" ? prod.name || "منتج" : "منتج";
          const prodImage =
            prod &&
            typeof prod === "object" &&
            Array.isArray(prod.images) &&
            prod.images.length > 0
              ? prod.images[0]
              : "";

          const existing = bySupplier[supId].pendingExchanges.find(
            (e) => e.productId === prodId
          );
          if (existing) {
            existing.quantity += Number(item.quantity) || 1;
          } else {
            bySupplier[supId].pendingExchanges.push({
              productId: prodId,
              name: prodName,
              image: prodImage,
              quantity: Number(item.quantity) || 1,
              reportId: rep._id.toString(),
            });
          }
        }
      }
    }

    if (requestedSupplierId) {
      return res.status(200).json({
        success: true,
        data: bySupplier[requestedSupplierId] || {
          supplierId: requestedSupplierId,
          totalRetourCredit: 0,
          pendingExchanges: [],
          reportsCount: 0,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: bySupplier,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/order/:orderId
export const getReportsByOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return createError(res, 400, "معرف الطلب غير صالح");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return createError(res, 404, "الطلب غير موجود");
    }

    if (
      userRole !== "admin" &&
      order.trader.toString() !== userId.toString() &&
      order.supplier.toString() !== userId.toString()
    ) {
      return createError(res, 403, "غير مصرح لك برؤية طلبات استرجاع هذه الطلبية");
    }

    const reports = await Report.find({ order: orderId })
      .populate("trader", "name phone")
      .populate("supplier", "name businessName phone")
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

// GET /api/reports/my-reports (Supplier's return/exchange requests)
export const getMyReports = async (req, res, next) => {
  try {
    if (req.user.role !== "supplier") {
      return res.status(403).json({
        success: false,
        message: "هذه الخاصية متاحة للموردين فقط",
      });
    }

    const supplierId = req.user._id;

    const reports = await Report.find({ supplier: supplierId })
      .populate("order")
      .populate("trader", "name phone")
      .populate("supplier", "name businessName phone")
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
      return createError(res, 400, "معرف الطلب غير صالح");
    }

    const report = await Report.findById(reportId)
      .populate("trader", "name phone")
      .populate("supplier", "name businessName phone")
      .populate({
        path: "order",
        select: "totalAmount status createdAt trader supplier",
        populate: [
          { path: "trader", select: "name phone" },
          { path: "supplier", select: "name businessName phone" },
        ],
      })
      .populate({
        path: "linkedOrder",
        select: "totalAmount status createdAt",
      })
      .populate("reportedItems.product", "name price images")
      .lean();

    if (!report) {
      return createError(res, 404, "طلب الاسترجاع غير موجود");
    }

    res.status(200).json({
      success: true,
      report,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/reports/:reportId/status
// Supplier who owns the report (or Admin fallback) approves / rejects with optional supplierNote
export const updateReportStatus = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { status, supplierNote } = req.body;

    if (!["approved", "rejected", "pending", "delivered"].includes(status)) {
      return createError(res, 400, "حالة غير صالحة");
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return createError(res, 404, "طلب الاسترجاع غير موجود");
    }

    const isReportSupplier =
      req.user.role === "supplier" &&
      report.supplier?.toString() === req.user._id.toString();

    if (!isReportSupplier && req.user.role !== "admin") {
      return createError(
        res,
        403,
        "غير مصرح - فقط المورد صاحب الطلبية يمكنه تعديل حالة طلب الاسترجاع"
      );
    }

    report.status = status;
    if (supplierNote !== undefined) {
      report.supplierNote = String(supplierNote).trim();
    }
    await report.save();

    // Notify Trader when Supplier updates the report status
    try {
      const traderUser = await User.findById(report.trader)
        .select("tokens")
        .lean();
      const tokens = Array.isArray(traderUser?.tokens)
        ? traderUser.tokens.filter(Boolean)
        : [];
      if (tokens.length > 0 && ["approved", "rejected"].includes(status)) {
        const statusAr = status === "approved" ? "الموافقة على" : "رفض";
        const reasonSuffix = report.supplierNote
          ? ` — ملاحظة المورد: ${report.supplierNote}`
          : "";
        sendPushNotification(
          tokens,
          "تحديث حالة طلب الاسترجاع / الاستبدال",
          `تمت ${statusAr} طلبك من طرف المورد.${reasonSuffix}`,
          { reportId: report._id.toString(), type: "REPORT_STATUS" }
        );
      }
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: `تم تحديث حالة الطلب إلى ${status}`,
      report,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/reports/:reportId/escalate (Trader escalates rejected or stalled report to Admin as a dispute)
export const escalateReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { disputeNote } = req.body;

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return createError(res, 400, "معرف الطلب غير صالح");
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return createError(res, 404, "طلب الاسترجاع غير موجود");
    }

    if (report.trader.toString() !== req.user._id.toString()) {
      return createError(res, 403, "غير مصرح لك بتصعيد هذا الطلب");
    }

    report.disputeEscalated = true;
    report.disputeNote = String(disputeNote || "").trim();
    await report.save();

    // Notify Admins about the escalated dispute
    try {
      const admins = await User.find({
        role: "admin",
        isActive: { $ne: false },
      })
        .select("tokens")
        .lean();
      const tokens = [
        ...new Set(
          admins
            .flatMap((a) => (Array.isArray(a.tokens) ? a.tokens : []))
            .filter(Boolean)
        ),
      ];
      if (tokens.length > 0) {
        const traderName = req.user?.name || "تاجر";
        sendPushNotification(
          tokens,
          "تصعيد نزاع استرجاع من تاجر",
          `قام ${traderName} بتصعيد طلب استرجاع للنظر فيه من الإدارة.`,
          { reportId: report._id.toString(), type: "DISPUTE_ESCALATED" }
        );
      }
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: "تم تصعيد النزاع للإدارة للمراجعة",
      report,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/pending
export const getPendingReports = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return createError(res, 403, "غير مصرح - فقط الإدارة");
    }

    const reports = await Report.find({ status: "pending" })
      .populate("order", "totalAmount status createdAt")
      .populate("trader", "name phone")
      .populate("supplier", "name businessName phone")
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
      .populate("supplier", "name businessName phone")
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

// DELETE /api/reports/:reportId — restricted to owner Trader while pending (or Admin)
export const deleteReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return createError(res, 400, "معرف الطلب غير صالح");
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return createError(res, 404, "طلب الاسترجاع غير موجود");
    }

    const isOwnerTrader =
      report.trader?.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwnerTrader && !isAdmin) {
      return createError(res, 403, "غير مصرح لك بحذف هذا الطلب");
    }

    if (!isAdmin && report.status !== "pending") {
      return createError(
        res,
        400,
        "لا يمكن حذف طلب الاسترجاع بعد مراجعته من طرف المورد"
      );
    }

    if (Array.isArray(report.images) && report.images.length > 0) {
      await Promise.all(
        report.images.map((url) => deleteFileByUrl(url).catch(() => {}))
      );
    }

    await report.deleteOne();
    res.status(200).json({
      success: true,
      message: "تم حذف طلب الاسترجاع بنجاح",
    });
  } catch (err) {
    next(err);
  }
};

export default {
  createReport,
  getTraderBenefits,
  getReportsByOrder,
  getMyReports,
  updateReportStatus,
  escalateReport,
  getPendingReports,
  getAllReports,
  deleteReport,
};
