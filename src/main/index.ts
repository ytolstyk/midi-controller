import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  globalShortcut,
  shell,
  powerMonitor,
  session,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { join } from 'node:path'
import { MidiEngine } from './engine'
import { VirtualPort } from './midi'
import { BindingsStore } from './store'
import { GlobalCapture } from './globalCapture'
import { SettingsStore } from './settings'
import { BINDABLE_CODES, GLOBAL_TOGGLE_ACCELERATOR, isBindableCode } from '../shared/keys'
import { IPC } from '../shared/ipc'
import { collectWarnings, validateBinding, validateSet } from '../shared/validation'
import type { Binding, GlobalStatus, LoadResult, SaveResult, StatusSnapshot } from '../shared/types'

const WINDOW = { width: 1240, height: 840, minWidth: 1000, minHeight: 600, background: '#14161a' }
const QUIT_DIALOG_CANCEL = 0
const UNTRUSTED = 'untrusted sender'
const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

let win: BrowserWindow | null = null
let quitting = false
let confirmingQuit = false

// `port` and `engine` reference each other; the callbacks only run after both exist.
const port: VirtualPort = new VirtualPort({
  onChange: () => engine.emit(),
  onReconnected: (renamedTo) => engine.onReconnected(renamedTo)
})
const engine = new MidiEngine(port, (s: StatusSnapshot) => {
  // The window can be gone (hidden or destroyed); status pushes must never throw.
  if (win && !win.isDestroyed()) win.webContents.send(IPC.midiStatus, s)
})
const store = new BindingsStore(join(app.getPath('userData'), 'bindings.json'))
const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))

let persistedGlobalKeys: boolean | null = null // null until the saved value has been applied
const onGlobalStatus = (s: GlobalStatus): void => {
  if (win && !win.isDestroyed()) win.webContents.send(IPC.globalStatusPush, s)
  if (persistedGlobalKeys !== null && s.enabled !== persistedGlobalKeys) {
    persistedGlobalKeys = s.enabled
    void settings.save({ globalKeys: s.enabled })
  }
}
// Keys typed while this window is focused are handled by the window itself; this covers every other app.
const globalCapture = new GlobalCapture(
  { press: (code) => engine.press(code, 'global'), release: (code) => engine.release(code, 'global') },
  () => win !== null && !win.isDestroyed() && win.isFocused(),
  onGlobalStatus
)

function createWindow(): void {
  win = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    minWidth: WINDOW.minWidth,
    minHeight: WINDOW.minHeight,
    title: 'Key Controller',
    backgroundColor: WINDOW.background,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })
  // Closing the window hides it so the virtual port stays alive; only Quit really quits.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('closed', () => {
    win = null
    engine.releaseHeld('window')
  })
  // The engine never trusts that a keyup will arrive: any loss of the input source releases held keys.
  win.on('hide', () => engine.releaseHeld('window'))
  win.on('focus', () => globalCapture.onAppFocus())
  win.webContents.on('render-process-gone', () => engine.releaseHeld('window'))
  win.webContents.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) engine.releaseHeld('window')
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

