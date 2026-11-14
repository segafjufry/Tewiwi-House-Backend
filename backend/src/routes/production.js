import { Router } from 'express';
import { adminOnly } from '../middleware/adminAuth.js';
import { AppError } from '../utils/errors.js';
import { addDays, todayISO } from '../utils/dates.js';
import { reqDate } from '../utils/validate.js';
import { buildBriefData, generateBrief } from '../services/briefService.js';
import { slotsBetween } from '../services/slotService.js';

const MAX_RANGE_DAYS = 366;

export default function productionRouter(db) {
  const r = Router();
  r.use(adminOnly);

  // Rekap order per tanggal pengiriman
  r.get('/recap', async (req, res) => {
    const from = req.query.from ? reqDate(req.query.from, 'from') : todayISO();
    const to = req.query.to ? reqDate(req.query.to, 'to') : addDays(from, 30);
    if (to < from || to > addDays(from, MAX_RANGE_DAYS)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Rentang tanggal tidak valid (maksimal ${MAX_RANGE_DAYS} hari)`);
    }
    const rows = await db.all(
      `SELECT o.delivery_date, COUNT(DISTINCT o.id) AS order_count, SUM(i.quantity) AS total_quantity
       FROM orders o JOIN order_items i ON i.order_id = o.id
       WHERE o.status <> 'Dibatalkan' AND o.delivery_date BETWEEN $1 AND $2
       GROUP BY o.delivery_date ORDER BY o.delivery_date`,
      [from, to]
    );
    const slots = new Map((await slotsBetween(db, from, to)).map((s) => [s.delivery_date, s]));
    res.json({ data: rows.map((x) => ({ ...x, slot: slots.get(x.delivery_date) || null })) });
  });

  // Rekap jumlah produk yang perlu diproduksi (order + prediksi)
  r.get('/summary', async (req, res) => res.json({ data: await buildBriefData(db, req.query.date) }));

  // Production brief (Generative AI jika API key tersedia, selain itu template)
  r.post('/brief', async (req, res) => res.json({ data: await generateBrief(db, req.body?.delivery_date) }));

  return r;
}
