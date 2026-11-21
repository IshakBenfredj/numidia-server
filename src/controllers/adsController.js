import Ads from "../models/Ads.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Notification from "../models/Notification.js";
import mongoose from "mongoose";
import { deleteFileByUrl, uploadSingleImage } from "../utils/r2storage.js";
import { sendPushNotification } from "../utils/pushNotifications.js";
import {
  getOrCreateSettings,
  getVisibleSupplierIds,
} from "./subscriptionController.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const VALID_TARGET_TYPES = [
  "product",
  "product_collection",
  "supplier_profile",
  "external_url",
  "none",
];

function sanitizeObjectId(val) {
  if (!val) return null;
  const str = typeof val === "object" ? val._id || val.id : String(val).trim();
  if (!str || !mongoose.Types.ObjectId.isValid(str)) return null;
  return new mongoose.Types.ObjectId(str);
}

function sanitizeObjectIdArray(arr) {
  if (!Array.isArray(arr)) return [];
  const unique = new Set();
  for (const item of arr) {
    const id = sanitizeObjectId(item);
    if (id) unique.add(id.toString());
  }
  return Array.from(unique).map((s) => new mongoose.Types.ObjectId(s));
}

async function notifyAdmins(title, body, data = {}) {
  try {
    const admins = await User.find({
      role: "admin",
      isActive: { $ne: false },
    })
      .select("tokens")
      .lean();
    const tokens = [
      ...new Set(
        admins.flatMap((a) => (Array.isArray(a.tokens) ? a.tokens : [])).filter(Boolean)
      ),
    ];
    if (tokens.length > 0) {
      await sendPushNotification(tokens, title, body, data);
    }
  } catch (err) {
    console.error("Notify admins error:", err);
  }
}

async function notifySingleUser(userId, title, body, data = {}) {
  try {
    if (!userId) return;
    const user = await User.findById(userId).select("tokens").lean();
    const tokens = Array.isArray(user?.tokens) ? user.tokens.filter(Boolean) : [];
    if (tokens.length > 0) {
      await sendPushNotification(tokens, title, body, data);
    }
  } catch (err) {
    console.error("Notify single user error:", err);
  }
}

/**
 * Send a promotional push notification for an active ad to TRADERS ONLY.
 */
