import SubscriptionSettings from "../models/SubscriptionSettings.js";
import SubscriptionRequest from "../models/SubscriptionRequest.js";
import User from "../models/User.js";
import { uploadSingleImage } from "../utils/r2storage.js";
import { sendPushNotification } from "../utils/pushNotifications.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getOrCreateSettings() {
  let settings = await SubscriptionSettings.findOne({ key: "global" });
  if (!settings) {
    settings = await SubscriptionSettings.create({ key: "global" });
  }
  return settings;
}

export function computeSupplierSubscriptionState(user, settings) {
  const now = new Date();
  const freeTrialDays = Number(settings?.freeTrialDays ?? 14);
  const createdAt = user.createdAt ? new Date(user.createdAt) : now;
  const trialEndsAt = user.trialEndsAt
    ? new Date(user.trialEndsAt)
    : new Date(createdAt.getTime() + freeTrialDays * DAY_MS);

  const subEnd = user.subscriptionEndDate
    ? new Date(user.subscriptionEndDate)
    : null;
  const wasSubscribed = Boolean(subEnd);

  if (!settings?.subscriptionsEnabled) {
    return {
      subscriptionsEnabled: false,
      hasAccess: true,
      effectiveStatus: "free_mode",
      wasSubscribed,
      daysRemaining: null,
      trialEndsAt,
      subscriptionEndDate: subEnd,
      subscriptionPlan: user.subscriptionPlan || "trial",
    };
  }

  if (subEnd && subEnd > now) {
    const daysRemaining = Math.max(
      1,
      Math.ceil((subEnd.getTime() - now.getTime()) / DAY_MS),
    );
    return {
      subscriptionsEnabled: true,
      hasAccess: true,
      effectiveStatus: "active",
      wasSubscribed: true,
      daysRemaining,
      trialEndsAt,
      subscriptionEndDate: subEnd,
      subscriptionPlan: user.subscriptionPlan || "monthly",
    };
  }

  if (!wasSubscribed && trialEndsAt > now) {
    const daysRemaining = Math.max(
      1,
      Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS),
    );
    return {
      subscriptionsEnabled: true,
      hasAccess: true,
      effectiveStatus: "trial",
      wasSubscribed: false,
      daysRemaining,
      trialEndsAt,
      subscriptionEndDate: subEnd,
      subscriptionPlan: "trial",
    };
  }

  return {
    subscriptionsEnabled: true,
    hasAccess: false,
    effectiveStatus: "expired",
    wasSubscribed,
    daysRemaining: 0,
    trialEndsAt,
    subscriptionEndDate: subEnd,
    subscriptionPlan: user.subscriptionPlan || "trial",
  };
}

/**
 * Returns the list & Set of supplier ObjectIds that are currently visible to Traders/Guests.
 * - Always excludes deactivated suppliers (isActive === false).
 * - When Admin has enabled subscriptions (subscriptionsEnabled === true),
 *   excludes any supplier whose subscription/trial is expired (hasAccess === false).
 */
export async function getVisibleSupplierIds() {
  const settings = await getOrCreateSettings();
  const suppliers = await User.find({
    role: "supplier",
    isActive: { $ne: false },
  })
    .select("_id createdAt trialEndsAt subscriptionEndDate subscriptionPlan")
    .lean();

  if (!settings?.subscriptionsEnabled) {
    return {
      subscriptionsEnabled: false,
      allowedSupplierIds: suppliers.map((s) => s._id),
      allowedSupplierIdSet: new Set(suppliers.map((s) => s._id.toString())),
    };
  }

  const visible = suppliers.filter(
    (s) => computeSupplierSubscriptionState(s, settings).hasAccess,
  );
  return {
    subscriptionsEnabled: true,
    allowedSupplierIds: visible.map((s) => s._id),
    allowedSupplierIdSet: new Set(visible.map((s) => s._id.toString())),
  };
}

