import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import debtRoutes from "./routes/debtRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import adsRoutes from "./routes/adsRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";
import job from "./cron.js";

dotenv.config();

const app = express();

// Middlewares
app.use(compression());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: "500mb" })); 
app.use(express.urlencoded({ extended: true, limit: "500mb" }));
job.start();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/debts", debtRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/delivery", deliveryRoutes);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log("MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🔥`);
});
