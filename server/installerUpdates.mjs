import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, openSync, closeSync } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink, writeFile, copyFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'

const REPOSITORY = 'https://github.com/nicholasandrade/kitchen-hub'
const VERSION = /^\d+\.\d+\.\d+(?:\.\d+)?$/
const MAX_SIZE = 200 * 1024 * 1024
const DIGEST = /^sha256:([a-f0-9]{64})$/
const newer = (candidate, installed) => {
  const left = candidate.split('.').map(BigInt)
  const right = installed.split('.').map(BigInt)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if ((left[index] || 0n) !== (right[index] || 0n)) return (left[index] || 0n) > (right[index] || 0n)
  }
  return false
}
const validInterval = value => Number.isInteger(value) && value >= 5 && value <= 86400

export const installerUrl = version => {
  if (!VERSION.test(version)) throw new Error('Invalid installer version.')
  return `${REPOSITORY}/releases/download/v${version}/KitchenHub-Setup-${version}.exe`
}

async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function launchPowerShell(script, args, onFailure) {
  return new Promise((resolve, reject) => {
    const logPath = join(dirname(script), 'update-launch.log')
    const helperLog = join(dirname(script), 'update-helper.log')
    const helperError = join(dirname(script), 'update-helper-error.log')
    const literal = value => `'${value.replace(/'/g, "''")}'`
    const nativeArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, ...args]
    if (nativeArgs.some(value => /["\r\n\0]/.test(value))) return reject(new Error('Invalid Windows update path.'))
    const argumentsText = nativeArgs.map(value => `"${value}"`).join(' ')
    // Windows Start-Process gives the helper its own hidden console. Direct
    // attached children die with Node; Node's detached PowerShell mode can exit
    // without executing the script. The short broker exits before Hub stops.
    const command = `$ErrorActionPreference = 'Stop'; Start-Process -FilePath 'powershell.exe' -ArgumentList ${literal(argumentsText)} -WindowStyle Hidden -RedirectStandardOutput ${literal(helperLog)} -RedirectStandardError ${literal(helperError)} | Out-Null`
    const encoded = Buffer.from(command, 'utf16le').toString('base64')
    const log = openSync(logPath, 'a')
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true, stdio: ['ignore', log, log],
    })
    closeSync(log)
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve()
      else {
        const error = new Error(`Windows update launcher failed (${code}). See ${logPath}`)
        void onFailure(error)
        reject(error)
      }
    })
  })
}

