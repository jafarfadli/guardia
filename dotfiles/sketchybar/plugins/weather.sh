#!/bin/bash
# Current weather from Open-Meteo (no key needed), drawn with the ink icons.
source "$CONFIG_DIR/colors.sh"
ICONS="$CONFIG_DIR/icons"
[ "$(defaults read -g AppleInterfaceStyle 2>/dev/null)" = "Dark" ] && ICONS="$ICONS/night"
json=$(curl -fsS --max-time 8 "https://api.open-meteo.com/v1/forecast?latitude=$LAT&longitude=$LON&current=temperature_2m,weather_code,is_day") || exit 0
read -r temp code day < <(/usr/bin/python3 -c 'import json,sys; c=json.load(sys.stdin)["current"]; print(round(c["temperature_2m"]), c["weather_code"], c["is_day"])' <<< "$json")
[ -z "$temp" ] && exit 0
case $code in
  0|1) [ "$day" = "1" ] && icon=clear || icon=night ;;
  2)   [ "$day" = "1" ] && icon=partly || icon=night-cloudy ;;
  3)   icon=cloudy ;;
  45|48) icon=fog ;;
  95|96|99) icon=storm ;;
  5*|6*|8*) icon=rain ;;
  *) icon=cloudy ;;
esac
sketchybar --set "$NAME" label="${temp}°" --set weather.icon background.image="$ICONS/$icon.png"
