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
