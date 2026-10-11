# Roadmap

## Windows support

**Status:** not started. **Estimate:** ~1–3 days of focused work, needs a Windows machine for testing.
Estimates are from reading the code, not from trying it on Windows.

### The blocker: virtual MIDI port

`src/main/midi.ts` calls `openVirtualPort(name)`, which Windows can't do (its MIDI API has no virtual ports).
Plan: require the user to install a free loopback driver such as **loopMIDI**, and have the app open that port
as a normal output by name. The plugin/DAW reads from the same loopMIDI port.

- Look the port up with `getPortName` / `openPort` on Windows instead of `openVirtualPort`.
- Drop the duplicate-name and numeric-suffix logic (CoreMIDI-specific); show a clear "install loopMIDI and create a
  port named X" state instead.
- Handle the driver being absent or the port being deleted while running.
- `engine.ts` needs no change (it only depends on the `MidiPort` interface).

Trade-off: a manual setup step for every Windows user. A true virtual port would need a kernel driver or a commercial
SDK (e.g. Tobias Erichsen's virtualMIDI), which isn't worth it to start.

### Smaller changes

- **Native addons:** `@julusian/midi` and `uiohook-napi` ship Windows prebuilds. Must be built on Windows or in CI
  (`npmRebuild: false`, no cross-compiling).
- **Global keys:** remove/skip `systemPreferences.isTrustedAccessibilityClient` in `globalCapture.ts` (no Accessibility
  permission on Windows). The Cmd-releases-held-keys logic is macOS-specific and can stay as a no-op. Check how the
  Windows key (Meta) behaves.
- **Global toggle hotkey:** `Ctrl+Alt+Cmd+K` has no Cmd on Windows. Pick another (e.g. Ctrl+Alt+Shift+K) and update
  `GLOBAL_TOGGLE_HINT` and the UI text.
- **Packaging:** add a `win` target (`nsis` or `portable`) to the `build` config and a `package:win` script.
  `tools/install.sh` stays macOS-only. Unsigned installers trigger SmartScreen warnings (the Windows equivalent of
  Gatekeeper).
- **App behavior:** `index.ts` hides on close and quits on Cmd+Q. Add a tray icon to restore the window and a proper
  Quit item on Windows. `powerMonitor` resume works cross-platform.
- **Docs/tests/CI:** README section for Windows, a `windows-latest` CI build, and a manual test with loopMIDI and a
  real plugin. Unit tests won't catch the Windows-specific issues.

### Estimate breakdown

| Piece | Estimate |
|---|---|
| loopMIDI port handling and setup UX | 0.5–1 day |
| Hotkey, permission and tray changes | 0.5 day |
| Packaging config and Windows CI | 0.5 day |
| Real-world testing with a DAW and plugin | 0.5–1 day |

### Risks

- How reliably the plugin/DAW picks up the loopMIDI port.
- `uiohook-napi` quirks on Windows.

Both only show up on a real Windows machine.

### Suggested approach

Start with the `MidiPort` abstraction and platform checks so macOS behavior stays unchanged, then add the Windows
implementation behind them.
