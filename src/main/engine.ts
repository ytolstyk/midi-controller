import {
  addressKey,
  addressOf,
  encodeAllNotesOff,
  encodeOff,
  encodeOn,
  type Address
} from '../shared/midi-encode'
import {
  TRIGGER_OFF_MS,
  type Binding,
  type Notice,
  type PanicResult,
  type PortState,
  type StatusSnapshot,
  type ToggleState
} from '../shared/types'

/** The slice of the MIDI port the engine needs; a fake in tests. */
export interface MidiPort {
  isOpen(): boolean
  /** Returns false (never throws) when the message could not be sent. */
  send(bytes: number[]): boolean
  state(): PortState
  name(): string | null
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as NodeJS.Timeout)
}

interface LedgerEntry {
  address: Address
  holders: Set<string>
}

interface PendingOff {
  handle: unknown
  spec: Binding
}

const TEST_PREFIX = 'test:'
/** Holder id for the Test button, distinct from the key's own holder. */
const testHolder = (code: string): string => `${TEST_PREFIX}${code}`
/** Inverse of testHolder; returns the binding code for either kind of holder id. */
const codeOfHolder = (holder: string): string =>
  holder.startsWith(TEST_PREFIX) ? holder.slice(TEST_PREFIX.length) : holder

/**
 * Owns all MIDI behaviour: mode semantics, the refcounted ON ledger, panic and
 * safety-off when bindings change. Never touches the renderer directly; it
 * reports through `onChange` with a full status snapshot.
 */
export class MidiEngine {
  private bindings = new Map<string, Binding>()
  /** address -> holders currently keeping it ON */
  private ledger = new Map<string, LedgerEntry>()
  /** momentary keys physically down, with the spec captured at keydown */
  private held = new Map<string, Binding>()
  /** toggles currently ON, with the spec captured when they were switched on */
  private toggleSpecs = new Map<string, Binding>()
  private toggleState = new Map<string, ToggleState>()
  /** pending auto Note Off timers, keyed by holder id */
  private timers = new Map<string, PendingOff>()
  private notice: Notice | null = null
  private lastSent = ''

  constructor(
    private readonly port: MidiPort,
    private readonly onChange: (s: StatusSnapshot) => void,
    private readonly scheduler: Scheduler = realScheduler
  ) {}

  // ---- state ---------------------------------------------------------------

  snapshot(): StatusSnapshot {
    return {
      port: { state: this.port.state(), name: this.port.name() },
      toggles: Object.fromEntries(this.toggleState),
      notice: this.notice
    }
  }

  /** Push the snapshot to the UI, skipping pushes that would change nothing (e.g. plain key presses). */
  emit(): void {
    const snap = this.snapshot()
    const signature = JSON.stringify(snap)
    if (signature === this.lastSent) return
    this.lastSent = signature
    this.onChange(snap)
  }

  /** True when any address is currently ON (drives the quit confirm). */
  hasActive(): boolean {
    return this.ledger.size > 0
  }

  dismissNotice(): void {
    this.notice = null
    this.emit()
  }

  // ---- ledger primitives ---------------------------------------------------

  /** Send "on" and, only if it went out, record the holder. */
  private holdOn(holder: string, spec: Binding): boolean {
    const address = addressOf(spec)
    if (!this.port.send(encodeOn(address, spec.value))) return false
    const key = addressKey(address)
    const entry = this.ledger.get(key) ?? { address, holders: new Set<string>() }
    entry.holders.add(holder)
    this.ledger.set(key, entry)
    return true
  }

  /** Drop a holder; send "off" only when it was the last one. False if the off failed. */
  private releaseHolder(holder: string, spec: Binding): boolean {
    const key = addressKey(addressOf(spec))
    const entry = this.ledger.get(key)
    if (!entry || !entry.holders.has(holder)) return true
    if (entry.holders.size === 1) {
      if (!this.port.send(encodeOff(entry.address))) return false
      this.ledger.delete(key)
    } else {
      entry.holders.delete(holder)
    }
    return true
  }

