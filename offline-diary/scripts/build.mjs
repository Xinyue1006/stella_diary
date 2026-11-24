import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

// Only bundle the public diary shell. The Worker serves private files through the API.
const assets = {};
for (const prefix of ['', 'assets/']) {
  const directory = new URL(prefix, dist);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const type = mime[extname(entry.name)];
    if (!type) throw new Error('Unknown asset format: ' + entry.name);
    const bytes = await readFile(new URL(entry.name, directory));
    assets['/' + prefix + entry.name] = [type, bytes.toString('base64')];
  }
}

const api = await readFile(new URL('worker/api.mjs', root), 'utf8');
const routes = await readFile(new URL('worker/routes.mjs', root), 'utf8');
const worker = api + '\nconst publicAssets = ' + JSON.stringify(assets) + ';\n' + routes;
await mkdir(new URL('server/', dist), { recursive: true });
await writeFile(new URL('server/index.js', dist), worker);
console.log('Built the diary Worker with ' + Object.keys(assets).length + ' public assets.');