/**
 * Automatic Supplier Verification:
 * - Only Suppliers have verification (never Traders).
 * - A Supplier is automatically verified whenever their account is active AND has subscription access.
 */
export function computeSupplierAutoVerified(user, settings) {
  if (!user || user.role !== "supplier") return false;
  if (user.isActive === false) return false;
  return computeSupplierSubscriptionState(user, settings).hasAccess === true;
}

// GET /api/subscriptions/app-version (Public — checked by every user on app launch/resume)
export const getAppVersionConfig = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.status(200).json({
      success: true,
      data: {
        latestAndroidVersion: settings.latestAndroidVersion || "1.0.0",
        latestAndroidBuildNumber: Number(settings.latestAndroidBuildNumber) || 1,
        playStoreUrl:
          settings.playStoreUrl ||
          "https://play.google.com/store/apps/details?id=com.numidia.numidia",
        updateTitle:
          settings.updateTitle || "تحديث جديد متوفر لتطبيق نوميديا",
        updateMessage:
          settings.updateMessage ||
          "يتوفر إصدار جديد من التطبيق يتضمن تحسينات مهمة وميزات جديدة. يرجى التحديث الآن من متجر جوجل.",
        forceUpdate: Boolean(settings.forceUpdate),
      },
    });
  } catch (error) {
    console.error("Get App Version Config Error:", error);
    res.status(500).json({
      success: false,
      message: "فشل جلب معلومات تحديث التطبيق",
    });
  }
};

// GET /api/subscriptions/settings
export const getSubscriptionSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("Get Subscription Settings Error:", error);
    res.status(500).json({ success: false, message: "فشل تحميل إعدادات الاشتراكات" });
  }
};

// PUT /api/subscriptions/settings (Admin)
export const updateSubscriptionSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const {
      subscriptionsEnabled,
      monthlyPrice,
      yearlyPrice,
      freeTrialDays,
      ccpNumber,
      ccpName,
      baridiMobRip,
      whatsappNumber,
      instructions,
      latestAndroidVersion,
      latestAndroidBuildNumber,
      playStoreUrl,
      updateTitle,
      updateMessage,
      forceUpdate,
    } = req.body;

    if (subscriptionsEnabled !== undefined) {
      settings.subscriptionsEnabled = Boolean(subscriptionsEnabled);
    }
    if (monthlyPrice !== undefined) {
      settings.monthlyPrice = Math.max(0, Number(monthlyPrice) || 0);
    }
    if (yearlyPrice !== undefined) {
      settings.yearlyPrice = Math.max(0, Number(yearlyPrice) || 0);
    }
    if (freeTrialDays !== undefined) {
      settings.freeTrialDays = Math.max(0, Number(freeTrialDays) || 0);
    }
    if (ccpNumber !== undefined) settings.ccpNumber = String(ccpNumber).trim();
    if (ccpName !== undefined) settings.ccpName = String(ccpName).trim();
    if (baridiMobRip !== undefined)
      settings.baridiMobRip = String(baridiMobRip).trim();
    if (whatsappNumber !== undefined)
      settings.whatsappNumber = String(whatsappNumber).trim();
    if (instructions !== undefined)
      settings.instructions = String(instructions).trim();
    if (latestAndroidVersion !== undefined && String(latestAndroidVersion).trim()) {
      settings.latestAndroidVersion = String(latestAndroidVersion).trim();
    }
    if (latestAndroidBuildNumber !== undefined) {
      settings.latestAndroidBuildNumber = Math.max(
        1,
        parseInt(latestAndroidBuildNumber, 10) || 1,
      );
    }
    if (playStoreUrl !== undefined && String(playStoreUrl).trim()) {
      settings.playStoreUrl = String(playStoreUrl).trim();
    }
    if (updateTitle !== undefined) {
      settings.updateTitle = String(updateTitle).trim();
    }
    if (updateMessage !== undefined) {
      settings.updateMessage = String(updateMessage).trim();
    }
    if (forceUpdate !== undefined) {
      settings.forceUpdate = Boolean(forceUpdate);
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: "تم حفظ إعدادات الاشتراكات بنجاح",
      data: settings,
    });
  } catch (error) {
    console.error("Update Subscription Settings Error:", error);
    res.status(500).json({ success: false, message: "فشل تحديث إعدادات الاشتراكات" });
  }
};