export async function sendAdNotificationToTraders(
  adDoc,
  { customTitle, customBody, sentBy } = {}
) {
  try {
    const ad = await Ads.findById(adDoc._id || adDoc)
      .populate("supplier", "name businessName")
      .populate("targetProduct", "name price isBundle bundleItems")
      .populate("targetSupplier", "name businessName");

    if (!ad) return { sentCount: 0 };

    const traders = await User.find({
      role: "trader",
      isActive: { $ne: false },
    })
      .select("tokens")
      .lean();

    const traderTokens = [
      ...new Set(
        traders
          .flatMap((t) => (Array.isArray(t.tokens) ? t.tokens : []))
          .filter(Boolean)
      ),
    ];

    const supplierLabel =
      ad.targetSupplier?.businessName ||
      ad.targetSupplier?.name ||
      ad.supplier?.businessName ||
      ad.supplier?.name ||
      "مورد معتمد";

    const notifTitle =
      (customTitle && customTitle.trim()) ||
      (ad.title && ad.title !== "إعلان"
        ? `عرض مميز: ${ad.title}`
        : `عرض جديد من ${supplierLabel}`);

    let defaultBody = "اكتشف هذا العرض الترويجي الجديد الآن على الصفحة الرئيسية في نوميديا.";
    if (ad.targetType === "product" && ad.targetProduct?.name) {
      if (ad.targetProduct.isBundle) {
        const itemsCount = Array.isArray(ad.targetProduct.bundleItems)
          ? ad.targetProduct.bundleItems.length
          : 0;
        defaultBody =
          itemsCount > 0
            ? `تجميعة خاصة: ${ad.targetProduct.name} (${itemsCount} أصناف) بسعر ${ad.targetProduct.price} دج.`
            : `تجميعة خاصة: ${ad.targetProduct.name} بسعر ${ad.targetProduct.price} دج.`;
      } else {
        defaultBody = `تصفح المنتج المميز: ${ad.targetProduct.name} بسعر ${ad.targetProduct.price} دج.`;
      }
    } else if (
      ad.targetType === "product_collection" &&
      Array.isArray(ad.targetProducts) &&
      ad.targetProducts.length > 0
    ) {
      defaultBody = `تجميعة خاصة تضم ${ad.targetProducts.length} منتجات مختارة من ${supplierLabel}.`;
    } else if (ad.targetType === "supplier_profile") {
      defaultBody = `تصفح أحدث منتجات وعروض متجر ${supplierLabel} الآن.`;
    }

    const notifBody = (customBody && customBody.trim()) || defaultBody;

    const payload = {
      type: "promoted_ad",
      adId: ad._id.toString(),
      targetType: ad.targetType || "none",
      targetProductId: ad.targetProduct?._id?.toString() || "",
      targetSupplierId: ad.targetSupplier?._id?.toString() || "",
      clickUrl: ad.clickUrl || "",
    };

    let pushResult = null;
    if (traderTokens.length > 0) {
      pushResult = await sendPushNotification(
        traderTokens,
        notifTitle,
        notifBody,
        payload
      );
    }

    ad.lastNotifiedAt = new Date();
    ad.notificationsSentCount = (ad.notificationsSentCount || 0) + 1;
    await ad.save();

    await Notification.create({
      title: notifTitle,
      body: notifBody,
      targetGroup: "traders",
      recipientCount: traderTokens.length,
      data: payload,
      sentBy: sentBy || undefined,
    }).catch(() => {});

    return {
      sentCount: traderTokens.length,
      title: notifTitle,
      body: notifBody,
      fcmSkipped: Boolean(pushResult?.fcmSkipped),
      fcmResult: pushResult?.fcm || null,
    };
  } catch (error) {
    console.error("Send Ad Notification To Traders Error:", error);
    return { sentCount: 0, error: error.message };
  }
}

/**
 * Scheduled task (cron): expires finished ads and sends periodic trader-only notifications.
 */
export async function processPeriodicAdNotifications() {
  try {
    const now = new Date();

    // 1. Auto-deactivate expired ads
    await Ads.updateMany(
      {
        isActive: true,
        expiresAt: { $ne: null, $lte: now },
      },
      { $set: { isActive: false } }
    );

    // 2. Find active approved ads with periodic trader notifications enabled
    const activeAds = await Ads.find({
      isActive: true,
      approvalStatus: { $nin: ["pending", "rejected"] },
      notifyTradersPeriodically: true,
      "image.url": { $exists: true, $ne: "" },
      $or: [
        { expiresAt: null },
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: now } },
      ],
    });

    for (const ad of activeAds) {
      const intervalHours = Math.max(1, Number(ad.notificationIntervalHours) || 24);
      const last = ad.lastNotifiedAt ? new Date(ad.lastNotifiedAt).getTime() : 0;
      if (!last || now.getTime() - last >= intervalHours * HOUR_MS) {
        await sendAdNotificationToTraders(ad);
      }
    }
  } catch (error) {
    console.error("Periodic Ad Notifications Cron Error:", error);
  }
}

// GET /api/ads/settings (Protected — Suppliers & Admin)
export const getAdSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.status(200).json({
      success: true,
      data: {
        selfAdPrice: settings.selfAdPrice ?? 1500,
        adminDesignAdPrice: settings.adminDesignAdPrice ?? 3000,
        defaultAdDurationDays: settings.defaultAdDurationDays ?? 7,
        adNotificationIntervalHours: settings.adNotificationIntervalHours ?? 24,
        adDimensionsGuide:
          settings.adDimensionsGuide || "1200 × 750 بكسل (نسبة 16:10 أفقية)",
        ccpNumber: settings.ccpNumber || "",
        ccpName: settings.ccpName || "",
        baridiMobRip: settings.baridiMobRip || "",
        whatsappNumber: settings.whatsappNumber || "",
        instructions: settings.instructions || "",
      },
    });
  } catch (error) {
    console.error("Get Ad Settings Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحميل إعدادات وأسعار الإعلانات",
    });
  }
};

