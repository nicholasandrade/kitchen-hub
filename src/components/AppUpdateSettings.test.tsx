import { describe, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppUpdateBanner, AppUpdateSettings } from './AppUpdateSettings'
import { reconcileInstallation, startUpdatePolling, validUpdateInterval, type AppUpdates, type InstallStatus } from '../appUpdates'

const release = { currentVersion: '0.1.4', latestVersion: '0.2.0', updateAvailable: true, releaseUrl: 'https://github.com/nicholasandrade/kitchen-hub/releases/tag/v0.2.0', installerUrl: 'https://github.com/nicholasandrade/kitchen-hub/releases/download/v0.2.0/KitchenHub-Setup-0.2.0.exe', checkedAt: '2026-10-21T12:00:00Z' }
const status = (extra: Partial<InstallStatus> = {}): InstallStatus => ({ supported: true, automaticUpdates: true, intervalSeconds: 30, phase: 'idle', ...extra })
const state = (extra: Partial<AppUpdates> = {}): AppUpdates => ({ intervalSeconds: 30, saveInterval: vi.fn().mockResolvedValue(true), settingsPending: false, settingsError: '', setAutomaticUpdates: vi.fn().mockResolvedValue(true), result: null, checking: false, error: '', check: vi.fn(), installStatus: status(), actionPending: false, download: vi.fn(), install: vi.fn(), ...extra })

