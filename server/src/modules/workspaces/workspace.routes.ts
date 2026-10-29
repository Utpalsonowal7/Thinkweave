import { Router } from 'express';
import { authenticate, requireVerifiedEmail } from '../../middlewares/authenticate.js';
import { requireJson, requireTrustedOrigin, redisLimit } from '../../middlewares/security.js';
import { ApiResponse } from '../../utils/api-response.js';
import * as service from './workspace.service.js';

export const workspaceRouter = Router();
workspaceRouter.use(authenticate, requireVerifiedEmail);
workspaceRouter.get('/', async (_req, res) => {
  res.json(new ApiResponse(200, 'success', await service.list(res.locals.auth.user.id)));
});
workspaceRouter.post('/', requireTrustedOrigin, requireJson, async (req, res) => {
  const workspace = await service.create(
    res.locals.auth.user.id,
    service.text(req.body?.name, 'Name'),
  );
  res.status(201).json(new ApiResponse(201, 'Workspace created.', workspace));
});
workspaceRouter.post('/invitations/accept', requireTrustedOrigin, requireJson, async (req, res) => {
  res.json(
    new ApiResponse(
      200,
      'Invitation accepted.',
      await service.accept(res.locals.auth.user.id, req.body?.token),
    ),
  );
});
workspaceRouter.get('/:workspaceId/members', async (req, res) => {
  res.json(
    new ApiResponse(
      200,
      'success',
      await service.members(service.id(req.params.workspaceId), res.locals.auth.user.id),
    ),
  );
});
workspaceRouter.post(
  '/:workspaceId/invitations',
  requireTrustedOrigin,
  requireJson,
  redisLimit('invite', 10, 900),
  async (req, res) => {
    await service.invite(
      service.id(req.params.workspaceId),
      res.locals.auth.user.id,
      req.body?.email,
      req.body?.role,
    );
    res.status(201).json(new ApiResponse(201, 'Invitation sent.', null));
  },
);
workspaceRouter.post(
  '/:workspaceId/members/:userId/role',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    await service.changeMember(
      service.id(req.params.workspaceId),
      res.locals.auth.user.id,
      service.id(req.params.userId),
      req.body?.role,
    );
    res.json(new ApiResponse(200, 'Role updated.', null));
  },
);
workspaceRouter.post(
  '/:workspaceId/members/:userId/remove',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    await service.changeMember(
      service.id(req.params.workspaceId),
      res.locals.auth.user.id,
      service.id(req.params.userId),
      undefined,
      true,
    );
    res.json(new ApiResponse(200, 'Member removed.', null));
  },
);
