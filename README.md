# ThinkWeave

Think together. Build a plan.

ThinkWeave is a collaborative planning board being built in small, reviewable checkpoints. The planned product combines shared notes and diagrams, real-time editing, offline synchronization, and Gemini-assisted task planning.

## Current checkpoint: backend initialization

Implemented:

- Node.js 24 and TypeScript with ES modules and strict type checking.
- Express backend with separate startup, application, routing, and controller files.
- `GET /health` liveness endpoint and a JSON response for unknown routes.
- Development, type-checking, build, and production-start commands.
- Reserved folders for the next checkpoints.

This is the initial backend foundation, not the complete application. PostgreSQL, Prisma 7, Redis, authentication, Gemini, and the frontend are not integrated yet. No database, Redis instance, Docker installation, or API key is needed to run this checkpoint.

## Run locally

Install Node.js **24.x** with npm first. The root `.nvmrc` records the Node major version.

```bash
git clone https://github.com/Utpalsonowal7/Thinkweave.git
cd Thinkweave/server
npm ci
npm run dev
```

Open <http://localhost:8080/health> in your browser:

```json
{
  "status": "ok",
  "service": "thinkweave-api"
}
```

This endpoint confirms that the HTTP application can respond. It does not claim that PostgreSQL, Redis, or Gemini are available. Database readiness will be handled separately when those dependencies exist.

The default port is `8080`. You can override it with the `PORT` environment variable. `.env` loading will be added in the configuration checkpoint; creating a `.env` file alone does not change the port yet.

PowerShell example:

```powershell
$env:PORT = "8081"
npm run dev
```

## Commands

Run these inside `server/`:

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact dependency versions from the lockfile |
| `npm run dev` | Run TypeScript with automatic restart on edits |
| `npm run typecheck` | Check types without generating files |
| `npm run build` | Compile `src/` into JavaScript in `dist/` |
| `npm start` | Run the compiled server; build first |

`tsx` runs development code but does not type-check it. Use the type-check command before committing.

## Packages

| Package | Purpose |
| --- | --- |
| `express` | HTTP application, middleware, and routing |
| `typescript` | Type checking and JavaScript compilation |
| `tsx` | TypeScript execution in development, alongside Node's built-in watcher |
| `@types/express` | Express type definitions |
| `@types/node` | Node.js type definitions |

Only Express is a runtime dependency at this checkpoint. The other packages are development dependencies. We will add libraries when their feature is implemented.

## Read the code in this order

| File | Responsibility |
| --- | --- |
| `server/src/server.ts` | Validates the port and starts the HTTP listener |
| `server/src/app.ts` | Creates the Express app, registers middleware and routes, and handles unknown paths |
| `server/src/routes/index.ts` | Mounts feature routers; currently `/health` |
| `server/src/modules/health/health.routes.ts` | Connects the health GET route to its handler |
| `server/src/modules/health/health.controller.ts` | Sends the health response |
| `server/tsconfig.json` | Controls type checking, module resolution, and compilation |
| `server/package.json` | Defines scripts, dependencies, and the supported Node version |

For `GET /health`, Express passes the request through the root router and health router to `getHealth`, which sends the JSON response. Keeping `app.ts` separate from `server.ts` also allows importing the app without opening a listening port.

Local imports use `.js` extensions even in TypeScript source because the compiled ES modules run as `.js` files in Node. `NodeNext` lets TypeScript resolve these imports back to their `.ts` sources during development and compilation.

## Folder responsibilities

| Folder | Intended contents |
| --- | --- |
| `client/` | Future React frontend |
| `server/src/modules/` | Feature-specific routes, controllers, and later services |
| `server/src/routes/` | Root route registration |
| `server/src/config/` | Future validated application settings |
| `server/src/utils/` | Future shared error and response helpers |
| `server/src/middlewares/` | Future error handling, authentication, and request validation |
| `server/src/lib/` | Future Prisma, Redis, and Gemini clients |

Empty folders contain `.gitkeep` placeholders so Git tracks their structure. These placeholders do not run any code.

## Next checkpoints

Each checkpoint will be implemented, checked, pushed, and reviewed before moving on.

1. **Initialization:** this checkpoint.
2. **Utilities:** shared errors, response conventions, and error middleware.
3. **Configuration:** validated environment settings, local Redis through Docker, and its connection lifecycle. PostgreSQL remains separate from Docker.
4. **Prisma 7:** PostgreSQL connection, Prisma configuration, and client setup.
5. **Models:** review and implement users, sessions, workspaces, memberships, boards, and invitations, then create the first migration.

Authentication and product features follow the models. Later collaboration work will use Yjs and WebSockets with durable PostgreSQL storage and local browser persistence. Gemini will generate reviewable task proposals rather than directly applying unapproved edits.
