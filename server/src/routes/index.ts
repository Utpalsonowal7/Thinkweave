import { Router } from 'express';
import { workspaceRouter } from '../modules/workspaces/workspace.routes.js';
import { boardRouter } from '../modules/boards/board.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/api/v1/auth', authRouter);

router.use('/api/v1/workspaces', workspaceRouter);
router.use('/api/v1', boardRouter);
