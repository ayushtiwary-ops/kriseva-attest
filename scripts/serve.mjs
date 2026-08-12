import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const host = process.env.ATTEST_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.ATTEST_PORT || '4173', 10);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', `http://${host}`).pathname);
  } catch {
    sendText(response, 400, 'Bad request');
    return;
  }

  const relativePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const filePath = resolve(root, `.${relativePath}`);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error('Not a file');
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': fileStat.size,
      'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    sendText(response, 404, 'Not found');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`KRISEVA ATTEST static server: http://${host}:${port}\n`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
