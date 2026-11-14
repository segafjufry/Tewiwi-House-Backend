import { AppError } from '../utils/errors.js';
import { todayISO, weekdayOf } from '../utils/dates.js';
import { reqDate } from '../utils/validate.js';

const WINDOW = 6;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Model sederhana: weighted moving average (slot terbaru berbobot lebih besar)
 * ditambah setengah dari kemiringan tren linear pada 6 slot terakhir.
 */
export function forecast(series) {
  const n = series.length;
  if (n === 0) return 0;
  if (n < 3) return mean(series);
  const w = series.slice(-WINDOW);
  const k = w.length;
  let sumW = 0, sumV = 0;
  w.forEach((v, i) => { sumW += i + 1; sumV += (i + 1) * v; });
  const wma = sumV / sumW;
  const mx = (k - 1) / 2, my = mean(w);
  let num = 0, den = 0;
  w.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  const slope = den ? num / den : 0;
  return Math.max(0, wma + 0.5 * slope);
}

// Preprocessing: gabungkan data historis + order nyata yang tanggalnya sudah lewat,
// jumlahkan per tanggal, lalu ambil hanya hari yang sama (mis. semua Selasa).
export async function seriesFor(db, productId, weekday) {
  const rows = await db.all(
    `SELECT t.d AS date, SUM(t.q) AS qty FROM (
       SELECT delivery_date AS d, product_id AS pid, quantity AS q FROM order_history
       UNION ALL
       SELECT o.delivery_date, i.product_id, i.quantity
       FROM orders o JOIN order_items i ON i.order_id = o.id
       WHERE o.status <> 'Dibatalkan' AND o.delivery_date < $1
     ) t WHERE t.pid = $2 GROUP BY t.d ORDER BY t.d`,
    [todayISO(), productId]
  );
  return rows.filter((r) => weekdayOf(r.date) === weekday).map((r) => r.qty);
}

export async function predict(db, date) {
  reqDate(date, 'delivery_date');
  const weekday = weekdayOf(date);
  const products = await db.all('SELECT id, name FROM products WHERE active ORDER BY id');
  const per_product = [];
  for (const p of products) {
    const s = await seriesFor(db, p.id, weekday);
    per_product.push({ product_id: p.id, name: p.name, predicted_qty: Math.round(forecast(s)), history_points: s.length });
  }
  return {
    delivery_date: date,
    model: 'wma6_trend_v1',
    per_product,
    total_predicted: per_product.reduce((a, b) => a + b.predicted_qty, 0),
  };
}

// Evaluasi walk-forward: 80% data awal sebagai histori, 20% terakhir sebagai data uji.
export async function evaluate(db) {
  const products = await db.all('SELECT id FROM products WHERE active');
  const days = await db.all('SELECT weekday FROM delivery_days WHERE active');
  let absErr = 0, baseErr = 0, pctErr = 0, n = 0, m = 0;
  for (const p of products) {
    for (const d of days) {
      const s = await seriesFor(db, p.id, d.weekday);
      if (s.length < 5) continue;
      for (let i = Math.floor(s.length * 0.8); i < s.length; i++) {
        const pred = forecast(s.slice(0, i));
        absErr += Math.abs(pred - s[i]);
        baseErr += Math.abs(s[i - 1] - s[i]); // baseline: ulangi nilai slot sebelumnya
        n++;
        if (s[i] > 0) { pctErr += Math.abs(pred - s[i]) / s[i]; m++; }
      }
    }
  }
  if (n === 0) throw new AppError(422, 'NOT_ENOUGH_DATA', 'Data historis belum cukup untuk evaluasi');
  return {
    model: 'wma6_trend_v1',
    method: 'walk-forward, 20% data terakhir sebagai data uji',
    n_test: n,
    mae: +(absErr / n).toFixed(2),
    mape_percent: +((100 * pctErr) / m).toFixed(1),
    baseline_mae: +(baseErr / n).toFixed(2),
  };
}
