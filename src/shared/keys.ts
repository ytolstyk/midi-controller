/** Bindable physical keys (KeyboardEvent.code). Everything else is reserved. */
export const BINDABLE_CODES: readonly string[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`)
]

const BINDABLE = new Set(BINDABLE_CODES)

export const isBindableCode = (code: string): boolean => BINDABLE.has(code)

/** Short on-screen caption for a key code. */
export function keyCaption(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  switch (code) {
    case 'ArrowUp':
      return '↑'
    case 'ArrowDown':
      return '↓'
    case 'ArrowLeft':
      return '←'
    case 'ArrowRight':
      return '→'
    default:
      return code
  }
}
