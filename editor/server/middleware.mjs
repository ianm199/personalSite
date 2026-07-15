import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { listPosts, readPost, writePost, createPost, resolvePostPath } from './posts.mjs';
import { preflight, publish } from './git.mjs';

const BODY_LIMIT = 2 * 1024 * 1024;

/**
 * The editor can write files and push to prod, so it must only ever
 * answer the local user: the socket must originate from loopback and
 * the Host header must name localhost, which also blocks DNS-rebinding
 * pages that trick a local browser into reaching the dev server.
 */
function isLocalRequest(req) {
  const addr = req.socket.remoteAddress;
  if (typeof addr !== 'string') {
    return false;
  }
  const ip = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  if (ip !== '::1' && !ip.startsWith('127.')) {
    return false;
  }
  const host = req.headers.host;
  if (typeof host !== 'string') {
    return false;
  }
  const name = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.split(':')[0];
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]';
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.destroy();
        reject(Object.assign(new Error('request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function shellHtml(base) {
  const config = JSON.stringify({ base });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>blog editor</title>
<link rel="stylesheet" href="${base}__edit/editor.css">
</head>
<body>
<div id="app"></div>
<script type="application/json" id="editor-config">${config}</script>
<script type="module" src="${base}editor/client/main.ts"></script>
</body>
</html>
`;
}

export function createEditorMiddleware({ base, repoRoot, blogDir, clientDir, refreshContent }) {
  function postPathspec(slug) {
    return path.relative(repoRoot, resolvePostPath(blogDir, slug));
  }
  return async (req, res) => {
    if (!isLocalRequest(req)) {
      sendJson(res, 403, { error: 'editor is localhost-only' });
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(shellHtml(base));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/editor.css') {
        const css = await readFile(path.join(clientDir, 'editor.css'), 'utf8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        res.end(css);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/posts') {
        sendJson(res, 200, { posts: await listPosts(blogDir) });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/post') {
        sendJson(res, 200, await readPost(blogDir, url.searchParams.get('slug')));
        return;
      }
      if (req.method === 'PUT' && url.pathname === '/api/post') {
        const { slug, fields, body, expectedHash } = await readJsonBody(req);
        sendJson(res, 200, await writePost(blogDir, slug, fields, body, expectedHash));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/publish/preflight') {
        const relPath = postPathspec(url.searchParams.get('slug'));
        sendJson(res, 200, await preflight(repoRoot, relPath));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/publish') {
        const { slug, message } = await readJsonBody(req);
        const relPath = postPathspec(slug);
        sendJson(res, 200, await publish(repoRoot, relPath, message));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/new') {
        const { title } = await readJsonBody(req);
        const created = await createPost(blogDir, title);
        await refreshContent();
        sendJson(res, 201, created);
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      const status = Number.isInteger(err.status) ? err.status : 500;
      const payload = { error: err.message };
      if (err.payload !== undefined) {
        Object.assign(payload, err.payload);
      }
      sendJson(res, status, payload);
    }
  };
}