// GET /api/subscriptions/my-status (Supplier)
export const getMySubscriptionStatus = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    const status = computeSupplierSubscriptionState(user, settings);
    const requests = await SubscriptionRequest.find({ supplier: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const latestRequest = requests.length > 0 ? requests[0] : null;
    const pendingRequest =
      requests.find((r) => r.status === "pending") || null;

    res.status(200).json({
      success: true,
      data: {
        ...status,
        settings,
        pendingRequest,
        latestRequest,
        requests,
      },
    });
  } catch (error) {
    console.error("Get My Subscription Status Error:", error);
    res.status(500).json({ success: false, message: "فشل التحقق من حالة الاشتراك" });
  }
};

// POST /api/subscriptions/requests (Supplier submits payment receipt)
export const submitSubscriptionRequest = async (req, res) => {
  try {
    const {
      planType = "monthly",
      months = 1,
      amount = 0,
      receiptImage,
      notes = "",
    } = req.body;

    if (!receiptImage || typeof receiptImage !== "string") {
      return res.status(400).json({
        success: false,
        message: "يرجى إرفاق صورة وصل الدفع",
      });
    }

    let uploadedUrl = receiptImage;
    if (receiptImage.startsWith("data:")) {
      uploadedUrl = await uploadSingleImage(receiptImage, "receipts");
    } else if (!receiptImage.startsWith("http")) {
      uploadedUrl = await uploadSingleImage(
        `data:image/jpeg;base64,${receiptImage}`,
        "receipts",
      );
    }

    const parsedMonths = Math.max(1, Number(months) || 1);
    const parsedAmount = Math.max(0, Number(amount) || 0);
    const normalizedPlan = ["monthly", "yearly", "custom"].includes(planType)
      ? planType
      : "monthly";

    const request = await SubscriptionRequest.create({
      supplier: req.user._id,
      planType: normalizedPlan,
      months: parsedMonths,
      amount: parsedAmount,
      receiptImage: uploadedUrl,
      notes: String(notes || "").trim(),
      status: "pending",
    });

    // Notify Admins
    try {
      const admins = await User.find({ role: "admin" }).select("tokens").lean();
      const adminTokens = admins.flatMap((a) => a.tokens || []).filter(Boolean);
      if (adminTokens.length > 0) {
        const supName = req.user.businessName || req.user.name || "مورد";
        await sendPushNotification(
          adminTokens,
          "وصل اشتراك جديد",
          `أرسل المورد ${supName} وصل دفع لتفعيل الاشتراك (${parsedMonths} شهر).`,
          { requestId: request._id.toString(), type: "SUBSCRIPTION_REQUEST" },
        );
      }
    } catch (pushErr) {
      console.error("Subscription request push error:", pushErr);
    }

    res.status(201).json({
      success: true,
      message: "تم إرسال وصل الدفع بنجاح، سيتم مراجعته وتفعيل حسابك قريباً",
      data: request,
    });
  } catch (error) {
    console.error("Submit Subscription Request Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "فشل إرسال وصل الاشتراك",
    });
  }
};

// GET /api/subscriptions/requests (Admin)
export const getAllSubscriptionRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status && status !== "all" ? { status } : {};

    const requests = await SubscriptionRequest.find(filter)
      .populate(
        "supplier",
        "name businessName phone logo type subscriptionStatus subscriptionEndDate trialEndsAt createdAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    console.error("Get Subscription Requests Error:", error);
    res.status(500).json({ success: false, message: "فشل جلب طلبات الاشتراك" });
  }
};

