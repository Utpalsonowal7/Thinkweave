import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import express, { type Express, type Request, type Response } from 'express';
import { app } from '../src/app.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { AppError } from '../src/utils/app-error.js';
import { sendSuccess } from '../src/utils/api-response.js';

async function serve(application: Express, t: TestContext): Promise<string> {
  const server = application.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function assertJson(response: globalThis.Response, status: number, body: unknown): Promise<void> {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await response.json(), body);
}

test('health uses the shared success response', async (t) => {
  const base = await serve(app, t);
  await assertJson(await fetch(`${base}/health`), 200, {
    status: 'ok', data: { service: 'thinkweave-api' },
  });
});

test('unknown routes use the shared error response', async (t) => {
  const base = await serve(app, t);
  await assertJson(await fetch(`${base}/missing`), 404, {
    status: 'error', code: 'ROUTE_NOT_FOUND', message: 'Route not found',
  });
});

test('malformed JSON returns a safe 400 without echoing the submitted body', async (t) => {
  const base = await serve(app, t);
  const response = await fetch(`${base}/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"password":"private-body-value",',
  });
  await assertJson(response, 400, {
    status: 'error', code: 'INVALID_JSON', message: 'Request body must contain valid JSON.',
  });
});

test('oversized JSON preserves the HTTP 413 status', async (t) => {
  const base = await serve(app, t);
  const response = await fetch(`${base}/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'a'.repeat(1024 * 1024) }),
  });
  await assertJson(response, 413, {
    status: 'error', code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 1 MB limit.',
  });
});

test('unsupported JSON charset returns HTTP 415', async (t) => {
  const base = await serve(app, t);
  const response = await fetch(`${base}/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=iso-8859-1' },
    body: '{}',
  });
  await assertJson(response, 415, {
    status: 'error', code: 'UNSUPPORTED_ENCODING', message: 'Request body encoding is not supported.',
  });
});

test('expected async failures reach the error handler without an async wrapper', async (t) => {
  // This app exists only in the test; no diagnostic routes are added to the API.
  const fixture = express();
  fixture.get('/protected', async () => {
    await Promise.resolve();
    throw new AppError(403, 'FORBIDDEN', 'You cannot edit this board.');
  });
  fixture.use(errorHandler);
  const base = await serve(fixture, t);
  await assertJson(await fetch(`${base}/protected`), 403, {
    status: 'error', code: 'FORBIDDEN', message: 'You cannot edit this board.',
  });
});

test('unexpected async errors hide internal messages and still allow later requests', async (t) => {
  const logger = t.mock.method(console, 'error', () => {});
  const fixture = express();
  fixture.get('/failure', async () => {
    await Promise.resolve();
    throw new Error('postgres://private:password@internal-db');
  });
  fixture.get('/alive', (_req, res) => sendSuccess(res, { alive: true }));
  fixture.use(errorHandler);
  const base = await serve(fixture, t);

  await assertJson(await fetch(`${base}/failure`), 500, {
    status: 'error', code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.',
  });
  assert.equal(logger.mock.callCount(), 1);
  assert.doesNotMatch(JSON.stringify(logger.mock.calls[0]?.arguments), /private|password|internal-db/);
  await assertJson(await fetch(`${base}/alive`), 200, { status: 'ok', data: { alive: true } });
});

test('internal SyntaxErrors are not mislabeled as invalid request JSON', async (t) => {
  t.mock.method(console, 'error', () => {});
  const fixture = express();
  fixture.get('/failure', () => {
    JSON.parse('internal invalid configuration');
  });
  fixture.use(errorHandler);
  const base = await serve(fixture, t);
  await assertJson(await fetch(`${base}/failure`), 500, {
    status: 'error', code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.',
  });
});

test('intentional 5xx errors also hide internal codes and messages', async (t) => {
  t.mock.method(console, 'error', () => {});
  const fixture = express();
  fixture.get('/failure', () => {
    throw new AppError(503, 'PRIVATE_DATABASE_HOST', 'Connection failed at private-host.');
  });
  fixture.use(errorHandler);
  const base = await serve(fixture, t);
  await assertJson(await fetch(`${base}/failure`), 503, {
    status: 'error', code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.',
  });
});

test('an error after headers are sent is delegated rather than writing another response', () => {
  const error = new Error('stream interrupted');
  let delegated = false;
  const response = {
    headersSent: true,
    status() { assert.fail('Must not write another response'); },
  } as unknown as Response;

  errorHandler(error, {} as Request, response, (received: unknown) => {
    assert.equal(received, error);
    delegated = true;
  });
  assert.equal(delegated, true);
});
