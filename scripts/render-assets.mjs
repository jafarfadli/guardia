// Renders the pet's sprite sheets (and other raster assets) into kamar-app/Resources.
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const tab = await browser.newPage();
  tab.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await tab.goto(`http://127.0.0.1:${port}/pet/index.html?scale=2`, { waitUntil: 'load' });
  await tab.waitForFunction('window.__sprites', { timeout: 60000 });
  const sprites = await tab.evaluate(() => window.__sprites);
  const outDir = join(root, 'kamar-app/Resources/pet');
  await mkdir(outDir, { recursive: true });
  const meta = { cell: sprites.cell, anims: {} };
  for (const [name, a] of Object.entries(sprites.anims)) {
    await writeFile(join(outDir, `${name}.png`), Buffer.from(a.png.split(',')[1], 'base64'));
    meta.anims[name] = { frames: a.frames, fps: a.fps, loop: a.loop };
    console.log('pet', name, a.frames, 'frames');
  }
  await writeFile(join(outDir, 'pet.json'), JSON.stringify(meta, null, 2));

  // menu bar icons
  await tab.goto(`http://127.0.0.1:${port}/bar/index.html`, { waitUntil: 'load' });
  await tab.waitForFunction('window.__icons', { timeout: 60000 });
  const icons = await tab.evaluate(() => window.__icons);
  const iconDir = join(root, 'dotfiles/sketchybar/icons');
  await mkdir(iconDir, { recursive: true });
  for (const [name, png] of Object.entries(icons)) await writeFile(join(iconDir, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  console.log('icons', Object.keys(icons).length);
  await tab.goto(`http://127.0.0.1:${port}/bar/index.html?ink=night`, { waitUntil: 'load' });
  await tab.waitForFunction('window.__icons', { timeout: 60000 });
  const nightIcons = await tab.evaluate(() => window.__icons);
  await mkdir(join(iconDir, 'night'), { recursive: true });
  for (const [name, png] of Object.entries(nightIcons)) await writeFile(join(iconDir, 'night', `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
} finally {
  await browser.close();
  server.close();
}
