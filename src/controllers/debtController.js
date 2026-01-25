import Debt from "../models/Debt.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";

// GET /api/debts/supplier/:id/current
export const getSupplierCurrentDebt = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("معرف المورد غير صالح");
      error.statusCode = 400;
      throw error;
    }

    // 1. Récupérer la dette courante non payée
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
          commission: {
            $multiply: [
              "$totalAmount",
              { $ifNull: ["$supplier.commissionRate", 0.05] },
            ],
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

    const stats = {
      deliveredCommission: 0,
      pendingCommission: 0,
      deliveredCount: 0,
      pendingCount: 0,
    };

    commissionBreakdown.forEach((group) => {
      if (group._id === "delivered") {
        stats.deliveredCommission = group.totalCommission || 0;
        stats.deliveredCount = group.count || 0;
      } else if (["confirmed", "shipped"].includes(group._id)) {
        stats.pendingCommission += group.totalCommission || 0;
        stats.pendingCount += group.count || 0;
      }
    });

    const calculatedTotalCommission =
      stats.deliveredCommission + stats.pendingCommission;

    if (Math.abs(calculatedTotalCommission - debt.totalAmount) > 1) {
      console.warn(
        `Incohérence dette ${debt._id} : total en DB = ${debt.totalAmount}, calculé = ${calculatedTotalCommission}`,
      );
    }

    res.status(200).json({
      success: true,
      data: {
        ...debt,
        deliveredCommission: Math.round(stats.deliveredCommission), 
        pendingCommission: Math.round(stats.pendingCommission),
        totalCommission: Math.round(calculatedTotalCommission),
        deliveredOrdersCount: stats.deliveredCount,
        pendingOrdersCount: stats.pendingCount,
        deliveredPercentage:
          calculatedTotalCommission > 0
            ? Math.round(
                (stats.deliveredCommission / calculatedTotalCommission) * 100,
              )
            : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/debts/supplier/:id
export const getSupplierDebts = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("معرف المورد غير صالح");
      error.statusCode = 400;
      throw error;
    }

    const debts = await Debt.find({ supplier: id })
      .sort({ createdAt: -1 })
      .populate("supplier", "name businessName phone");

    res.status(200).json({
      success: true,
      count: debts.length,
      data: debts,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/debts/current
export const getCurrentDebts = async (req, res, next) => {
  try {
    const debts = await Debt.find({ isPaid: false })
      .populate("supplier", "name businessName phone commissionRate")
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
        const breakdown = await Order.aggregate([
          {
            $match: {
              debt: debt._id,
              status: { $in: ["confirmed", "shipped", "delivered"] },
            },
          },
          {
            $project: {
              commission: {
                $multiply: [
                  "$totalAmount",
                  { $ifNull: ["$supplier.commissionRate", 0.05] },
                ],
              },
              status: 1,
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

        breakdown.forEach((g) => {
          if (g._id === "delivered") {
            deliveredCommission = Math.round(g.totalCommission || 0);
            deliveredCount = g.count || 0;
          } else if (["confirmed", "shipped"].includes(g._id)) {
            pendingCommission += Math.round(g.totalCommission || 0);
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
      })
    );

    // Global totals
    const totalUnpaid = enrichedDebts.reduce((sum, d) => sum + d.totalAmount, 0);
    const totalDelivered = enrichedDebts.reduce((sum, d) => sum + d.deliveredCommission, 0);
    const totalPending = enrichedDebts.reduce((sum, d) => sum + d.pendingCommission, 0);

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
// export const getCurrentDebts = async (req, res, next) => {
//   try {
//     const debts = await Debt.find({ isPaid: false })
//       .populate("supplier", "name businessName phone commissionRate")
//       .sort({ createdAt: -1 });

//     const totalUnpaid = debts.reduce((sum, debt) => sum + debt.totalAmount, 0);

//     res.status(200).json({
//       success: true,
//       count: debts.length,
//       totalUnpaidAmount: totalUnpaid,
//       data: debts,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// POST /api/debts/:debtId/pay
export const payDebtDelivered = async (req, res, next) => {
  const { debtId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(debtId)) {
    return next(createError(400, "معرف الدين غير صالح"));
  }

  try {
    const oldDebt = await Debt.findById(debtId);
    if (!oldDebt) {
      return next(createError(404, "الدين غير موجود"));
    }
    if (oldDebt.isPaid) {
      return next(createError(400, "هذا الدين تم تسديده مسبقًا"));
    }

    // Calculate pending commissions (not delivered but confirmed/shipped)
    const pendingCommission = await Order.aggregate([
      {
        $match: {
          debt: oldDebt._id,
          status: { $in: ["confirmed", "shipped"] },
        },
      },
      {
        $project: {
          commission: {
            $multiply: [
              "$totalAmount",
              { $ifNull: ["$supplier.commissionRate", 0.05] },
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$commission" } } },
    ]);

    const movedAmount = Math.round(pendingCommission[0]?.total || 0);

    // Mark old debt as paid
    oldDebt.isPaid = true;
    oldDebt.paidAt = new Date();

    // Subtract moved amount from old debt
    oldDebt.totalAmount = Math.max(0, oldDebt.totalAmount - movedAmount);

    // Find and update pending orders
    const pendingOrders = await Order.find({
      debt: oldDebt._id,
      status: { $in: ["confirmed", "shipped"] },
    });

    // Create new debt
    const newDebt = new Debt({
      supplier: oldDebt.supplier,
      totalAmount: movedAmount,
      isPaid: false,
    });

    await newDebt.save();

    // Update orders to new debt
    for (const order of pendingOrders) {
      order.debt = newDebt._id;
      await order.save();
    }

    // Save old debt changes
    await oldDebt.save();

    return res.status(200).json({
      success: true,
      message: "تم تسديد الدين بنجاح ونقل الطلبات المعلقة إلى دين جديد",
      oldDebt,
      newDebt,
      movedAmount,
      movedOrdersCount: pendingOrders.length,
    });
  } catch (err) {
    next(err);
  }
};