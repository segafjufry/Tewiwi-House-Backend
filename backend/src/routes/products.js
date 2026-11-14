import { Router } from 'express';
import { adminOnly, isAdmin } from '../middleware/adminAuth.js';
import { AppError } from '../utils/errors.js';
import { reqBool, reqInt, reqString } from '../utils/validate.js';

const parse = (b = {}, partial = null) => ({
  name: reqString(b.name ?? partial?.name, 'name'),
  price: reqInt(b.price ?? partial?.price, 'price'),
  flour_grams: reqInt(b.flour_grams ?? partial?.flour_grams ?? 0, 'flour_grams'),
  active: reqBool(b.active ?? partial?.active ?? true, 'active'),
});

export default function productsRouter(db) {
  const r = Router();
  const find = async (id) => {
    const p = await db.get('SELECT * FROM products WHERE id = $1', [reqInt(id, 'id', { min: 1 })]);
    if (!p) throw new AppError(404, 'NOT_FOUND', 'Produk tidak ditemukan');
    return p;
  };

  // Publik: hanya produk aktif. Admin + ?all=true: semua produk.
  r.get('/', async (req, res) => {
    const all = req.query.all === 'true' && isAdmin(req);
    res.json({ data: await db.all(`SELECT * FROM products ${all ? '' : 'WHERE active'} ORDER BY id`) });
  });

  r.get('/:id', async (req, res) => res.json({ data: await find(req.params.id) }));

  r.post('/', adminOnly, async (req, res) => {
    const p = parse(req.body);
    const created = await db.get(
      'INSERT INTO products (name, price, flour_grams, active) VALUES ($1, $2, $3, $4) RETURNING *',
      [p.name, p.price, p.flour_grams, p.active]
    );
    res.status(201).json({ data: created });
  });

  r.put('/:id', adminOnly, async (req, res) => {
    const old = await find(req.params.id);
    const p = parse(req.body, old);
    const updated = await db.get(
      'UPDATE products SET name = $1, price = $2, flour_grams = $3, active = $4 WHERE id = $5 RETURNING *',
      [p.name, p.price, p.flour_grams, p.active, old.id]
    );
    res.json({ data: updated });
  });

  r.delete('/:id', adminOnly, async (req, res) => {
    const p = await find(req.params.id);
    try {
      await db.run('DELETE FROM products WHERE id = $1', [p.id]);
    } catch (err) {
      if (err.code === '23503') { // foreign_key_violation
        throw new AppError(409, 'PRODUCT_IN_USE', 'Produk sudah dipakai di order/histori. Nonaktifkan saja (active: false).');
      }
      throw err;
    }
    res.status(204).end();
  });

  return r;
}
