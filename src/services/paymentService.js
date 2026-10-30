import { config } from '../config.js';

// 0812... atau +62812... atau 62812... -> 62812... (format wa.me). Mengembalikan null jika kosong/tidak valid.
export function normalizeWhatsapp(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
  return /^[1-9][0-9]{7,14}$/.test(intl) ? intl : null;
}

/**
 * Data untuk layar "Pesanan diterima": jumlah yang harus ditransfer, rekening tujuan, dan tautan WhatsApp admin
 * (sudah berisi pesan siap kirim). Nomor rekening/WhatsApp diatur lewat .env; jika belum diisi nilainya null
 * dan frontend menampilkan "belum diatur".
 */
export function paymentInstructions(order, cfg = config) {
  const p = cfg.payment ?? {};
  const wa = normalizeWhatsapp(p.adminWhatsapp);
  const message =
    `Halo admin Tewiwi House, saya ${order.customer_name} ingin mengirim bukti transfer untuk pesanan ${order.code} ` +
    `sebesar Rp${order.total_price.toLocaleString('id-ID')}.`;
  return {
    amount: order.total_price,
    bank_name: p.bankName || null,
    account_number: p.accountNumber || null,
    account_name: p.accountName || null,
    transfer_note: order.code, // "Cantumkan <kode> pada berita transfer"
    whatsapp_number: wa,
    whatsapp_url: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(message)}` : null,
  };
}
