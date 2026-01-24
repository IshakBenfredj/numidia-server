import express from 'express';
const router = express.Router();

import {
  getSupplierCurrentDebt,
  getSupplierDebts,
  getCurrentDebts,
  payDebtDelivered,
} from '../controllers/debtController.js';

router.get('/supplier/:id/current', getSupplierCurrentDebt);
router.get('/supplier/:id', getSupplierDebts);
router.get('/current', getCurrentDebts);
router.post('/:debtId/pay', payDebtDelivered);

export default router;