// PUT /api/subscriptions/requests/:id/approve (Admin)
export const approveSubscriptionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { months, days, adminNote = "" } = req.body;

    const request = await SubscriptionRequest.findById(id).populate("supplier");
    if (!request) {
      return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    }

    const supplier = await User.findById(
      request.supplier?._id || request.supplier,
    );
    if (!supplier) {
      return res.status(404).json({ success: false, message: "المورد غير موجود" });
    }

    const addDays = Number(days) || 0;
    const addMonths =
      addDays > 0 ? 0 : Math.max(1, Number(months) || request.months || 1);

    const now = new Date();
    const baseDate =
      supplier.subscriptionEndDate && new Date(supplier.subscriptionEndDate) > now
        ? new Date(supplier.subscriptionEndDate)
        : now;

    const nextEndDate = new Date(baseDate);
    if (addDays > 0) {
      nextEndDate.setDate(nextEndDate.getDate() + addDays);
    } else {
      nextEndDate.setMonth(nextEndDate.getMonth() + addMonths);
    }

    supplier.subscriptionStatus = "active";
    supplier.subscriptionStartDate = supplier.subscriptionStartDate || now;
    supplier.subscriptionEndDate = nextEndDate;
    supplier.subscriptionPlan =
      addDays > 0
        ? "custom"
        : addMonths >= 12
          ? "yearly"
          : addMonths === 1
            ? "monthly"
            : "custom";
    supplier.isActive = true;
    supplier.isVerified = true;
    supplier.kycStatus = "verified";
    await supplier.save();

    request.status = "approved";
    request.approvedMonths = addMonths;
    request.approvedDays = addDays;
    request.adminNote = String(adminNote || "").trim();
    request.reviewedBy = req.user._id;
    request.reviewedAt = now;
    await request.save();

    // Notify Supplier
    try {
      if (Array.isArray(supplier.tokens) && supplier.tokens.length > 0) {
        const durationText =
          addDays > 0
            ? `${addDays} يوم`
            : addMonths === 1
              ? "شهر واحد"
              : addMonths === 2
                ? "شهرين"
                : addMonths === 12
                  ? "سنة كاملة"
                  : `${addMonths} أشهر`;
        await sendPushNotification(
          supplier.tokens,
          "تم تفعيل اشتراكك",
          `تمت الموافقة على وصل الدفع وتفعيل اشتراكك لمدة ${durationText}.`,
          { type: "SUBSCRIPTION_APPROVED" },
        );
      }
    } catch (pushErr) {
      console.error("Approve subscription push error:", pushErr);
    }

    res.status(200).json({
      success: true,
      message: "تم تفعيل اشتراك المورد بنجاح",
      data: { request, subscriptionEndDate: nextEndDate },
    });
  } catch (error) {
    console.error("Approve Subscription Error:", error);
    res.status(500).json({ success: false, message: "فشل تفعيل الاشتراك" });
  }
};

// PUT /api/subscriptions/requests/:id/reject (Admin)
export const rejectSubscriptionRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote = "" } = req.body;

    const request = await SubscriptionRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    }

    request.status = "rejected";
    request.adminNote = String(adminNote || "").trim();
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    const supplier = await User.findById(request.supplier).select("tokens").lean();
    if (supplier && Array.isArray(supplier.tokens) && supplier.tokens.length > 0) {
      sendPushNotification(
        supplier.tokens,
        "تم رفض وصل الاشتراك",
        adminNote
          ? `تم رفض وصل الدفع: ${adminNote}`
          : "تم رفض وصل الدفع المرسل، يرجى التواصل مع الإدارة أو إعادة المحاولة.",
        { type: "SUBSCRIPTION_REJECTED" },
      ).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: "تم رفض طلب الاشتراك",
      data: request,
    });
  } catch (error) {
    console.error("Reject Subscription Error:", error);
    res.status(500).json({ success: false, message: "فشل رفض الطلب" });
  }
};

