// Renders the wallpaper headlessly at fixed views and times, for looking at the art.
// usage: node scripts/preview.mjs [--times 16:30,08:00] [--views main] [--dpr 2] [--size 1440x900] [--raw] [--out build/preview]
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes('--' + name);
const times = arg('times', '16:30').split(',');
const views = arg('views', 'main').split(',');
const dpr = Number(arg('dpr', '2'));
const [vw, vh] = arg('size', '1440x900').split('x').map(Number);
const outDir = join(root, arg('out', 'build/preview'));
const page = arg('page', 'wallpaper/index.html');
const extra = arg('query', '');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

await mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--font-render-hinting=none'],
});
try {
  const tab = await browser.newPage();
  tab.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${m.type()}]`, m.text()); });
  tab.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await tab.setViewport({ width: vw, height: vh, deviceScaleFactor: dpr });
  for (const view of views) {
    for (const time of times) {
      const url = `http://127.0.0.1:${port}/${page}?still=1&view=${view}&time=${time}${flag('raw') ? '&raw=1' : ''}${extra ? '&' + extra : ''}`;
      const t0 = Date.now();
      await tab.goto(url, { waitUntil: 'load' });
      await tab.waitForFunction('window.__kamar && window.__kamar.ready', { timeout: 60000 });
      const info = await tab.evaluate(() => ({ ...window.__kamar.light, ms: window.__kamar.ms }));
      const file = join(outDir, `${view}-${time.replace(':', '')}${flag('raw') ? '-raw' : ''}.png`);
      await tab.screenshot({ path: file });
      console.log(`${file}  ${info?.name ?? ''} elev=${info?.elevation?.toFixed?.(1)}  render=${info?.ms}ms`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
