# ThinkWeave

A collaborative planning board built in reviewable steps. This checkpoint sets up the backend foundation and database schema; it implements email/password and Google/GitHub sign-in with sessions. Workspace APIs, live editing, and AI endpoints come later.

## Stack

Node.js 24, TypeScript, Express, PostgreSQL, Prisma ORM 7, Redis (Docker), and a Gemini REST helper. PostgreSQL runs separately; only Redis is in Docker Compose.

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

3. Edit `server/.env`: replace `DATABASE_URL` with the connection string for your dedicated database. Set `REDIS_URL` if needed. `GEMINI_API_KEY` is optional until AI features are used. Do not commit `.env`.
4. Generate the client, apply the checked-in migration, and start the server:

```powershell
npm run prisma:generate
npm run db:deploy
npm run dev
```

Open http://localhost:8080/health. This is a **liveness** endpoint; it does not check database, Redis, or Gemini connectivity. `db:deploy` applies migrations to the database in `DATABASE_URL` and does not reset it. Review the migration before applying it. For development schema changes later, `npm run db:migrate -- --name descriptive_name` uses Prisma's development migration workflow; it can request a shadow database or prompt on drift, so read any prompt and never reset an existing database without a backup.

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

`src/server.ts` imports `dotenv/config` to load `.env`; each client reads its settings directly from `process.env`. Prisma CLI loads `.env` separately in `prisma.config.ts`. These settings are not centrally validated. `DATABASE_URL` must be set; Redis defaults to `redis://localhost:6379` and `PORT` defaults to 8080. Prisma uses the PostgreSQL driver adapter from `src/lib/prisma.ts`. The Redis client in `src/lib/redis.ts` connects lazily when used; currently no endpoint uses it. `src/lib/gemini.ts` calls the Gemini REST API only on demand and requires a key then. `src/server.ts` closes the HTTP server and clients on shutdown. None of these clients proves an external service is reachable merely because the application starts.

Redis is bound to localhost by default. Compose uses a named volume for local persistence; cache data should not be treated as the source of truth. The setup is intended for local development and needs appropriate authentication, network restrictions, and operational configuration before production.

## Models

The Prisma schema is `server/prisma/schema.prisma`; generated client code is ignored by Git.

| Model | Purpose |
| --- | --- |
| User | Account identity and password hash |
| Session | Per-device session-token hash, expiry, and revocation |
| OAuthAccount | Provider identity linked to one user |
| Workspace | Team container |
| WorkspaceMember | User/workspace membership and role |
| Board | Board metadata and creator |
| WorkspaceInvitation | Hashed invitation token, recipient, role, and lifecycle |
| BoardUpdate | Persisted binary collaboration update |
| BoardSnapshot | Binary board checkpoint and optional last update marker |
| AIProposal | Proposed JSON changes, requester, and review status |

Workspace memberships are unique per user and workspace. A database index restricts a workspace to **at most** one owner; the application must enforce that an owner exists and handle ownership transfer in a transaction. The migration also prevents invitations from assigning the owner role. Email normalization, role authorization, invitation acceptance, token rotation, valid board state, snapshot restoration, proposal validation, and tenant isolation require future application logic; the schema alone does not implement them. The ordering, compaction and restoration semantics for Yjs updates still need to be designed and validated before collaboration is implemented.

Board content is intended to be stored as Yjs binary updates and snapshots, rather than independent SQL rows for every canvas item. `AIProposal.proposal` is untrusted JSON until validated by the future AI service; no AI actions are applied yet. The optional last-update marker is a cursor, not a foreign key, because old updates may later be compacted.

## Responses and errors

`ApiResponse` stores `statusCode`, `message`, `data`, and `success`. `ApiError` extends `Error` with a status, optional details, and captured stack. The middleware returns safe JSON errors; 5xx responses do not expose internal messages or stack traces. Read `src/utils/` and `src/middlewares/` for the request flow.

## Next steps

Verify authentication end to end with your configured services, then build workspace membership and invitation APIs. Add live editing and Gemini only after authorization and persistence behavior are implemented. Explain and review each feature before moving on.

## Authentication

All routes are under `/api/v1/auth`. Registration creates an account; login starts a separate session.

