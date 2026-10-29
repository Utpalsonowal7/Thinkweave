# ThinkWeave

ThinkWeave is a collaborative planning app: create a workspace, invite a team, connect notes on a shared board, and turn selected notes into a reviewed Gemini task plan. The React client and Node.js API live in separate folders. Realtime transport uses **Socket.IO**, with Yjs for merging board changes.

## Stack

Node.js 24, TypeScript, Express, PostgreSQL, Prisma ORM 7, Redis, Socket.IO, Yjs, React, React Flow, Vite, and Gemini. PostgreSQL and Node run separately; **only Redis is in Docker Compose**.

## Local setup (Windows PowerShell)

1. Install Node.js 24, PostgreSQL, and Docker Desktop. Create a **dedicated, empty** PostgreSQL database called `thinkweave` using your existing PostgreSQL installation.
2. Clone the repository, start Redis, and install dependencies:

```powershell
git clone https://github.com/Utpalsonowal7/Thinkweave.git
cd Thinkweave
docker compose up -d redis
cd server
npm ci
Copy-Item .env.example .env
```

3. Edit `server/.env`: replace `DATABASE_URL` with the connection string for your dedicated database. Set `REDIS_URL` if needed. Set `JWT_ACCESS_SECRET` to a private random 64-character hex value (generation command below). Set `APP_ORIGIN`, `APP_URL`, and `OAUTH_SUCCESS_REDIRECT` to `http://localhost:5173`. Set Brevo credentials to deliver verification and invitation emails. `GEMINI_API_KEY` and a `GEMINI_MODEL` available to your account are needed only for AI features. Do not commit `.env`.
4. Generate the client, apply the checked-in migration, and start the server:

```powershell
npm run prisma:generate
npm run db:deploy
npm run dev
```

Open http://localhost:8080/health. This is a **liveness** endpoint; it does not check database, Redis, or Gemini connectivity. `db:deploy` applies migrations to the database in `DATABASE_URL` and does not reset it. Review the migration before applying it. For development schema changes later, `npm run db:migrate -- --name descriptive_name` uses Prisma's development migration workflow; it can request a shadow database or prompt on drift, so read any prompt and never reset an existing database without a backup.

5. Open a second terminal in the repository root and start the separate frontend:

```powershell
cd client
npm ci
Copy-Item .env.example .env
npm run dev
```

Open **http://localhost:5173**, register, verify your email, and log in. Create a workspace and a board; invite a second account to try collaboration. The client uses `VITE_API_URL=http://localhost:8080`. Use `localhost` consistently; switching to `127.0.0.1` changes the trusted origin. When updating an existing checkout, preserve your `.env` files, run `npm ci` in both folders, regenerate Prisma, and apply the new migration with `npm run db:deploy` in `server/`.

## Commands

Run inside `server/`:

| Command | Purpose |
| --- | --- |
| `npm run prisma:generate` | Generate the Prisma client after install/schema changes |
| `npm run prisma:validate` | Validate the Prisma schema |
| `npm run db:deploy` | Apply checked-in migrations |
| `npm run db:migrate -- --name name` | Create and apply a development migration |
| `npm run typecheck` | Type-check source (generate client first) |
| `npm run build` | Compile TypeScript (generate client first) |
| `npm run dev` | Start with file watching |
| `npm start` | Run compiled code after build |

## Configuration and clients

`server/src/server.ts` imports `dotenv/config` once; modules use `process.env` directly. Prisma CLI loads `.env` separately in `prisma.config.ts`. `DATABASE_URL` and a valid `JWT_ACCESS_SECRET` are required. Redis defaults to `redis://localhost:6379`, the API to port 8080, and the client to port 5173. `VITE_*` variables are public browser configuration: never put provider secrets there.

