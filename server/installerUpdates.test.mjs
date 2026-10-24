import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createInstallerUpdater, installerUrl } from './installerUpdates.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const version = '0.1.8'
const bytes = Buffer.from('verified installer fixture')
const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hub-update-test-'))
  roots.push(root)
  const appRoot = join(root, 'installed app', 'app')
  const dataDirectory = join(root, 'user data')
  await mkdir(appRoot, { recursive: true })
  await mkdir(join(appRoot, '..', 'launcher'), { recursive: true })
  await writeFile(join(appRoot, 'app-config.json'), '{}')
  await writeFile(join(appRoot, '..', 'launcher', 'Install-KitchenHubUpdate.ps1'), '# trusted helper')
  const metadata = { tag_name: `v${version}`, assets: [{ name: `KitchenHub-Setup-${version}.exe`, browser_download_url: installerUrl(version), size: bytes.length, digest }] }
  const fetchImpl = vi.fn(async url => {
    if (url.startsWith('https://api.github.com/')) return Response.json(metadata)
    const response = new Response(bytes)
    Object.defineProperty(response, 'url', { value: 'https://release-assets.githubusercontent.com/fixture' })
    return response
  })
  const launch = vi.fn().mockResolvedValue(undefined)
  const updates = { check: vi.fn().mockResolvedValue({ updateAvailable: true, latestVersion: version }) }
  const config = { appRoot, currentVersion: '0.1.7', dataDirectory, platform: 'win32', updates, fetchImpl, launch, ...options }
  return { service: createInstallerUpdater(config), config, metadata, fetchImpl, launch, updates, dataDirectory }
}
const waitForPhase = async (service, phase) => vi.waitFor(async () => expect((await service.status()).phase).toBe(phase))

test('downloads verified bytes once, reports progress, persists readiness and launches the copied helper', async () => {
  const { service, config, fetchImpl, launch, dataDirectory } = await fixture()
  expect(await service.download()).toMatchObject({ phase: 'downloading', supported: true })
  await service.download()
  await waitForPhase(service, 'ready')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  expect(await service.status()).toMatchObject({ downloadedBytes: bytes.length, totalBytes: bytes.length, version })
  const downloaded = join(dataDirectory, 'updates', `KitchenHub-Setup-${version}.exe`)
  expect(await readFile(downloaded)).toEqual(bytes)
  const resumed = createInstallerUpdater(config)
  expect(await resumed.status()).toMatchObject({ phase: 'ready', version })
  expect(await resumed.install()).toMatchObject({ phase: 'installing', version })
  expect(launch).toHaveBeenCalledOnce()
  expect(launch.mock.calls[0][0]).toBe(join(dataDirectory, 'updates', 'Install-KitchenHubUpdate.ps1'))
  expect(launch.mock.calls[0][1]).toContain(downloaded)
  expect(launch.mock.calls[0][1]).toContain(digest.slice(7))
  await expect(resumed.install()).rejects.toThrow('Download and verify')
})

test.each(['checksum', 'size', 'foreign-url', 'missing-digest'])('rejects invalid release metadata or download: %s', async kind => {
  const { service, metadata, launch } = await fixture()
  const asset = metadata.assets[0]
  if (kind === 'checksum') asset.digest = `sha256:${'0'.repeat(64)}`
  if (kind === 'size') asset.size += 1
  if (kind === 'foreign-url') asset.browser_download_url = 'https://example.com/installer.exe'
  if (kind === 'missing-digest') delete asset.digest
  await service.download()
  await waitForPhase(service, 'error')
  await expect(service.install()).rejects.toThrow('Download and verify')
  expect(launch).not.toHaveBeenCalled()
})

test('rechecks the on-disk checksum immediately before install and permits a fresh download on failure', async () => {
  const { service, dataDirectory, launch } = await fixture()
  await service.download()
  await waitForPhase(service, 'ready')
  await writeFile(join(dataDirectory, 'updates', `KitchenHub-Setup-${version}.exe`), Buffer.alloc(bytes.length))
  await expect(service.install()).rejects.toThrow('changed')
  expect(launch).not.toHaveBeenCalled()
  expect(await service.status()).toMatchObject({ phase: 'error' })
  await service.download()
  await waitForPhase(service, 'ready')
})

test('unsupported development installs never download or launch an executable', async () => {
  const { service, fetchImpl, launch } = await fixture({ platform: 'linux' })
  expect(await service.status()).toMatchObject({ supported: false, phase: 'idle' })
  await expect(service.download()).rejects.toThrow('installed Windows app')
  await expect(service.install()).rejects.toThrow('Download and verify')
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(launch).not.toHaveBeenCalled()
})

