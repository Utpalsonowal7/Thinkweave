import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { redisLimit, requireJson, requireTrustedOrigin } from '../../middlewares/security.js';
import * as auth from './auth.controller.js';
import * as oauth from './oauth.controller.js';
import * as security from './security.controller.js';

export const authRouter = Router();
authRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const loginLimit = redisLimit('auth-login', 10, 15 * 60);
const emailLimit = redisLimit('auth-email', 5, 15 * 60);
const tokenLimit = redisLimit('auth-token', 10, 15 * 60);
const oauthLimit = redisLimit('auth-oauth', 10, 15 * 60);

// OAuth callbacks use state + PKCE; provider redirects cannot include our Origin header.
authRouter.get('/oauth/:provider', oauthLimit, oauth.start);
authRouter.get('/oauth/:provider/callback', oauth.callback);
authRouter.post('/oauth/:provider/link', requireTrustedOrigin, requireJson, oauthLimit, authenticate, oauth.link);

authRouter.post('/register', requireTrustedOrigin, requireJson, emailLimit, auth.register);
authRouter.post('/login', requireTrustedOrigin, requireJson, loginLimit, auth.login);
authRouter.post('/refresh', requireTrustedOrigin, requireJson, tokenLimit, auth.refresh);
authRouter.post('/verification/request', requireTrustedOrigin, requireJson, emailLimit, security.requestVerification);
authRouter.post('/verification/confirm', requireTrustedOrigin, requireJson, tokenLimit, security.verifyEmail);
authRouter.post('/password/forgot', requireTrustedOrigin, requireJson, emailLimit, security.requestReset);
authRouter.post('/password/reset', requireTrustedOrigin, requireJson, tokenLimit, security.resetPassword);
authRouter.get('/me', authenticate, auth.me);
authRouter.get('/sessions', authenticate, security.sessions);
authRouter.post('/sessions/revoke-all', requireTrustedOrigin, requireJson, authenticate, security.revokeAll);
authRouter.post('/sessions/:id/revoke', requireTrustedOrigin, requireJson, authenticate, security.revokeSession);
authRouter.post('/logout', requireTrustedOrigin, requireJson, authenticate, auth.logout);
