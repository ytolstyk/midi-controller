import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'
import { IPC } from '../shared/ipc'
import type { GlobalStatus, StatusSnapshot } from '../shared/types'

const api: Api = {
  press: (code) => ipcRenderer.send(IPC.keyPress, code),
  release: (code) => ipcRenderer.send(IPC.keyRelease, code),
  blur: () => ipcRenderer.send(IPC.keyBlur),
  test: (code) => ipcRenderer.invoke(IPC.midiTest, code),
  panic: () => ipcRenderer.invoke(IPC.midiPanic),
  reconnect: () => ipcRenderer.invoke(IPC.midiReconnect),
  dismissNotice: () => ipcRenderer.send(IPC.noticeDismiss),
  loadBindings: () => ipcRenderer.invoke(IPC.bindingsLoad),
  saveBindings: (b) => ipcRenderer.invoke(IPC.bindingsSave, b),
  getStatus: () => ipcRenderer.invoke(IPC.midiStatus),
  onStatus: (cb) => {
    const listener = (_e: unknown, s: StatusSnapshot): void => cb(s)
    ipcRenderer.on(IPC.midiStatus, listener)
    return () => ipcRenderer.removeListener(IPC.midiStatus, listener)
  },
  getGlobal: () => ipcRenderer.invoke(IPC.globalStatus),
  openAccessSettings: () => ipcRenderer.send(IPC.globalOpenAccess),
  setGlobal: (enabled) => ipcRenderer.invoke(IPC.globalSet, enabled),
  onGlobal: (cb) => {
    const listener = (_e: unknown, s: GlobalStatus): void => cb(s)
    ipcRenderer.on(IPC.globalStatusPush, listener)
    return () => ipcRenderer.removeListener(IPC.globalStatusPush, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
