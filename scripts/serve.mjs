import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixture } from './fixtures.mjs';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.env.PORT || 8080);
const fixtureIndex = process.argv.indexOf('--fixture');
const fixture = fixtureIndex !== -1 ? createFixture(Number(process.argv[fixtureIndex + 1] ?? 31)) : null;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png',
  '.pdf': 'application/pdf', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.ai': 'application/postscript' };
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.includes('\\') || path.split('/').some(part => part.startsWith('.'))) throw new Error('Forbidden path');
    if (fixture && path === '/data/content.json') {
      response.writeHead(200, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? '' : JSON.stringify(fixture)); return;
    }
    let target = resolve(root, `.${path}`);
    if (target !== root && !target.startsWith(root + sep)) throw new Error('Outside workspace');
    if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    const absolute = await realpath(target);
    if (!absolute.startsWith(root + sep)) throw new Error('Outside workspace');
    const info = await stat(absolute);
    response.writeHead(200, { 'Content-Type': mime[extname(absolute)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(absolute);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('הקובץ לא נמצא');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set PORT to another port (e.g. 8081).` : error.message); process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Public: http://localhost:${port}/\nEditor: http://localhost:${port}/editor.html${fixture ? `\nFixture: ${fixture.items.length} active records (data/content.json is unchanged).` : ''}`);
});
