import express from 'express';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { router } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
// Browser clients are allowed only from the configured exact origin.
app.use((req, res, next) => {
  const origin = req.get('origin');
  const allowed = process.env.APP_ORIGIN;
  res.vary('Origin');
  if (origin && allowed && origin === allowed) {
    res.set('Access-Control-Allow-Origin', allowed);
    res.set('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).end();
      return;
    }
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(router);

// Keep these last: unmatched requests become errors, then errors become JSON.
app.use(notFound);
app.use(errorHandler);