describe('installation request reconciliation', () => {
  test('restores ready state after an unaccepted install request', () => {
    const ready = status({ phase: 'ready', version: '0.2.0', currentVersion: '0.1.4' })
    expect(reconcileInstallation(ready, '0.2.0')).toEqual({ target: null, idlePolls: 0, status: ready })
  })
  test('bounds idle reconciliation and resets the count when installation starts', () => {
    const idle = status({ currentVersion: '0.1.4' })
    const first = reconcileInstallation(idle, '0.2.0')
    const second = reconcileInstallation(idle, first.target, first.idlePolls)
    expect(first.status).toBeNull()
    expect(second.status).toBeNull()
    const third = reconcileInstallation(idle, second.target, second.idlePolls)
    expect(third.target).toBeNull()
    expect(third.status?.phase).toBe('error')
    expect(third.status?.error).toContain('Please retry')
    expect(reconcileInstallation(status({ phase: 'installing' }), '0.2.0', 2)).toEqual({ target: '0.2.0', idlePolls: 0, status: null })
  })
  test('accepts server errors and does not mistake a ready older installer for the requested target', () => {
    const error = status({ phase: 'error', error: 'Installer failed' })
    expect(reconcileInstallation(error, '0.2.0').status).toBe(error)
    expect(reconcileInstallation(status({ phase: 'ready', version: '0.1.9' }), '0.2.0').status).toBeNull()
  })
})
describe('app update settings', () => {
  test('accepts bounded whole seconds only', () => {
    for (const value of [5, 30, 86400]) expect(validUpdateInterval(value)).toBe(true)
    for (const value of [0, -1, 4, 5.5, 86401, NaN, Infinity]) expect(validUpdateInterval(value)).toBe(false)
  })
  test('shows default interval and labels the control', () => {
    const html = renderToStaticMarkup(<AppUpdateSettings updates={state()} />)
    expect(html).toContain('value="30"')
    expect(html).toContain('for="update-interval"')
    expect(html).toContain('Checking for releases')
    expect(html).not.toContain('Hub is up to date')
  })
  test('does not report failures as up to date', () => {
    const html = renderToStaticMarkup(<AppUpdateSettings updates={state({ error: 'Offline' })} />)
    expect(html).toContain('Offline')
    expect(html).not.toContain('Hub is up to date')
  })
  test('defaults to automatic updates with an accessible off switch and no required action', () => {
    const updates = state({ result: release })
    const html = renderToStaticMarkup(<AppUpdateSettings updates={updates} />)
    expect(html).toContain('for="automatic-updates"')
    expect(html).toContain('id="automatic-updates" type="checkbox" aria-describedby="automatic-updates-help" checked=""')
    expect(html).toContain('Install updates automatically')
    expect(html).toContain('Turn this off to download and install updates manually')
    for (const Component of [AppUpdateSettings, AppUpdateBanner]) {
      const automatic = renderToStaticMarkup(<Component updates={updates} />)
      expect(automatic).toContain('Automatic update scheduled')
      expect(automatic).not.toContain('Download update')
      expect(automatic).not.toContain('Install and restart')
    }
  })
  test('initial settings load stays checked and disabled and server interval is displayed', () => {
    const loading = renderToStaticMarkup(<AppUpdateSettings updates={state({ installStatus: null })} />)
    expect(loading).toContain('type="checkbox" disabled=""')
    expect(loading).toContain('checked=""')
    const html = renderToStaticMarkup(<AppUpdateSettings updates={state({ intervalSeconds: 60, installStatus: status({ automaticUpdates: false, intervalSeconds: 60 }), settingsError: 'Unable to save. Please retry.' })} />)
    expect(html).toContain('value="60"')
    expect(html).not.toContain('checked=""')
    expect(html).toContain('role="alert">Unable to save. Please retry.')
  })
  test('shows a newer release even after a later offline check', () => {
    const updates = state({ error: 'Offline', result: release, installStatus: status({ automaticUpdates: false }) })
    expect(renderToStaticMarkup(<AppUpdateBanner updates={updates} />)).toContain('Hub 0.2.0 is available')
    expect(renderToStaticMarkup(<AppUpdateSettings updates={updates} />)).toContain('Download update')
    expect(renderToStaticMarkup(<AppUpdateBanner updates={state()} />)).toBe('')
  })
  test('offers the download in both settings and banner and explains restart', () => {
    const updates = state({ result: release, installStatus: status({ automaticUpdates: false }) })
    for (const Component of [AppUpdateBanner, AppUpdateSettings]) {
      const html = renderToStaticMarkup(<Component updates={updates} />)
      expect(html).toContain('Download update')
      expect(html).toContain('Your data is preserved')
    }
  })
  test('shows accessible byte progress without duplicate download controls', () => {
    const updates = state({ result: release, installStatus: status({ supported: true, phase: 'downloading', downloadedBytes: 250, totalBytes: 1000 }) })
    const html = renderToStaticMarkup(<AppUpdateSettings updates={updates} />)
    expect(html).toContain('250 bytes of 1,000 bytes (25%)')
    expect(html).toContain('aria-label="Update download progress" max="100" value="25"')
    expect(html).not.toContain('Download update')
    const unknown = renderToStaticMarkup(<AppUpdateBanner updates={state({ result: release, installStatus: status({ supported: true, phase: 'downloading', downloadedBytes: 100 }) })} />)
    expect(unknown).toContain('100 bytes')
    expect(unknown).not.toContain('value=')
  })
  test('offers install only when ready and disables pending actions', () => {
    const updates = state({ result: release, installStatus: status({ supported: true, automaticUpdates: false, phase: 'ready', version: '0.2.0' }) })
    expect(renderToStaticMarkup(<AppUpdateBanner updates={updates} />)).toContain('Install and restart')
    expect(renderToStaticMarkup(<AppUpdateBanner updates={state({ ...updates, actionPending: true })} />)).toContain('disabled=""')
  })
  test('shows installation reconnect status and actionable download errors', () => {
    const installing = renderToStaticMarkup(<AppUpdateBanner updates={state({ result: release, installStatus: status({ supported: true, phase: 'installing' }) })} />)
    expect(installing).toContain('will reconnect automatically')
    expect(installing).not.toContain('<button')
    const error = renderToStaticMarkup(<AppUpdateSettings updates={state({ result: release, installStatus: status({ supported: true, phase: 'error', error: 'Download interrupted' }) })} />)
    expect(error).toContain('role="alert">Download interrupted')
    expect(error).toContain('Retry download')
  })
  test('uses the direct installer link for unsupported installs', () => {
    const updates = state({ result: release, installStatus: status({ supported: false, phase: 'idle' }) })
    for (const Component of [AppUpdateBanner, AppUpdateSettings]) {
      const html = renderToStaticMarkup(<Component updates={updates} />)
      expect(html).toContain(`href="${release.installerUrl}"`)
      expect(html).toContain('Download installer')
      expect(html).not.toContain('Download update')
    }
  })
})

test('polls at startup and the chosen interval, and cancels old timers', () => {
  vi.useFakeTimers()
  try {
    const check = vi.fn()
    const stop = startUpdatePolling(check, 30)
    vi.advanceTimersByTime(0)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(29999)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(check).toHaveBeenCalledTimes(2)
    stop()
    const stopNew = startUpdatePolling(check, 10)
    vi.advanceTimersByTime(20000)
    expect(check).toHaveBeenCalledTimes(5)
    stopNew()
    vi.advanceTimersByTime(60000)
    expect(check).toHaveBeenCalledTimes(5)
  } finally { vi.useRealTimers() }
})
