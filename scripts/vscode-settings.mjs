// Applies (or restores) the Kertas settings in VS Code's user settings.json.
// usage: node scripts/vscode-settings.mjs apply|restore
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const file = join(homedir(), 'Library/Application Support/Code/User/settings.json');
const backup = join(homedir(), '.kamar/backup/vscode-settings.json');
const MONO = "'FantasqueSansM Nerd Font Mono', Menlo, monospace";
const WANT = {
  'window.autoDetectColorScheme': true,
  'workbench.preferredLightColorTheme': 'Kertas',
  'workbench.preferredDarkColorTheme': 'Kertas Malam',
  'workbench.colorTheme': 'Kertas Malam',
  'editor.fontFamily': MONO,
  'terminal.integrated.fontFamily': MONO,
};

function read() {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, 'utf8');
  try { return JSON.parse(text); } catch {}
  // JSONC: drop comments outside strings and trailing commas
  const stripped = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '').replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(stripped);
}
const write = (obj) => writeFileSync(file, JSON.stringify(obj, null, 4) + '\n');

const mode = process.argv[2];
const settings = read();
if (mode === 'apply') {
  if (!existsSync(backup)) {
    mkdirSync(join(homedir(), '.kamar/backup'), { recursive: true });
    const old = {};
    for (const k of Object.keys(WANT)) old[k] = k in settings ? settings[k] : null;
    writeFileSync(backup, JSON.stringify(old, null, 2));
  }
  Object.assign(settings, WANT);
  write(settings);
  console.log('VS Code: Kertas / Kertas Malam aktif (ikut mode terang/gelap macOS)');
} else if (mode === 'restore') {
  if (!existsSync(backup)) { console.log('VS Code: tidak ada cadangan, dilewati'); process.exit(0); }
  const old = JSON.parse(readFileSync(backup, 'utf8'));
  for (const [k, v] of Object.entries(old)) { if (v === null) delete settings[k]; else settings[k] = v; }
  write(settings);
  console.log('VS Code: setelan lama dikembalikan');
} else {
  console.log('usage: vscode-settings.mjs apply|restore');
  process.exit(1);
}
