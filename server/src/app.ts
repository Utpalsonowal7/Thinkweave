import express from 'express';
import { router } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(router);

app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});
