# Manual release walkthrough

These steps are a manual review guide, not automated test files or a claim that external integrations have passed.

1. Follow the root setup instructions. Configure your own PostgreSQL, Redis, Brevo, OAuth applications, JWT signing secret, and Gemini key/model. Generate Prisma and apply the checked-in migrations. Start server and client in separate terminals.
2. Check `/health` for liveness and `/health/ready` for PostgreSQL/Redis readiness. Create an account, open its verification email, and sign in. Password reset should invalidate existing sessions. Try Google and GitHub login with the documented callbacks; connect providers from Settings for existing email accounts.
3. Create a workspace and board. Invite a second verified account as EDITOR, then open the board in two browser profiles. Add notes, drag them, edit text, connect two notes, remove a connector, and use Undo/Redo. Both profiles should converge after each saved update.
4. Disconnect one already-open editor tab using browser developer tools. Edit different fields in both tabs, reconnect, and check convergence. Reload only after the status shows all changes saved. Offline fresh-page loading is outside this release's scope.
5. Change the second account to VIEWER. Reconnect it, confirm read-only controls, and verify a manually attempted update is rejected. Remove that membership and verify it cannot rejoin or read the board. Check a different workspace ID cannot be accessed.
6. Save a snapshot while online and synced, edit the board, and restore the snapshot as owner/admin. Other connected clients should receive the restore message. Export any unsynced local notes before reloading. An old-epoch join must be rejected; the new epoch must show the saved snapshot.
7. Select notes with Shift-click, generate a Gemini plan, and review its tasks. Review later should leave a pending proposal; Discard should reject it; Add tasks should persist and broadcast it. Retrying the same approval request must not add tasks again. Restore to an earlier epoch and check old pending plans cannot be applied.
8. Try missing credentials, Redis unavailability, an expired access cookie, an invalid invitation, and a malformed or oversized update. Confirm a failed save stays visibly unsynced. Use Export local notes before leaving if recovery is required.
9. Run `npm run prisma:validate`, `npm run typecheck`, and `npm run build` in `server/`; run `npm run build` in `client/`. Check the Build and validate workflow on GitHub.

## Development verification

The development environment could build both applications and run a local Socket.IO exercise against mocked storage. It had no PostgreSQL/Redis services or provider credentials. Real migration/transaction behavior, browser UI interactions, and external providers remain manual verification items. Do not replace these with invented benchmark or production claims.
