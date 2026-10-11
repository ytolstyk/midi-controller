// Renders build/icon.svg to build/icon.png and build/icon.icns (macOS). Run: npx electron tools/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'build', 'icon.svg')
const SIZES = [16, 32, 64, 128, 256, 512, 1024]

app.dock?.hide()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  const svg = fs.readFileSync(svgPath, 'utf8')
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const png = path.join(root, 'build', 'icon.png')
  fs.writeFileSync(png, img.toPNG())

  const set = path.join(root, 'build', 'icon.iconset')
  fs.rmSync(set, { recursive: true, force: true })
  fs.mkdirSync(set)
  const out = (name, px) => execFileSync('sips', ['-z', String(px), String(px), png, '--out', path.join(set, name)], { stdio: 'ignore' })
  for (const s of SIZES) {
    if (s <= 512) out(`icon_${s}x${s}.png`, s)
    if (s >= 32) out(`icon_${s / 2}x${s / 2}@2x.png`, s)
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(root, 'build', 'icon.icns')])
  fs.rmSync(set, { recursive: true, force: true })
  app.quit()
})
