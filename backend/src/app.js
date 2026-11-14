import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createLimiter, rateLimit } from './middleware/rateLimit.js';
import { securityHeaders } from './middleware/security.js';
import productsRouter from './routes/products.js';
import slotsRouter from './routes/slots.js';
import ordersRouter from './routes/orders.js';
import productionRouter from './routes/production.js';
import modelRouter from './routes/model.js';
import authRouter from './routes/auth.js';

export function createApp(db, cfg = config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy || false);

  // Pembatas laju dibuat per aplikasi (bukan global modul) agar tes saling terpisah.
  const rl = cfg.rateLimit;
  const globalLimiter = createLimiter(rl.global);
  const orderLimiter = createLimiter(rl.createOrder);
  const trackLimiter = createLimiter(rl.track);
  app.locals.adminFailLimiter = createLimiter(rl.adminFail);

  app.use(securityHeaders({ hsts: cfg.isProd }));
  app.use(
    cors({
      origin: cfg.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'x-admin-key', 'Authorization'],
      maxAge: 600,
    })
  );

  // Sanitize Authorization header — strip newlines/non-printable characters
  // yang bisa menyebabkan "Invalid character in header content" di Node.js
  app.use((req, _res, next) => {
    const auth = req.headers['authorization'];
    if (auth) req.headers['authorization'] = auth.replace(/[^\x20-\x7E]/g, '').trim();
    next();
  });

  // Health check di luar rate limit (dipakai monitoring/Docker); ikut memeriksa database.
  app.get('/api/health', async (req, res) => {
    try {
      await db.get('SELECT 1 AS ok');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'error' });
    }
  });

  app.use('/api', rateLimit(globalLimiter));
  app.use(express.json({ limit: '100kb' }));

  // Endpoint publik yang rawan disalahgunakan diberi batas tambahan.
  app.post('/api/orders', rateLimit(orderLimiter, 'Terlalu banyak pesanan dari alamat ini, coba lagi nanti'));
  app.get('/api/orders/track/:code', rateLimit(trackLimiter));

  app.use('/api/products', productsRouter(db));
  app.use('/api/slots', slotsRouter(db));
  app.use('/api/orders', ordersRouter(db, cfg));
  app.use('/api/production', productionRouter(db));
  app.use('/api', modelRouter(db));
  app.use('/api/auth', authRouter(db));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
