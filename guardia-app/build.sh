#!/bin/zsh
# Builds Guardia.app with the Command Line Tools' swiftc.
# The CLT on this Mac carries a stale usr/include/swift/module.modulemap that redefines
# SwiftBridging; a VFS overlay hides it from the compiler without touching the system.
set -euo pipefail
here=${0:A:h}
root=${here:h}
build=$root/build/app
app=$build/Guardia.app
mkdir -p $build
overlay=$build/overlay.yaml
: > $build/empty.modulemap
cat > $overlay <<YAML
{ "version": 0, "case-sensitive": "false", "roots": [ { "type": "directory", "name": "/Library/Developer/CommandLineTools/usr/include/swift",
  "contents": [ { "type": "file", "name": "module.modulemap", "external-contents": "$build/empty.modulemap" } ] } ] }
YAML
flags=()
if [[ -f /Library/Developer/CommandLineTools/usr/include/swift/bridging.modulemap && -f /Library/Developer/CommandLineTools/usr/include/swift/module.modulemap ]]; then
  flags=(-vfsoverlay $overlay -Xcc -ivfsoverlay -Xcc $overlay)
fi
rm -rf $app
mkdir -p $app/Contents/MacOS $app/Contents/Resources
swiftc -O -target arm64-apple-macos14.0 $flags $here/Sources/*.swift -o $app/Contents/MacOS/Guardia
cp $here/Info.plist $app/Contents/Info.plist
# web wallpaper and pet sprites travel inside the bundle
mkdir -p $app/Contents/Resources/wallpaper
cp -R $root/wallpaper/index.html $root/wallpaper/src $root/wallpaper/fonts $root/wallpaper/frames $app/Contents/Resources/wallpaper/
cp -R $here/Resources/pet $app/Contents/Resources/pet
# the folder drawing, for icons Guardia puts on new folders by itself
mkdir -p $app/Contents/Resources/icons
cp $root/icons/folder.html $root/icons/folders.js $root/icons/glyphs.js $app/Contents/Resources/icons/
[[ -f $here/Resources/AppIcon.icns ]] && cp $here/Resources/AppIcon.icns $app/Contents/Resources/
codesign --force --sign - --timestamp=none $app >/dev/null
echo "built $app"
