#!/bin/bash
source "$CONFIG_DIR/colors.sh"
I=$INK; S=$INK_SOFT
[ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ] && I=$NIGHT_INK && S=0xffae9a82
if [ "$SELECTED" = "true" ]; then
  sketchybar --set "$NAME" background.color=$MUSTARD_SOFT icon.color=$I
else
  sketchybar --set "$NAME" background.color=$TRANSPARENT icon.color=$S
fi
