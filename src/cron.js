import cron from "cron";
import https from "https";
import { processPeriodicAdNotifications } from "./controllers/adsController.js";

// Keep-alive ping every 14 minutes (when API_URL is configured)
const keepAliveJob = new cron.CronJob("*/14 * * * *", function () {
  if (!process.env.API_URL) return;
  https
    .get(process.env.API_URL, (res) => {
      if (res.statusCode === 200) console.log("GET request sent successfully");
      else console.log("GET request failed", res.statusCode);
    })
    .on("error", (e) => console.error("Error while sending request", e));
});

// Hourly job: expire finished ads + send periodic push notifications to TRADERS ONLY
const periodicAdsNotificationJob = new cron.CronJob("0 * * * *", function () {
  processPeriodicAdNotifications();
});

const job = {
  start() {
    keepAliveJob.start();
    periodicAdsNotificationJob.start();
  },
  stop() {
    keepAliveJob.stop();
    periodicAdsNotificationJob.stop();
  },
};

export default job;
