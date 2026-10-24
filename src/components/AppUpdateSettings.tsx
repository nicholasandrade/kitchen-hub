import { useState } from 'react'
import { validUpdateInterval, type AppUpdates } from '../appUpdates'

export function AppUpdateBanner({ updates }: { updates: AppUpdates }) {
  if (!updates.result?.updateAvailable) return null
  return <aside className="app-update-banner" role="status">
    <span>Hub {updates.result.latestVersion} is available.</span>
    <a href={updates.result.releaseUrl} target="_blank" rel="noopener noreferrer">View release</a>
  </aside>
}

export function AppUpdateSettings({ updates }: { updates: AppUpdates }) {
  const [draft, setDraft] = useState(String(updates.intervalSeconds))
  const [saved, setSaved] = useState(false)
  return <div className="connection-settings">
    <div className={`connection-status ${updates.error ? 'error' : updates.checking ? 'loading' : 'connected'}`}>
      <span aria-hidden="true" />
      <div>
        <strong>{updates.result?.updateAvailable ? `Hub ${updates.result.latestVersion} is available` : updates.error ? 'Release check unavailable' : updates.checking ? 'Checking GitHub' : updates.result ? updates.result.latestVersion === null ? 'No published release found' : 'Hub is up to date' : 'Checking for releases'}</strong>
        <p>{updates.error || (updates.result ? `Current version: ${updates.result.currentVersion}. Last checked: ${new Date(updates.result.checkedAt).toLocaleTimeString()}.` : 'Looking for the latest published Hub release.')}</p>
        {updates.result?.updateAvailable ? <a href={updates.result.releaseUrl} target="_blank" rel="noopener noreferrer">View release and installer</a> : null}
      </div>
    </div>
    <form className="connection-form" onSubmit={(event) => { event.preventDefault(); updates.saveInterval(Number(draft)); setSaved(true) }}>
      <label htmlFor="update-interval">Check interval (seconds)</label>
      <input id="update-interval" type="number" min="5" max="86400" step="1" required value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false) }} aria-describedby="update-interval-help" />
      <small id="update-interval-help">Default: 30 seconds. Choose 5–86,400 seconds. Saved for this browser. Hub notifies you when a new release is available; install it from GitHub.</small>
      <button type="submit" disabled={!validUpdateInterval(Number(draft))}>{saved ? 'Saved' : 'Save interval'}</button>
    </form>
    <div className="connection-form"><button type="button" disabled={updates.checking} onClick={() => { void updates.check() }}>{updates.checking ? 'Checking…' : 'Check now'}</button></div>
  </div>
}
