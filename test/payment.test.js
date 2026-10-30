// Tes tanpa database: info pembayaran untuk layar "Pesanan diterima".
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhatsapp, paymentInstructions } from '../src/services/paymentService.js';

const order = { code: 'TW-A1B2C3', customer_name: 'Dewi', total_price: 86000 };

test('normalizeWhatsapp: 08xx, +62, dan 62 menjadi format wa.me; kosong/tidak valid = null', () => {
  assert.equal(normalizeWhatsapp('0812-3456-7890'), '6281234567890');
  assert.equal(normalizeWhatsapp('+62 812 3456 7890'), '6281234567890');
  assert.equal(normalizeWhatsapp('6281234567890'), '6281234567890');
  assert.equal(normalizeWhatsapp(''), null);
  assert.equal(normalizeWhatsapp(undefined), null);
  assert.equal(normalizeWhatsapp('123'), null);
});

test('paymentInstructions: jumlah, rekening, berita transfer, dan tautan WhatsApp', () => {
  const cfg = { payment: { bankName: 'BCA', accountNumber: '1234567890', accountName: 'Tewiwi House', adminWhatsapp: '081234567890' } };
  const p = paymentInstructions(order, cfg);
  assert.equal(p.amount, 86000);
  assert.equal(p.bank_name, 'BCA');
  assert.equal(p.account_number, '1234567890');
  assert.equal(p.account_name, 'Tewiwi House');
  assert.equal(p.transfer_note, 'TW-A1B2C3');
  assert.equal(p.whatsapp_number, '6281234567890');
  assert.ok(p.whatsapp_url.startsWith('https://wa.me/6281234567890?text='));
  assert.ok(decodeURIComponent(p.whatsapp_url).includes('TW-A1B2C3'));
});

test('paymentInstructions: nomor WhatsApp/rekening belum diatur -> null (frontend menampilkan "belum diatur")', () => {
  const p = paymentInstructions(order, { payment: { bankName: 'BCA', accountNumber: '', accountName: 'Tewiwi House', adminWhatsapp: '' } });
  assert.equal(p.whatsapp_url, null);
  assert.equal(p.whatsapp_number, null);
  assert.equal(p.account_number, null);
});
