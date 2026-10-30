#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Opensidian-<version>-macos-<arch>.dmg, the installer image for macOS.
#
# One file is worth handing to someone else only when Gatekeeper accepts it on
# their machine, which takes three things: a Developer ID Application signature
# with the hardened runtime, a notarisation ticket from Apple, and that ticket
# stapled to the artifact so the first launch works offline. This script walks
# that chain, and says plainly when it could only do part of it.
#
#   packaging/macos/make-dmg.sh
#   OPENSIDIAN_SKIP_BUILD=1 packaging/macos/make-dmg.sh
#   OPENSIDIAN_SKIP_APP=1   packaging/macos/make-dmg.sh   reuse the .app as is
#
# Environment:
#   OPENSIDIAN_SKIP_BUILD=1        passed to make-app.sh: reuse target/release
#   OPENSIDIAN_SKIP_APP=1          do not run make-app.sh at all
#   OPENSIDIAN_SIGN_ID             "Developer ID Application: Name (TEAMID)";
#                                  signs the .app and the .dmg. Unset = ad-hoc,
#                                  so the image runs on this machine only.
#   OPENSIDIAN_NOTARY_PROFILE      keychain profile made once with
#                                  `xcrun notarytool store-credentials <name>`
#   OPENSIDIAN_NOTARY_APPLE_ID     alternative to the profile, together with
#   OPENSIDIAN_NOTARY_TEAM_ID      …these three: an app-specific password
#   OPENSIDIAN_NOTARY_PASSWORD     (ideally "@keychain:item" so it stays out of ps)
#   OPENSIDIAN_NO_NOTARIZE=1       build and sign, skip notarisation on purpose
#
# Signing keys and Apple credentials live in the login keychain, never in the
# repository and never in this script (AGENTS.md, "Releases").
#
# The DMG is named after the version in src-tauri/tauri.conf.json because
# src-tauri/src/updates.rs::scan_dir reads the version out of the file name.

set -eu

die() { echo "make-dmg: $*" >&2; exit 1; }

root=$(cd "$(dirname "$0")/../.." && pwd)
app="$root/src-tauri/target/macos/Opensidian.app"
outdir="$root/src-tauri/target/macos"
version=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$root/src-tauri/tauri.conf.json" | head -1)
[ -n "$version" ] || die "no version in src-tauri/tauri.conf.json"
arch=$(uname -m)
dmg="$outdir/Opensidian-$version-macos-$arch.dmg"

# ---- what will be able to happen -------------------------------------------
# Resolved before the build: a half-configured environment should cost nothing.

sign_id=${OPENSIDIAN_SIGN_ID:-}

notary_profile=${OPENSIDIAN_NOTARY_PROFILE:-}
notary_apple_id=${OPENSIDIAN_NOTARY_APPLE_ID:-}
notary_team_id=${OPENSIDIAN_NOTARY_TEAM_ID:-}
notary_password=${OPENSIDIAN_NOTARY_PASSWORD:-}
have_creds=0
if [ -n "$notary_profile" ]; then
    have_creds=1
elif [ -n "$notary_apple_id" ] && [ -n "$notary_team_id" ] && [ -n "$notary_password" ]; then
    have_creds=1
elif [ -n "$notary_apple_id" ] || [ -n "$notary_team_id" ] || [ -n "$notary_password" ]; then
    die "notarisation needs all three of OPENSIDIAN_NOTARY_APPLE_ID, _TEAM_ID and _PASSWORD (or OPENSIDIAN_NOTARY_PROFILE)"
fi
if [ "$have_creds" = 1 ] && [ -z "$sign_id" ]; then
    die "notarisation needs a Developer ID signature: set OPENSIDIAN_SIGN_ID (Apple rejects ad-hoc signed submissions)"
fi
notarize=0
if [ "$have_creds" = 1 ] && [ "${OPENSIDIAN_NO_NOTARIZE:-}" != 1 ]; then
    notarize=1
    command -v xcrun >/dev/null 2>&1 && xcrun notarytool --version >/dev/null 2>&1 \
        || die "xcrun notarytool is missing; install Xcode (or the command line tools with a new enough macOS)"
fi

# ---- the app ----------------------------------------------------------------

if [ "${OPENSIDIAN_SKIP_APP:-}" != 1 ]; then
    "$root/packaging/macos/make-app.sh"
