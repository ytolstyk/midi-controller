import { memo, type JSX } from 'react'
import { keyCaption } from '../../../shared/keys'
import type { Binding, ToggleState } from '../../../shared/types'
import { ARROW_ROW, ARROW_UP, KEY_ROWS } from '../keyboardLayout'

interface Props {
  bindings: ReadonlyMap<string, Binding>
  toggles: Record<string, ToggleState>
  pressed: ReadonlySet<string>
  selected: string | null
  onSelect(code: string): void
}

const MODE_TAG = { momentary: 'hold', toggle: 'toggle', trigger: 'shot' } as const

const target = (b: Binding): string => `${b.type === 'cc' ? 'CC' : 'N'}${b.number} ch${b.channel}`

interface CapProps {
  code: string
  binding: Binding | undefined
  pressed: boolean
  selected: boolean
  toggle: ToggleState | null
  onSelect(code: string): void
}

/** One key. Takes primitives so memo skips re-render when only other keys change. */
const Cap = memo(function Cap({ code, binding: b, pressed, selected, toggle, onSelect }: CapProps): JSX.Element {
  const cls = [
    'cap',
    b ? 'bound' : '',
    pressed ? 'pressed' : '',
    selected ? 'selected' : '',
    toggle ? `toggle-${toggle}` : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={cls} onClick={() => onSelect(code)} aria-pressed={selected}>
      <span className="cap-key">{keyCaption(code)}</span>
      {b ? (
        <>
          <span className="cap-label">{b.label || '—'}</span>
          <span className="cap-target">{target(b)}</span>
          <span className="cap-mode" title={b.mode}>
            {MODE_TAG[b.mode]}
          </span>
        </>
      ) : null}
      {toggle ? <span className="cap-led" title={`toggle ${toggle}`} /> : null}
    </button>
  )
})

export function KeyboardView({ bindings, toggles, pressed, selected, onSelect }: Props): JSX.Element {
  const cap = (code: string): JSX.Element => {
    const binding = bindings.get(code)
    return (
      <Cap
        key={code}
        code={code}
        binding={binding}
        pressed={pressed.has(code)}
        selected={selected === code}
        toggle={binding?.mode === 'toggle' ? (toggles[code] ?? 'unknown') : null}
        onSelect={onSelect}
      />
    )
  }
  return (
    <div className="keyboard" role="group" aria-label="Keyboard">
      <div className="main-keys">
        {KEY_ROWS.map((row, i) => (
          <div className="key-row" style={{ paddingLeft: `${i * 14}px` }} key={row[0]}>
            {row.map(cap)}
          </div>
        ))}
      </div>
      <div className="arrow-cluster" aria-label="Arrow keys">
        <div className="key-row arrow-top">{cap(ARROW_UP)}</div>
        <div className="key-row">{ARROW_ROW.map(cap)}</div>
      </div>
    </div>
  )
}
