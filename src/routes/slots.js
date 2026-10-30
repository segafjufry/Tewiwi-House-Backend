import { Router } from 'express';
import { adminOnly } from '../middleware/adminAuth.js';
import { AppError } from '../utils/errors.js';
import { reqBool, reqDate, reqInt } from '../utils/validate.js';
import { getSlot, listUpcoming, nextAvailable } from '../services/slotService.js';

const withNext = async (db, slot) =>
  slot.status === 'full' ? { ...slot, next_available: await nextAvailable(db, slot.delivery_date) } : slot;

export default function slotsRouter(db) {
  const r = Router();

  // Publik: slot mendatang. Slot penuh berstatus "full" dan menyertakan saran slot berikutnya.
  r.get('/', async (req, res) => {
    const count = req.query.count ? reqInt(req.query.count, 'count', { min: 1, max: 30 }) : 8;
    const slots = await listUpcoming(db, { count });
    res.json({ data: await Promise.all(slots.map((s) => withNext(db, s))) });
  });

  // Admin: konfigurasi hari pengiriman & override (harus sebelum '/:date')
  r.get('/config', adminOnly, async (req, res) => {
    res.json({
      data: {
        days: await db.all('SELECT * FROM delivery_days ORDER BY weekday'),
        overrides: await db.all('SELECT * FROM slot_overrides ORDER BY delivery_date'),
      },
    });
  });

  r.put('/config/days/:weekday', adminOnly, async (req, res) => {
    const weekday = reqInt(req.params.weekday, 'weekday', { min: 0, max: 6 });
    const capacity = reqInt(req.body?.capacity, 'capacity');
    const active = req.body?.active === undefined ? true : reqBool(req.body.active, 'active');
    const row = await db.get(
      `INSERT INTO delivery_days (weekday, capacity, active) VALUES ($1, $2, $3)
       ON CONFLICT (weekday) DO UPDATE SET capacity = EXCLUDED.capacity, active = EXCLUDED.active
       RETURNING *`,
      [weekday, capacity, active]
    );
    res.json({ data: row });
  });

  r.put('/:date/capacity', adminOnly, async (req, res) => {
    const date = reqDate(req.params.date, 'date');
    const capacity = reqInt(req.body?.capacity, 'capacity');
    // Dikunci dengan kunci yang sama seperti createOrder, supaya tidak berbalapan dengan order yang masuk.
    const slot = await db.transaction(async (tx) => {
      await tx.lock(`slot:${date}`);
      const current = await getSlot(tx, date);
      if (!current) throw new AppError(404, 'NOT_FOUND', 'Tanggal tersebut bukan hari pengiriman');
      if (capacity < current.used) {
        throw new AppError(422, 'BELOW_USED', `Kapasitas tidak boleh di bawah jumlah order aktif (${current.used})`);
      }
      await tx.run(
        `INSERT INTO slot_overrides (delivery_date, capacity) VALUES ($1, $2)
         ON CONFLICT (delivery_date) DO UPDATE SET capacity = EXCLUDED.capacity`,
        [date, capacity]
      );
      return getSlot(tx, date);
    });
    res.json({ data: slot });
  });

  r.delete('/:date/capacity', adminOnly, async (req, res) => {
    await db.run('DELETE FROM slot_overrides WHERE delivery_date = $1', [reqDate(req.params.date, 'date')]);
    res.status(204).end();
  });

  r.get('/:date', async (req, res) => {
    const slot = await getSlot(db, reqDate(req.params.date, 'date'));
    if (!slot) throw new AppError(404, 'NOT_FOUND', 'Tanggal tersebut bukan hari pengiriman');
    res.json({ data: await withNext(db, slot) });
  });

  return r;
}
