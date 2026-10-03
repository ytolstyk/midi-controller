# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # electron-vite dev
npm run build && npm start   # production build + preview
npm run typecheck    # tsc for both tsconfig.node.json (main/preload/shared) and tsconfig.web.json (renderer)
npm test             # vitest run (all tests in tests/)
npx vitest run tests/engine.test.ts   # single test file
npx vitest run -t "name"              # single test by name
npm run monitor      # tools/midi-monitor.cjs: prints MIDI the running app sends
npm run install-app  # tools/install.sh: build, ad-hoc sign, copy to /Applications (arm64 only; pass --open to launch)
```

Apple Silicon with Node under Rosetta: install with `npm_config_arch=arm64 npm install` so Electron and the native addons (`@julusian/midi`, `uiohook-napi`) match.

## Architecture

macOS-only Electron app (electron-vite) that turns keyboard keys into MIDI CC/Note messages on a virtual CoreMIDI port named "Key Controller". See README.md for user-facing behavior (modes, panic, global keys, limitations).

- `src/shared/` — pure code used by both processes: types, key whitelist (`keys.ts`), MIDI byte encoding, binding validation, IPC channel names (`ipc.ts`), and the `api.ts` contract exposed to the renderer.
- `src/main/` — all MIDI logic lives here, not in the renderer.
  - `engine.ts` (`MidiEngine`): the core. Implements momentary/toggle/trigger semantics, a refcounted ON ledger keyed by MIDI address (so several holders — key, Test button, window vs global source — can share one note/CC), panic, and safety-off when bindings change. Depends only on the `MidiPort` and `Scheduler` interfaces so tests inject fakes; it pushes full `StatusSnapshot`s via `onChange` rather than touching the renderer.
  - `midi.ts` (`VirtualPort`): wraps the native MIDI addon, detects port loss on send failure/wake, reconnects.
  - `globalKeys.ts` (`GlobalKeys`, pure logic) → `globalCapture.ts` (`GlobalCapture`, ties it to the setting and the macOS Accessibility permission, polling to retry) → `hook.ts` (thin `uiohook-napi` wrapper). Global capture only handles keys while the app window is NOT focused; the window's own capture handles them otherwise. Cmd-down releases all held keys because macOS sends no keyup for them.
  - `store.ts` / `settings.ts`: JSON persistence in userData (`bindings.json` with `.bak`, `settings.json`).
  - `index.ts`: wiring — creates engine/port/stores/global capture, the window (close hides; Cmd+Q quits with confirmation), IPC handlers (validate sender, `UNTRUSTED` check), power monitor.
- `src/preload/index.ts`: `contextIsolation` bridge implementing `shared/api.ts`; renderer runs sandboxed with no Node.
- `src/renderer/src/`: React UI (keyboard view, binding editor, status bar). Receives state only through pushed status snapshots.

Key invariant: the engine never trusts that a keyup will arrive; any loss of an input source (window hide/close, renderer crash, hook stop, Cmd) must release that source's held keys (`releaseHeld(source)`).

## Notes

- Tests live in `tests/` and cover `shared/` and the pure main-process classes (engine, globalKeys); none exercise Electron or native addons.
- Packaging is ad-hoc signed with a fixed designated requirement (`install.sh`) so the Accessibility grant survives rebuilds.
