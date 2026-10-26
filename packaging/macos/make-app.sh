#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Opensidian.app from a release build, for macOS.
#
# Linux ships an AppImage and a Flatpak; macOS has no single-file format that
# needs nothing from the maintainer, so this assembles the one thing Finder can
# launch: a bundle with Contents/MacOS/opensidian, an Info.plist and an .icns.
# Ad-hoc signing (-) is enough to run it on this machine; a copy that travels
# still needs Developer ID + notarisation, which agents never hold (AGENTS.md,
# "Releases").
#
#   packaging/macos/make-app.sh          build, then bundle into
#                                        src-tauri/target/macos/Opensidian.app
#   OPENSIDIAN_SKIP_BUILD=1 ...          reuse an existing target/release binary
#
# The icon comes from the same SVG-derived PNGs the Linux packages use, so the
# app looks identical on both platforms and no new artwork enters the tree.

set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
bin="$root/src-tauri/target/release/opensidian"
out="$root/src-tauri/target/macos/Opensidian.app"
icons="$root/packaging/linux/icons"
version=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$root/src-tauri/tauri.conf.json" | head -1)
[ -n "$version" ] || { echo "no version in src-tauri/tauri.conf.json" >&2; exit 1; }

if [ "${OPENSIDIAN_SKIP_BUILD:-}" != 1 ]; then
    echo "==> cargo build --release --locked"
    (cd "$root/src-tauri" && cargo build --release --locked)
fi
[ -x "$bin" ] || { echo "missing $bin (run without OPENSIDIAN_SKIP_BUILD)" >&2; exit 1; }

echo "==> assembling $out"
rm -rf "$out"
mkdir -p "$out/Contents/MacOS" "$out/Contents/Resources"
cp "$bin" "$out/Contents/MacOS/opensidian"
printf 'APPL????' > "$out/Contents/PkgInfo"

# .icns from the Linux icon set. 512px is the largest upstream render; the
# 1024px slot (@2x of 512) is an upscale — Retina shows it at 512 points only
# when the user picks a huge icon in the Dock, where the softness does not read.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
set="$work/AppIcon.iconset"
mkdir -p "$set"
for pair in 16:icon_16x16.png 32:icon_16x16@2x.png 32:icon_32x32.png 64:icon_32x32@2x.png \
            128:icon_128x128.png 256:icon_128x128@2x.png 256:icon_256x256.png \
            512:icon_256x256@2x.png 512:icon_512x512.png 1024:icon_512x512@2x.png; do
    px=${pair%%:*}
    name=${pair#*:}
    # sips reads the 256px render for the small slots and the 512px one for the rest
    src="$icons/256.png"
    [ "$px" -ge 512 ] && src="$icons/512.png"
    sips -z "$px" "$px" "$src" --out "$set/$name" >/dev/null
done
iconutil -c icns "$set" -o "$out/Contents/Resources/AppIcon.icns"

cat > "$out/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>opensidian</string>
    <key>CFBundleExecutable</key>
    <string>opensidian</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>dev.koto.opensidian</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>opensidian</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$version</string>
    <key>CFBundleVersion</key>
    <string>$version</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
    <!-- WKWebView + the bundled window code need 11.0 (the floor Tauri v2 sets) -->
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
PLIST

# Ad-hoc signature: without any signature Apple Silicon refuses to launch the
# bundle at all, and the ad-hoc one is what every local build of a mac app gets.
# It is NOT a distribution signature — see the header.
codesign --force --sign - "$out" >/dev/null 2>&1 || echo "warning: ad-hoc codesign failed; launch may be refused on arm64" >&2

echo "==> $out ($version)"
