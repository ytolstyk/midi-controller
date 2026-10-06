# Midi-eval Controller

Turn your Mac keyboard into a MIDI controller for Neural DSP plugins (or anything with MIDI learn).
The app creates a virtual CoreMIDI source called **Midi-eval Controller**; each key you assign sends a CC or
Note message that you map once with the plugin's MIDI learn.

## Run

```bash
npm install
npm run dev        # development
npm run build && npm start   # production build
npm test           # unit tests
npm run monitor    # print the MIDI the app sends (needs the app running)
```

Apple Silicon: if your Node runs under Rosetta, install with
`npm_config_arch=arm64 npm install` so Electron and the MIDI addon are native.

## Package a standalone app (macOS)

This produces a normal `Midi-eval Controller.app` that runs without Node, npm or any dev tools installed. You only
need the tools below on the machine that **builds** it.

### 1. Prerequisites (build machine only)

- macOS on Apple Silicon or Intel, with Xcode Command Line Tools (`xcode-select --install`; provides `codesign` and the
  compiler used if a native addon has no prebuilt binary).
- Node.js 20 or newer (`node -v`) and npm.

### 2. Build the app

```bash
git clone <this repo> && cd midi-controller
npm ci        # Apple Silicon with Node under Rosetta: npm_config_arch=arm64 npm ci
npm run package
```

`npm run package` builds the renderer/main bundles and runs electron-builder, writing the app to
`dist/mac-arm64/Midi-eval Controller.app`. The two native addons (`@julusian/midi`, `uiohook-napi`) are bundled
unpacked inside the app, so nothing needs to be installed on the target Mac.

The script is Apple Silicon only (`--arm64`). For an Intel build, install with `npm_config_arch=x64 npm ci` and run
`npx electron-vite build && npx electron-builder --mac --x64 --dir`; the app lands in `dist/mac/`. Native addons are
not cross-compiled, so each architecture must be built with dependencies installed for that architecture.

### 3. Sign it

Unsigned arm64 apps will not launch on macOS, so ad-hoc sign the bundle. Use the fixed designated requirement so the
Accessibility permission (for Global keys) survives reinstalls:

```bash
codesign --force --deep --sign - -r='designated => identifier "com.local.keycontroller"' \
  "dist/mac-arm64/Midi-eval Controller.app"
```

`npm run install-app` does steps 2–3 and copies the result to `/Applications` in one go (add `--open` to launch it).

### 4. Share it

Zip with `ditto` (plain `zip` can break the signature):

```bash
ditto -c -k --keepParent "dist/mac-arm64/Midi-eval Controller.app" Midi-eval-Controller-arm64.zip
```

Send the zip. The recipient unzips it, drags the app to `/Applications` and opens it.

### 5. First launch on someone else's Mac

The app is not notarized (that needs a paid Apple Developer ID), so Gatekeeper blocks it on first open:

- **Right-click the app → Open → Open**, or
- System Settings → Privacy & Security → **Open Anyway**, or
- in Terminal: `xattr -dr com.apple.quarantine "/Applications/Midi-eval Controller.app"`

Then see [Use it with Neural DSP](#use-it-with-neural-dsp). Global keys additionally needs Accessibility permission
(see below). The recipient's Mac must match the architecture you built for (Apple Silicon vs Intel).

To distribute without these warnings, replace ad-hoc signing with a Developer ID Application certificate and notarize
(set `mac.identity` and add `mac.notarize` / hardened-runtime entitlements in the `build` section of `package.json`).

### Windows

Not supported. The app's core feature is a *virtual* MIDI port created through CoreMIDI, and Windows has no
equivalent: its MIDI APIs cannot create virtual ports, and the key capture and window behavior are written for macOS.
A Windows port would need a virtual-port driver such as loopMIDI, code changes in `src/main/midi.ts` to open it by
name, and a `win` target in the electron-builder config, built on Windows. None of that exists in this repo today, so
there is no honest `npm run` command for it.

## Use it with Neural DSP

1. Start **Midi-eval Controller first**, then the plugin/DAW (many hosts only scan MIDI ports at startup).
2. In the plugin/host, enable the **Midi-eval Controller** MIDI input.
3. In the app click a key (or **Learn key** and press one), set label / message / behavior, **Save**.
4. In the plugin open MIDI learn, click a parameter, then press **Test** (or click back on this window and press the key).

**The controller window must be focused for keys to register** (no global hooks, no Accessibility permission).
The header shows *Keys active* or *Click this window to activate keys*.

## Behavior

| Behavior | CC | Note |
|---|---|---|
| Momentary | on value at press, 0 at release | Note On at press, Note Off at release |
| Toggle | each press flips on value / 0 | each press flips Note On / Note Off |
| Trigger | on value only, never 0 | Note On, auto Note Off after 100 ms |

- Bindable keys: arrows, A–Z, 0–9 (modifier combos are ignored). CC 120–127 are reserved and rejected.
- Toggle state can't be read back from the plugin, so each toggle shows an LED: lit = on, dim = off, dashed = **unknown**
  (at launch and after a reconnect). The first press from unknown sends *on*.
- **Panic / reset all** sends All Notes Off on channels that have something ON, switches off everything the app turned on,
  and resets toggle LEDs. It sends nothing if nothing is on.
- Editing or deleting a binding whose key is held or toggled on switches its target off first.
- Closing the window **hides** it (the port stays alive); **Cmd+Q** quits, asking first if anything is still ON.
- After sleep/wake the app reopens the port automatically, sends nothing, marks toggles unknown, and shows a notice.

## Known limitations

- Keys only work while the window is focused.
- A crash/force-quit, or quitting while the port is lost, can't send Off messages — use the plugin's own reset.
- Port health is detected on send failure and on wake, not by polling; use **Reconnect** if the plugin stops responding.
- If an unclean exit leaves a stale port, a relaunch may open as `Midi-eval Controller 2` and your MIDI-learn assignments
  (which point at the old name) go quiet until the stale port clears.
- On-screen labels assume an ANSI QWERTY layout.
- The quit confirmation blocks until answered; Activity Monitor is the last resort for a backgrounded app.

Bindings live in `~/Library/Application Support/midi-controller/bindings.json` (a `.bak` of the previous save is kept).

## Global keys (any app)

Turn on **Global keys** in the header to play without focusing the window. It uses a system-wide key listener, so macOS asks for **Accessibility** permission (System Settings → Privacy & Security → Accessibility). It is off until you turn it on, and the setting is remembered. **Ctrl+Alt+Cmd+K** toggles it from anywhere.

- Only the bound keys (A–Z, 0–9, arrows) are looked at, and only without Cmd/Ctrl/Alt/Shift. Nothing else is read, stored or logged.
- The keys still reach the app you're typing in, so turn capture off when you type elsewhere.
- While it's on, the bound keys you press in **any** app are sent as MIDI on the "Midi-eval Controller" port, which other apps on this Mac (or a network MIDI session) can read. Don't use bound keys for passwords while it's on.
- Reinstalling can reset the permission (the app is ad-hoc signed): remove and re-add it in the Accessibility list.
