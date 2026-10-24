import { afterEach, expect, test, vi } from 'vitest'
import { createUpdateService } from './updates.mjs'

const repository = 'https://github.com/nicholasandrade/kitchen-hub'
const release = (version) => ({ ok: true, status: 200, url: `${repository}/releases/tag/v${version}` })
afterEach(() => vi.useRealTimers())

test.each([
  ['1.2.3', '1.2.3', false],
  ['1.2.3', '1.2.3.0', false],
  ['1.2.9', '1.2.10', true],
  ['1.2.3', '1.2.3.1', true],
  ['1.2.3.1', '1.2.3', false],
  ['2.0.0', '1.99.99', false],
])('compares installed %s with release %s numerically', async (currentVersion, latestVersion, updateAvailable) => {
  const fetchImpl = vi.fn().mockResolvedValue(release(latestVersion))
  const service = createUpdateService({ currentVersion, fetchImpl, now: () => 0 })
  expect(await service.check()).toEqual({
    currentVersion, latestVersion, updateAvailable,
    releaseUrl: `${repository}/releases/tag/v${latestVersion}`, checkedAt: '1970-01-01T00:00:00.000Z',
  })
  expect(fetchImpl).toHaveBeenCalledWith(`${repository}/releases/latest`, expect.objectContaining({ method: 'HEAD', redirect: 'follow', signal: expect.any(AbortSignal) }))
})

test.each([
  'https://example.com/nicholasandrade/kitchen-hub/releases/tag/v1.2.3',
  'https://github.com/other/kitchen-hub/releases/tag/v1.2.3',
  `${repository}/releases/tag/v1.2`,
  `${repository}/releases/tag/v1.2.3-beta`,
  `${repository}/releases/tag/v1.2.3?download=1`,
  `${repository}/releases/latest`,
  'malformed',
])('rejects invalid or foreign release URL %s', async (url) => {
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl: async () => ({ ok: true, status: 200, url }) })
  await expect(service.check()).rejects.toThrow(/invalid|untrusted/)
})

test('404 reports no releases and caches the successful check', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, url: `${repository}/releases/latest` })
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl })
  expect(await service.check()).toMatchObject({ latestVersion: null, updateAvailable: false, releaseUrl: '' })
  await service.check()
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

test('coalesces concurrent requests and caches success for five seconds', async () => {
  let time = 0
  let resolve
  const fetchImpl = vi.fn().mockImplementation(() => new Promise(done => { resolve = done }))
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl, now: () => time })
  const first = service.check()
  const second = service.check()
  expect(second).toBe(first)
  resolve(release('1.1.0'))
  await first
  time = 4999
  await service.check()
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  time = 5000
  const third = service.check()
  resolve(release('1.2.0'))
  expect((await third).latestVersion).toBe('1.2.0')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})

test('network failures reject and back off for thirty seconds', async () => {
  let time = 0
  const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(release('1.1.0'))
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl, now: () => time })
  await expect(service.check()).rejects.toThrow('Offline')
  time = 29999
  await expect(service.check()).rejects.toThrow('Offline')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  time = 30000
  expect((await service.check()).updateAvailable).toBe(true)
})

test.each([
  [429, '60', 60_000],
  [503, 'Thu, 01 Jan 1970 00:02:00 GMT', 120_000],
  [429, '1', 30_000],
  [503, 'invalid', 30_000],
])('HTTP %s respects retry-after %s', async (status, retryAfter, delay) => {
  let time = 0
  const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status, headers: new Headers({ 'retry-after': retryAfter }) }).mockResolvedValue(release('1.1.0'))
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl, now: () => time })
  await expect(service.check()).rejects.toThrow(`HTTP ${status}`)
  time = delay - 1
  await expect(service.check()).rejects.toThrow(`HTTP ${status}`)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  time = delay
  await service.check()
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})

test('times out after ten seconds even if fetch ignores abort', async () => {
  vi.useFakeTimers()
  let signal
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl: (_url, options) => { signal = options.signal; return new Promise(() => {}) } })
  const result = expect(service.check()).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(10_000)
  await result
  expect(signal.aborted).toBe(true)
})

test('does not treat a foreign 404 redirect as no releases', async () => {
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl: async () => ({ ok: false, status: 404, url: 'https://example.com/releases/latest' }) })
  await expect(service.check()).rejects.toThrow('untrusted')
})

test('a failed refresh rejects rather than returning a previously cached success', async () => {
  let time = 0
  const fetchImpl = vi.fn().mockResolvedValueOnce(release('1.0.0')).mockRejectedValue(new Error('Offline'))
  const service = createUpdateService({ currentVersion: '1.0.0', fetchImpl, now: () => time })
  expect((await service.check()).updateAvailable).toBe(false)
  time = 5000
  await expect(service.check()).rejects.toThrow('Offline')
  await expect(service.check()).rejects.toThrow('Offline')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