Redis stores rate limits, short-lived OAuth state, and five-minute AI-plan cache entries scoped to board, user, board version, model, and input hash. PostgreSQL stores identities, permissions, board updates, snapshots, and AI proposals. Auth and AI-generation rate limits fail closed if Redis is down; a cache read/write failure alone never changes persisted board state. `/health` is liveness; `/health/ready` checks PostgreSQL and Redis with a bounded response wait. Neither checks Gemini, email, or OAuth providers.

Compose binds Redis to localhost and uses a named volume. The API attaches Socket.IO to its HTTP server; on shutdown it closes connections, drains board work, and closes database/cache clients. Run **one API process** for this release: Redis caching is not a multi-process board coordination mechanism.

## Models

The Prisma schema is `server/prisma/schema.prisma`; generated client code is ignored by Git.

| Model | Purpose |
| --- | --- |
| User | Account identity and password hash |
| Session | Per-device current refresh-token hash, expiry, and revocation |
| RefreshToken | Hashed rotation history for detecting reuse |
| OAuthAccount | Provider identity linked to one user |
| Workspace | Team container |
| WorkspaceMember | User/workspace membership and role |
| Board | Board metadata and creator |
| WorkspaceInvitation | Hashed invitation token, recipient, role, and lifecycle |
| BoardUpdate | Persisted binary collaboration update |
| BoardSnapshot | Binary board checkpoint and optional last update marker |
| AIProposal | Proposed JSON changes, requester, and review status |

Workspace memberships are unique per user and workspace. Creation inserts the workspace and owner atomically. A database partial index permits at most one owner; the API prevents deleting or changing that owner. Invitations are single-use, expiring, hashed, bound to the recipient's verified email, and cannot assign the owner role. Only owners can promote or manage admins.

Board content is stored as Yjs updates. Every restore increments `Board.epoch`; updates, snapshots, and browser caches are separated by epoch. A client from an old version must export unsynced notes before reloading. Saved AI proposals contain validated tasks and their board epoch. Approval persists a Yjs update and the proposal's APPLIED status in the same transaction; rejection leaves the board untouched. Repeat approval is idempotent.

## Responses and errors

`ApiResponse` stores `statusCode`, `message`, `data`, and `success`. `ApiError` extends `Error` with a status, optional details, and captured stack. The middleware returns safe JSON errors; 5xx responses do not expose internal messages or stack traces. Read `src/utils/` and `src/middlewares/` for the request flow.

## Included product flows

- Password, Google, and GitHub login; email verification and password reset; session revocation and provider linking.
- Workspaces, invitation acceptance, member roles, board creation, rename, and archive.
- Notes and connectors, dragging, local undo/redo, live cursors, presence, and read-only viewers.
- Open-board offline editing with IndexedDB storage and Yjs synchronization after reconnecting.
- Saved snapshots, owner/admin restore, stale-version protection, and local JSON export.
- Gemini task suggestions with preview, pending-plan recovery, explicit approval/rejection, and short-lived Redis caching.
- Request-ID logs, liveness/readiness routes, and CI for Prisma validation, type checks, and builds. No automated test files are included, as requested.

Read [the architecture and limits](docs/architecture.md), [product API and Socket.IO contract](docs/api.md), and [the manual walkthrough](docs/walkthrough.md) before evaluating the release. Builds and mocked local Socket.IO checks do not prove production reliability, deployment, concurrency scale, or latency targets. This checkout has not been deployed to AWS or benchmarked against a real PostgreSQL dataset.

## Authentication

All routes are under `/api/v1/auth`. Registration creates an account; login starts a separate session.

| Method and route | Body | Result |
| --- | --- | --- |
| `POST /register` | `{ "name": "Utpal", "email": "utpal@example.com", "password": "a-long-password" }` | Creates an account and returns its public fields; then log in |
| `POST /login` | `{ "email": "utpal@example.com", "password": "a-long-password" }` | Sets access and refresh cookies and returns the user |
| `POST /refresh` | `{}` | Rotates the refresh token and sets both cookies |
| `GET /me` | None | Returns the user for a valid access cookie and active session |
| `POST /logout` | `{}` | Revokes the current session and clears both cookies |

