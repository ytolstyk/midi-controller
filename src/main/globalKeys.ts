/** A physical key event from the OS-wide hook, already translated to a KeyboardEvent.code (or null if not bindable). */
export interface RawKey {
  down: boolean
  code: string | null
  /** Any of Cmd / Ctrl / Alt / Shift held at the time. */
  modified: boolean
  /** Cmd is down. Implies `modified`; handled first because macOS sends no keyup for keys held under Cmd. */
  meta: boolean
}

export interface KeySink {
  press(code: string): void
  release(code: string): void
}

/**
 * Turns OS-wide key events into engine presses while this app is NOT focused
 * (when focused, the window's own capture handles keys, including Learn and text fields).
 * Owns the set of keys it pressed so a release is always delivered, even after
 * the window gains focus or capture is switched off.
 */
export class GlobalKeys {
  private enabled = false // until the saved setting is applied
  /** keys we pressed (global source) */
  private readonly held = new Set<string>()
  /** keys that went down while the window was focused: the window owns them until keyup, so auto-repeat after a focus loss never re-triggers */
  private readonly windowDown = new Set<string>()

  constructor(
    private readonly sink: KeySink,
    private readonly appFocused: () => boolean
  ) {}

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return
    this.enabled = on
    if (!on) this.onHookStopped()
  }

  /** The listener stopped (disabled, access revoked, failed): no keyup can arrive, so release everything. */
  onHookStopped(): void {
    this.releaseAll()
    this.windowDown.clear()
  }

  /** The app window gained focus: hand keys over to the window's own capture. */
  onAppFocus(): void {
    this.releaseAll()
  }

  handle(ev: RawKey): void {
    if (ev.down) this.onDown(ev)
    else this.onUp(ev)
  }

  private onDown(ev: RawKey): void {
    // macOS sends no keyup for keys held under Cmd, so Cmd releases everything we hold.
    if (ev.meta) {
      this.releaseAll()
      return
    }
    if (!ev.code || ev.modified || !this.enabled) return // unbindable, combo, or off
    if (this.held.has(ev.code) || this.windowDown.has(ev.code)) return // auto-repeat
    if (this.appFocused()) {
      this.windowDown.add(ev.code) // the window's own capture handles it
      return
    }
    this.held.add(ev.code)
    this.sink.press(ev.code)
  }

  /** Deliberately ignores `enabled` and focus: a key we pressed must always get its release. */
  private onUp(ev: RawKey): void {
    if (!ev.code) return
    this.windowDown.delete(ev.code)
    if (this.held.delete(ev.code)) this.sink.release(ev.code)
  }

  /** Release only what we pressed; keys held in the window are the window's to release. */
  private releaseAll(): void {
    for (const code of [...this.held]) this.sink.release(code)
    this.held.clear()
  }
}
