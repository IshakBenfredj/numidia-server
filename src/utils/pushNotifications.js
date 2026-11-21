import admin from "firebase-admin";

let firebaseInitialized = false;

function initFirebaseAdmin() {
  if (firebaseInitialized || admin.apps.length > 0) {
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
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      return true;
    }

    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
      firebaseInitialized = true;
      return true;
    }
  } catch (err) {
    console.error("Firebase Admin init error:", err.message);
  }
  return false;
}

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
      return;
    }

    const expoTokens = uniqueTokens.filter((t) =>
      t.startsWith("ExponentPushToken["),
    );
    const fcmTokens = uniqueTokens.filter(
      (t) => !t.startsWith("ExponentPushToken["),
    );

    const results = {};

    // 1. Send to Expo Push API
    if (expoTokens.length > 0) {
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
    }

    // 2. Send to Firebase Cloud Messaging (Flutter Android/iOS)
    if (fcmTokens.length > 0) {
      if (initFirebaseAdmin()) {
        const stringData = {};
        for (const [k, v] of Object.entries(data || {})) {
          stringData[k] = v === null || v === undefined ? "" : String(v);
        }

        const fcmRes = await admin.messaging().sendEachForMulticast({
          tokens: fcmTokens,
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
        results.fcm = {
          successCount: fcmRes.successCount,
          failureCount: fcmRes.failureCount,
        };
        results.fcmSkipped = false;
      } else {
        results.fcmSkipped = true;
        results.fcmSkippedCount = fcmTokens.length;
        console.log(
          `[FCM] Skipped ${fcmTokens.length} Flutter FCM token(s): FIREBASE_SERVICE_ACCOUNT env var not configured on server yet.`,
        );
      }
    }

    return results;
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
};
