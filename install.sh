#!/bin/zsh
# Kamar: installs the whole desktop (safe to run again). Undo everything with ./uninstall.sh.
set -euo pipefail
ROOT=${0:A:h}
STATE=$HOME/.kamar
BACKUP=$STATE/backup
mkdir -p $BACKUP

say() { print -r -- "==> $*" }
note() { print -r -- "    $*" }

command -v brew >/dev/null || { echo "Homebrew dibutuhkan: https://brew.sh"; exit 1 }

# ------------------------------------------------------------------ 1. packages
say "Memasang paket lewat Homebrew"
brew trust --formula felixkratz/formulae/sketchybar >/dev/null 2>&1 || true
brew trust --formula felixkratz/formulae/borders >/dev/null 2>&1 || true
brew bundle --file="$ROOT/Brewfile" --no-upgrade

# ------------------------------------------------------------------ 2. the Kamar app
say "Membangun app Kamar (wallpaper hidup, dynamic island, si Oren)"
"$ROOT/kamar-app/build.sh"
mkdir -p $HOME/Applications
# stop the agent first, or launchd relaunches Kamar mid-copy and macOS locks the bundle
launchctl bootout gui/$UID/id.kamar.app 2>/dev/null || true
pkill -x Kamar 2>/dev/null || true
sleep 1
rm -rf $HOME/Applications/Kamar.app
cp -R "$ROOT/build/app/Kamar.app" $HOME/Applications/

# ------------------------------------------------------------------ 3. dotfiles
# symlinks into this folder; whatever was there before moves to ~/.kamar/backup
link() {
  local src=$1 dst=$2
  mkdir -p ${dst:h}
  if [[ -L $dst ]]; then rm $dst
  elif [[ -e $dst ]]; then
    local saved=$BACKUP/${dst:t}.$(date +%s)
    mv $dst $saved
    print -r -- "$dst	$saved" >> $BACKUP/moved.tsv
  fi
  ln -s $src $dst
  print -r -- "$dst" >> $BACKUP/links.txt
}
say "Menautkan config (SketchyBar, borders, Ghostty)"
link $ROOT/dotfiles/sketchybar $HOME/.config/sketchybar
link $ROOT/dotfiles/borders $HOME/.config/borders
link $ROOT/dotfiles/ghostty $HOME/.config/ghostty

# ------------------------------------------------------------------ 4. macOS settings
save_default() { # domain key: remember the original value once
  local f=$BACKUP/defaults.tsv
  [[ -f $f ]] && grep -q "^$1	$2	" $f && return 0
  local v
  v=$(defaults read $1 $2 2>/dev/null) || v="__unset__"
  print -r -- "$1	$2	$v" >> $f
}
say "Menyembunyikan menu bar macOS (muncul saat kursor ke atas) dan aksen hangat"
save_default -g _HIHideMenuBar
save_default -g AppleAccentColor
save_default -g AppleHighlightColor
defaults write -g _HIHideMenuBar -bool true
defaults write -g AppleAccentColor -int 1
defaults write -g AppleHighlightColor -string "0.968627 0.831373 0.588235 Other"
# on macOS 26 the defaults key alone does not take effect; System Events applies it live
osascript -e 'tell application "System Events" to tell dock preferences to set autohide menu bar to false' >/dev/null 2>&1 || true
osascript -e 'tell application "System Events" to tell dock preferences to set autohide menu bar to true' >/dev/null 2>&1 || true
killall SystemUIServer 2>/dev/null || true

# ------------------------------------------------------------------ 5. bar and window borders
say "Menyalakan SketchyBar dan JankyBorders"
brew services restart felixkratz/formulae/sketchybar >/dev/null
brew services restart felixkratz/formulae/borders >/dev/null

# ------------------------------------------------------------------ 6. Kamar at login
say "Menjalankan Kamar sekarang dan setiap login"
plist=$HOME/Library/LaunchAgents/id.kamar.app.plist
mkdir -p ${plist:h}
cat > $plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>id.kamar.app</string>
  <key>ProgramArguments</key><array><string>$HOME/Applications/Kamar.app/Contents/MacOS/Kamar</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
PLIST
launchctl bootout gui/$UID/id.kamar.app 2>/dev/null || true
launchctl bootstrap gui/$UID $plist

# the same room as the system picture (lock screen, Mission Control)
$HOME/Applications/Kamar.app/Contents/MacOS/Kamar --set-wallpaper $ROOT/dotfiles/wallpaper/kamar-sore.jpg || true

# ------------------------------------------------------------------ 7. VS Code
CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
if [[ -x $CODE ]]; then
  say "Memasang tema Kertas untuk VS Code"
  mkdir -p $ROOT/build
  (cd $ROOT/dotfiles/vscode/kertas-theme && npx --yes @vscode/vsce@3 package --allow-missing-repository --skip-license -o $ROOT/build/kertas.vsix >/dev/null)
  "$CODE" --install-extension $ROOT/build/kertas.vsix --force >/dev/null
  node $ROOT/scripts/vscode-settings.mjs apply
fi

# ------------------------------------------------------------------ 8. Spotify
if [[ -d /Applications/Spotify.app ]] && command -v spicetify >/dev/null; then
  say "Memberi Spotify tema Kertas (Spicetify; Spotify akan dibuka ulang)"
  spicetify >/dev/null 2>&1 || true   # first run writes its config
  mkdir -p $HOME/.config/spicetify/Themes
  rm -rf $HOME/.config/spicetify/Themes/Kertas
  ln -s $ROOT/dotfiles/spicetify/Kertas $HOME/.config/spicetify/Themes/Kertas
  scheme=sore; [[ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" == Dark ]] && scheme=malam
  spicetify config current_theme Kertas color_scheme $scheme inject_css 1 replace_colors 1 >/dev/null
  spicetify backup apply >/dev/null 2>&1 || spicetify apply >/dev/null 2>&1 || note "Spicetify gagal; coba jalankan 'spicetify backup apply' manual."
fi

# ------------------------------------------------------------------ 9. Chrome (manual: Chrome only loads local themes by hand)
say "Selesai."
note "Chrome: buka chrome://extensions, nyalakan Developer mode, Load unpacked, pilih:"
note "  $ROOT/dotfiles/chrome/kertas-theme"
note "Terminal baru: buka Ghostty (tema Kertas sudah terpasang)."
note "Batalkan semua: $ROOT/uninstall.sh"
