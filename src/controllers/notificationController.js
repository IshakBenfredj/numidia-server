import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { sendPushNotification } from "../utils/pushNotifications.js";

/**
 * POST /api/notifications/broadcast
 * Admin sends a push notification to specific or all users
 */
export const broadcastNotification = async (req, res) => {
  try {
    const { title, body, targetGroup = "all", data = {} } = req.body;

    if (!title || !title.trim() || !body || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: "عنوان ونص الإشعار مطلوبان",
      });
    }

    const query = { isActive: { $ne: false } };
    if (targetGroup === "traders") {
      query.role = "trader";
    } else if (targetGroup === "suppliers") {
      query.role = "supplier";
    }

    // Fetch users with tokens
    const users = await User.find(query).select("tokens").lean();

    let allTokens = [];
    users.forEach((u) => {
      if (Array.isArray(u.tokens) && u.tokens.length > 0) {
        allTokens.push(...u.tokens);
      }
    });

    // Remove duplicates
    allTokens = [...new Set(allTokens.filter(Boolean))];

    if (allTokens.length > 0) {
      await sendPushNotification(allTokens, title.trim(), body.trim(), {
        ...data,
        targetGroup,
        sentAt: new Date().toISOString(),
      });
    }

    // Save notification history log
    const notificationLog = await Notification.create({
      title: title.trim(),
      body: body.trim(),
      targetGroup,
      recipientCount: allTokens.length,
      data,
      sentBy: req.user?._id,
    });

    return res.status(200).json({
      success: true,
      message: `تم إرسال الإشعار بنجاح إلى ${allTokens.length} جهاز`,
      notification: notificationLog,
    });
  } catch (error) {
    console.error("Broadcast Notification Error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إرسال الإشعار",
      error: error.message,
    });
  }
};

/**
 * GET /api/notifications/history
 * Fetch past broadcast notifications
 */
export const getNotificationHistory = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("sentBy", "name")
      .lean();

    return res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Get Notification History Error:", error);
    return res.status(500).json({
      success: false,
      message: "فشل تحميل سجل الإشعارات",
      error: error.message,
    });
  }
};
