# ThinkWeave

A collaborative planning board built in reviewable steps. This checkpoint sets up the backend foundation and database schema; it does not implement authentication, workspaces, boards, live editing, or AI endpoints yet.

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
| Session | Per-device refresh-token hash, expiry, and revocation |
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

Build authentication and session rotation, then workspace membership and invitation APIs. Add live editing and Gemini only after authorization and persistence behavior are implemented. Explain and review each feature before moving on.
