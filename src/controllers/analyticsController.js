import Order from "../models/Order.js";
import Report from "../models/Report.js";
import User from "../models/User.js";
import moment from "moment-timezone";

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

export const getAdminDashboardAnalyticsTabs = async (req, res) => {
  try {
    const today = getTodayRange();

    const [pendingOrdersCount, pendingReportsCount, newTradersToday] =
      await Promise.all([
        Order.countDocuments({ status: "pending" }),
        Report.countDocuments({ status: "pending" }),
        User.countDocuments({
          role: "trader",
          createdAt: { $gte: today.start, $lte: today.end },
        }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        pendingOrders: pendingOrdersCount,
        pendingReports: pendingReportsCount,
        newTradersToday,
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

// Optional: More granular endpoints (can be called separately if needed)

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
