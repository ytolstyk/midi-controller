import type { JSX } from 'react'
import { memo, useEffect, useState } from 'react'
import { keyCaption } from '../../../shared/keys'
import type { Binding, BindingMode, BindingType } from '../../../shared/types'

interface Props {
  code: string | null
  binding: Binding | undefined
  learnArmed: boolean
  errors: string[]
  onToggleLearn(): void
  onSave(b: Binding): void
  onClear(): void
  onTest(): void
}

const blank = (code: string): Binding => ({
  code,
  label: '',
  type: 'cc',
  channel: 1,
  number: 20,
  mode: 'momentary',
  value: 127
})

const clampInt = (v: string, min: number, max: number): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
}

export const BindingEditor = memo(function BindingEditor(p: Props): JSX.Element {
  const [draft, setDraft] = useState<Binding | null>(null)

  useEffect(() => {
    setDraft(p.code ? (p.binding ?? blank(p.code)) : null)
  }, [p.code, p.binding])

  return (
    <aside className="editor" aria-label="Binding editor">
      <div className="editor-head">
        <h2>{p.code ? <span className="editor-key">{keyCaption(p.code)}</span> : null}Assign key</h2>
        <button
          type="button"
          className={`btn ${p.learnArmed ? 'btn-armed' : ''}`}
          onClick={p.onToggleLearn}
          title="Press a physical key to select it"
        >
          {p.learnArmed ? 'Press a key… (Esc)' : 'Learn key'}
        </button>
      </div>

      {!draft ? (
        <p className="muted">Click a key on the keyboard, or use Learn and press one, to give it a MIDI action.</p>
      ) : (
        <form
          className="fields"
          onSubmit={(e) => {
            e.preventDefault()
            p.onSave(draft)
          }}
        >
          <label>
            Label
            <input
              value={draft.label}
              maxLength={40}
              placeholder="e.g. Next preset"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <div className="row2">
            <label>
              Message
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as BindingType })}
              >
                <option value="cc">Control Change (CC)</option>
                <option value="note">Note</option>
              </select>
            </label>
            <label>
              Behavior
              <select
                value={draft.mode}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as BindingMode })}
              >
                <option value="momentary">Momentary (on while held)</option>
                <option value="toggle">Toggle (press flips)</option>
                <option value="trigger">Trigger (one shot)</option>
              </select>
            </label>
          </div>
          <div className="row3">
            <label>
              Channel
              <input
                type="number"
                min={1}
                max={16}
                value={draft.channel}
                onChange={(e) => setDraft({ ...draft, channel: clampInt(e.target.value, 1, 16) })}
              />
            </label>
            <label>
              {draft.type === 'cc' ? 'CC number' : 'Note number'}
              <input
                type="number"
                min={0}
                max={127}
                value={draft.number}
                onChange={(e) => setDraft({ ...draft, number: clampInt(e.target.value, 0, 127) })}
              />
            </label>
            <label>
              {draft.type === 'cc' ? 'On value' : 'Velocity'}
              <input
                type="number"
                min={0}
                max={127}
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: clampInt(e.target.value, 0, 127) })}
              />
            </label>
          </div>

          {p.errors.length > 0 ? (
            <ul className="errors" role="alert">
              {p.errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}

          <div className="actions">
            <button type="submit" className="btn btn-primary">
              Save
            </button>
            <button type="button" className="btn" onClick={p.onTest} disabled={!p.binding}>
              Test
            </button>
            <button type="button" className="btn btn-danger" onClick={p.onClear} disabled={!p.binding}>
              Clear
            </button>
          </div>
          <p className="muted small">
            In Neural DSP: open MIDI learn, click a parameter, press <b>Test</b> (or click back here and press the key).
          </p>
        </form>
      )}
    </aside>
  )
})
