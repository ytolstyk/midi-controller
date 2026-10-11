/** Pad-style palette, like a MIDI grid controller's LEDs. A binding stores the id; the UI maps it to a color. */
export const BINDING_COLORS = [
  { id: 'red', label: 'Red', hex: '#ff4d4d' },
  { id: 'orange', label: 'Orange', hex: '#ff8a3d' },
  { id: 'amber', label: 'Amber', hex: '#ffb23e' },
  { id: 'yellow', label: 'Yellow', hex: '#f2e04a' },
  { id: 'lime', label: 'Lime', hex: '#a6e84a' },
  { id: 'green', label: 'Green', hex: '#3ddc84' },
  { id: 'cyan', label: 'Cyan', hex: '#3dd9d6' },
  { id: 'blue', label: 'Blue', hex: '#4d8dff' },
  { id: 'purple', label: 'Purple', hex: '#a06bff' },
  { id: 'pink', label: 'Pink', hex: '#ff6bb5' },
  { id: 'white', label: 'White', hex: '#e8e9ec' }
] as const

export type BindingColorId = (typeof BINDING_COLORS)[number]['id']

const HEX_BY_ID: ReadonlyMap<string, string> = new Map(BINDING_COLORS.map((c) => [c.id, c.hex]))

export const isBindingColor = (v: unknown): v is BindingColorId => typeof v === 'string' && HEX_BY_ID.has(v)

/** Hex for a stored id, or undefined for "no color" / unknown ids. */
export const colorHex = (id: string | undefined): string | undefined => (id ? HEX_BY_ID.get(id) : undefined)
