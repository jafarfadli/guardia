#!/usr/bin/env python3
"""Group the Dock: system apps, then social, work, entertainment, with a small gap between.

usage: python3 scripts/dock.py apply | restore

The groups come from ~/.guardia/icons/manifest.json (written by scripts/render-icons.mjs).
The Dock keeps the apps it already had; Telegram, Spotify and Roblox are added so each group has
its everyday apps. The original order is saved once to ~/.guardia/backup/dock-persistent-apps.plist.
"""
import json
import os
import plistlib
import subprocess
import sys
from urllib.parse import unquote, quote

HOME = os.path.expanduser('~')
MANIFEST = os.path.join(HOME, '.guardia/icons/manifest.json')
BACKUP = os.path.join(HOME, '.guardia/backup/dock-persistent-apps.plist')
ADD = ['telegram', 'spotify', 'roblox']
ORDER = ['sosial', 'kerja', 'hiburan']


def read_dock():
    raw = subprocess.run(['defaults', 'export', 'com.apple.dock', '-'], capture_output=True, check=True).stdout
    return plistlib.loads(raw)


def write_dock(d):
    subprocess.run(['defaults', 'import', 'com.apple.dock', '-'], input=plistlib.dumps(d), check=True)
    subprocess.run(['killall', 'Dock'], check=False)


def tile_path(t):
    url = t.get('tile-data', {}).get('file-data', {}).get('_CFURLString', '')
    return unquote(url.replace('file://', '')).rstrip('/') if url.startswith('file://') else None


def app_tile(path, label):
    return {'tile-type': 'file-tile', 'tile-data': {
        'file-data': {'_CFURLString': 'file://' + quote(path.rstrip('/') + '/'), '_CFURLStringType': 15}, 'file-label': label}}


def spacer():
    return {'tile-type': 'small-spacer-tile', 'tile-data': {}}


def apply():
    d = read_dock()
    tiles = d.get('persistent-apps', [])
    if not os.path.exists(BACKUP):
        os.makedirs(os.path.dirname(BACKUP), exist_ok=True)
        with open(BACKUP, 'wb') as f:
            plistlib.dump(tiles, f)
    apps = json.load(open(MANIFEST))['apps']
    by_path = {a['app'].rstrip('/'): a for a in apps}
    system, groups, others = [], {g: [] for g in ORDER}, []
    present = set()
    for t in tiles:
        if 'spacer' in t.get('tile-type', ''):
            continue
        p = tile_path(t)
        present.add(p)
        if p and p.startswith('/System/'):
            system.append(t)
        elif p in by_path and by_path[p].get('group') in groups:
            groups[by_path[p]['group']].append((p, t))
        else:
            others.append(t)
    for a in apps:
        if a['id'] in ADD and a['app'].rstrip('/') not in present and a.get('group') in groups:
            groups[a['group']].append((a['app'].rstrip('/'), app_tile(a['app'], a['name'])))
    # inside a group, keep the order of the manifest (the icon sheet's order)
    rank = {a['app'].rstrip('/'): i for i, a in enumerate(apps)}
    out = list(system)
    for g in ORDER:
        if groups[g]:
            out.append(spacer())
            out += [t for _, t in sorted(groups[g], key=lambda pt: rank.get(pt[0], 999))]
    if others:
        out.append(spacer())
        out += others
    d['persistent-apps'] = out
    write_dock(d)
    print('Dock: ' + ' | '.join(f'{g} {len(groups[g])}' for g in ORDER) + (f' | lainnya {len(others)}' if others else ''))


def restore():
    if not os.path.exists(BACKUP):
        print('Tidak ada cadangan Dock.')
        return
    d = read_dock()
    with open(BACKUP, 'rb') as f:
        d['persistent-apps'] = plistlib.load(f)
    write_dock(d)
    os.remove(BACKUP)
    print('Dock dikembalikan.')


if __name__ == '__main__':
    {'apply': apply, 'restore': restore}[sys.argv[1] if len(sys.argv) > 1 else 'apply']()
