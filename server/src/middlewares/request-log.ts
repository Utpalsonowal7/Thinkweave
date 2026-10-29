import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestLog: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const start = performance.now();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.once('finish', () => {
    // Use route templates: query strings, cookies, bodies and tokens never belong in logs.
    console.log(
      JSON.stringify({
        event: 'http_request',
        requestId,
        method: req.method,
        route: req.route?.path ?? 'unmatched',
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      }),
    );
  });
  next();
};