  private scheduleOff(holder: string, spec: Binding): void {
    const handle = this.scheduler.set(() => {
      this.timers.delete(holder)
      this.releaseHolder(holder, spec)
      this.emit()
    }, TRIGGER_OFF_MS)
    this.timers.set(holder, { handle, spec })
  }

  /** Cancel a pending auto-off and release its holder now. */
  private flushTimer(holder: string): boolean {
    const pending = this.timers.get(holder)
    if (!pending) return true
    this.scheduler.clear(pending.handle)
    this.timers.delete(holder)
    return this.releaseHolder(holder, pending.spec)
  }

  /** CC trigger: fire-and-forget value; deliberately not tracked in the ledger. */
  private sendCcValue(b: Binding): void {
    this.port.send(encodeOn(addressOf(b), b.value))
  }

  /** Send "on", then auto-off after TRIGGER_OFF_MS; restarts on every call. */
  private pulseNote(holder: string, spec: Binding): void {
    if (!this.flushTimer(holder)) return
    if (this.holdOn(holder, spec)) this.scheduleOff(holder, spec)
  }

  // ---- key events ----------------------------------------------------------

  press(code: string): void {
    const b = this.bindings.get(code)
    if (!b || !this.port.isOpen()) return
    switch (b.mode) {
      case 'momentary':
        if (this.held.has(code)) return
        if (this.holdOn(code, b)) this.held.set(code, b)
        break
      case 'toggle':
        this.flipToggle(code, b)
        break
      case 'trigger':
        if (b.type === 'cc') this.sendCcValue(b)
        else this.pulseNote(code, b)
        break
    }
    this.emit()
  }

  release(code: string): void {
    const spec = this.held.get(code)
    if (!spec || !this.port.isOpen()) return
    if (this.releaseHolder(code, spec)) this.held.delete(code)
    this.emit()
  }

  /** Window blur: release held momentary keys only; toggles keep their state. */
  releaseHeld(): void {
    for (const code of [...this.held.keys()]) this.release(code)
  }

  private flipToggle(code: string, b: Binding): void {
    if (this.toggleState.get(code) === 'on') {
      const spec = this.toggleSpecs.get(code) ?? b
      if (this.releaseHolder(code, spec)) {
        this.toggleSpecs.delete(code)
        this.toggleState.set(code, 'off')
      }
    } else if (this.holdOn(code, b)) {
      this.toggleSpecs.set(code, b)
      this.toggleState.set(code, 'on')
    }
  }

  /** Test button: same bytes as a keypress, but self-releasing. */
  test(code: string): void {
    const b = this.bindings.get(code)
    if (!b || !this.port.isOpen()) return
    if (b.mode === 'toggle') {
      this.flipToggle(code, b)
      this.toggleState.set(code, 'unknown') // a Test flip isn't a real press; the plugin's state is now unverified
    } else if (b.mode === 'trigger' && b.type === 'cc') {
      this.sendCcValue(b)
    } else {
      this.pulseNote(testHolder(code), b)
    }
    this.emit()
  }

  // ---- panic ---------------------------------------------------------------

