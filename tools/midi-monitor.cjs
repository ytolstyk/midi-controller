// Prints everything arriving on the "Key Controller" virtual port. Run: npm run monitor
const midi = require('@julusian/midi')

const input = new midi.Input()
const names = Array.from({ length: input.getPortCount() }, (_, i) => input.getPortName(i))
const idx = names.findIndex((n) => n.startsWith('Key Controller'))
if (idx < 0) {
  console.error('No "Key Controller" source found. Start the app first.\nSources:', names)
  process.exit(1)
}
const label = ({ 0x80: 'Note Off', 0x90: 'Note On ', 0xb0: 'CC      ' })
input.on('message', (_dt, [status, a, b]) => {
  const kind = label[status & 0xf0] ?? 'other   '
  console.log(`${new Date().toISOString().slice(11, 23)}  ${kind} ch${(status & 0x0f) + 1}  ${a}  ${b}`)
})
input.openPort(idx)
console.log(`Listening on "${names[idx]}" (Ctrl+C to stop)`)
