import { memo, type JSX } from 'react'
import type { Notice, StatusSnapshot } from '../../../shared/types'

interface Props {
  status: StatusSnapshot
  focused: boolean
  panicMessage: string | null
  onPanic(): void
  onReconnect(): void
  onDismissNotice(): void
}

export const StatusBar = memo(function StatusBar({ status, focused, panicMessage, onPanic, onReconnect, onDismissNotice }: Props): JSX.Element {
  const open = status.port.state === 'open'
  const notice: Notice | null = status.notice
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
        <span className={`chip ${focused ? 'chip-ok' : 'chip-warn'}`}>
          <i className="dot" />
          {focused ? 'Keys active' : 'Click this window to activate keys'}
        </span>
      </div>

      <div className="top-actions">
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
