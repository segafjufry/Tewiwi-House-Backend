import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { addDays } from '../utils/dates.js';
import { reqDate } from '../utils/validate.js';
import { getSlot, nextAvailable } from './slotService.js';
import { predict } from './predictionService.js';
import { CONFIRMED_STATUSES } from './orderService.js';

// Data terstruktur untuk satu tanggal pengiriman (dipakai endpoint summary dan brief)
export async function buildBriefData(db, date) {
  reqDate(date, 'delivery_date');
  const slot = await getSlot(db, date);
  if (!slot) throw new AppError(404, 'NOT_FOUND', 'Tanggal tersebut bukan hari pengiriman');

  const pred = await predict(db, date);
  // Brief memakai order TERKONFIRMASI. Order 'Baru' ikut memakai kapasitas slot, tapi hanya dilaporkan
  // sebagai 'pending' (belum masuk target) sampai admin mengonfirmasinya.
  const inConfirmed = CONFIRMED_STATUSES.map((x) => `'${x}'`).join(', '); // konstanta internal, bukan input pengguna
  const ordered = await db.all(
      `SELECT i.product_id AS id,
              SUM(CASE WHEN o.status IN (${inConfirmed}) THEN i.quantity ELSE 0 END) AS confirmed,
              SUM(CASE WHEN o.status = 'Baru' THEN i.quantity ELSE 0 END) AS pending
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.delivery_date = $1 AND o.status <> 'Dibatalkan' GROUP BY i.product_id`,
    [date]
  );
  const orderedMap = new Map(ordered.map((r) => [r.id, r]));
  const counts = await db.get(
      `SELECT SUM(CASE WHEN status IN (${inConfirmed}) THEN 1 ELSE 0 END) AS confirmed,
              SUM(CASE WHEN status = 'Baru' THEN 1 ELSE 0 END) AS pending
       FROM orders WHERE delivery_date = $1`,
    [date]
  );
  const orderCount = counts.confirmed || 0;
  const pendingCount = counts.pending || 0;
  const flourMap = new Map((await db.all('SELECT id, flour_grams FROM products')).map((p) => [p.id, p.flour_grams]));

  const items = pred.per_product.map((p) => {
    const row = orderedMap.get(p.product_id);
    const o = row?.confirmed || 0;
    const pending = row?.pending || 0;
    // Slot penuh = tidak ada order baru lagi, jadi target = jumlah order terkonfirmasi.
    // Slot masih terbuka = siapkan sebesar yang lebih besar antara order terkonfirmasi dan prediksi.
    const target = slot.left === 0 ? o : Math.max(o, p.predicted_qty);
    return {
      product_id: p.product_id,
      name: p.name,
      ordered: o, // terkonfirmasi
      pending, // berstatus Baru, belum masuk target
      predicted: p.predicted_qty,
      target,
      flour_kg: +((target * (flourMap.get(p.product_id) || 0)) / 1000).toFixed(2),
    };
  });

  const total_target = items.reduce((a, b) => a + b.target, 0);
  const confirmed_qty = items.reduce((a, b) => a + b.ordered, 0);
  const pending_qty = items.reduce((a, b) => a + b.pending, 0);
  const warnings = [];
  if (pending_qty > 0) {
    warnings.push(
      `${pendingCount} order (${pending_qty} pcs) masih berstatus Baru dan belum masuk target. ` +
        `Konfirmasi sebelum produksi dimulai (${addDays(date, -config.productionLeadDays)}).`
    );
  }
  if (slot.left === 0) {
    const nx = await nextAvailable(db, date);
    warnings.push(`Slot penuh. Pelanggan baru diarahkan ke ${nx ? `${nx.day_name} ${nx.delivery_date}` : 'slot berikutnya'}.`);
  }
  if (total_target > slot.capacity) {
    warnings.push(`Target produksi (${total_target} pcs) melebihi kapasitas slot (${slot.capacity} pcs).`);
  }
  for (const it of items) {
    if (it.predicted > 0 && it.ordered > it.predicted) warnings.push(`${it.name}: order sudah melewati prediksi.`);
  }

  return {
    delivery_date: date,
    day_name: slot.day_name,
    production_start: addDays(date, -config.productionLeadDays),
    capacity: slot.capacity,
    used: slot.used, // termasuk order Baru (memakai kapasitas)
    confirmed_qty,
    pending_qty,
    order_count: orderCount, // order terkonfirmasi
    pending_order_count: pendingCount,
    items,
    total_target,
    flour_kg: +items.reduce((a, b) => a + b.flour_kg, 0).toFixed(2),
    warnings,
  };
}

export function templateBrief(d) {
  const lines = d.items.map((i) => `- ${i.name}: ${i.ordered} terkonfirmasi${i.pending ? ` (+${i.pending} belum dikonfirmasi)` : ''}, prediksi ${i.predicted}, target produksi ${i.target} pcs`);
  const notes = d.warnings.length ? d.warnings.map((w) => `- ${w}`) : ['- Tidak ada risiko kapasitas.'];
  return [
    `PRODUCTION BRIEF - ${d.day_name}, ${d.delivery_date}`,
    `Mulai produksi: ${d.production_start} (H-2)`,
    `Kapasitas slot: ${d.capacity} pcs | Terisi: ${d.used} pcs (terkonfirmasi ${d.confirmed_qty} dari ${d.order_count} order, belum dikonfirmasi ${d.pending_qty} pcs)`,
    '',
    'Rincian produk',
    ...lines,
    '',
    `Total target: ${d.total_target} pcs`,
    `Estimasi tepung: ${d.flour_kg} kg`,
    '',
    'Catatan',
    ...notes,
  ].join('\n');
}

const SYSTEM_PROMPT =
  'Kamu asisten produksi untuk bakery kecil. Tulis production brief singkat dalam Bahasa Indonesia ' +
  'untuk tim dapur berdasarkan data JSON yang diberikan. Gunakan HANYA angka dari data, jangan mengarang. ' +
  'Pada data, "ordered" = order yang sudah dikonfirmasi, "pending" = order berstatus Baru yang belum dikonfirmasi dan BELUM masuk target. ' +
  'Format: ringkasan 2 kalimat, daftar target produksi per produk, lalu catatan risiko/tindakan. Teks biasa, tanpa markdown.';

async function writeWithClaude(data) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(data) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const json = await res.json();
  return json.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// Generative AI jika ANTHROPIC_API_KEY diisi; kalau kosong atau gagal, pakai template.
export async function generateBrief(db, date) {
  const data = await buildBriefData(db, date);
  if (config.anthropicKey) {
    try {
      const text = await writeWithClaude(data);
      if (text) return { delivery_date: date, source: 'llm', brief: text, data };
    } catch (err) {
      console.warn('Gagal memanggil LLM, memakai template:', err.message);
    }
  }
  return { delivery_date: date, source: 'template', brief: templateBrief(data), data };
}
