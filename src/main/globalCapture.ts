import { systemPreferences } from 'electron'
import { GlobalKeys, type KeySink } from './globalKeys'
import { isHookRunning, startHook, stopHook } from './hook'
import type { GlobalStatus } from '../shared/types'

const ACCESS_POLL_MS = 2000

/**
 * Ties the OS-wide key listener to its enabled setting and the macOS Accessibility permission.
 * The listener only runs while capture is enabled and permission is granted. While it is wanted
 * but not running (permission missing, or the OS refused to start it) we retry on a timer, so
 * capture starts by itself once the user grants access.
 */
export class GlobalCapture {
  private readonly keys: GlobalKeys
  private retryTimer: ReturnType<typeof setInterval> | undefined
  private lastSent: GlobalStatus | null = null
  private startFailureLogged = false

  constructor(
    sink: KeySink,
    appFocused: () => boolean,
    private readonly onStatusChange: (s: GlobalStatus) => void
  ) {
    this.keys = new GlobalKeys(sink, appFocused)
  }

  /** Apply the saved setting and start listening if possible. */
  init(enabled: boolean): void {
    this.keys.setEnabled(enabled)
    this.sync()
  }

  /** `prompt`: show the macOS permission dialog when access is missing (only for clicks inside our window). */
  setEnabled(on: boolean, prompt = false): GlobalStatus {
    this.keys.setEnabled(on)
    if (on && prompt && !this.hasAccess()) systemPreferences.isTrustedAccessibilityClient(true)
    this.sync()
    return this.status()
  }

  toggle(): GlobalStatus {
    return this.setEnabled(!this.keys.isEnabled())
  }

  onAppFocus(): void {
    this.keys.onAppFocus()
  }

  stop(): void {
    this.stopRetrying()
    stopHook()
  }

  status(): GlobalStatus {
    return this.buildStatus(this.hasAccess())
  }

  private hasAccess(): boolean {
    return systemPreferences.isTrustedAccessibilityClient(false)
  }

  private buildStatus(access: boolean): GlobalStatus {
    return { enabled: this.keys.isEnabled(), access: access ? 'granted' : 'denied', running: isHookRunning() }
  }

  /** Bring the listener and the retry timer in line with the setting and the permission. */
  private sync(): void {
    const access = this.hasAccess()
    const wanted = this.keys.isEnabled()
    if (wanted && access) this.startListening()
    else {
      stopHook()
      this.keys.onHookStopped()
    }
    // Keep checking while wanted, not only until it starts: revoked access must stop the hook and show in the UI.
    if (wanted) this.startRetrying()
    else this.stopRetrying()
    this.emitIfChanged(this.buildStatus(access))
  }

  private startListening(): void {
    try {
      startHook((k) => this.keys.handle(k))
    } catch (err) {
      if (!this.startFailureLogged) console.error('[global-keys] listener failed to start; will retry', err)
      this.startFailureLogged = true
    }
  }

  private startRetrying(): void {
    this.retryTimer ??= setInterval(() => this.sync(), ACCESS_POLL_MS)
  }

  private stopRetrying(): void {
    clearInterval(this.retryTimer)
    this.retryTimer = undefined
  }

  private emitIfChanged(s: GlobalStatus): void {
    const prev = this.lastSent
    if (prev && prev.enabled === s.enabled && prev.access === s.access && prev.running === s.running) return
    this.lastSent = s
    this.onStatusChange(s)
  }
}
