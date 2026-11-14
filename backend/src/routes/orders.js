import { Router } from 'express';
import { adminOnly } from '../middleware/adminAuth.js';
import { reqInt } from '../utils/validate.js';
import { config } from '../config.js';
import { paymentInstructions } from '../services/paymentService.js';
import { createOrder, getOrder, listOrders, trackByCode, updateOrderStatus } from '../services/orderService.js';

export default function ordersRouter(db, cfg = config) {
  const r = Router();

  // Publik: form pemesanan. Mengembalikan 409 + saran slot lain jika slot penuh.
  // Respons 201 berisi order + `payment` (jumlah transfer, rekening, tautan WhatsApp) untuk layar "Pesanan diterima".
  r.post('/', async (req, res) => {
    const order = await createOrder(db, req.body);
    res.status(201).json({ data: { ...order, payment: paymentInstructions(order, cfg) } });
  });

  // Publik: pelanggan cek status dengan kode order
  r.get('/track/:code', async (req, res) => res.json({ data: await trackByCode(db, req.params.code) }));

  // Admin
  r.get('/', adminOnly, async (req, res) => res.json({ data: await listOrders(db, req.query) }));
  r.get('/:id', adminOnly, async (req, res) =>
    res.json({ data: await getOrder(db, reqInt(req.params.id, 'id', { min: 1 })) })
  );
  r.patch('/:id/status', adminOnly, async (req, res) =>
    res.json({ data: await updateOrderStatus(db, reqInt(req.params.id, 'id', { min: 1 }), req.body?.status) })
  );

  return r;
}