// PUT /api/ads/settings (Admin)
export const updateAdSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const {
      selfAdPrice,
      adminDesignAdPrice,
      defaultAdDurationDays,
      adNotificationIntervalHours,
      adDimensionsGuide,
    } = req.body;

    if (selfAdPrice !== undefined) {
      settings.selfAdPrice = Math.max(0, Number(selfAdPrice) || 0);
    }
    if (adminDesignAdPrice !== undefined) {
      settings.adminDesignAdPrice = Math.max(0, Number(adminDesignAdPrice) || 0);
    }
    if (defaultAdDurationDays !== undefined) {
      settings.defaultAdDurationDays = Math.max(
        1,
        Number(defaultAdDurationDays) || 7
      );
    }
    if (adNotificationIntervalHours !== undefined) {
      settings.adNotificationIntervalHours = Math.max(
        1,
        Number(adNotificationIntervalHours) || 24
      );
    }
    if (adDimensionsGuide !== undefined) {
      settings.adDimensionsGuide = String(adDimensionsGuide).trim();
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: "تم حفظ أسعار وإعدادات الإعلانات بنجاح",
      data: {
        selfAdPrice: settings.selfAdPrice,
        adminDesignAdPrice: settings.adminDesignAdPrice,
        defaultAdDurationDays: settings.defaultAdDurationDays,
        adNotificationIntervalHours: settings.adNotificationIntervalHours,
        adDimensionsGuide: settings.adDimensionsGuide,
      },
    });
  } catch (error) {
    console.error("Update Ad Settings Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل تحديث إعدادات الإعلانات",
    });
  }
};

