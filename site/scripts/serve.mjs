// Serves dist/ for the quality scripts on a plain Node static server with gzip for text,
// so several scripts can run at once on different ports. Astro 7's `astro preview` is a
// background daemon and only one instance runs per project, which these scripts don't want.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = Number(process.env.SITE_PORT ?? 4321);
export const BASE = `http://127.0.0.1:${PORT}`;
// Where Chromium is. `CHROMIUM_PATH` wins, then the cloud image's fixed path if it is really
// there, then whatever the installed Playwright resolves to. Without the third the quality run
// only worked in the cloud environment: on a Mac it failed with "executable doesn't exist at
// /opt/pw-browsers/...", because that path is the image's and the browser here lives in the
// Playwright cache under a version this project does not pin.
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  (existsSync(CLOUD_CHROMIUM) ? CLOUD_CHROMIUM : (await import('playwright')).chromium.executablePath());

export const PAGES = [
  { name: 'home', path: '/' },
  { name: 'start', path: '/start/' },
  { name: 'concepts', path: '/concepts/' },
  { name: 'concepts-consensus-and-finality', path: '/concepts/consensus-and-finality/' },
  { name: 'concepts-blocks-on-demand', path: '/concepts/blocks-on-demand/' },
  { name: 'concepts-gas-model', path: '/concepts/gas-model/' },
  { name: 'concepts-identity-gate', path: '/concepts/identity-gate/' },
  { name: 'identity', path: '/identity/' },
  { name: 'agents', path: '/agents/' },
  { name: 'tutorials', path: '/tutorials/' },
  { name: 'project-change-the-gate', path: '/tutorials/change-the-gate/' },
  { name: 'project-prove-the-pause', path: '/tutorials/prove-the-pause/' },
  { name: 'project-break-it-on-purpose', path: '/tutorials/break-it-on-purpose/' },
  { name: 'project-tokenised-bond', path: '/tutorials/tokenised-bond/' },
  { name: 'solidity', path: '/solidity/' },
  { name: 'solidity-gate-a-function', path: '/solidity/gate-a-function/' },
  { name: 'solidity-the-gated-token', path: '/solidity/the-gated-token/' },
  { name: 'solidity-gas-in-dollars', path: '/solidity/gas-in-dollars/' },
  { name: 'agents-say-what-you-want', path: '/agents-guide/say-what-you-want/' },
  { name: 'agents-what-never-goes-in', path: '/agents-guide/what-never-goes-in/' },
  { name: 'tools', path: '/tools/' },
  { name: 'research', path: '/research/' },
  { name: 'review', path: '/review/' },
  { name: 'errors', path: '/errors/' },
  { name: 'operate', path: '/operate/' },
  { name: 'status', path: '/status/' },
];

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.mdc': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.pf_meta': 'application/octet-stream', '.pf_index': 'application/octet-stream', '.pf_fragment': 'application/octet-stream', '.pagefind': 'application/octet-stream', '.xml': 'application/xml',
};
const compressible = new Set(['.html', '.css', '.js', '.mjs', '.json', '.txt', '.md', '.mdc', '.svg', '.xml']);

export async function serve(host = '127.0.0.1') {
  const dist = resolve(siteDir, 'dist');
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, BASE).pathname);
    let file = normalize(join(dist, path));
    if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { location: path + '/' }); return res.end(); }
      file = join(file, 'index.html');
    }
    if (!existsSync(file)) { file = join(dist, '404.html'); res.statusCode = 404; }
    const ext = extname(file);
    const headers = { 'content-type': types[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' };
    const gzip = compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    if (gzip) headers['content-encoding'] = 'gzip';
    res.writeHead(res.statusCode || 200, headers);
    const stream = createReadStream(file);
    if (gzip) stream.pipe(createGzip({ level: 6 })).pipe(res); else stream.pipe(res);
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(PORT, host, ok); });
  return () => server.close();
}
