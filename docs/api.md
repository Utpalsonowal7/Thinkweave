# Product API and Socket.IO

All product REST endpoints are under `/api/v1`. They require an active access cookie and a verified ThinkWeave email. POST requests require JSON and an exact `Origin` matching `APP_ORIGIN`. Responses use the existing `ApiResponse` shape. Auth endpoints are documented in the root README.

## Workspaces

| Method and path | JSON body | Permission |
| --- | --- | --- |
| GET `/workspaces` | — | Current user's memberships |
| POST `/workspaces` | `{ "name": "Design team" }` | Verified account; creator becomes owner |
| GET `/workspaces/:id/members` | — | Member |
| POST `/workspaces/:id/invitations` | `{ "email": "member@example.com", "role": "EDITOR" }` | Owner/admin; role EDITOR or VIEWER |
| POST `/workspaces/invitations/accept` | `{ "token": "..." }` | Verified invited email |
| POST `/workspaces/:id/members/:userId/role` | `{ "role": "VIEWER" }` | Owner/admin within role restrictions |
| POST `/workspaces/:id/members/:userId/remove` | `{}` | Owner/admin within role restrictions |

No endpoint here can remove an owner, change the owner's role, or modify the actor's own membership. Only an owner can assign ADMIN or manage an existing admin. Invitations expire after seven days and are consumed once. Email-delivery failure removes the newly created invitation. Tokens are never returned in API responses.

## Boards

| Method and path | JSON body | Permission |
| --- | --- | --- |
| GET `/workspaces/:id/boards` | — | Member |
| POST `/workspaces/:id/boards` | `{ "title": "Launch" }` | Editor/admin/owner |
| GET `/boards/:id` | — | Member; returns metadata, epoch and role |
| POST `/boards/:id/rename` | `{ "title": "New name" }` | Editor/admin/owner |
| POST `/boards/:id/archive` | `{}` | Owner/admin |
| GET `/boards/:id/snapshots` | — | Member; most recent 50 |
| POST `/boards/:id/snapshots` | `{}` | Editor/admin/owner |
| POST `/boards/:id/snapshots/:snapshotId/restore` | `{}` | Owner/admin |
| POST `/boards/:id/ai/proposal` | `{ "notes": ["Improve onboarding"] }` | Editor/admin/owner; 1–30 notes, at most 1,000 characters each |
| GET `/boards/:id/ai/proposals` | — | Editor; own pending proposals for this epoch, most recent 20 |
| POST `/boards/:id/ai/proposals/:proposalId/apply` | `{}` | Requester with editor rights |
| POST `/boards/:id/ai/proposals/:proposalId/reject` | `{}` | Requester with editor rights |

## Socket.IO contract

Use `socket.io-client`, credentials, and the same API origin as REST. The server uses Socket.IO's WebSocket transport on its default `/socket.io` path; it is **not** a raw WebSocket protocol. It rejects untrusted origins and unauthenticated/unverified sessions.

| Event | Direction | Payload / behavior |
| --- | --- | --- |
| `board:join` | Client → server, acknowledgement | `{ boardId, epoch }`; reply `{ ok, state, vector, role, user }` or error |
| `board:update` | Client → server, acknowledgement | Binary Yjs update; `{ ok: true }` only after persistence |
| `board:update` | Server → client | Persisted Yjs binary update |
| `board:cursor` | Client → server | Finite board coordinates `{ x, y }` |
| `board:cursor` | Server → client | `{ id, name, x, y }`; identity supplied by the server |
| `board:cursor-leave` | Server → client | Connection ID |
| `board:presence` | Server → client | Number of joined connections |
| `board:restored` | Server → client | Current epoch replaced; export unsynced notes, then reload |

A socket joins one board. Joins from an old epoch return `code: STALE_VERSION`. Inbound updates are at most 256 KiB and 120 updates per ten seconds per connection. Server cursor handling is throttled to one update per 120 ms per connection. Network reconnects perform a new join and a state-vector diff. An expired session causes reauthentication; revoked membership cannot submit or receive subsequent board updates.

`X-Request-ID` correlates an HTTP response with structured request logs. Request logs contain route templates and status/duration, not cookies, passwords, note contents, query strings, or email tokens.
