import { Router } from 'express';
import { authenticate, requireVerifiedEmail } from '../../middlewares/authenticate.js';
import { requireJson, requireTrustedOrigin, redisLimit } from '../../middlewares/security.js';
import { ApiResponse } from '../../utils/api-response.js';
import { id, text } from '../workspaces/workspace.service.js';
import * as service from './board.service.js';
import { propose, pending } from './ai.service.js';
import { reviewProposal } from '../realtime/proposals.js';
import { createSnapshot, restoreSnapshot } from '../realtime/snapshots.js';
import { prisma } from '../../lib/prisma.js';

export const boardRouter = Router();
boardRouter.use(authenticate, requireVerifiedEmail);
boardRouter.get('/workspaces/:workspaceId/boards', async (req, res) => {
  res.json(
    new ApiResponse(
      200,
      'success',
      await service.list(id(req.params.workspaceId), res.locals.auth.user.id),
    ),
  );
});
boardRouter.post(
  '/workspaces/:workspaceId/boards',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    const result = await service.create(
      id(req.params.workspaceId),
      res.locals.auth.user.id,
      text(req.body?.title, 'Title'),
    );
    res.status(201).json(new ApiResponse(201, 'Board created.', result));
  },
);
boardRouter.get('/boards/:boardId', async (req, res) => {
  res.json(
    new ApiResponse(
      200,
      'success',
      await service.access(id(req.params.boardId), res.locals.auth.user.id),
    ),
  );
});

boardRouter.post(
  '/boards/:boardId/ai/proposal',
  requireTrustedOrigin,
  requireJson,
  redisLimit('ai-proposal', 10, 900),
  async (req, res) => {
    const result = await propose(id(req.params.boardId), res.locals.auth.user.id, req.body?.notes);
    res.json(new ApiResponse(200, 'Proposal ready for review.', result));
  },
);
boardRouter.get('/boards/:boardId/ai/proposals', async (req, res) => {
  res.json(
    new ApiResponse(200, 'success', await pending(id(req.params.boardId), res.locals.auth.user.id)),
  );
});
boardRouter.post(
  '/boards/:boardId/ai/proposals/:proposalId/apply',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    res.json(
      new ApiResponse(
        200,
        'Proposal applied.',
        await reviewProposal(
          id(req.params.boardId),
          id(req.params.proposalId),
          res.locals.auth.user.id,
          true,
        ),
      ),
    );
  },
);
boardRouter.post(
  '/boards/:boardId/ai/proposals/:proposalId/reject',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    res.json(
      new ApiResponse(
        200,
        'Proposal rejected.',
        await reviewProposal(
          id(req.params.boardId),
          id(req.params.proposalId),
          res.locals.auth.user.id,
          false,
        ),
      ),
    );
  },
);
boardRouter.post('/boards/:boardId/rename', requireTrustedOrigin, requireJson, async (req, res) => {
  res.json(
    new ApiResponse(
      200,
      'Board renamed.',
      await service.rename(
        id(req.params.boardId),
        res.locals.auth.user.id,
        text(req.body?.title, 'Title'),
      ),
    ),
  );
});
boardRouter.post(
  '/boards/:boardId/archive',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    await service.archive(id(req.params.boardId), res.locals.auth.user.id);
    res.json(new ApiResponse(200, 'Board archived.', null));
  },
);

boardRouter.get('/boards/:boardId/snapshots', async (req, res) => {
  const boardId = id(req.params.boardId);
  await service.access(boardId, res.locals.auth.user.id);
  const snapshots = await prisma.boardSnapshot.findMany({
    where: { boardId },
    select: { id: true, epoch: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(new ApiResponse(200, 'success', snapshots));
});
boardRouter.post(
  '/boards/:boardId/snapshots',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    const snapshot = await createSnapshot(id(req.params.boardId), res.locals.auth.user.id);
    res.status(201).json(new ApiResponse(201, 'Snapshot saved.', snapshot));
  },
);
boardRouter.post(
  '/boards/:boardId/snapshots/:snapshotId/restore',
  requireTrustedOrigin,
  requireJson,
  async (req, res) => {
    const result = await restoreSnapshot(
      id(req.params.boardId),
      id(req.params.snapshotId),
      res.locals.auth.user.id,
    );
    res.json(new ApiResponse(200, 'Snapshot restored.', result));
  },
);