| Method and route | Body | Result |
| --- | --- | --- |
| `POST /register` | `{ "name": "Utpal", "email": "utpal@example.com", "password": "a-long-password" }` | Creates an account and returns its public fields; then log in |
| `POST /login` | `{ "email": "utpal@example.com", "password": "a-long-password" }` | Sets a session cookie and returns the user |
| `GET /me` | None | Returns the user for a valid session cookie |
| `POST /logout` | `{}` | Revokes the current session and clears the cookie |

Send `Content-Type: application/json` for each POST. Email is trimmed and lowercased, names must contain 2–100 characters, and passwords must contain 12–128 characters. Passwords are hashed with Argon2id. Login uses a generic error for unknown accounts and incorrect passwords. A random 32-byte session token is sent in an HttpOnly, SameSite=Strict cookie; only its SHA-256 hash is stored in the existing `Session.refreshTokenHash` column. Sessions expire after seven days and logout revokes the current one. No JWT or token rotation is implemented.

On production (`NODE_ENV=production`) the cookie is Secure and uses the `__Host-` prefix, requiring HTTPS. Local development uses a non-Secure cookie. Authentication mutations require a JSON body and an exact matching Origin header. The API permits credentialed CORS only for APP_ORIGIN. SameSite=Strict cookies support same-site deployments; a frontend on a different site requires a separate cookie and CSRF design.

Authentication routes use shared Redis-backed per-IP rate limits and a per-address email cooldown. Authentication mutations fail closed when Redis is unavailable. Express does not trust proxy headers by default; configure trusted proxies deliberately before deployment, or users behind a proxy may share a limit. Password verification is intentionally expensive, so also capacity-plan and apply edge-level abuse controls. Session rotation and recovery for social-only accounts are not implemented.

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

Redis must be available for OAuth, because one-time state and PKCE verifiers expire there after ten minutes. Login initiation uses `GET /api/v1/auth/oauth/google` or `/api/v1/auth/oauth/github` as a browser navigation. On success the API sets the regular session cookie and redirects to `OAUTH_SUCCESS_REDIRECT`. The frontend can then request `GET /api/v1/auth/me`. Provider errors or account conflicts currently return a JSON error at the callback; there is no frontend error page yet.

Providers are identified by their stable Google `sub` or GitHub numeric ID. Google must provide an email marked verified; GitHub must provide a verified primary email. Provider access tokens are used only to retrieve the profile and are not stored. The app's `emailVerifiedAt` is not set merely because a provider reports an email as verified.

**Existing email accounts are never linked automatically.** First log in to the existing ThinkWeave account, then send JSON `{}` to `POST /api/v1/auth/oauth/google/link` or `/api/v1/auth/oauth/github/link`. Navigate the same browser to the returned `data.authorizationUrl`. The callback links only if that same server-side session remains valid. A provider identity already linked to another user cannot be transferred. Only one account per provider may be linked to each user.

OAuth state uses a short-lived HttpOnly SameSite=Lax cookie bound to a single-use Redis entry; authorization uses PKCE S256. Starting a second flow for the same provider in the same browser replaces its state cookie. Session cookies remain SameSite=Strict, so a frontend hosted on a different site needs a separate CORS and CSRF design. OAuth initiation uses the shared Redis-backed per-IP limiter. Provider credentials and real database/Redis services are required for a full end-to-end check.

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

Email links point to `/verify-email#token=...` and `/reset-password#token=...` on `APP_URL`; fragments are not sent in the HTTP request. **The frontend pages are not built yet**: they must read the token from the fragment, remove it from the visible URL, and POST it in JSON. Until then, use the token from your own email in a manual API request. Do not log tokens or post them in query strings.

`authenticate` validates the stored session and populates `res.locals.auth`; `requireVerifiedEmail` is available for future protected product routes. Account/session endpoints remain accessible to signed-in unverified users so they can manage their account. Social provider email claims do not automatically mark the ThinkWeave email verified; users should complete the verification flow. The app uses opaque sessions; token rotation, replay-family detection, email change, and recovery for social-only accounts are not implemented. Password reset currently applies only to accounts that already have a password.

OAuth initiation and login limits require Redis and fail closed when it is unavailable. When running behind a reverse proxy, explicitly configure Express `trust proxy` to match your infrastructure; the default avoids trusting spoofed forwarding headers but can group users under the proxy IP. Verification and reset email delivery, real OAuth redirects, migration application, and race conditions must be checked with configured external services before production.
