import { describe, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppUpdateBanner, AppUpdateSettings } from './AppUpdateSettings'
import { startUpdatePolling, validUpdateInterval, type AppUpdates } from '../appUpdates'

const state = (extra: Partial<AppUpdates> = {}): AppUpdates => ({ intervalSeconds: 30, saveInterval: vi.fn(), result: null, checking: false, error: '', check: vi.fn(), ...extra })
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
  test('shows a newer release even after a later offline check', () => {
    const updates = state({ error: 'Offline', result: { currentVersion: '0.1.4', latestVersion: '0.2.0', updateAvailable: true, releaseUrl: 'https://github.com/nicholasandrade/kitchen-hub/releases/tag/v0.2.0', checkedAt: '2026-10-21T12:00:00Z' } })
    expect(renderToStaticMarkup(<AppUpdateBanner updates={updates} />)).toContain('Hub 0.2.0 is available')
    expect(renderToStaticMarkup(<AppUpdateSettings updates={updates} />)).toContain('View release and installer')
    expect(renderToStaticMarkup(<AppUpdateBanner updates={state()} />)).toBe('')
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
