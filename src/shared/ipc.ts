/** IPC channel names shared by main and preload. */
export const IPC = {
  keyPress: 'key:press',
  keyRelease: 'key:release',
  keyBlur: 'key:blur',
  noticeDismiss: 'notice:dismiss',
  midiTest: 'midi:test',
  midiPanic: 'midi:panic',
  midiReconnect: 'midi:reconnect',
  /** Used both as a push (main → renderer) and as an invoke (snapshot request). */
  midiStatus: 'midi:status',
  bindingsLoad: 'bindings:load',
  bindingsSave: 'bindings:save'
} as const