// POST /api/ads/supplier-request (Supplier submits self-made or admin-design ad + payment receipt)
export const submitSupplierAdRequest = async (req, res) => {
  try {
    const {
      title,
      creationMode = "self_made",
      imageBase64,
      referenceImageBase64,
      receiptImage,
      targetType = "supplier_profile",
      targetProduct,
      targetProducts,
      targetSupplier,
      clickUrl,
      designNotes,
      durationUnits = 1,
    } = req.body;

    if (!["self_made", "admin_design"].includes(creationMode)) {
      return res.status(400).json({
        success: false,
        message: "نوع طلب الإعلان غير صالح",
      });
    }

    if (!receiptImage || typeof receiptImage !== "string") {
      return res.status(400).json({
        success: false,
        message: "يرجى إرفاق صورة وصل الدفع أولاً",
      });
    }

    if (creationMode === "self_made" && !imageBase64) {
      return res.status(400).json({
        success: false,
        message: "يرجى إرفاق صورة الإعلان بالمقاسات الموضحة",
      });
    }

    if (
      creationMode === "admin_design" &&
      (!designNotes || !String(designNotes).trim()) &&
      (!title || !String(title).trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "يرجى توضيح تفاصيل الإعلان المطلوب تصميمه من الإدارة",
      });
    }

    const safeTargetType = VALID_TARGET_TYPES.includes(targetType)
      ? targetType
      : "supplier_profile";

    const cleanTargetProduct =
      safeTargetType === "product" ? sanitizeObjectId(targetProduct) : null;
    const cleanTargetProducts =
      safeTargetType === "product_collection"
        ? sanitizeObjectIdArray(targetProducts)
        : [];
    const cleanTargetSupplier =
      safeTargetType === "supplier_profile"
        ? sanitizeObjectId(targetSupplier) || req.user._id
        : null;
    const cleanClickUrl =
      safeTargetType === "external_url" ? String(clickUrl || "").trim() : "";

    if (safeTargetType === "product" && !cleanTargetProduct) {
      return res.status(400).json({
        success: false,
        message: "يرجى اختيار المنتج المستهدف أو إدخال معرفه الصحيح",
      });
    }
    if (safeTargetType === "product_collection" && cleanTargetProducts.length === 0) {
      return res.status(400).json({
        success: false,
        message: "يرجى اختيار منتج واحد على الأقل ضمن التجميعة",
      });
    }
    if (safeTargetType === "external_url" && !cleanClickUrl) {
      return res.status(400).json({
        success: false,
        message: "يرجى إدخال الرابط الخارجي للإعلان",
      });
    }

    const settings = await getOrCreateSettings();
    const units = Math.min(12, Math.max(1, Number(durationUnits) || 1));
    const basePrice =
      creationMode === "admin_design"
        ? Number(settings.adminDesignAdPrice ?? 3000)
        : Number(settings.selfAdPrice ?? 1500);
    const totalPrice = basePrice * units;
    const durationDays = Math.max(1, Number(settings.defaultAdDurationDays ?? 7)) * units;

    // Upload receipt & ad/reference images to R2
    const receiptUrl = await uploadSingleImage(receiptImage, "receipts");
    let bannerUrl = "";
    let refUrl = "";

    if (creationMode === "self_made" && imageBase64) {
      bannerUrl = await uploadSingleImage(imageBase64, "ads");
    } else if (referenceImageBase64) {
      refUrl = await uploadSingleImage(referenceImageBase64, "ads");
    } else if (creationMode === "admin_design" && imageBase64) {
      refUrl = await uploadSingleImage(imageBase64, "ads");
    }

    const ad = await Ads.create({
      title: (title && String(title).trim()) || "إعلان مميز",
      image: { url: bannerUrl },
      referenceImage: refUrl,
      receiptImage: receiptUrl,
      supplier: req.user._id,
      creationMode,
      approvalStatus: "pending",
      isActive: false, // Must be approved by Admin first!
      targetType: safeTargetType,
      targetProduct: cleanTargetProduct,
      targetProducts: cleanTargetProducts,
      targetSupplier: cleanTargetSupplier,
      clickUrl: cleanClickUrl,
      designNotes: String(designNotes || "").trim(),
      price: totalPrice,
      durationDays,
      notifyTradersPeriodically: true,
      notificationIntervalHours: Number(settings.adNotificationIntervalHours ?? 24),
    });

    const supplierName = req.user?.businessName || req.user?.name || "مورد";
    const modeLabel =
      creationMode === "admin_design"
        ? "طلب تصميم إعلان من الإدارة"
        : "إعلان جاهز بانتظار الموافقة";

    await notifyAdmins(
      "طلب إعلان جديد من مورد",
      `أرسل ${supplierName} ${modeLabel} مع وصل الدفع (${totalPrice} دج).`,
      { type: "ad_request", adId: ad._id.toString() }
    );

    res.status(201).json({
      success: true,
      message:
        "تم إرسال طلب الإعلان ووصل الدفع بنجاح، سيتم مراجعته والقبول به من طرف الإدارة قبل النشر",
      ad,
    });
  } catch (error) {
    console.error("Submit Supplier Ad Request Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل إرسال طلب الإعلان",
    });
  }
};

// GET /api/ads/my-ads (Supplier's submitted & active ads)
export const getMyAds = async (req, res) => {
  try {
    const ads = await Ads.find({ supplier: req.user._id })
      .sort({ createdAt: -1 })
      .populate("targetProduct", "name price images")
      .populate("targetProducts", "name price images")
      .populate("targetSupplier", "name businessName logo")
      .lean();

    res.status(200).json({
      success: true,
      count: ads.length,
      ads,
    });
  } catch (error) {
    console.error("Get My Ads Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب إعلاناتك",
    });
  }
};

