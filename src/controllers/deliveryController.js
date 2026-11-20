import Order from "../models/Order.js";
import { createShippingParcel, trackShipment, SUPPORTED_COURIERS } from "../utils/deliveryCourier.js";

/**
 * POST /api/delivery/create-parcel
 * Admin or Supplier creates a courier waybill / shipment
 */
export const createOrderParcel = async (req, res) => {
  try {
    const { orderId, courier = "yalidine" } = req.body;

    const order = await Order.findById(orderId)
      .populate("supplier", "name phone address")
      .populate("trader", "name phone");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "الطلب غير موجود",
      });
    }

    const parcelResult = await createShippingParcel(courier, order);

    return res.status(200).json({
      success: true,
      message: "تم إنشاء بوليصة الشحن بنجاح",
      parcel: parcelResult,
    });
  } catch (error) {
    console.error("Create Order Parcel Error:", error);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ أثناء إنشاء بوليصة الشحن",
      error: error.message,
    });
  }
};

/**
 * GET /api/delivery/track/:trackingNumber
 */
export const getShipmentTracking = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { courier = "yalidine" } = req.query;

    const trackingData = await trackShipment(courier, trackingNumber);

    return res.status(200).json({
      success: true,
      tracking: trackingData,
    });
  } catch (error) {
    console.error("Tracking Error:", error);
    return res.status(500).json({
      success: false,
      message: "فشل تتبع الشحنة",
      error: error.message,
    });
  }
};

/**
 * GET /api/delivery/couriers
 */
export const getSupportedCouriers = async (req, res) => {
  return res.status(200).json({
    success: true,
    couriers: [
      { id: "yalidine", name: "Yalidine Fast Express", hasApi: true, logo: "https://yalidine.com/favicon.ico" },
      { id: "maystro", name: "Maystro Delivery", hasApi: true },
      { id: "procolis", name: "Procolis Express", hasApi: true },
      { id: "zr_express", name: "ZR Express", hasApi: true },
      { id: "manual", name: "توصيل خاص / يدوي", hasApi: false },
    ],
  });
};
