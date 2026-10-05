#!/bin/bash
# Build, ad-hoc sign and install Midi-eval Controller into /Applications (Apple Silicon).
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="Midi-eval Controller"
BUILT="dist/mac-arm64/$APP_NAME.app"
DEST="/Applications/$APP_NAME.app"

# Node may run under Rosetta; force arm64 so native deps and Electron match the app.
export npm_config_arch=arm64 npm_config_platform=darwin

[ -d node_modules ] || npm ci
[ -f node_modules/electron/path.txt ] || node node_modules/electron/install.js

npm run package

# Ad-hoc signing normally ties the Accessibility permission to this exact build, so every reinstall
# would invalidate it. A fixed designated requirement keeps the grant valid across rebuilds.
BUNDLE_ID="com.local.keycontroller"
codesign --force --deep --sign - -r="designated => identifier \"$BUNDLE_ID\"" "$BUILT"

# Quit a running copy so it can be replaced (Off messages are sent on quit).
if pgrep -f "$APP_NAME.app/Contents/MacOS" >/dev/null; then
  osascript -e "tell application \"$APP_NAME\" to quit" || true
  for _ in $(seq 1 20); do
    pgrep -f "$APP_NAME.app/Contents/MacOS" >/dev/null || break
    sleep 0.5
  done
  if pgrep -f "$APP_NAME.app/Contents/MacOS" >/dev/null; then
    echo "$APP_NAME is still running (a quit dialog may be waiting). Quit it and re-run." >&2
    exit 1
  fi
fi

rm -rf "$DEST"
cp -R "$BUILT" "$DEST"
echo "Installed $DEST"
[ "${1:-}" = "--open" ] && open "$DEST" || true
