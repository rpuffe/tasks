// Smoke test: create -> list -> complete, plus the error-path quality bar
// from APP_SPEC.md. Uses only Node built-ins (node:test, global fetch) —
// no npm dependencies.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server.js');

let base;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET / returns the default greeting', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json');
  const body = await res.json();
  assert.equal(body.message, 'tasks api');
});

test('create -> list -> complete', async () => {
  const createRes = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'buy milk' }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.title, 'buy milk');
  assert.equal(created.done, false);
  assert.ok(created.id);

  const listRes = await fetch(`${base}/todos`);
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(list.some((t) => t.id === created.id));

  const patchRes = await fetch(`${base}/todos/${created.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: true }),
  });
  assert.equal(patchRes.status, 200);
  const patched = await patchRes.json();
  assert.equal(patched.done, true);
  assert.equal(patched.title, 'buy milk');
});

test('POST /todos with missing title returns 400', async () => {
  const res = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('POST /todos with empty title returns 400', async () => {
  const res = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  });
  assert.equal(res.status, 400);
});

test('POST /todos with malformed JSON returns 400, not a crash', async () => {
  const res = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json',
  });
  assert.equal(res.status, 400);

  // Server must still be alive afterwards.
  const healthRes = await fetch(`${base}/healthz`);
  assert.equal(healthRes.status, 200);
});

test('PATCH unknown id returns 404', async () => {
  const res = await fetch(`${base}/todos/does-not-exist`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: true }),
  });
  assert.equal(res.status, 404);
});

test('DELETE removes a todo and unknown id then returns 404', async () => {
  const createRes = await fetch(`${base}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'temp' }),
  });
  const created = await createRes.json();

  const delRes = await fetch(`${base}/todos/${created.id}`, { method: 'DELETE' });
  assert.equal(delRes.status, 204);

  const delAgainRes = await fetch(`${base}/todos/${created.id}`, { method: 'DELETE' });
  assert.equal(delAgainRes.status, 404);
});
