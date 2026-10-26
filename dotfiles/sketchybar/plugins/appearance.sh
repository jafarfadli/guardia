#!/bin/bash
# Paper by day, "kertas malam" by night: follows the macOS appearance.
source "$CONFIG_DIR/colors.sh"
if [ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ]; then
  P=$NIGHT_PAPER; I=$NIGHT_INK; mode=night; icons="$CONFIG_DIR/icons/night"
else
  P=$PAPER; I=$INK; mode=day; icons="$CONFIG_DIR/icons"
fi
state="${TMPDIR:-/tmp}/kamar-bar-mode"
[ "$(cat "$state" 2>/dev/null)" = "$mode" ] && [ "$SENDER" != "forced" ] && exit 0
echo "$mode" > "$state"
args=()
for tag in kamar.tag spaces front_app clock battery.tag weather.tag; do
  args+=(--set "$tag" background.color=$P background.border_color=$I)
done
for item in kamar.name front_app clock battery weather; do args+=(--set "$item" label.color=$I); done
args+=(--set kamar background.image="$icons/cat.png")
sketchybar "${args[@]}"
# let the icon scripts redraw with the right ink
sketchybar --trigger kamar_appearance