/** Only our own window may drive MIDI or bindings. */
const trusted = (e: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  win !== null && e.sender === win.webContents

const codeOf = (v: unknown): string | null => (typeof v === 'string' && isBindableCode(v) ? v : null)

/** Re-pick known fields so nothing extra from the renderer is persisted or applied. */
const pickBinding = (b: Binding): Binding => ({
  code: b.code,
  label: b.label,
  type: b.type,
  channel: b.channel,
  number: b.number,
  mode: b.mode,
  value: b.value
})

const rejected = (errors: string[]): SaveResult => ({ ok: false, errors, warnings: [] })

/** Loads and saves run one at a time so they can't interleave or apply stale data. */
let ioChain: Promise<unknown> = Promise.resolve()
const inOrder = <T>(job: () => Promise<T>): Promise<T> => {
  const run = ioChain.then(job)
  ioChain = run.catch(() => undefined)
  return run
}
const saveBindings = (raw: unknown): Promise<SaveResult> => inOrder(() => doSaveBindings(raw))

async function doSaveBindings(raw: unknown): Promise<SaveResult> {
  if (!Array.isArray(raw)) return rejected(['bindings must be a list'])
  if (raw.length > BINDABLE_CODES.length) return rejected(['too many bindings'])
  const errors = raw.flatMap((b, i) => validateBinding(b).map((m) => `binding #${i + 1}: ${m}`))
  if (errors.length > 0) return rejected(errors)
  const bindings = (raw as Binding[]).map(pickBinding)
  const setErrors = validateSet(bindings)
  if (setErrors.length > 0) return rejected(setErrors)
  try {
    await store.save(bindings)
  } catch (err) {
    return rejected([`could not save: ${err instanceof Error ? err.message : String(err)}`])
  }
  engine.applyBindings(bindings)
  return { ok: true, errors: [], warnings: collectWarnings(bindings) }
}

const loadBindings = (): Promise<LoadResult> =>
  inOrder(async () => {
    const result = await store.load()
    engine.applyBindings(result.bindings)
    return { ...result, warnings: [...result.warnings, ...collectWarnings(result.bindings)] }
  })

/** The load started at launch; the first renderer request reuses it so its warnings aren't lost. */
let startupLoad: Promise<LoadResult> | null = null
const loadForRenderer = (): Promise<LoadResult> => {
  const pending = startupLoad
  startupLoad = null
  return pending ?? loadBindings()
}

function registerIpc(): void {
  const onKey = (channel: string, act: (code: string) => void): void => {
    ipcMain.on(channel, (e, v) => {
      const code = codeOf(v)
      if (trusted(e) && code) act(code)
    })
  }
  onKey(IPC.keyPress, (code) => engine.press(code))
  onKey(IPC.keyRelease, (code) => engine.release(code))
  ipcMain.on(IPC.keyBlur, (e) => trusted(e) && engine.releaseHeld('window'))
  ipcMain.on(IPC.noticeDismiss, (e) => trusted(e) && engine.dismissNotice())

  ipcMain.handle(IPC.midiTest, (e, v) => {
    const code = codeOf(v)
    if (trusted(e) && code) engine.test(code)
  })
  ipcMain.handle(IPC.midiPanic, (e) =>
    trusted(e) ? engine.panic() : { ok: false, message: UNTRUSTED }
  )
  ipcMain.handle(IPC.midiReconnect, async (e) => {
    if (trusted(e)) await port.reconnect()
  })
  ipcMain.handle(IPC.midiStatus, (e) => (trusted(e) ? engine.snapshot() : null))
  ipcMain.handle(IPC.globalStatus, () => globalCapture.status())
  ipcMain.handle(IPC.globalSet, (e, on: unknown) =>
    trusted(e) && typeof on === 'boolean' ? globalCapture.setEnabled(on, true) : globalCapture.status()
  )
  ipcMain.on(IPC.globalOpenAccess, (e) => trusted(e) && void shell.openExternal(ACCESSIBILITY_SETTINGS_URL))
  ipcMain.handle(IPC.bindingsLoad, (e) =>
    trusted(e) ? loadForRenderer() : { bindings: [], warnings: [UNTRUSTED] }
  )
  ipcMain.handle(IPC.bindingsSave, (e, raw: unknown) =>
    trusted(e) ? saveBindings(raw) : rejected([UNTRUSTED])
  )
}

/** Sweep, close the port and really exit. app.quit() is ignored inside a cancelled before-quit. */
function finishQuit(): void {
  engine.panic() // no-op when the ledger is empty or the port is lost
  quitting = true
  globalCapture.stop()
  globalShortcut.unregisterAll()
  port.close()
  app.exit(0)
}

/**
 * Cmd+Q / menu Quit. If anything is still ON, confirm first (async, so timers and key
 * events keep flowing while the dialog is up), then sweep and exit.
 */
function onBeforeQuit(e: Electron.Event): void {
  if (quitting) return
  e.preventDefault()
  if (confirmingQuit) return
  if (!engine.hasActive()) {
    finishQuit()
    return
  }
  const lost = !port.isOpen()
  confirmingQuit = true
  void dialog
    .showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Quit'],
      defaultId: QUIT_DIALOG_CANCEL,
      cancelId: QUIT_DIALOG_CANCEL,
      message: lost
        ? 'Port is disconnected — quitting will NOT send any Off messages. Quit anyway?'
        : 'Some keys or toggles are still ON. Quitting will send Off messages first.',
      detail: lost ? undefined : 'Quit now?'
    })
    .then(({ response }) => response !== QUIT_DIALOG_CANCEL)
    .catch(() => false)
    .then((confirmed) => {
      confirmingQuit = false
      if (confirmed) finishQuit()
    })
}

function main(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    if (!win) createWindow()
    win?.show()
    win?.focus()
  })
  app.on('before-quit', onBeforeQuit)
  process.on('exit', () => {
    // Best effort for exits that skipped before-quit (signals, dev restarts).
    globalCapture.stop()
    engine.panic()
    port.close()
  })
  app.on('activate', () => {
    if (win) win.show()
    else createWindow()
  })
  // Keep running (and keep the port) when the window is hidden.
  app.on('window-all-closed', () => undefined)

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, deny) => deny(false))
    registerIpc()
    void port.open() // in parallel with the window; the UI shows "lost" until it opens
    startupLoad = loadBindings() // main owns the bindings; don't wait for a renderer to ask
    createWindow()
    void settings.load().then((st) => {
      persistedGlobalKeys = st.globalKeys
      globalCapture.init(st.globalKeys)
      // Registered after the saved setting is applied so an early toggle can't be overwritten.
      if (!globalShortcut.register(GLOBAL_TOGGLE_ACCELERATOR, () => globalCapture.toggle())) {
        console.warn(`[global-keys] could not register ${GLOBAL_TOGGLE_ACCELERATOR}`)
      }
    })
    powerMonitor.on('resume', () => void port.reconnect())
  })
}

main()
