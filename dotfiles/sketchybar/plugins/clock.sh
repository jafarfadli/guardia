#!/bin/bash
# Indonesian day and month, e.g. "Sen 26 Okt · 16.30"
days=(Min Sen Sel Rab Kam Jum Sab)
months=(Jan Feb Mar Apr Mei Jun Jul Agu Sep Okt Nov Des)
d=$(date +%w); m=$(( $(date +%-m) - 1 ))
sketchybar --set "$NAME" label="${days[$d]} $(date +%-d) ${months[$m]} · $(date +%H.%M)"
