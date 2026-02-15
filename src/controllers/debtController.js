import Debt from "../models/Debt.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";

// GET /api/debts/supplier/:id
export const getSupplierDebts = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف المورد غير صالح",
      });
    }

    const debts = await Debt.find({ supplier: id })
      .sort({ createdAt: -1 })
      .populate("supplier", "name businessName phone commissionRate")
      .lean();

    res.status(200).json({
      success: true,
      count: debts.length,
      data: debts,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/debts/supplier/:id/current
export const getSupplierCurrentDebt = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "معرف المورد غير صالح",
      });
    }

    const debt = await Debt.findOne({
      supplier: id,
      isPaid: false,
    })
      .populate("supplier", "name businessName phone commissionRate")
      .lean();

    if (!debt) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    const rate = debt.supplier?.commissionRate ?? 0.05;

    const commissionBreakdown = await Order.aggregate([
      {
        $match: {
          debt: debt._id,
          status: { $in: ["confirmed", "shipped", "delivered"] },
        },
      },
      {
        $project: {
          status: 1,
          effectiveAmount: {
            $subtract: ["$totalAmount", { $ifNull: ["$deductedRetour", 0] }],
          },
        },
      },
      {
        $addFields: {
          // ← or $project
          commission: {
            $multiply: ["$effectiveAmount", rate],
          },
        },
      },
      {
        $group: {
          _id: "$status",
          totalCommission: { $sum: "$commission" },
          count: { $sum: 1 },
        },
      },
    ]);

    let deliveredCommission = 0;
    let pendingCommission = 0;
    let deliveredCount = 0;
    let pendingCount = 0;

    commissionBreakdown.forEach((group) => {
      const roundedCommission = Math.round(group.totalCommission || 0);

      if (group._id === "delivered") {
        deliveredCommission = roundedCommission;
        deliveredCount = group.count || 0;
      } else if (["confirmed", "shipped"].includes(group._id)) {
        pendingCommission += roundedCommission;
        pendingCount += group.count || 0;
      }
    });

    const calculatedTotalCommission = deliveredCommission + pendingCommission;

    // Warning if mismatch (allow 1 دج tolerance for rounding)
    if (Math.abs(calculatedTotalCommission - debt.totalAmount) > 1) {
      console.warn(
        `Incohérence dette ${debt._id}: DB = ${debt.totalAmount}, calculé = ${calculatedTotalCommission}`,
      );
    }

    res.status(200).json({
      success: true,
      data: {
        ...debt,
        deliveredCommission,
        pendingCommission,
        totalCommission: calculatedTotalCommission,
        deliveredOrdersCount: deliveredCount,
        pendingOrdersCount: pendingCount,
        deliveredPercentage:
          calculatedTotalCommission > 0
            ? Math.round(
                (deliveredCommission / calculatedTotalCommission) * 100,
              )
            : 0,
        effectiveTotalUsedForCommission: calculatedTotalCommission,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/debts/current (admin)
export const getCurrentDebts = async (req, res, next) => {
  try {
    const debts = await Debt.find({ isPaid: false })
      .populate("supplier", "name phone commissionRate")
      .sort({ createdAt: -1 })
      .lean();

    if (debts.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        totalUnpaidAmount: 0,
        totalDeliveredCommission: 0,
        totalPendingCommission: 0,
        data: [],
      });
    }

    const enrichedDebts = await Promise.all(
      debts.map(async (debt) => {
        // inside debts.map(async (debt) => {

        const rate = debt.supplier?.commissionRate ?? 0.05;

        const breakdown = await Order.aggregate([
          {
            $match: {
              debt: debt._id,
              status: { $in: ["confirmed", "shipped", "delivered"] },
            },
          },
          {
            $project: {
              effectiveAmount: {
                $subtract: [
                  "$totalAmount",
                  { $ifNull: ["$deductedRetour", 0] },
                ],
              },
              status: 1,
            },
          },
          {
            $addFields: {
              commission: {
                $multiply: ["$effectiveAmount", rate],
              },
            },
          },
          {
            $group: {
              _id: "$status",
              totalCommission: { $sum: "$commission" },
              count: { $sum: 1 },
            },
          },
        ]);

        // ... rest remains the same

        let deliveredCommission = 0;
        let pendingCommission = 0;
        let deliveredCount = 0;
        let pendingCount = 0;

        breakdown.forEach((g) => {
          const rounded = Math.round(g.totalCommission || 0);
          if (g._id === "delivered") {
            deliveredCommission = rounded;
            deliveredCount = g.count || 0;
          } else if (["confirmed", "shipped"].includes(g._id)) {
            pendingCommission += rounded;
            pendingCount += g.count || 0;
          }
        });

        return {
          ...debt,
          deliveredCommission,
          pendingCommission,
          deliveredCount,
          pendingCount,
          calculatedTotal: deliveredCommission + pendingCommission,
        };
      }),
    );

    const totalUnpaid = enrichedDebts.reduce(
      (sum, d) => sum + d.totalAmount,
      0,
    );
    const totalDelivered = enrichedDebts.reduce(
      (sum, d) => sum + d.deliveredCommission,
      0,
    );
    const totalPending = enrichedDebts.reduce(
      (sum, d) => sum + d.pendingCommission,
      0,
    );

    res.status(200).json({
      success: true,
      count: enrichedDebts.length,
      totalUnpaidAmount: Math.round(totalUnpaid),
      totalDeliveredCommission: Math.round(totalDelivered),
      totalPendingCommission: Math.round(totalPending),
      data: enrichedDebts,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/debts/:debtId/pay-delivered
export const payDebtDelivered = async (req, res, next) => {
  const { debtId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(debtId)) {
    return res.status(400).json({
      success: false,
      message: "معرف الدين غير صالح",
    });
  }

  try {
    const oldDebt = await Debt.findById(debtId);
    if (!oldDebt) {
      return res.status(404).json({
        success: false,
        message: "الدين غير موجود",
      });
    }

    if (oldDebt.isPaid) {
      return res.status(400).json({
        success: false,
        message: "هذا الدين تم تسديده مسبقًا",
      });
    }

    // Get only pending (confirmed + shipped) commissions
    const pendingBreakdown = await Order.aggregate([
      {
        $match: {
          debt: oldDebt._id,
          status: { $in: ["confirmed", "shipped"] },
        },
      },
      {
        $project: {
          effectiveAmount: {
            $subtract: ["$totalAmount", { $ifNull: ["$deductedRetour", 0] }],
          },
          status: 1,
        },
      },
      {
        $project: {
          commission: {
            $multiply: [
              "$effectiveAmount",
              { $ifNull: ["$supplier.commissionRate", 0.05] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalPendingCommission: { $sum: "$commission" },
          count: { $sum: 1 },
        },
      },
    ]);

    const movedAmount = Math.round(
      pendingBreakdown[0]?.totalPendingCommission || 0,
    );
    const movedOrdersCount = pendingBreakdown[0]?.count || 0;

    // Mark old debt as paid (only keep delivered part)
    const deliveredCommission = Math.round(oldDebt.totalAmount - movedAmount);
    oldDebt.totalAmount = deliveredCommission;
    oldDebt.isPaid = true;
    oldDebt.paidAt = new Date();
    await oldDebt.save();

    // Create new debt for pending commissions
    let newDebt = null;
    if (movedAmount > 0) {
      newDebt = await Debt.create({
        supplier: oldDebt.supplier,
        totalAmount: movedAmount,
        isPaid: false,
      });
    }

    // Move pending orders to new debt
    const pendingOrders = await Order.find({
      debt: oldDebt._id,
      status: { $in: ["confirmed", "shipped"] },
    });

    for (const order of pendingOrders) {
      order.debt = newDebt?._id || null;
      await order.save();
    }

    res.status(200).json({
      success: true,
      message: "تم تسديد الجزء المُسلّم ونقل الطلبات المعلقة إلى دين جديد",
      oldDebt,
      newDebt,
      movedAmount,
      movedOrdersCount,
      remainingDeliveredCommission: deliveredCommission,
    });
  } catch (err) {
    next(err);
  }
};