// PUT /api/ads/:id/approve (Admin reviews receipt, optionally uploads designed banner & publishes)
export const approveAdRequest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    const {
      title,
      imageBase64,
      targetType,
      targetProduct,
      targetProducts,
      targetSupplier,
      clickUrl,
      durationDays,
      notifyTradersPeriodically,
      notificationIntervalHours,
      adminNote,
      sendImmediateNotification = true,
    } = req.body;

    if (
      imageBase64 &&
      typeof imageBase64 === "string" &&
      imageBase64.startsWith("data:image")
    ) {
      const uploadedUrl = await uploadSingleImage(imageBase64, "ads");
      if (ad.image?.url) {
        await deleteFileByUrl(ad.image.url).catch(() => {});
      }
      ad.image = { url: uploadedUrl };
    }

    if (!ad.image?.url) {
      return res.status(400).json({
        success: false,
        message: "يرجى إرفاق صورة البانر النهائي قبل الموافقة ونشر الإعلان",
      });
    }

    if (title !== undefined && String(title).trim()) {
      ad.title = String(title).trim();
    }
    if (targetType && VALID_TARGET_TYPES.includes(targetType)) {
      ad.targetType = targetType;
      ad.targetProduct =
        targetType === "product" ? sanitizeObjectId(targetProduct) : null;
      ad.targetProducts =
        targetType === "product_collection"
          ? sanitizeObjectIdArray(targetProducts)
          : [];
      ad.targetSupplier =
        targetType === "supplier_profile"
          ? sanitizeObjectId(targetSupplier) || ad.supplier || null
          : null;
      ad.clickUrl =
        targetType === "external_url" ? String(clickUrl || "").trim() : "";
    }

    const finalDuration = Math.max(
      1,
      Number(durationDays !== undefined ? durationDays : ad.durationDays) || 7
    );
    const now = new Date();
    ad.durationDays = finalDuration;
    ad.startsAt = now;
    ad.expiresAt = new Date(now.getTime() + finalDuration * DAY_MS);
    ad.approvalStatus = "approved";
    ad.isActive = true;
    ad.reviewedBy = req.user._id;
    ad.reviewedAt = now;

    if (notifyTradersPeriodically !== undefined) {
      ad.notifyTradersPeriodically = Boolean(notifyTradersPeriodically);
    }
    if (notificationIntervalHours !== undefined) {
      ad.notificationIntervalHours = Math.max(
        1,
        Number(notificationIntervalHours) || 24
      );
    }
    if (adminNote !== undefined) {
      ad.adminNote = String(adminNote).trim();
    }

    await ad.save();

    // Notify supplier that their ad was approved
    if (ad.supplier) {
      await notifySingleUser(
        ad.supplier,
        "تمت الموافقة على إعلانك ونشره",
        `إعلانك "${ad.title}" أصبح نشطاً الآن في الصفحة الرئيسية لمدة ${finalDuration} يوم.`,
        { type: "ad_approved", adId: ad._id.toString() }
      );
    }

    // Send immediate push notification to Traders ONLY if enabled
    let traderNotifResult = null;
    if (sendImmediateNotification !== false) {
      traderNotifResult = await sendAdNotificationToTraders(ad, {
        sentBy: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "تمت الموافقة على الإعلان ونشره بنجاح",
      ad,
      traderNotification: traderNotifResult,
    });
  } catch (error) {
    console.error("Approve Ad Request Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل قبول الإعلان",
    });
  }
};

// PUT /api/ads/:id/reject (Admin rejects supplier ad request)
export const rejectAdRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    ad.approvalStatus = "rejected";
    ad.isActive = false;
    ad.adminNote = String(adminNote || "").trim();
    ad.reviewedBy = req.user._id;
    ad.reviewedAt = new Date();
    await ad.save();

    if (ad.supplier) {
      await notifySingleUser(
        ad.supplier,
        "تم رفض طلب الإعلان",
        ad.adminNote
          ? `السبب: ${ad.adminNote}`
          : "يرجى مراجعة صورة الإعلان أو وصل الدفع والتواصل مع الإدارة.",
        { type: "ad_rejected", adId: ad._id.toString() }
      );
    }

    res.status(200).json({
      success: true,
      message: "تم رفض طلب الإعلان",
      ad,
    });
  } catch (error) {
    console.error("Reject Ad Request Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل رفض طلب الإعلان",
    });
  }
};

// POST /api/ads/:id/notify-traders (Admin manually triggers Trader-only push notification for an ad)
export const notifyTradersForAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, body } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    const result = await sendAdNotificationToTraders(ad, {
      customTitle: title,
      customBody: body,
      sentBy: req.user._id,
    });

    const msg = result.fcmSkipped
      ? "لم يتم ضبط مفتاح FIREBASE_SERVICE_ACCOUNT على سيرفر Render لإشعارات Flutter"
      : `تم إرسال إشعار الإعلان إلى ${result.sentCount} جهاز من أجهزة التجار`;

    res.status(200).json({
      success: true,
      message: msg,
      result,
    });
  } catch (error) {
    console.error("Notify Traders For Ad Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل إرسال إشعار الإعلان للتجار",
    });
  }
};

