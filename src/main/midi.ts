import { Input, Output } from '@julusian/midi'
import { PORT_BASE_NAME, type PortState } from '../shared/types'
import type { MidiPort } from './engine'

const MAX_SUFFIX = 6
const BASE_NAME_RETRIES = 3
const RETRY_DELAY_MS = 150

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface PortEvents {
  /** Port state or name changed. */
  onChange(): void
  /** A reconnect succeeded; renamedTo is set when the name differs from before. */
  onReconnected(renamedTo: string | null): void
}

/**
 * The virtual CoreMIDI output. Never throws: failures flip the state to `lost`.
 * Reconnects are serialized; extra triggers coalesce into at most one retry.
 */
export class VirtualPort implements MidiPort {
  private out: Output | null = null
  private current: PortState = 'lost'
  private portName: string | null = null
  /** Last name we actually opened under; survives failed reconnects. */
  private lastGoodName: string | null = null
  private inflight: Promise<boolean> | null = null
  private queued = false

  constructor(private readonly events: PortEvents) {}

  isOpen(): boolean {
    return this.current === 'open'
  }
  state(): PortState {
    return this.current
  }
  name(): string | null {
    return this.portName
  }

  send(bytes: number[]): boolean {
    if (this.current !== 'open' || !this.out) return false
    try {
      this.out.sendMessage(bytes)
      return true
    } catch {
      this.current = 'lost'
      this.events.onChange()
      return false
    }
  }

  /** First open at launch (no reconnect notice). Shares the in-flight guard with reconnect(). */
  open(): Promise<boolean> {
    if (this.inflight) return this.inflight
    const run = this.openFresh()
      .then((ok) => {
        this.events.onChange()
        return ok
      })
      .finally(() => {
        this.inflight = null
      })
    this.inflight = run
    return run
  }

  /** Close, reopen under the base name, and report. Safe to call from any trigger. */
  reconnect(): Promise<boolean> {
    if (this.inflight) {
      this.queued = true
      return this.inflight
    }
    const previous = this.lastGoodName
    const run = (async (): Promise<boolean> => {
      const ok = await this.openFresh()
      if (ok) {
        const renamed = previous !== null && this.portName !== previous ? this.portName : null
        this.events.onReconnected(renamed)
      } else {
        this.events.onChange()
      }
      return ok
    })().finally(() => {
      this.inflight = null
      if (this.queued) {
        this.queued = false
        void this.reconnect()
      }
    })
    this.inflight = run
    return run
  }

  close(): void {
    this.closeQuietly()
    this.current = 'lost'
  }

  private closeQuietly(): void {
    try {
      this.out?.closePort()
    } catch {
      // a dead handle may throw; nothing more to do
    }
    this.out = null
  }

  /** Open under the base name; fall back to a numeric suffix if a same-named source already exists. */
  private async openFresh(): Promise<boolean> {
    this.closeQuietly()
    this.current = 'lost'
    for (let n = 1; n <= MAX_SUFFIX; n++) {
      const name = n === 1 ? PORT_BASE_NAME : `${PORT_BASE_NAME} ${n}`
      const attempts = n === 1 ? BASE_NAME_RETRIES : 1
      for (let a = 0; a < attempts; a++) {
        if (this.tryOpen(name)) return true
        if (a < attempts - 1) await sleep(RETRY_DELAY_MS)
      }
    }
    this.portName = null
    return false
  }

  private tryOpen(name: string): boolean {
    let out: Output | null = null
    try {
      out = new Output()
      out.openVirtualPort(name)
      // CoreMIDI happily creates duplicates; ours is the only one if the name appears once.
      const copies = Input.getPortNames().filter((p) => p === name).length
      if (copies > 1) {
        out.closePort()
        return false
      }
      this.out = out
      this.current = 'open'
      this.portName = name
      this.lastGoodName = name
      return true
    } catch {
      try {
        out?.closePort()
      } catch {
        // ignore
      }
      return false
    }
  }
}
