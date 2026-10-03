import { memo, type JSX } from 'react'
import { GLOBAL_TOGGLE_HINT } from '../../../shared/keys'
import type { GlobalStatus, Notice, StatusSnapshot } from '../../../shared/types'

interface Props {
  status: StatusSnapshot
  focused: boolean
  global: GlobalStatus
  onSetGlobal(enabled: boolean): void
  onOpenAccess(): void
  panicMessage: string | null
  onPanic(): void
  onReconnect(): void
  onDismissNotice(): void
}

interface Chip {
  cls: 'chip-ok' | 'chip-warn' | 'chip-bad'
  text: string
}

function describeKeys(global: GlobalStatus, focused: boolean): Chip {
  if (global.enabled && global.access === 'denied') return { cls: 'chip-bad', text: 'Global keys need Accessibility permission' }
  if (global.enabled && global.running) return { cls: 'chip-ok', text: 'Keys active in any app' }
  if (global.enabled) return { cls: 'chip-bad', text: 'Global keys could not start' }
  if (focused) return { cls: 'chip-ok', text: 'Keys active (this window only)' }
  return { cls: 'chip-warn', text: 'Click this window to activate keys' }
}

export const StatusBar = memo(function StatusBar({ status, focused, global, onSetGlobal, onOpenAccess, panicMessage, onPanic, onReconnect, onDismissNotice }: Props): JSX.Element {
  const open = status.port.state === 'open'
  const notice: Notice | null = status.notice
  const needsAccess = global.enabled && global.access === 'denied'
  const keysChip = describeKeys(global, focused)
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Key Controller</h1>
          <p className="muted small">Keyboard → virtual MIDI for Neural DSP</p>
        </div>
      </div>

      <div className="chips">
        <span className={`chip ${open ? 'chip-ok' : 'chip-bad'}`}>
          <i className="dot" />
          {open ? `Port “${status.port.name}” open` : 'MIDI port lost'}
        </span>
        <span className={`chip ${keysChip.cls}`}>
          <i className="dot" />
          {keysChip.text}
        </span>
      </div>

      <div className="top-actions">
        {needsAccess ? (
          <button type="button" className="btn" onClick={onOpenAccess}>
            Grant access
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          aria-pressed={global.enabled}
          onClick={() => onSetGlobal(!global.enabled)}
          title={`Bound keys typed in any app are sent as MIDI, which other apps can read. Toggle with ${GLOBAL_TOGGLE_HINT}.`}
        >
          Global keys: {global.enabled ? 'On' : 'Off'}
        </button>
        {!open ? (
          <button type="button" className="btn" onClick={onReconnect}>
            Reconnect
          </button>
        ) : null}
        <button type="button" className="btn btn-danger" onClick={onPanic} title="All notes off, CC 0 for everything ON, reset toggles">
          Panic / reset all
        </button>
      </div>

      {panicMessage ? <p className="flash" role="status">{panicMessage}</p> : null}
      {notice ? (
        <div className={`notice ${notice.sticky ? 'notice-sticky' : ''}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="btn btn-quiet" onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      ) : null}
    </header>
  )
})