Send `Content-Type: application/json` for each POST. Email is normalized; passwords use Argon2id. Login sets an HttpOnly, SameSite=Strict **access JWT** (15 minutes) and an opaque **refresh token** (seven-day absolute session lifetime). The access JWT contains user and session IDs and is signed with HS256; `authenticate` verifies its signature and claims and checks the session in PostgreSQL so revocations take effect immediately. The refresh token is random, and only its SHA-256 hash is stored. OAuth login sets the same cookies. No token is returned in the response body.

`POST /refresh` requires `{}`, the trusted Origin, and the refresh cookie. It atomically marks the old token used, saves the next token hash, and issues both new cookies. Reusing a consumed refresh token revokes that device session. The client must coordinate refresh requests **across tabs** and allow only one in-flight refresh per session. With strict replay detection, simultaneous requests using the same old token can cause the second request to revoke the session. A lost refresh response can also require a fresh login; do not retry the old token blindly. No grace period or idempotent retry mechanism is implemented. Expired or revoked refresh tokens require login again.

Refresh-token history is retained for the lifetime of the session to detect reuse. Production needs a scheduled cleanup policy for expired and revoked sessions and their history. Logout and password reset revoke sessions; access-token checks consult the session, so existing access tokens stop working on the next request. Logout requires a valid access token: refresh first if it has expired.

In production (`NODE_ENV=production`) both cookies are Secure and use the `__Host-` prefix, requiring HTTPS. Local development uses non-Secure cookies. Authentication mutations require a JSON body and an exact matching Origin header. The API permits credentialed CORS only for APP_ORIGIN. SameSite=Strict cookies support same-site deployments; a frontend on a different site requires a separate cookie and CSRF design.

Authentication routes use shared Redis-backed per-IP rate limits and a per-address email cooldown. Authentication mutations fail closed when Redis is unavailable. Express does not trust proxy headers by default; configure trusted proxies deliberately before deployment, or users behind a proxy may share a limit. Password verification is intentionally expensive, so also capacity-plan and apply edge-level abuse controls. Recovery for social-only accounts is not implemented.

## Google and GitHub sign-in

Create a Google OAuth web client and a GitHub OAuth App. Configure these **exact** redirect URLs for local development:

- Google: `http://localhost:8080/api/v1/auth/oauth/google/callback`
- GitHub: `http://localhost:8080/api/v1/auth/oauth/github/callback`

Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, and `OAUTH_SUCCESS_REDIRECT` to `server/.env`; see `.env.example`. Use HTTPS for callback and success URLs in production. The success redirect must be a fixed URL under your control; it is not accepted from the request. Apply the new migration and regenerate the client:

```powershell
cd server
npm ci
npm run prisma:generate
npm run db:deploy
npm run dev
```

Redis must be available for OAuth, because one-time state and PKCE verifiers expire there after ten minutes. Login initiation uses `GET /api/v1/auth/oauth/google` or `/api/v1/auth/oauth/github` as a browser navigation. On success the API sets the access and refresh cookies and redirects to `OAUTH_SUCCESS_REDIRECT`. The frontend can then request `GET /api/v1/auth/me`. Provider errors or account conflicts currently return a JSON error at the callback; there is no frontend error page yet.

Providers are identified by their stable Google `sub` or GitHub numeric ID. Google must provide an email marked verified; GitHub must provide a verified primary email. Provider access tokens are used only to retrieve the profile and are not stored. The app's `emailVerifiedAt` is not set merely because a provider reports an email as verified.

**Existing email accounts are never linked automatically.** First log in to the existing ThinkWeave account, then send JSON `{}` to `POST /api/v1/auth/oauth/google/link` or `/api/v1/auth/oauth/github/link`. Navigate the same browser to the returned `data.authorizationUrl`. The callback links only if that same server-side session remains valid. A provider identity already linked to another user cannot be transferred. Only one account per provider may be linked to each user.

