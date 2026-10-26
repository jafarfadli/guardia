#!/bin/zsh
# Guardia: puts the desktop back the way it was before install.sh.
# Homebrew packages stay installed (remove them with: brew bundle cleanup --file=Brewfile --force).
set -uo pipefail
ROOT=${0:A:h}
BACKUP=$HOME/.guardia/backup
[[ -d $BACKUP ]] || BACKUP=$HOME/.kamar/backup   # installs from before the rename
say() { print -r -- "==> $*" }

say "Mematikan Guardia"
$HOME/Applications/Guardia.app/Contents/MacOS/Guardia --restore-wallpaper 2>/dev/null || $HOME/Applications/Kamar.app/Contents/MacOS/Kamar --restore-wallpaper 2>/dev/null
for label in id.guardia.app id.kamar.app; do
  launchctl bootout gui/$UID/$label 2>/dev/null
  rm -f $HOME/Library/LaunchAgents/$label.plist
done
pkill -x Guardia 2>/dev/null; pkill -x Kamar 2>/dev/null
rm -rf $HOME/Applications/Guardia.app $HOME/Applications/Kamar.app

say "Mematikan JankyBorders"
brew services stop felixkratz/formulae/sketchybar >/dev/null 2>&1  # from installs before the bar was retired
brew services stop felixkratz/formulae/borders >/dev/null 2>&1

say "Melepas config dan mengembalikan yang lama"
if [[ -f $BACKUP/links.txt ]]; then
  sort -u $BACKUP/links.txt | while read -r dst; do [[ -L $dst ]] && rm $dst; done
fi
if [[ -f $BACKUP/moved.tsv ]]; then
  while IFS=$'\t' read -r dst saved; do [[ -e $saved && ! -e $dst ]] && mv $saved $dst; done < $BACKUP/moved.tsv
fi

say "Mengembalikan setelan macOS"
if [[ -f $BACKUP/defaults.tsv ]]; then
  while IFS=$'\t' read -r domain key value; do
    if [[ $value == "__unset__" ]]; then defaults delete $domain $key 2>/dev/null
    elif [[ $key == _HIHideMenuBar ]]; then defaults write $domain $key -bool $value
    elif [[ $key == AppleAccentColor ]]; then defaults write $domain $key -int $value
    else defaults write $domain $key -string "$value"
    fi
  done < $BACKUP/defaults.tsv
  hide=$(defaults read -g _HIHideMenuBar 2>/dev/null || echo 0)
  [[ $hide == 1 ]] && flag=true || flag=false
  osascript -e "tell application \"System Events\" to tell dock preferences to set autohide menu bar to $flag" >/dev/null 2>&1
  killall SystemUIServer 2>/dev/null
fi

CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
if [[ -x $CODE ]]; then
  say "Mengembalikan VS Code"
  node $ROOT/scripts/vscode-settings.mjs restore
  "$CODE" --uninstall-extension guardia.kertas-theme >/dev/null 2>&1
  "$CODE" --uninstall-extension kamar.kertas-theme >/dev/null 2>&1
fi

if command -v spicetify >/dev/null; then
  say "Mengembalikan Spotify"
  spicetify restore >/dev/null 2>&1
  rm -f $HOME/.config/spicetify/Themes/Kertas
fi

rm -rf $HOME/.guardia $HOME/.kamar
say "Beres. Tema Chrome (kalau dipasang) dilepas dari chrome://extensions."
