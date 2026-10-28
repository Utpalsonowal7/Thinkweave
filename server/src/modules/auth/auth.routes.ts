import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../../utils/api-error.js';
import * as auth from './auth.controller.js';

export const authRouter = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new ApiError(429, 'Too many attempts. Please try again later.')),
});

// JSON-only mutations prevent ordinary cross-site HTML forms from submitting credentials or logout.
authRouter.post('/register', limiter, requireJson, auth.register);
authRouter.post('/login', limiter, requireJson, auth.login);
authRouter.get('/me', auth.me);
authRouter.post('/logout', requireJson, auth.logout);

function requireJson(req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction): void {
  if (!req.is('application/json')) return next(new ApiError(415, 'Content-Type must be application/json.'));
  next();
}
