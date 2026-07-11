// Zero-dependency JSON REST API for managing todo items.
// Uses only Node's built-in http module — no npm dependencies at runtime.
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const PORT = parseInt(process.env.PORT || '8080', 10);
const GREETING = process.env.GREETING || 'tasks api';

// In-memory storage. Data loss on restart is accepted (spec + contract rule 5).
const todos = new Map();

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX_BODY = 1024 * 1024; // 1MB guard against unbounded bodies
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim() === '') {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serializeTodo(todo) {
  return { id: todo.id, title: todo.title, done: todo.done };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = url.pathname.split('/').filter(Boolean); // e.g. ['todos', '123']

  try {
    // GET / — configurable greeting
    if (req.method === 'GET' && parts.length === 0) {
      sendJson(res, 200, { message: GREETING });
      return;
    }

    // GET /healthz — dependency-free healthcheck
    if (req.method === 'GET' && parts.length === 1 && parts[0] === 'healthz') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    // GET /todos — list all
    if (req.method === 'GET' && parts.length === 1 && parts[0] === 'todos') {
      sendJson(res, 200, Array.from(todos.values()).map(serializeTodo));
      return;
    }

    // POST /todos — create
    if (req.method === 'POST' && parts.length === 1 && parts[0] === 'todos') {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        sendJson(res, 400, { error: 'malformed JSON body' });
        return;
      }
      if (
        body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        typeof body.title !== 'string' ||
        body.title.trim() === ''
      ) {
        sendJson(res, 400, { error: 'title is required and must be a non-empty string' });
        return;
      }
      const id = crypto.randomUUID();
      const todo = { id, title: body.title, done: false };
      todos.set(id, todo);
      sendJson(res, 201, serializeTodo(todo));
      return;
    }

    // PATCH /todos/{id} — update title and/or done
    if (req.method === 'PATCH' && parts.length === 2 && parts[0] === 'todos') {
      const id = parts[1];
      const todo = todos.get(id);
      if (!todo) {
        sendJson(res, 404, { error: `no todo with id ${id}` });
        return;
      }
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        sendJson(res, 400, { error: 'malformed JSON body' });
        return;
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        sendJson(res, 400, { error: 'body must be a JSON object' });
        return;
      }
      if ('title' in body) {
        if (typeof body.title !== 'string' || body.title.trim() === '') {
          sendJson(res, 400, { error: 'title must be a non-empty string' });
          return;
        }
        todo.title = body.title;
      }
      if ('done' in body) {
        if (typeof body.done !== 'boolean') {
          sendJson(res, 400, { error: 'done must be a boolean' });
          return;
        }
        todo.done = body.done;
      }
      sendJson(res, 200, serializeTodo(todo));
      return;
    }

    // DELETE /todos/{id} — remove
    if (req.method === 'DELETE' && parts.length === 2 && parts[0] === 'todos') {
      const id = parts[1];
      if (!todos.has(id)) {
        sendJson(res, 404, { error: `no todo with id ${id}` });
        return;
      }
      todos.delete(id);
      res.writeHead(204);
      res.end();
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 400, { error: 'bad request' });
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`tasks api listening on 0.0.0.0:${PORT}`);
  });
}

module.exports = { server };
