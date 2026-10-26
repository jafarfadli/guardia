#!/bin/bash
ICONS="$CONFIG_DIR/icons"
[ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ] && ICONS="$ICONS/night"
info=$(pmset -g batt)
pct=$(echo "$info" | grep -Eo '[0-9]+%' | head -1 | tr -d '%')
[ -z "$pct" ] && exit 0
lvl=$(( (pct + 12) / 25 )); [ $lvl -gt 4 ] && lvl=4
icon="battery-$lvl"
echo "$info" | grep -q "AC Power" && icon="$icon-charging"
sketchybar --set "$NAME" label="${pct}%" --set battery.icon background.image="$ICONS/$icon.png"