  /** Sweep the ledger (not the bindings list) and reset all toggle indicators. */
  panic(): PanicResult {
    if (!this.port.isOpen()) {
      return { ok: false, message: 'Panic not sent — port disconnected' }
    }
    const incomplete = (): PanicResult => {
      this.emit()
      return { ok: false, message: 'Panic incomplete — some addresses may still be ON' }
    }
    const entries = [...this.ledger.values()]
    const channels = new Set(entries.map((e) => e.address.channel))
    for (const ch of channels) {
      if (!this.port.send(encodeAllNotesOff(ch))) return incomplete()
    }
    for (const [key, entry] of [...this.ledger]) {
      if (!this.port.send(encodeOff(entry.address))) return incomplete()
      this.ledger.delete(key)
    }
    for (const t of this.timers.values()) this.scheduler.clear(t.handle)
    this.timers.clear()
    this.held.clear()
    this.toggleSpecs.clear()
    this.toggleState.clear()
    for (const b of this.bindings.values()) {
      if (b.mode === 'toggle') this.toggleState.set(b.code, 'off')
    }
    this.notice = null
    this.emit()
    return {
      ok: true,
      message: entries.length > 0 ? `Panic sent — ${entries.length} address(es) cleared` : 'Nothing to clear'
    }
  }

  // ---- bindings changes ----------------------------------------------------

  /** Install a new bindings list, safely switching off anything the edit would orphan. */
  applyBindings(next: Binding[]): void {
    const nextByCode = new Map(next.map((b) => [b.code, b]))
    const live = new Set<string>([
      ...this.held.keys(),
      ...this.toggleSpecs.keys(),
      ...[...this.timers.keys()].map(codeOfHolder)
    ])
    let sharedLeftOn = false
    for (const code of live) {
      const before = this.bindings.get(code)
      const after = nextByCode.get(code)
      if (before && after && sameSpec(before, after)) continue
      if (this.forceRelease(code)) sharedLeftOn = true
    }
    for (const code of [...this.toggleState.keys()]) {
      const before = this.bindings.get(code)
      const after = nextByCode.get(code)
      if (!before || !after || !sameSpec(before, after)) this.toggleState.delete(code)
    }
    this.bindings = nextByCode
    if (sharedLeftOn) {
      this.notice = {
        text: 'A switched-off address is also used by another binding — consider Panic / reset all.',
        sticky: false
      }
    }
    this.emit()
  }

  /** Release everything a code holds. Returns true if its address stays ON via another holder. */
  private forceRelease(code: string): boolean {
    let stillShared = false
    const check = (spec: Binding): void => {
      const entry = this.ledger.get(addressKey(addressOf(spec)))
      if (entry && entry.holders.size > 0) stillShared = true
    }
    const held = this.held.get(code)
    if (held && this.releaseHolder(code, held)) {
      this.held.delete(code)
      check(held)
    }
    const tog = this.toggleSpecs.get(code)
    if (tog && this.releaseHolder(code, tog)) {
      this.toggleSpecs.delete(code)
      check(tog)
    }
    for (const holder of [code, testHolder(code)]) {
      const pending = this.timers.get(holder)
      if (pending && this.flushTimer(holder)) check(pending.spec)
    }
    return stillShared
  }

  // ---- reconnect -----------------------------------------------------------

  /** Port came back after an outage. Sends nothing; toggles become unverified. */
  onReconnected(renamedTo: string | null): void {
    const toggles = [...this.bindings.values()].filter((b) => b.mode === 'toggle')
    const unverifiedToggles = toggles.filter((b) => this.toggleState.get(b.code) !== 'off').length
    const sticky = this.ledger.size > 0 || unverifiedToggles > 0 || renamedTo !== null
    this.toggleState.clear()
    // A key held across the outage may never deliver its release; forget it so the next press works.
    // Its ledger entry stays, so Panic (or that key's next release) still switches it off.
    this.held.clear()
    const n = this.ledger.size + unverifiedToggles
    let text = sticky
      ? `Reconnected. ${n} address(es)/toggle(s) may still be ON or unverified across the outage — Panic to clear.`
      : 'Reconnected'
    if (renamedTo) text += ` Port renamed to “${renamedTo}” — redo MIDI learn.`
    this.notice = { text, sticky }
    this.emit()
  }
}

const sameSpec = (a: Binding, b: Binding): boolean =>
  a.type === b.type &&
  a.channel === b.channel &&
  a.number === b.number &&
  a.mode === b.mode &&
  a.value === b.value
