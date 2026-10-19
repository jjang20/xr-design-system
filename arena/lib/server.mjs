// Minimal static file server for the arena folder (scene pages and three.js).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { ARENA } from './experiment.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };

export function serveStatic(extra = () => false, port = 0) {
  const server = createServer(async (req, res) => {
    if (await extra(req, res)) return;
    const url = new URL(req.url, 'http://x');
    const path = normalize(join(ARENA, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ARENA)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}
