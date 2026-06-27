/**
 * Send push notifications to Expo Push Token(s)
 * @param {string|string[]} targetTokens - Single token or array of Expo push tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} [data] - Optional metadata/payload
 */
export const sendPushNotification = async (targetTokens, title, body, data = {}) => {
  try {
    const tokens = Array.isArray(targetTokens) ? targetTokens : [targetTokens];
    
    // Filter valid Expo push tokens
    const validTokens = tokens.filter(token => 
      typeof token === "string" && token.startsWith("ExponentPushToken[")
    );

    if (validTokens.length === 0) {
      console.log("No valid Expo push tokens to notify.");
      return;
    }

    const messages = validTokens.map(token => ({
      to: token,
      sound: "default",
      title,
      body,
      data,
    }));

    console.log(`Sending push notification to ${validTokens.length} tokens...`);

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const responseData = await response.json();
    console.log("Expo Push Notification response:", JSON.stringify(responseData));
    return responseData;
  } catch (error) {
    console.error("Error sending Expo push notification:", error);
  }
};
