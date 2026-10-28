import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/api/v1/auth', authRouter);
