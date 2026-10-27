#!/bin/zsh
# Guardia: app icons in the room's print, and the Dock grouped by kind (sistem · sosial · kerja · hiburan).
# usage: ./scripts/app-icons.sh apply     draw and put on the icons, group the Dock
#        ./scripts/app-icons.sh restore   original icons and Dock back
# Apps the system owns (App Store ones such as WhatsApp, LINE, Telegram, Office) need your Mac
# password once. If macOS says the terminal "was prevented from modifying apps", allow it in
# System Settings → Privacy & Security → App Management and run this again.
set -uo pipefail
ROOT=${0:A:h:h}
GUARDIA=$HOME/Applications/Guardia.app/Contents/MacOS/Guardia
DIR=$HOME/.guardia/icons
say() { print -r -- "==> $*" }

[[ -x $GUARDIA ]] || { echo "Guardia belum terpasang: jalankan ./install.sh dulu"; exit 1 }

# split the manifest by who owns each app: yours need no password, the system's need sudo
split() {
  python3 - "$DIR/manifest.json" "$DIR" <<'PY'
import json, os, sys
m = json.load(open(sys.argv[1]))
mine, system = [], []
for a in m['apps']:
    (mine if os.stat(a['app']).st_uid == os.getuid() else system).append(a)
for name, apps in (('mine', mine), ('system', system)):
    json.dump({'repo': m['repo'], 'apps': apps}, open(os.path.join(sys.argv[2], name + '.json'), 'w'))
print(len(mine), len(system))
PY
}

run() { # $1: --set-icons or --restore-icons
  local counts mine system failed=0 out
  counts=($(split))
  mine=$counts[1]; system=$counts[2]
  if (( mine > 0 )); then
    out=$($GUARDIA $1 $DIR/mine.json) || failed=1
    print -r -- "$out" | sed 's/^/    /'
  fi
  if (( system > 0 )); then
    say "$system app milik sistem (App Store): masukkan password Mac kamu"
    out=$(sudo $GUARDIA $1 $DIR/system.json) || failed=1
    print -r -- "$out" | sed 's/^/    /'
  fi
  return $failed
}

# macOS lets only terminals allowed under App Management change other apps: on a refusal,
# open that setting, wait for the switch, and try once more
run_allowed() {
  run $1 && return 0
  say "macOS belum mengizinkan terminal ini mengubah app."
  print -r -- "    Di jendela yang terbuka, nyalakan Ghostty (atau terminal yang kamu pakai) di App Management."
  open "x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles" 2>/dev/null
  read "?    Tekan Enter setelah dinyalakan… "
  run $1 && return 0
  say "Masih ditolak. Tutup terminal ini sepenuhnya (⌘Q), buka lagi, lalu jalankan:"
  print -r -- "    cd $ROOT && ./scripts/app-icons.sh ${2:-apply}"
  return 1
}

case ${1:-apply} in
  apply)
    say "Menggambar ikon"
    node $ROOT/scripts/render-icons.mjs || exit 1
    say "Memasang ikon"
    run_allowed --set-icons apply
    say "Merapikan Dock"
    python3 $ROOT/scripts/dock.py apply
    killall Dock 2>/dev/null
    say "Selesai. Ikon baru muncul di Dock dan Finder."
    ;;
  restore)
    [[ -f $DIR/manifest.json ]] || { echo "Belum ada ikon yang dipasang."; exit 0 }
    say "Mengembalikan ikon asli"
    run_allowed --restore-icons restore
    python3 $ROOT/scripts/dock.py restore
    killall Dock 2>/dev/null
    ;;
  *) echo "pakai: $0 apply | restore"; exit 1 ;;
esac
