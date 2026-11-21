import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import User from "../models/User.js";

let firebaseInitialized = false;
let lastFirebaseInitError = null;
let initializedProjectId = null;

function initFirebaseAdmin() {
  if (firebaseInitialized || getApps().length > 0) {
    firebaseInitialized = true;
    return true;
  }

  try {
    let rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (rawServiceAccount) {
      rawServiceAccount = rawServiceAccount.trim();
      if (
        (rawServiceAccount.startsWith('"') && rawServiceAccount.endsWith('"')) ||
        (rawServiceAccount.startsWith("'") && rawServiceAccount.endsWith("'"))
      ) {
        rawServiceAccount = rawServiceAccount.slice(1, -1).trim();
      }
      const jsonStr = rawServiceAccount.startsWith("{")
        ? rawServiceAccount
        : Buffer.from(rawServiceAccount, "base64").toString("utf8");
      const serviceAccount = JSON.parse(jsonStr);
      if (typeof serviceAccount.private_key === "string") {
        serviceAccount.private_key = serviceAccount.private_key.replace(
          /\\n/g,
          "\n",
        );
      }
      initializeApp({
        credential: cert(serviceAccount),
      });
      initializedProjectId = serviceAccount.project_id || null;
      lastFirebaseInitError = null;
      firebaseInitialized = true;
      return true;
    }

    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
      initializedProjectId = process.env.FIREBASE_PROJECT_ID;
      lastFirebaseInitError = null;
      firebaseInitialized = true;
      return true;
    }

    lastFirebaseInitError = "FIREBASE_SERVICE_ACCOUNT env var is not set";
  } catch (err) {
    lastFirebaseInitError = err.message;
    console.error("Firebase Admin init error:", err.message);
  }
  return false;
}

export const getPushConfigurationStatus = () => {
  const configured = initFirebaseAdmin();
  return {
    firebaseConfigured: configured,
    projectId: initializedProjectId,
    error: configured ? null : lastFirebaseInitError,
  };
};

/**
 * Send push notifications to both Expo Push Tokens and Firebase FCM Tokens (Flutter).
 * @param {string|string[]} targetTokens
 * @param {string} title
 * @param {string} body
 * @param {object} [data]
 */
export const sendPushNotification = async (
  targetTokens,
  title,
  body,
  data = {},
) => {
  const results = {
    expo: null,
    fcm: null,
    fcmSkipped: false,
    fcmSkippedCount: 0,
    fcmError: null,
  };

  try {
    const rawList = Array.isArray(targetTokens)
      ? targetTokens
      : [targetTokens];
    const uniqueTokens = [
      ...new Set(
        rawList.filter((t) => typeof t === "string" && t.trim().length > 0),
      ),
    ];

    if (uniqueTokens.length === 0) {
      console.log("No push tokens to notify.");
      return results;
    }

    const expoTokens = uniqueTokens.filter((t) =>
      t.startsWith("ExponentPushToken["),
    );
    const fcmTokens = uniqueTokens.filter(
      (t) => !t.startsWith("ExponentPushToken["),
    );

    // 1. Send to Expo Push API
    if (expoTokens.length > 0) {
      try {
        const messages = expoTokens.map((token) => ({
          to: token,
          sound: "default",
          title,
          body,
          data,
        }));
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages),
        });
        results.expo = await response.json();
      } catch (expoErr) {
        console.error("[Expo Push] Error:", expoErr.message);
        results.expo = { error: expoErr.message };
      }
    }

    // 2. Send to Firebase Cloud Messaging (Flutter Android/iOS)
    if (fcmTokens.length > 0) {
      if (initFirebaseAdmin()) {
        try {
          const stringData = {};
          for (const [k, v] of Object.entries(data || {})) {
            stringData[k] = v === null || v === undefined ? "" : String(v);
          }

          const messaging = getMessaging();
          const BATCH_SIZE = 500;
          let successCount = 0;
          let failureCount = 0;
          const deadTokens = [];
          const errorCodes = [];

          for (let i = 0; i < fcmTokens.length; i += BATCH_SIZE) {
            const batch = fcmTokens.slice(i, i + BATCH_SIZE);
            const fcmRes = await messaging.sendEachForMulticast({
              tokens: batch,
              notification: {
                title,
                body,
              },
              data: stringData,
              android: {
                priority: "high",
                notification: {
                  channelId: "numidia_default_channel",
                  sound: "default",
                  color: "#F29221",
                },
              },
              apns: {
                payload: {
                  aps: {
                    sound: "default",
                  },
                },
              },
            });

            successCount += fcmRes.successCount;
            failureCount += fcmRes.failureCount;

            fcmRes.responses.forEach((resp, idx) => {
              if (!resp.success) {
                const code = resp.error?.code || "unknown";
                errorCodes.push(code);
                console.warn(
                  `[FCM] Failed for token ${batch[idx].slice(0, 14)}...: ${code} - ${resp.error?.message}`,
                );
                if (
                  code === "messaging/registration-token-not-registered" ||
                  code === "messaging/invalid-registration-token"
                ) {
                  deadTokens.push(batch[idx]);
                }
              }
            });
          }

          // Auto-prune permanently dead tokens from MongoDB
          if (deadTokens.length > 0) {
            User.updateMany(
              { tokens: { $in: deadTokens } },
              { $pull: { tokens: { $in: deadTokens } } },
            ).catch((e) =>
              console.error("[FCM] Dead token cleanup error:", e.message),
            );
          }

          results.fcm = {
            successCount,
            failureCount,
            prunedCount: deadTokens.length,
            errors: [...new Set(errorCodes)],
          };
          results.fcmSkipped = false;
        } catch (fcmErr) {
          console.error("[FCM] Multicast send error:", fcmErr.message);
          results.fcmError = fcmErr.message;
        }
      } else {
        results.fcmSkipped = true;
        results.fcmSkippedCount = fcmTokens.length;
        results.fcmError = lastFirebaseInitError;
        console.log(
          `[FCM] Skipped ${fcmTokens.length} Flutter FCM token(s): ${lastFirebaseInitError}`,
        );
      }
    }

    return results;
  } catch (error) {
    console.error("Error sending push notification:", error);
    results.fcmError = error.message;
    return results;
  }
};