// CREATE - Admin directly creates and publishes an ad (with optional target & immediate trader notification)
export const createAd = async (req, res) => {
  try {
    const {
      title,
      imageBase64,
      clickUrl,
      isActive,
      targetType = "none",
      targetProduct,
      targetProducts,
      targetSupplier,
      durationDays,
      notifyTradersPeriodically = true,
      notificationIntervalHours = 24,
      sendImmediateNotification = false,
    } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: "صورة الإعلان مطلوبة",
      });
    }

    const imageUrl = await uploadSingleImage(imageBase64, "ads");
    const safeTargetType = VALID_TARGET_TYPES.includes(targetType)
      ? targetType
      : clickUrl
        ? "external_url"
        : "none";

    const days = durationDays ? Math.max(1, Number(durationDays) || 7) : null;
    const now = new Date();

    const ad = await Ads.create({
      title: (title && String(title).trim()) || "إعلان جديد",
      image: { url: imageUrl },
      creationMode: "admin_direct",
      approvalStatus: "approved",
      clickUrl: clickUrl ? String(clickUrl).trim() : "",
      targetType: safeTargetType,
      targetProduct:
        safeTargetType === "product" ? sanitizeObjectId(targetProduct) : null,
      targetProducts:
        safeTargetType === "product_collection"
          ? sanitizeObjectIdArray(targetProducts)
          : [],
      targetSupplier:
        safeTargetType === "supplier_profile"
          ? sanitizeObjectId(targetSupplier)
          : null,
      durationDays: days || 30,
      startsAt: now,
      expiresAt: days ? new Date(now.getTime() + days * DAY_MS) : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      notifyTradersPeriodically: Boolean(notifyTradersPeriodically),
      notificationIntervalHours: Math.max(
        1,
        Number(notificationIntervalHours) || 24
      ),
      reviewedBy: req.user._id,
      reviewedAt: now,
    });

    if (sendImmediateNotification && ad.isActive) {
      await sendAdNotificationToTraders(ad, { sentBy: req.user._id });
    }

    res.status(201).json({
      success: true,
      message: "تم إنشاء الإعلان بنجاح",
      ad,
    });
  } catch (error) {
    console.error("Create Ad Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل إنشاء الإعلان",
    });
  }
};

// UPDATE - Replace image or update fields
export const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      imageBase64,
      clickUrl,
      isActive,
      targetType,
      targetProduct,
      targetProducts,
      targetSupplier,
      notifyTradersPeriodically,
      notificationIntervalHours,
      durationDays,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    let updatedImage = ad.image;
    if (
      imageBase64 &&
      typeof imageBase64 === "string" &&
      imageBase64.startsWith("data:image")
    ) {
      const newImageUrl = await uploadSingleImage(imageBase64, "ads");
      if (ad.image?.url) {
        await deleteFileByUrl(ad.image.url).catch((err) =>
          console.error("Failed to delete old ad image:", err)
        );
      }
      updatedImage = { url: newImageUrl };
    }

    const updatePayload = {
      title: title !== undefined ? title : ad.title,
      image: updatedImage,
      clickUrl: clickUrl !== undefined ? clickUrl : ad.clickUrl,
      isActive: isActive !== undefined ? Boolean(isActive) : ad.isActive,
    };

    if (targetType && VALID_TARGET_TYPES.includes(targetType)) {
      updatePayload.targetType = targetType;
      updatePayload.targetProduct =
        targetType === "product" ? sanitizeObjectId(targetProduct) : null;
      updatePayload.targetProducts =
        targetType === "product_collection"
          ? sanitizeObjectIdArray(targetProducts)
          : [];
      updatePayload.targetSupplier =
        targetType === "supplier_profile"
          ? sanitizeObjectId(targetSupplier)
          : null;
    }

    if (notifyTradersPeriodically !== undefined) {
      updatePayload.notifyTradersPeriodically = Boolean(notifyTradersPeriodically);
    }
    if (notificationIntervalHours !== undefined) {
      updatePayload.notificationIntervalHours = Math.max(
        1,
        Number(notificationIntervalHours) || 24
      );
    }
    if (durationDays !== undefined) {
      const days = Math.max(1, Number(durationDays) || 7);
      updatePayload.durationDays = days;
      const start = ad.startsAt ? new Date(ad.startsAt) : new Date();
      updatePayload.startsAt = start;
      updatePayload.expiresAt = new Date(start.getTime() + days * DAY_MS);
    }

    const updatedAd = await Ads.findByIdAndUpdate(id, updatePayload, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "تم تحديث الإعلان بنجاح",
      ad: updatedAd,
    });
  } catch (error) {
    console.error("Update Ad Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل تحديث الإعلان",
    });
  }
};

