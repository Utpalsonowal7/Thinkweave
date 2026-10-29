import { Router } from 'express';
import { getHealth } from './health.controller.js';
import { readiness } from './readiness.js';

export const healthRouter = Router();

healthRouter.get('/', getHealth);
healthRouter.get('/ready', readiness);
