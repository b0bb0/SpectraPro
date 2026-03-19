/* eslint-disable no-console */
/**
 * Builder local preview proxy.
 *
 * If you're loading the UI in an embedded webview (e.g. Builder) and styles are missing,
 * it's often because the embed only fetches `/` and doesn't correctly follow `/_next/*`
 * asset requests. This proxy forwards *all* paths (including `/_next/static/*`) to the
 * running Next dev server.
 *
 * Usage:
 *   1) `npm run dev` (port 3001)
 *   2) `BUILDER_PROXY_PORT=48752 npm run builder:proxy`
 *   3) Point Builder/localEditUrl to `http://localhost:48752`
 */

const http = require('http');
const httpProxy = require('http-proxy');

const TARGET = process.env.BUILDER_PROXY_TARGET || 'http://localhost:3001';
const PORT = parseInt(process.env.BUILDER_PROXY_PORT || '48752', 10);

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: true,
});

proxy.on('error', (err, req, res) => {
  const message = err && err.message ? err.message : String(err);
  console.error('[builder-proxy] proxy error:', message);

  // If the error happened during an HTTP request, respond with a helpful status.
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (res && typeof res.end === 'function') {
    res.end(`Builder proxy error: ${message}\nTarget: ${TARGET}\n`);
  }
});

const server = http.createServer((req, res) => {
  // Forward everything (/, /_next/*, assets, etc.)
  proxy.web(req, res, { target: TARGET });
});

server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, { target: TARGET });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[builder-proxy] listening on http://localhost:${PORT}`);
  console.log(`[builder-proxy] forwarding to ${TARGET}`);
});

