import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const LOCAL_ORIGIN = 'http://attest.local';
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
};

export function resolveLocalAsset(rootDirectory, requestUrl) {
  const parsedUrl = new URL(requestUrl);
  if (parsedUrl.origin !== LOCAL_ORIGIN) {
    throw new Error(`Unexpected local origin: ${parsedUrl.origin}`);
  }

  const rawPath = requestUrl.slice(LOCAL_ORIGIN.length).split(/[?#]/u, 1)[0] || '/';
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath).replaceAll('\\', '/');
  } catch {
    throw new Error('Malformed local asset path');
  }

  if (decodedPath.split('/').includes('..')) {
    throw new Error('Local asset path traversal rejected');
  }

  const pathname = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`;
  const relativePath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const root = resolve(rootDirectory);
  const filePath = resolve(root, `.${relativePath}`);

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    throw new Error('Local asset path traversal rejected');
  }

  return {
    contentType: CONTENT_TYPES[extname(filePath)] || 'application/octet-stream',
    filePath,
  };
}

export async function readLocalAsset(rootDirectory, requestUrl, method = 'GET') {
  const asset = resolveLocalAsset(rootDirectory, requestUrl);
  const [canonicalRoot, canonicalFile] = await Promise.all([
    realpath(rootDirectory),
    realpath(asset.filePath),
  ]);

  if (canonicalFile !== canonicalRoot && !canonicalFile.startsWith(`${canonicalRoot}${sep}`)) {
    throw new Error('Local asset symlink path traversal rejected');
  }

  const fileStat = await stat(canonicalFile);
  if (!fileStat.isFile()) {
    throw new Error('Not a file');
  }

  return {
    ...asset,
    body: method === 'HEAD' ? '' : await readFile(canonicalFile),
  };
}

export async function installLocalRoute(page, rootDirectory) {
  await page.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const method = route.request().method();
    if (!['GET', 'HEAD'].includes(method)) {
      await route.fulfill({ status: 405, contentType: 'text/plain', body: 'Method not allowed' });
      return;
    }

    try {
      const asset = await readLocalAsset(rootDirectory, route.request().url(), method);
      await route.fulfill({
        status: 200,
        contentType: asset.contentType,
        body: asset.body,
        headers: {
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      const rejected = /traversal|malformed|origin/iu.test(error?.message || '');
      await route.fulfill({
        status: rejected ? 403 : 404,
        contentType: 'text/plain; charset=utf-8',
        body: rejected ? 'Forbidden' : 'Not found',
      });
    }
  });
}

export { LOCAL_ORIGIN };
