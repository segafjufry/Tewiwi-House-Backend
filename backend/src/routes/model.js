import { Router } from 'express';
import { adminOnly } from '../middleware/adminAuth.js';
import { evaluate, predict } from '../services/predictionService.js';

// Inference API untuk model prediksi demand (khusus admin).
// adminOnly dipasang per route, bukan r.use(), supaya URL /api/... yang tidak ada tetap 404.
export default function modelRouter(db) {
  const r = Router();
  r.post('/predict', adminOnly, async (req, res) => res.json({ data: await predict(db, req.body?.delivery_date) }));
  r.get('/model/evaluation', adminOnly, async (req, res) => res.json({ data: await evaluate(db) }));
  return r;
}