export function createInstallerUpdater({ updates, currentVersion, appRoot, dataDirectory, platform = process.platform, fetchImpl = fetch, launch = launchPowerShell }) {
  if (!VERSION.test(currentVersion)) throw new Error('Invalid installed version.')
  const installRoot = join(appRoot, '..')
  const helperSource = join(installRoot, 'launcher', 'Install-KitchenHubUpdate.ps1')
  const supported = platform === 'win32' && existsSync(join(appRoot, 'app-config.json')) && existsSync(helperSource)
  const directory = join(dataDirectory, 'updates')
  const statePath = join(directory, 'status.json')
  const settingsPath = join(directory, 'settings.json')
  let settings = { automaticUpdates: true, intervalSeconds: 30 }
  let downloadTask = null
  let autoTimer = null
  let autoStarted = false
  let autoBusy = false
  let settingsQueue = Promise.resolve()
  let state = { phase: 'idle' }
  let artifact = null
  const initialized = (async () => {
    try {
      const saved = JSON.parse(await readFile(settingsPath, 'utf8'))
      if (typeof saved.automaticUpdates === 'boolean') settings.automaticUpdates = saved.automaticUpdates
      if (validInterval(saved.intervalSeconds)) settings.intervalSeconds = saved.intervalSeconds
    } catch { /* Automatic updates are enabled by default. */ }
    if (!supported) return
    try {
      const saved = JSON.parse((await readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''))
      if (saved.phase === 'ready' && VERSION.test(saved.version) && newer(saved.version, currentVersion) && DIGEST.test(saved.digest) && Number.isInteger(saved.size) && saved.size > 0 && saved.size <= MAX_SIZE) {
        artifact = { version: saved.version, digest: saved.digest, size: saved.size }
        state = { phase: 'ready', version: saved.version }
      } else if (saved.phase === 'error') {
        state = { phase: 'error', error: String(saved.error || 'Update installation failed. Please retry.') }
      }
    } catch { /* First run or incomplete download: start idle. */ }
  })()
  const status = () => ({ supported, currentVersion, ...settings, ...state })
  const persist = async value => {
    await mkdir(directory, { recursive: true })
    await writeFile(`${statePath}.tmp`, JSON.stringify(value), 'utf8')
    await rename(`${statePath}.tmp`, statePath)
  }
  const fail = async error => {
    const failure = { phase: 'error', error: error instanceof Error ? error.message : 'Update failed. Please retry.' }
    await persist(failure).catch(() => {})
    state = failure
  }
  const download = async () => {
    let partial
    try {
      const release = await updates.check()
      if (!release.updateAvailable) throw new Error('No newer Hub version is available.')
      const version = release.latestVersion
      const url = installerUrl(version)
      state = { phase: 'downloading', version, downloadedBytes: 0 }
      const metadataResponse = await fetchImpl(`https://api.github.com/repos/nicholasandrade/kitchen-hub/releases/tags/v${version}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KitchenHub-Updater' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
      })
      if (!metadataResponse.ok) throw new Error(`Could not read installer details (HTTP ${metadataResponse.status}). Please retry.`)
      const metadata = await metadataResponse.json()
      const asset = metadata.assets?.find(item => item.name === `KitchenHub-Setup-${version}.exe`)
      if (metadata.tag_name !== `v${version}` || metadata.draft || metadata.prerelease || !asset || asset.browser_download_url !== url || !DIGEST.test(asset.digest) || !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > MAX_SIZE) {
        throw new Error('The release does not contain a verifiable Hub installer.')
      }
      await mkdir(directory, { recursive: true })
      const destination = join(directory, `KitchenHub-Setup-${version}.exe`)
      partial = `${destination}.partial`
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(300_000) })
      if (!response.ok || !response.body) throw new Error(`Installer download failed (HTTP ${response.status}). Please retry.`)
      const finalUrl = new URL(response.url)
      if (finalUrl.protocol !== 'https:' || finalUrl.username || finalUrl.password || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(finalUrl.hostname)) {
        throw new Error('GitHub redirected the installer to an untrusted location.')
      }
      const hash = createHash('sha256')
      let size = 0
      state = { ...state, totalBytes: asset.size }
      const verify = new Transform({ transform(chunk, _encoding, done) {
        size += chunk.length
        if (size > asset.size) return done(new Error('Installer exceeds the expected download size.'))
        hash.update(chunk)
        state = { ...state, downloadedBytes: size }
        done(null, chunk)
      } })
      await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(partial, { mode: 0o600 }))
      if (size !== asset.size || `sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('Installer verification failed. Nothing was installed. Please download again.')
      await rename(partial, destination)
      artifact = { version, digest: asset.digest, size: asset.size }
      await persist({ phase: 'ready', ...artifact })
      state = { phase: 'ready', version, downloadedBytes: size, totalBytes: size }
    } catch (error) {
      if (partial) await unlink(partial).catch(() => {})
      artifact = null
      await fail(error)
    }
  }
  const schedule = () => {
    clearTimeout(autoTimer)
    if (!autoStarted || !supported) return
    autoTimer = setTimeout(() => { void service.runAutomaticUpdate().finally(schedule) }, settings.intervalSeconds * 1000)
    autoTimer.unref?.()
  }
  const service = {
    async saveSettings(values) {
      await initialized
      if ((values.automaticUpdates !== undefined && typeof values.automaticUpdates !== 'boolean') || (values.intervalSeconds !== undefined && !validInterval(values.intervalSeconds))) throw new Error('Invalid automatic update settings.')
      const task = settingsQueue.then(async () => {
        const next = { ...settings, ...(values.automaticUpdates === undefined ? {} : { automaticUpdates: values.automaticUpdates }), ...(values.intervalSeconds === undefined ? {} : { intervalSeconds: values.intervalSeconds }) }
        await mkdir(directory, { recursive: true })
        await writeFile(`${settingsPath}.tmp`, JSON.stringify(next), 'utf8')
        await rename(`${settingsPath}.tmp`, settingsPath)
        settings = next
        schedule()
        return status()
      })
      settingsQueue = task.catch(() => {})
      return task
    },
    async startAutomaticUpdates() { await initialized; autoStarted = true; schedule() },
    stopAutomaticUpdates() { autoStarted = false; clearTimeout(autoTimer) },
    async runAutomaticUpdate() {
      await initialized
      if (!supported || !settings.automaticUpdates || autoBusy) return status()
      autoBusy = true
      try {
        await service.status()
        if (state.phase === 'installing') return status()
        if (state.phase !== 'ready') {
          const release = await updates.check()
          if (!release.updateAvailable) return status()
          await service.download()
          await downloadTask
        }
        if (settings.automaticUpdates && state.phase === 'ready') await service.install()
      } catch (error) {
        await fail(error)
      } finally { autoBusy = false }
      return status()
    },
    async status() {
      await initialized
      if (state.phase === 'installing') {
        try {
          const saved = JSON.parse((await readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''))
          if (saved.phase === 'error') state = { phase: 'error', error: String(saved.error || 'Installation failed. Please retry.') }
        } catch { /* The detached helper may be writing its status. */ }
      }
      return status()
    },
    async download() {
      await initialized
      if (!supported) throw new Error('In-app installation is available in the installed Windows app. Download the installer instead.')
      if (state.phase === 'downloading' || state.phase === 'installing' || state.phase === 'ready') return status()
      state = { phase: 'downloading', downloadedBytes: 0 }
      downloadTask = download()
      return status()
    },
    async install() {
      await initialized
      if (!supported || state.phase !== 'ready' || !artifact || !newer(artifact.version, currentVersion)) throw new Error('Download and verify the update before installing it.')
      const ready = artifact
      state = { phase: 'installing', version: ready.version }
      try {
        const path = join(directory, `KitchenHub-Setup-${ready.version}.exe`)
        if ((await stat(path)).size !== ready.size || `sha256:${await hashFile(path)}` !== ready.digest) throw new Error('Downloaded installer changed. Download the update again.')
        const helper = join(directory, 'Install-KitchenHubUpdate.ps1')
        await copyFile(helperSource, helper)
        await persist({ phase: 'installing', version: ready.version })
        await launch(helper, ['-InstallerPath', path, '-ExpectedHash', ready.digest.slice(7), '-InstallRoot', installRoot, '-StatePath', statePath, '-Version', ready.version], fail)
        return status()
      } catch (error) {
        artifact = null
        await fail(error)
        throw error
      }
    },
  }
  return service
}
