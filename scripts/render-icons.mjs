// Exports the app icons drawn in icons/emblems.js: a 1024 PNG per app into ~/.guardia/icons,
// a manifest of the installed apps they belong to (for Guardia --set-icons and the Dock), and
// Guardia's own AppIcon.icns.
// usage: node scripts/render-icons.mjs
import http from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(homedir(), '.guardia/icons');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

// "/Applications/MATLAB_*.app" → the installed one, if any
function resolve(pattern) {
  if (!pattern) return null;
  if (!pattern.includes('*')) return existsSync(pattern) ? pattern : null;
  const parts = pattern.split('/');
  let found = ['/'];
  for (const part of parts.filter(Boolean)) {
    const next = [];
    for (const base of found) {
      if (!part.includes('*')) { const p = join(base, part); if (existsSync(p)) next.push(p); continue; }
      const re = new RegExp('^' + part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace('*', '.*') + '$');
      try { for (const e of readdirSync(base)) if (re.test(e)) next.push(join(base, e)); } catch {}
    }
    found = next;
  }
  return found.sort().pop() ?? null;
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const tab = await browser.newPage();
  const port = server.address().port;
  await tab.goto(`http://127.0.0.1:${port}/icons/sheet.html`, { waitUntil: 'load' });
  await tab.waitForFunction('window.__icons', { timeout: 60000 });
  const icons = await tab.evaluate(() => window.__icons);
  const list = await tab.evaluate(async () => (await import('./emblems.js')).ICONS.map(({ id, name, path, group }) => ({ id, name, path, group })));
  await mkdir(out, { recursive: true });
  for (const [id, png] of Object.entries(icons)) await writeFile(join(out, `${id}.png`), Buffer.from(png.split(',')[1], 'base64'));

  const apps = list.map((it) => ({ ...it, app: resolve(it.path), png: join(out, `${it.id}.png`) })).filter((it) => it.app);
  await writeFile(join(out, 'manifest.json'), JSON.stringify({ repo: root, apps: apps.map(({ id, name, app, png, group }) => ({ id, name, app, png, group })) }, null, 2));
  console.log(`ikon: ${Object.keys(icons).length}, app terpasang: ${apps.length}`);

  // folders: stamped home folders, and a sticker for every folder inside Koding, the Desktop and home
  const conf = await tab.evaluate(async () => { const m = await import('./folders.js'); return { folders: m.FOLDERS, parents: m.STICKER_PARENTS, skip: m.SKIP }; });
  const home = homedir();
  const tilde = (p) => p.replace(/^~/, home);
  const flist = conf.folders.map((f) => ({ ...f, path: tilde(f.path) })).filter((f) => existsSync(f.path));
  const taken = new Set(flist.map((f) => f.path));
  for (const parent of conf.parents.map(tilde)) {
    let entries = [];
    try { entries = readdirSync(parent, { withFileTypes: true }); } catch {}
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || (parent === home && conf.skip.includes(e.name))) continue;
      const path = join(parent, e.name);
      if (taken.has(path)) continue;
      taken.add(path);
      flist.push({ id: 'f-' + Buffer.from(path).toString('base64url').slice(-24), path, name: e.name });
    }
  }
  const pngs = await tab.evaluate((l) => window.renderFolders(l), flist);
  await mkdir(join(out, 'folders'), { recursive: true });
  for (const [id, png] of Object.entries(pngs)) await writeFile(join(out, 'folders', `${id}.png`), Buffer.from(png.split(',')[1], 'base64'));
  await writeFile(join(out, 'folders.json'), JSON.stringify({ repo: root, apps: flist.map((f) => ({ id: f.id, name: f.name, app: f.path, png: join(out, 'folders', `${f.id}.png`) })) }, null, 2));
  console.log(`folder: ${flist.length}`);

  // Guardia's own icon, as an .icns in the app's resources
  const set = join(root, 'build/AppIcon.iconset');
  await rm(set, { recursive: true, force: true });
  await mkdir(set, { recursive: true });
  for (const s of [16, 32, 128, 256, 512]) {
    for (const k of [1, 2]) {
      const name = `icon_${s}x${s}${k === 2 ? '@2x' : ''}.png`;
      execFileSync('sips', ['-z', String(s * k), String(s * k), join(out, 'guardia.png'), '--out', join(set, name)], { stdio: 'ignore' });
    }
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', join(root, 'guardia-app/Resources/AppIcon.icns')]);
  console.log('AppIcon.icns ditulis');
} finally {
  await browser.close();
  server.close();
}
