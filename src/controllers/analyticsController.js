import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Report from "../models/Report.js";
import SubscriptionRequest from "../models/SubscriptionRequest.js";
import Ads from "../models/Ads.js";
import User from "../models/User.js";
import moment from "moment-timezone";
import { getVisibleSupplierIds } from "./subscriptionController.js";

// Helper to get start/end of today in your timezone (Algeria = UTC+1)
const getTodayRange = () => {
  const start = moment().tz("Africa/Algiers").startOf("day").toDate();
  const end = moment().tz("Africa/Algiers").endOf("day").toDate();
  return { start, end };
};

// Main analytics endpoint for admin dashboard
export const getAdminDashboardAnalytics = async (req, res) => {
  try {
    const today = getTodayRange();

    // 1. Pending Orders (status = pending)
    const pendingOrdersCount = await Order.countDocuments({
      status: "pending",
    });

    // 2. Pending Reports (status = pending)
    const pendingReportsCount = await Report.countDocuments({
      status: "pending",
    });

    // 3. New Traders today
    const newTradersToday = await User.countDocuments({
      role: "trader",
      createdAt: { $gte: today.start, $lte: today.end },
    });

    // 4. New Suppliers today
    const newSuppliersToday = await User.countDocuments({
      role: "supplier",
      createdAt: { $gte: today.start, $lte: today.end },
    });

    // 5. Active Traders
    const activeTraders = await User.countDocuments({
      role: "trader",
      isActive: { $ne: false },
    });

    // 6. Active Suppliers
    const activeSuppliers = await User.countDocuments({
      role: "supplier",
      isActive: { $ne: false },
    });

    // 7. Orders today
    const ordersToday = await Order.countDocuments({
      createdAt: { $gte: today.start, $lte: today.end },
    });

    // 8. Total revenue today (sum of totalAmount for delivered/confirmed orders today)
    const revenueTodayResult = await Order.aggregate([
      {
        $match: {
          status: { $in: ["confirmed", "shipped", "delivered"] },
          createdAt: { $gte: today.start, $lte: today.end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]);

    const revenueToday = revenueTodayResult[0]?.total || 0;

    // 9. Pending reports that are overdue (created > 48h ago and still pending)
    const overdueReports = await Report.countDocuments({
      status: "pending",
      createdAt: { $lt: moment().subtract(48, "hours").toDate() },
    });

    res.status(200).json({
      success: true,
      data: {
        pendingOrders: pendingOrdersCount,
        pendingReports: pendingReportsCount,
        overdueReports,
        newTradersToday,
        newSuppliersToday,
        activeTraders,
        activeSuppliers,
        ordersToday,
        revenueToday,
      },
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب الإحصائيات",
      error: error.message,
    });
  }
};

export const getDashboardAnalyticsTabs = async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user._id;

    let queryOrder = {};
    let queryReport = {};

    if (role === "admin") {
      queryOrder = { status: "pending" };
      queryReport = {
        disputeEscalated: true,
        status: { $in: ["pending", "rejected"] },
      };
    } else if (role === "supplier") {
      queryOrder = { status: "pending", supplier: userId };
      queryReport = { status: "pending", supplier: userId };
    }

    const today = getTodayRange();

    const [
      pendingOrdersCount,
      pendingReportsCount,
      newTradersToday,
      pendingSubscriptionsCount,
      pendingAdsCount,
    ] = await Promise.all([
      Order.countDocuments(queryOrder),
      Report.countDocuments(queryReport),
      role === "admin"
        ? User.countDocuments({
            role: "trader",
            createdAt: { $gte: today.start, $lte: today.end },
          })
        : 0,
      role === "admin"
        ? SubscriptionRequest.countDocuments({ status: "pending" })
        : 0,
      role === "admin"
        ? Ads.countDocuments({ approvalStatus: "pending" })
        : 0,
    ]);

    res.status(200).json({
      success: true,
      data: {
        pendingOrders: pendingOrdersCount,
        pendingReports: pendingReportsCount,
        newTradersToday,
        pendingSubscriptions: pendingSubscriptionsCount,
        pendingAds: pendingAdsCount,
      },
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب الإحصائيات",
      error: error.message,
    });
  }
};

export const getPendingOrdersCount = async (req, res) => {
  try {
    const count = await Order.countDocuments({ status: "pending" });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getPendingReportsCount = async (req, res) => {
  try {
    const count = await Report.countDocuments({ status: "pending" });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getNewUsersToday = async (req, res) => {
  try {
    const today = getTodayRange();
    const traders = await User.countDocuments({
      role: "trader",
      createdAt: { $gte: today.start, $lte: today.end },
    });
    const suppliers = await User.countDocuments({
      role: "supplier",
      createdAt: { $gte: today.start, $lte: today.end },
    });
    res.json({
      success: true,
      tradersToday: traders,
      suppliersToday: suppliers,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Public algorithm-based popular categories (ranked by real order demand + active supply)
export const getPopularCategories = async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 8));
    const { allowedSupplierIds } = await getVisibleSupplierIds();

    const [orderDemand, productSupply] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            status: { $ne: "cancelled" },
            supplier: { $in: allowedSupplierIds },
          },
        },
        { $unwind: "$products" },
        {
          $lookup: {
            from: "products",
            localField: "products.product",
            foreignField: "_id",
            as: "prod",
          },
        },
        { $unwind: "$prod" },
        { $match: { "prod.category": { $exists: true, $ne: "" } } },
        {
          $group: {
            _id: "$prod.category",
            orderCount: { $sum: 1 },
            totalQuantity: { $sum: "$products.quantity" },
          },
        },
      ]),
      Product.aggregate([
        {
          $match: {
            isActive: { $ne: false },
            supplier: { $in: allowedSupplierIds },
            category: { $exists: true, $ne: "" },
          },
        },
        {
          $group: {
            _id: "$category",
            productCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const scoreMap = new Map();
    for (const p of productSupply) {
      scoreMap.set(p._id, {
        categoryId: p._id,
        orderCount: 0,
        totalQuantity: 0,
        productCount: p.productCount || 0,
        score: (p.productCount || 0) * 1.5,
      });
    }

    for (const o of orderDemand) {
      const existing = scoreMap.get(o._id) || {
        categoryId: o._id,
        orderCount: 0,
        totalQuantity: 0,
        productCount: 0,
        score: 0,
      };
      existing.orderCount = o.orderCount || 0;
      existing.totalQuantity = o.totalQuantity || 0;
      // Weight real order demand heavily above catalog count
      existing.score += existing.orderCount * 10 + existing.totalQuantity * 2;
      scoreMap.set(o._id, existing);
    }

    const ranked = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.status(200).json({
      success: true,
      data: ranked,
    });
  } catch (error) {
    console.error("Popular Categories Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل حساب الفئات الأكثر طلباً",
    });
  }
};
