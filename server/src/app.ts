import express from 'express';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { router } from './routes/index.js';

export const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(router);

// Keep these last: unmatched requests become errors, then errors become JSON.
app.use(notFound);
app.use(errorHandler);