fi
[ -d "$app" ] || die "missing $app (run packaging/macos/make-app.sh first)"
appver=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$app/Contents/Info.plist" 2>/dev/null || true)
[ "$appver" = "$version" ] || die "app is '$appver' but tauri.conf.json says '$version'; rebuild instead of reusing it"
# an app that is not signed with the identity this run claims would make notarisation fail late
if [ "$notarize" = 1 ]; then
    codesign -dv --verbose=2 "$app" 2>&1 | grep -F -- "$sign_id" >/dev/null 2>&1 \
        || die "$app is not signed with '$sign_id' (build it with OPENSIDIAN_SIGN_ID set, or drop OPENSIDIAN_SKIP_APP)"
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# notarytool with the configured credentials, then the given arguments
ncr() {
    if [ -n "$notary_profile" ]; then
        xcrun notarytool "$@" --keychain-profile "$notary_profile"
    else
        xcrun notarytool "$@" --apple-id "$notary_apple_id" --team-id "$notary_team_id" \
            --password "$notary_password"
    fi
}

# submit one artifact and fail unless Apple said "Accepted"
submit_artifact() {
    art=$1
    echo "==> notarising $(basename "$art") (usually a few minutes)" >&2
    log="$work/notary.log"
    if ! ncr submit "$art" --wait >"$log" 2>&1; then
        cat "$log" >&2
        die "notarytool submit failed for $(basename "$art")"
    fi
    if ! grep -q "status: Accepted" "$log"; then
        cat "$log" >&2
        die "Apple did not accept $(basename "$art") (see the log above; 'status: Invalid' lists the reasons)"
    fi
    grep -E "  id: |  status: " "$log" | sed 's/^  //' >&2
}

# ---- app: notarise before the image ---------------------------------------
# The .app travels inside the DMG and later gets copied to /Applications; its
# own ticket is what lets that copy launch offline, so it is stapled separately.

if [ "$notarize" = 1 ]; then
    zip="$work/Opensidian-$version.zip"
    # ditto keeps the code signature intact; `zip` does not
    ditto -c -k --keepParent "$app" "$zip"
    submit_artifact "$zip"
    xcrun stapler staple "$app" || die "stapler could not staple $app"
    xcrun stapler validate "$app" || die "stapled app does not validate"
fi

# ---- the image -------------------------------------------------------------
# Stage a writable copy: the .app plus the usual /Applications shortcut, so a
# drag install is one gesture. The volume itself stays read-only and UDZO.

stage="$work/stage"
mkdir -p "$stage"
cp -R "$app" "$stage/Opensidian.app"
ln -s /Applications "$stage/Applications"

rm -f "$dmg"
echo "==> creating $dmg"
hdiutil create -volname Opensidian -srcfolder "$stage" -ov -format UDZO "$dmg" >/dev/null
hdiutil verify "$dmg" >/dev/null || die "hdiutil verify failed on $dmg"

if [ -n "$sign_id" ]; then
    echo "==> signing the image with $sign_id"
    codesign --force --timestamp --sign "$sign_id" "$dmg" \
        || die "codesign of the DMG failed (the .app inside is signed; this seals the image)"
fi

if [ "$notarize" = 1 ]; then
    submit_artifact "$dmg"
    xcrun stapler staple "$dmg" || die "stapler could not staple $dmg"
    xcrun stapler validate "$dmg" || die "stapled image does not validate"
fi

# ---- what the user can actually do with it ---------------------------------

echo "==> $dmg"
shasum -a 256 "$dmg"
if [ "$notarize" = 1 ]; then
    # Gatekeeper's own opinion, the same check a fresh Mac applies on open
    spctl -a -t open --context context:primary-signature -vv "$dmg" 2>&1 | sed 's/^/    /'
    echo "==> signed with Developer ID and stapled; this image installs on any Mac"
elif [ "${OPENSIDIAN_NO_NOTARIZE:-}" = 1 ]; then
    echo "note: notarisation skipped (OPENSIDIAN_NO_NOTARIZE=1): the image runs on this machine only" >&2
else
    echo "note: no Developer ID / notarisation credentials were given, so the image is ad-hoc:" >&2
    echo "      it runs on this machine only and will be refused elsewhere by Gatekeeper." >&2
    echo "      set OPENSIDIAN_SIGN_ID and OPENSIDIAN_NOTARY_PROFILE (README-Mac.md, 分发) to distribute." >&2
fi
