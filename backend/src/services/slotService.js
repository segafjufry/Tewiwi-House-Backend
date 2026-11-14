import { config } from '../config.js';
import { DAY_NAMES, addDays, todayISO, weekdayOf } from '../utils/dates.js';

// Tanggal paling awal yang boleh dipesan (H+2 dari hari ini)
export const earliestDate = () => addDays(todayISO(), config.minLeadDays);

const SEARCH_DAYS = 120;

/**
 * Semua slot (hari pengiriman aktif) pada rentang tanggal [from, to], diurutkan.
 * Hanya 3 query berapa pun panjang rentangnya (penting karena database berada di jaringan, mis. RDS).
 * `db` boleh berupa pool biasa atau `tx` (di dalam transaksi).
 */
export async function slotsBetween(db, from, to) {
  const dayRows = await db.all('SELECT weekday, capacity FROM delivery_days WHERE active');
  const overrideRows = await db.all(
    'SELECT delivery_date, capacity FROM slot_overrides WHERE delivery_date BETWEEN $1 AND $2',
    [from, to]
  );
  // Total roti dari semua order aktif (selain Dibatalkan) per tanggal
  const usedRows = await db.all(
    `SELECT o.delivery_date, SUM(i.quantity) AS n
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.status <> 'Dibatalkan' AND o.delivery_date BETWEEN $1 AND $2
     GROUP BY o.delivery_date`,
    [from, to]
  );
  const days = new Map(dayRows.map((r) => [r.weekday, r.capacity]));
  const overrides = new Map(overrideRows.map((r) => [r.delivery_date, r.capacity]));
  const used = new Map(usedRows.map((r) => [r.delivery_date, r.n]));

  const slots = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = weekdayOf(d);
    if (!days.has(weekday)) continue;
    const capacity = overrides.has(d) ? overrides.get(d) : days.get(weekday);
    const usedQty = used.get(d) || 0;
    const left = Math.max(0, capacity - usedQty);
    slots.push({
      delivery_date: d,
      weekday,
      day_name: DAY_NAMES[weekday],
      capacity,
      used: usedQty,
      left,
      status: left > 0 ? 'available' : 'full', // 'full' => tidak bisa menerima order baru
    });
  }
  return slots;
}

// Info satu slot. Mengembalikan null jika tanggal itu bukan hari pengiriman.
export async function getSlot(db, date) {
  const [slot] = await slotsBetween(db, date, date);
  return slot || null;
}

// Slot berikutnya yang masih punya sisa >= needed
export async function nextAvailable(db, afterDate, needed = 1) {
  let start = addDays(afterDate, 1);
  const min = earliestDate();
  if (start < min) start = min;
  const slots = await slotsBetween(db, start, addDays(start, SEARCH_DAYS - 1));
  return slots.find((s) => s.left >= needed) || null;
}

export async function listUpcoming(db, { count = 8 } = {}) {
  const start = earliestDate();
  return (await slotsBetween(db, start, addDays(start, SEARCH_DAYS - 1))).slice(0, count);
}