OAuth state uses a short-lived HttpOnly SameSite=Lax cookie bound to a single-use Redis entry; authorization uses PKCE S256. Starting a second flow for the same provider in the same browser replaces its state cookie. Access and refresh cookies remain SameSite=Strict, so a frontend hosted on a different site needs a separate CORS and CSRF design. OAuth initiation uses the shared Redis-backed per-IP limiter. Provider credentials and real database/Redis services are required for a full end-to-end check.

## Verification, reset, and session management

Set `APP_ORIGIN` to the exact trusted frontend origin (no trailing slash), `APP_URL` to the frontend base URL, `BREVO_API_KEY`, and `EMAIL_FROM` to a verified Brevo sender in `server/.env`. Set HTTPS URLs and `NODE_ENV=production` for deployment. Do not put secrets in Git. Run `npm run prisma:generate` and `npm run db:deploy` after updating. Redis and PostgreSQL must both be available. Authentication writes reject requests without a matching `Origin` header, including API clients; include `Origin: http://localhost:5173` for local manual requests. Browser fetches from that origin should use `credentials: 'include'`.

| Method and path under `/api/v1/auth` | JSON body |
| --- | --- |
| `POST /verification/request` | `{ "email": "user@example.com" }` |
| `POST /verification/confirm` | `{ "token": "..." }` |
| `POST /password/forgot` | `{ "email": "user@example.com" }` |
| `POST /password/reset` | `{ "token": "...", "password": "new-long-password" }` |
| `GET /sessions` | No body; current valid session cookie required |
| `POST /sessions/:id/revoke` | `{}`; only the session owner can revoke it |
| `POST /sessions/revoke-all` | `{}`; revokes every session including the current one |

Registration attempts to send a verification email; if email configuration or delivery fails, the account remains registered and the user can request another link. Request endpoints return a generic response for known and unknown addresses. There is a 60-second per-address cooldown and per-IP limits. Verification tokens expire after 24 hours; password reset tokens expire after 15 minutes. Only hashes are stored. A reset consumes the token and revokes the user's sessions in a database transaction. Login checks the password version inside a transaction before issuing a session.

Email links point to `/verify-email#token=...` and `/reset-password#token=...` on `APP_URL`; fragments are not sent in the HTTP request. The frontend pages read the token from the fragment, remove it from the visible URL, and POST it in JSON after confirmation. If an invitation requires login, sign in and reopen the link from your email. Do not log tokens or post them in query strings.

`authenticate` validates the stored session and populates `res.locals.auth`; `requireVerifiedEmail` protects workspace, board, and realtime access. Account/session endpoints remain accessible to signed-in unverified users so they can manage their account. Social provider email claims do not automatically mark the ThinkWeave email verified; users should complete the verification flow. The app uses rotating opaque refresh tokens and signed access tokens; email change and recovery for social-only accounts are not implemented. Password reset currently applies only to accounts that already have a password.

OAuth initiation and login limits require Redis and fail closed when it is unavailable. When running behind a reverse proxy, explicitly configure Express `trust proxy` to match your infrastructure; the default avoids trusting spoofed forwarding headers but can group users under the proxy IP. Verification and reset email delivery, real OAuth redirects, migration application, and race conditions must be checked with configured external services before production.

## Access-token signing key and upgrade

Set `JWT_ACCESS_SECRET` in `server/.env` to at least 32 cryptographically random bytes encoded as hex. Generate one on your own machine:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the output into `.env` and keep it private. The server refuses to start without a valid hex value. Deploy the same secret to instances that must verify each other's access tokens; rotating it invalidates existing access tokens. The earlier access-token migration intentionally revoked existing sessions once, when upgrading from legacy session cookies. The new board-epoch migration does not revoke sessions. New OAuth and password logins issue the new cookies.

The frontend serializes refresh requests across tabs with the Web Locks API. Use a current browser on localhost or HTTPS; without Web Locks, an expired access token requires signing in again. The refresh implementation serializes each session's database update and retains consumed hashes; database integration and concurrent replay behavior still need verification against a running PostgreSQL instance before deployment.