test('reports download errors and installer-launch failures so the user can retry', async () => {
  const { service, fetchImpl, launch } = await fixture()
  fetchImpl.mockRejectedValueOnce(new Error('Offline'))
  await service.download()
  await waitForPhase(service, 'error')
  expect(await service.status()).toMatchObject({ error: 'Offline' })
  await service.download()
  await waitForPhase(service, 'ready')
  launch.mockRejectedValueOnce(new Error('Cannot start installer'))
  await expect(service.install()).rejects.toThrow('Cannot start installer')
  expect(await service.status()).toMatchObject({ phase: 'error', error: 'Cannot start installer' })
})

test('does not fetch or install when no newer version exists', async () => {
  const { service, updates, fetchImpl } = await fixture()
  updates.check.mockResolvedValue({ updateAvailable: false })
  await service.download()
  await waitForPhase(service, 'error')
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('installer URLs cannot contain paths or command arguments', () => {
  for (const value of ['../evil', '0.1.8;command', '0.1.8-beta', null]) expect(() => installerUrl(value)).toThrow()
})

test('notices a detached installer failure even when the original server stays running', async () => {
  const { service, dataDirectory } = await fixture()
  await service.download()
  await waitForPhase(service, 'ready')
  await service.install()
  await writeFile(join(dataDirectory, 'updates', 'status.json'), JSON.stringify({ phase: 'error', error: 'Installer disk full' }))
  expect(await service.status()).toMatchObject({ phase: 'error', error: 'Installer disk full' })
  await service.download()
  await waitForPhase(service, 'ready')
})

test('automatically downloads, verifies and installs with no user action by default', async () => {
  const { service, launch } = await fixture()
  expect(await service.status()).toMatchObject({ automaticUpdates: true, intervalSeconds: 30 })
  expect(await service.runAutomaticUpdate()).toMatchObject({ phase: 'installing', version })
  expect(launch).toHaveBeenCalledOnce()
})

test('the running server scheduler installs a detected release without a browser or manual trigger', async () => {
  const { service, launch } = await fixture()
  await service.saveSettings({ intervalSeconds: 5 })
  await service.startAutomaticUpdates()
  try {
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce(), { timeout: 8000, interval: 100 })
    expect(await service.status()).toMatchObject({ phase: 'installing', automaticUpdates: true })
  } finally { service.stopAutomaticUpdates() }
}, 10000)

test('turning automatic updates off persists across restarts and prevents automatic downloads/installations', async () => {
  const { service, config, fetchImpl, launch } = await fixture()
  await service.saveSettings({ automaticUpdates: false, intervalSeconds: 60 })
  const restarted = createInstallerUpdater(config)
  expect(await restarted.status()).toMatchObject({ automaticUpdates: false, intervalSeconds: 60 })
  await restarted.runAutomaticUpdate()
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(launch).not.toHaveBeenCalled()
  await restarted.saveSettings({ automaticUpdates: true })
  await restarted.runAutomaticUpdate()
  expect(launch).toHaveBeenCalledOnce()
})

test('simultaneous settings saves preserve both the opt-out and the check interval', async () => {
  const { service, config } = await fixture()
  await Promise.all([service.saveSettings({ automaticUpdates: false }), service.saveSettings({ intervalSeconds: 60 })])
  const resumed = createInstallerUpdater(config)
  expect(await resumed.status()).toMatchObject({ automaticUpdates: false, intervalSeconds: 60 })
})

test('disabling automatic updates during a download prevents its automatic installation', async () => {
  const { service, fetchImpl, launch } = await fixture()
  const normalFetch = fetchImpl.getMockImplementation()
  let releaseDownload
  fetchImpl.mockImplementation(async (...args) => {
    if (!args[0].startsWith('https://api.github.com/')) await new Promise(resolve => { releaseDownload = resolve })
    return normalFetch(...args)
  })
  const automatic = service.runAutomaticUpdate()
  await vi.waitFor(() => expect(releaseDownload).toBeTypeOf('function'))
  await service.saveSettings({ automaticUpdates: false })
  releaseDownload()
  await automatic
  expect(await service.status()).toMatchObject({ phase: 'ready', automaticUpdates: false })
  expect(launch).not.toHaveBeenCalled()
})

test.each(['0.1.8', '0.1.9'])('discards an already-installed or older persisted download in Hub %s', async currentVersion => {
  const { service, config, launch } = await fixture()
  await service.download()
  await waitForPhase(service, 'ready')
  const upgraded = createInstallerUpdater({ ...config, currentVersion })
  expect(await upgraded.status()).toMatchObject({ phase: 'idle' })
  await expect(upgraded.install()).rejects.toThrow('Download and verify')
  expect(launch).not.toHaveBeenCalled()
})
