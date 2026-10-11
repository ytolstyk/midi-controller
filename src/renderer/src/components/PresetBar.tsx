import { memo, useState, type JSX } from 'react'
import { PRESET_NAME_MAX } from '../../../shared/types'

interface Props {
  names: string[]
  onSave(name: string): Promise<boolean>
  onLoad(name: string): void
  onDelete(name: string): void
}

export const PresetBar = memo(function PresetBar({ names, onSave, onLoad, onDelete }: Props): JSX.Element {
  const [choice, setChoice] = useState('')
  const [name, setName] = useState('')
  const picked = names.includes(choice) ? choice : ''
  const trimmed = name.trim()

  const save = (): void => {
    if (!trimmed) return
    if (names.includes(trimmed) && !window.confirm(`Replace preset “${trimmed}” with the current mapping?`)) return
    // Keep what was typed if the save fails.
    void onSave(trimmed).then((ok) => ok && setName(''))
  }

  return (
    <div className="presets" role="group" aria-label="Presets">
      <select value={picked} onChange={(e) => setChoice(e.target.value)} aria-label="Saved presets">
        <option value="">{names.length > 0 ? 'Choose a preset…' : 'No saved presets'}</option>
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        disabled={!picked}
        onClick={() => window.confirm(`Load “${picked}”? This replaces the current mapping.`) && onLoad(picked)}
      >
        Load
      </button>
      <button
        type="button"
        className="btn btn-danger"
        disabled={!picked}
        onClick={() => window.confirm(`Delete preset “${picked}”?`) && onDelete(picked)}
      >
        Delete
      </button>
      <span className="preset-sep" aria-hidden="true" />
      <input
        value={name}
        maxLength={PRESET_NAME_MAX}
        placeholder="Preset name"
        aria-label="New preset name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <button type="button" className="btn btn-primary" disabled={!trimmed} onClick={save}>
        Save as preset
      </button>
    </div>
  )
})
