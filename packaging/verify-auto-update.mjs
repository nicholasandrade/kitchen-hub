// Run on the isolated Windows CI runner. Exercises the real silent installer,
// recorded service shutdown, detached updater, restart, and preserved user data.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { createInstallerUpdater, installerUrl } from '../server/installerUpdates.mjs'

if (process.platform !== 'win32' || process.env.CI !== 'true') throw new Error('The installer smoke test must run on an isolated Windows CI runner.')
const execute = promisify(execFile)
const installer = resolve(process.argv[2])
const smokeRoot = resolve('build/windows/update-smoke')
const installRoot = join(smokeRoot, 'Hub Install')
process.env.LOCALAPPDATA = join(smokeRoot, 'profile')
process.env.KITCHEN_HUB_NONINTERACTIVE = '1'
const dataDirectory = join(process.env.LOCALAPPDATA, 'KitchenHub', 'data')
const runPowerShell = script => new Promise((done, reject) => {
  // Service descendants must not keep execFile's output pipes open after the
  // launcher exits. Production launchers likewise run without captured pipes.
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-NoBrowser'], { windowsHide: true, stdio: 'ignore' })
  const timer = setTimeout(() => { child.kill(); reject(new Error('Installed launcher did not return within 90 seconds.')) }, 90_000)
  child.once('error', error => { clearTimeout(timer); reject(error) })
  child.once('exit', code => {
    clearTimeout(timer)
    if (code === 0) done()
    else reject(new Error(`Installed launcher failed (${code}). Inspect service diagnostics below.`))
  })
})
const stopScript = join(installRoot, 'launcher', 'Stop-KitchenHub.ps1')
const sleep = ms => new Promise(done => setTimeout(done, ms))
const waitFor = async (description, check) => {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try { if (await check()) return } catch { /* Server is expected to stop and restart. */ }
    await sleep(1000)
  }
  throw new Error(`Timed out waiting for ${description}. Inspect build/windows/update-smoke.`)
}

try {
  await mkdir(smokeRoot, { recursive: true })
  console.log('Smoke: installing initial build into isolated directory.')
  await execute(installer, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${installRoot}`, `/LOG=${join(smokeRoot, 'initial-install.log')}`], { windowsHide: true, timeout: 90_000 })
  console.log('Smoke: initial installation completed.')
  const appRoot = join(installRoot, 'app')
  const configPath = join(appRoot, 'app-config.json')
  const config = JSON.parse((await readFile(configPath, 'utf8')).replace(/^\uFEFF/, ''))
  const version = config.version
  config.version = '0.0.1'
  await writeFile(configPath, JSON.stringify(config))
  await mkdir(join(dataDirectory, 'updates'), { recursive: true })
  await mkdir(join(dataDirectory, 'edge-profile'), { recursive: true })
  await writeFile(join(dataDirectory, 'updates', 'settings.json'), JSON.stringify({ automaticUpdates: false, intervalSeconds: 86400 }))
  const sentinel = join(dataDirectory, 'edge-profile', 'update-preservation-check.txt')
  await writeFile(sentinel, 'preserve existing user data')
  console.log('Smoke: starting installed server and wake listener.')
  await runPowerShell(join(installRoot, 'launcher', 'Start-KitchenHub.ps1'))
  console.log('Smoke: launcher returned.')
  const wakePidPath = join(dataDirectory, 'pids', 'wake.pid')
  const initialWakePid = (await readFile(wakePidPath, 'utf8')).trim()
  await waitFor('initial installed server', async () => (await fetch('http://127.0.0.1:8787/api/voice/health', { signal: AbortSignal.timeout(2000) })).ok)
  const size = (await stat(installer)).size
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(installer)) hash.update(chunk)
  const digest = `sha256:${hash.digest('hex')}`
  const updater = createInstallerUpdater({
    currentVersion: '0.0.1', appRoot, dataDirectory,
    updates: { check: async () => ({ updateAvailable: true, latestVersion: version }) },
    fetchImpl: async url => {
      if (url.startsWith('https://api.github.com/')) return Response.json({ tag_name: `v${version}`, assets: [{ name: `KitchenHub-Setup-${version}.exe`, size, digest, browser_download_url: installerUrl(version) }] })
      assert.equal(url, installerUrl(version))
      const response = new Response(Readable.toWeb(createReadStream(installer)))
      Object.defineProperty(response, 'url', { value: url })
      return response
    },
  })
  await updater.saveSettings({ automaticUpdates: true, intervalSeconds: 86400 })
  assert.equal((await updater.runAutomaticUpdate()).phase, 'installing')
  console.log('Smoke: automatic download verified; detached installer launched.')
  await waitFor('automatic installation and restarted server', async () => {
    const response = await fetch('http://127.0.0.1:8787/api/updates/install-status', { signal: AbortSignal.timeout(2000) })
    return response.ok && (await response.json()).currentVersion === version
  })
  await waitFor('restarted wake listener and browser launch', async () => {
    const response = await fetch('http://127.0.0.1:8788/health', { signal: AbortSignal.timeout(2000) })
    return response.ok && (await response.json()).ready && (await readFile(wakePidPath, 'utf8')).trim() !== initialWakePid && Number((await readFile(join(dataDirectory, 'pids', 'edge.pid'), 'utf8')).trim()) > 0
  })
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve existing user data')
  const status = await (await fetch('http://127.0.0.1:8787/api/updates/install-status', { signal: AbortSignal.timeout(2000) })).json()
  assert.equal(status.supported, true)
  assert.equal(status.automaticUpdates, true)
  assert.equal(status.phase, 'idle')
  console.log('Real automatic update verified: download, SHA-256, silent install, service restart, and preserved user data.')
} catch (error) {
  for (const directory of [join(dataDirectory, 'logs'), join(dataDirectory, 'updates'), smokeRoot]) {
    for (const name of await readdir(directory).catch(() => [])) {
      if (!name.endsWith('.log') && name !== 'status.json') continue
      const output = await readFile(join(directory, name), 'utf8').catch(() => '')
      console.error(`Smoke diagnostic ${name}:\n${output.slice(-4000)}`)
    }
  }
  throw error
} finally {
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', stopScript], { windowsHide: true, timeout: 15_000 }).catch(() => {})
}