// DELETE
export const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    for (const url of [ad.image?.url, ad.receiptImage, ad.referenceImage]) {
      if (url) {
        await deleteFileByUrl(url).catch((err) =>
          console.error("Failed to delete ad asset:", err)
        );
      }
    }

    await Ads.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "تم حذف الإعلان بنجاح",
    });
  } catch (error) {
    console.error("Delete Ad Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل حذف الإعلان",
    });
  }
};

// READ ALL - Admin dashboard (all requests & ads with populated refs)
export const getAllAds = async (req, res) => {
  try {
    const { approvalStatus } = req.query;
    const query = {};
    if (approvalStatus && ["pending", "approved", "rejected"].includes(approvalStatus)) {
      query.approvalStatus = approvalStatus;
    }

    const ads = await Ads.find(query)
      .sort({ createdAt: -1 })
      .populate("supplier", "name businessName phone logo type")
      .populate("targetProduct", "name price images isBundle bundleItems")
      .populate("targetProducts", "name price images isBundle")
      .populate("targetSupplier", "name businessName logo type")
      .select("-__v")
      .lean();

    res.status(200).json({
      success: true,
      count: ads.length,
      ads,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الإعلانات",
    });
  }
};

// READ ACTIVE - Public Home Carousel (only approved, active, non-expired ads with banner image)
export const getActiveAds = async (req, res) => {
  try {
    const now = new Date();
    const ads = await Ads.find({
      isActive: true,
      approvalStatus: { $nin: ["pending", "rejected"] },
      "image.url": { $exists: true, $ne: "" },
      $or: [
        { expiresAt: null },
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: now } },
      ],
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "targetProduct",
        populate: {
          path: "supplier",
          select: "name phone logo businessName",
        },
      })
      .populate("targetSupplier", "name businessName logo type")
      .lean();

    // Hide ads linked to unsubscribed/expired suppliers when subscriptions are enabled
    const { subscriptionsEnabled, allowedSupplierIdSet } =
      await getVisibleSupplierIds();
    const visibleAds = subscriptionsEnabled
      ? ads.filter((ad) => {
          const adSupplierId = ad.supplier?.toString();
          if (adSupplierId && !allowedSupplierIdSet.has(adSupplierId)) {
            return false;
          }
          const targetSupplierId = (
            ad.targetSupplier?._id || ad.targetSupplier
          )?.toString();
          if (targetSupplierId && !allowedSupplierIdSet.has(targetSupplierId)) {
            return false;
          }
          const targetProductSupplierId = (
            ad.targetProduct?.supplier?._id || ad.targetProduct?.supplier
          )?.toString();
          if (
            targetProductSupplierId &&
            !allowedSupplierIdSet.has(targetProductSupplierId)
          ) {
            return false;
          }
          return true;
        })
      : ads;

    res.status(200).json({
      success: true,
      count: visibleAds.length,
      ads: visibleAds,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الإعلانات",
    });
  }
};

// READ ONE
export const getAdById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف الإعلان غير صالح",
      });
    }

    const ad = await Ads.findById(id)
      .populate("supplier", "name businessName phone logo type")
      .populate("targetProduct", "name price images")
      .populate("targetProducts", "name price images")
      .populate("targetSupplier", "name businessName logo type")
      .select("-__v")
      .lean();

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: "الإعلان غير موجود",
      });
    }

    res.status(200).json({
      success: true,
      ad,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "فشل جلب الإعلان",
    });
  }
};
