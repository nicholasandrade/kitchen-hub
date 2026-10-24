import { useState } from 'react'
import { validUpdateInterval, type AppUpdates } from '../appUpdates'

function UpdateAction({ updates }: { updates: AppUpdates }) {
  const status = updates.installStatus
  if (!status) return <p role="status">Checking installer availability…</p>
  if (!status.supported) return updates.result?.installerUrl
    ? <a href={updates.result.installerUrl}>Download installer</a>
    : <a href={updates.result?.releaseUrl} target="_blank" rel="noopener noreferrer">View release</a>
  if (status.phase === 'downloading') {
    const downloaded = Math.max(0, status.downloadedBytes || 0)
    const total = status.totalBytes && status.totalBytes > 0 ? status.totalBytes : undefined
    const percent = total ? Math.min(100, Math.round(downloaded / total * 100)) : undefined
    return <div role="status">
      <p>Downloading update: {downloaded.toLocaleString()} bytes{total ? ` of ${total.toLocaleString()} bytes (${percent}%)` : ''}</p>
      <progress aria-label="Update download progress" max={100} value={percent} />
    </div>
  }
  if (status.phase === 'installing') return <p role="status">Installing update. Hub is restarting and will reconnect automatically…</p>
  if (status.automaticUpdates && status.phase !== 'error') return <p role="status">Automatic update scheduled. Hub will download, install, and restart automatically. Your data is preserved.</p>
  return <div>
    {status.phase === 'error' ? <p role="alert">{status.error || 'Update failed. Please retry.'}</p> : null}
    <p>Installing closes and reopens Hub. Your data is preserved.</p>
    <button type="button" disabled={updates.actionPending} onClick={() => { void (status.phase === 'ready' ? updates.install() : updates.download()) }}>
      {updates.actionPending ? 'Starting…' : status.phase === 'ready' ? 'Install and restart' : status.phase === 'error' ? 'Retry download' : 'Download update'}
    </button>
  </div>
}

export function AppUpdateBanner({ updates }: { updates: AppUpdates }) {
  const phase = updates.installStatus?.phase
  const activeInstall = ['downloading', 'ready', 'installing'].includes(phase || '')
  if (!updates.result?.updateAvailable && !activeInstall) return null
  const version = activeInstall ? updates.installStatus?.version : updates.result?.latestVersion
  return <aside className="app-update-banner" role="status">
    <span>{version ? `Hub ${version} is available.` : 'Hub update in progress.'}</span>
    <UpdateAction updates={updates} />
  </aside>
}

export function AppUpdateSettings({ updates }: { updates: AppUpdates }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const intervalDraft = draft ?? String(updates.intervalSeconds)
  return <div className="connection-settings">
    <div className={`connection-status ${updates.error ? 'error' : updates.checking ? 'loading' : 'connected'}`}>
      <span aria-hidden="true" />
      <div>
        <strong>{updates.result?.updateAvailable ? `Hub ${updates.result.latestVersion} is available` : updates.error ? 'Release check unavailable' : updates.checking ? 'Checking GitHub' : updates.result ? updates.result.latestVersion === null ? 'No published release found' : 'Hub is up to date' : 'Checking for releases'}</strong>
        <p>{updates.error || (updates.result ? `Current version: ${updates.result.currentVersion}. Last checked: ${new Date(updates.result.checkedAt).toLocaleTimeString()}.` : 'Looking for the latest published Hub release.')}</p>
        {updates.result?.updateAvailable || ['downloading', 'ready', 'installing'].includes(updates.installStatus?.phase || '') ? <UpdateAction updates={updates} /> : null}
      </div>
    </div>
    <div className="connection-form">
      <label htmlFor="automatic-updates"><input id="automatic-updates" type="checkbox" checked={updates.installStatus?.automaticUpdates ?? true} disabled={!updates.installStatus || updates.settingsPending} onChange={(event) => { void updates.setAutomaticUpdates(event.target.checked) }} aria-describedby="automatic-updates-help" /> Install updates automatically</label>
      <small id="automatic-updates-help">On by default. Hub downloads and installs updates, then closes and reopens automatically. Your data is preserved. Turn this off to download and install updates manually.</small>
      {updates.settingsError ? <p role="alert">{updates.settingsError}</p> : null}
    </div>
    <form className="connection-form" onSubmit={async (event) => { event.preventDefault(); if (await updates.saveInterval(Number(intervalDraft))) { setSaved(true); setDraft(null) } }}>
      <label htmlFor="update-interval">Check interval (seconds)</label>
      <input id="update-interval" type="number" min="5" max="86400" step="1" required value={intervalDraft} onChange={(event) => { setDraft(event.target.value); setSaved(false) }} aria-describedby="update-interval-help" />
      <small id="update-interval-help">Default: 30 seconds. Choose 5–86,400 seconds. Saved on Hub and in this browser. Hub checks for updates at this interval.</small>
      <button type="submit" disabled={!updates.installStatus || updates.settingsPending || !validUpdateInterval(Number(intervalDraft))}>{saved ? 'Saved' : updates.settingsPending ? 'Saving…' : 'Save interval'}</button>
    </form>
    <div className="connection-form"><button type="button" disabled={updates.checking} onClick={() => { void updates.check() }}>{updates.checking ? 'Checking…' : 'Check now'}</button></div>
  </div>
}
