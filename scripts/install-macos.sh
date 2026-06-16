#!/usr/bin/env bash
# Install (or update) Murmur on macOS — without the Gatekeeper hassle.
#
# Murmur isn't notarized by Apple (no paid Developer account), so a freshly
# downloaded copy is quarantined and macOS blocks it on first open. This script
# downloads the latest universal build, installs it to /Applications, and removes
# the quarantine flag so the (ad-hoc-signed) app opens normally.
#
#   curl -fsSL https://raw.githubusercontent.com/kurenn/murmur/main/scripts/install-macos.sh | bash
#
# It only touches /Applications/Murmur.app and a temp dir. Read it first if you
# like — that's the point of it living in the repo.
set -euo pipefail

REPO="kurenn/murmur"
APP="/Applications/Murmur.app"
TMP="$(mktemp -d)"
MNT=""
cleanup() {
  [ -n "$MNT" ] && hdiutil detach "$MNT" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "→ Finding the latest Murmur release…"
DMG_URL="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o "https://github.com/$REPO/releases/download/[^\"]*universal\.dmg" | head -1)"
[ -n "$DMG_URL" ] || { echo "✗ Could not find a universal .dmg in the latest release."; exit 1; }

echo "→ Downloading $(basename "$DMG_URL")…"
curl -fL# "$DMG_URL" -o "$TMP/Murmur.dmg"

echo "→ Mounting…"
MNT="$(hdiutil attach -nobrowse -noverify "$TMP/Murmur.dmg" | grep -o '/Volumes/.*' | head -1)"
[ -n "$MNT" ] && [ -d "$MNT/Murmur.app" ] || { echo "✗ Murmur.app not found in the disk image."; exit 1; }

echo "→ Installing to /Applications…"
[ -e "$APP" ] && rm -rf "$APP"
cp -R "$MNT/Murmur.app" "$APP"

echo "→ Removing quarantine so Gatekeeper won't block the unsigned app…"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "✓ Murmur installed. Launching…"
open "$APP"
echo "  When prompted, grant Microphone, Accessibility, and Input Monitoring (for the fn-key trigger)."