// GET /api/subscriptions/suppliers (Admin overview of all suppliers' subscriptions)
export const getAllSuppliersSubscriptions = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const suppliers = await User.find({ role: "supplier" })
      .select(
        "name businessName phone logo type isActive createdAt subscriptionStatus subscriptionPlan trialEndsAt subscriptionStartDate subscriptionEndDate",
      )
      .sort({ createdAt: -1 })
      .lean();

    const data = suppliers.map((sup) => ({
      ...sup,
      subscription: computeSupplierSubscriptionState(sup, settings),
    }));

    const pendingRequestsCount = await SubscriptionRequest.countDocuments({
      status: "pending",
    });

    res.status(200).json({
      success: true,
      data,
      summary: {
        totalSuppliers: data.length,
        activeCount: data.filter((s) => s.subscription.effectiveStatus === "active")
          .length,
        trialCount: data.filter((s) => s.subscription.effectiveStatus === "trial")
          .length,
        expiredCount: data.filter(
          (s) => s.subscription.effectiveStatus === "expired",
        ).length,
        pendingRequestsCount,
        subscriptionsEnabled: settings.subscriptionsEnabled,
      },
    });
  } catch (error) {
    console.error("Get Suppliers Subscriptions Error:", error);
    res.status(500).json({ success: false, message: "فشل جلب اشتراكات الموردين" });
  }
};

// PUT /api/subscriptions/suppliers/:supplierId/activate (Admin direct activation/deactivation)
export const adminUpdateSupplierSubscription = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { months, days, deactivate = false } = req.body;

    const supplier = await User.findById(supplierId);
    if (!supplier || supplier.role !== "supplier") {
      return res.status(404).json({ success: false, message: "المورد غير موجود" });
    }

    const now = new Date();
    if (deactivate) {
      const expiredDate = new Date(now.getTime() - DAY_MS);
      supplier.subscriptionStatus = "expired";
      supplier.subscriptionEndDate = expiredDate;
      supplier.trialEndsAt = expiredDate;
      await supplier.save();

      return res.status(200).json({
        success: true,
        message: "تم إنهاء اشتراك المورد",
        data: supplier,
      });
    }

    const addDays = Number(days) || 0;
    const addMonths = addDays > 0 ? 0 : Math.max(1, Number(months) || 1);

    const baseDate =
      supplier.subscriptionEndDate && new Date(supplier.subscriptionEndDate) > now
        ? new Date(supplier.subscriptionEndDate)
        : now;

    const nextEndDate = new Date(baseDate);
    if (addDays > 0) {
      nextEndDate.setDate(nextEndDate.getDate() + addDays);
    } else {
      nextEndDate.setMonth(nextEndDate.getMonth() + addMonths);
    }

    supplier.subscriptionStatus = "active";
    supplier.subscriptionStartDate = supplier.subscriptionStartDate || now;
    supplier.subscriptionEndDate = nextEndDate;
    supplier.subscriptionPlan =
      addDays > 0
        ? "custom"
        : addMonths >= 12
          ? "yearly"
          : addMonths === 1
            ? "monthly"
            : "custom";
    supplier.isActive = true;
    supplier.isVerified = true;
    supplier.kycStatus = "verified";
    await supplier.save();

    if (Array.isArray(supplier.tokens) && supplier.tokens.length > 0) {
      const durationText =
        addDays > 0
          ? `${addDays} يوم`
          : addMonths === 1
            ? "شهر واحد"
            : addMonths === 2
              ? "شهرين"
              : addMonths === 12
                ? "سنة كاملة"
                : `${addMonths} أشهر`;
      sendPushNotification(
        supplier.tokens,
        "تم تفعيل اشتراكك",
        `قامت الإدارة بتفعيل اشتراكك لمدة ${durationText}.`,
        { type: "SUBSCRIPTION_APPROVED" },
      ).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: "تم تفعيل اشتراك المورد بنجاح",
      data: supplier,
    });
  } catch (error) {
    console.error("Admin Update Supplier Subscription Error:", error);
    res.status(500).json({ success: false, message: "فشل تحديث اشتراك المورد" });
  }
};
