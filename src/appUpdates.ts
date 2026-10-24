import { useEffect, useRef, useState } from 'react'

export const UPDATE_INTERVAL_KEY = 'kitchen-hub:update-interval-seconds'
export const validUpdateInterval = (value: number) => Number.isInteger(value) && value >= 5 && value <= 86400
export type ReleaseCheck = { currentVersion: string; latestVersion: string | null; updateAvailable: boolean; releaseUrl: string; installerUrl: string | null; checkedAt: string }
export type InstallStatus = { supported: boolean; automaticUpdates: boolean; intervalSeconds: number; phase: 'idle' | 'downloading' | 'ready' | 'installing' | 'error'; currentVersion?: string; version?: string; downloadedBytes?: number; totalBytes?: number; error?: string }

export function reconcileInstallation(status: InstallStatus, target: string | null, idlePolls = 0) {
  if (!target || status.phase === 'error' || (status.phase === 'ready' && status.version === target)) {
    return { target: null, idlePolls: 0, status }
  }
  const nextIdlePolls = status.phase === 'idle' && status.currentVersion !== target ? idlePolls + 1 : 0
  if (nextIdlePolls >= 3) {
    return { target: null, idlePolls: 0, status: { ...status, phase: 'error' as const, error: 'Installation did not start. Please retry.' } }
  }
  return { target, idlePolls: nextIdlePolls, status: null }
}

export function startUpdatePolling(check: () => void, seconds: number) {
  const initial = setTimeout(check, 0)
  const timer = setInterval(check, seconds * 1000)
  return () => { clearTimeout(initial); clearInterval(timer) }
}

export function useAppUpdates() {
  const [intervalSeconds, setIntervalSeconds] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(UPDATE_INTERVAL_KEY))
      return validUpdateInterval(saved) ? saved : 30
    } catch { return 30 }
  })
  const [result, setResult] = useState<ReleaseCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [settingsPending, setSettingsPending] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const settingsRef = useRef(false)
  const actionRef = useRef(false)
  const actionFailure = useRef(false)
  const installingVersion = useRef<string | null>(null)
  const installIdlePolls = useRef(0)
  const loadedVersion = useRef<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const applyStatus = (status: InstallStatus) => {
    setInstallStatus(status)
    if (validUpdateInterval(status.intervalSeconds)) {
      setIntervalSeconds(status.intervalSeconds)
      try { localStorage.setItem(UPDATE_INTERVAL_KEY, String(status.intervalSeconds)) } catch { /* Keep the setting for this session. */ }
    }
  }

  const check = async () => {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    setChecking(true)
    try {
      const response = await fetch('/api/updates', { cache: 'no-store', signal: controller.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Release check failed.')
      if (requestRef.current !== controller) return
      if (loadedVersion.current && loadedVersion.current !== data.currentVersion) window.location.reload()
      loadedVersion.current = data.currentVersion
      setResult(data as ReleaseCheck)
      setError('')
    } catch (cause) {
      if (requestRef.current !== controller) return
      setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Release check timed out. Retrying automatically.')
    } finally {
      window.clearTimeout(timeout)
      if (requestRef.current === controller) {
        requestRef.current = null
        setChecking(false)
      }
    }
  }

  useEffect(() => {
    const stop = startUpdatePolling(() => { void check() }, intervalSeconds)
    return () => {
      stop()
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [intervalSeconds])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | null = null
    const poll = async () => {
      controller = new AbortController()
      const timeout = window.setTimeout(() => controller?.abort(), 10000)
      try {
        const response = await fetch('/api/updates/install-status', { cache: 'no-store', signal: controller.signal })
        const data = await response.json() as InstallStatus
        if (!response.ok) throw new Error(data.error || 'Unable to check update download.')
        if (stopped || settingsRef.current || actionRef.current || (actionFailure.current && data.phase === 'idle')) return
        if (data.currentVersion) {
          if ((loadedVersion.current && loadedVersion.current !== data.currentVersion) || installingVersion.current === data.currentVersion) {
            window.location.reload()
          }
          loadedVersion.current = data.currentVersion
        }
        const reconciled = reconcileInstallation(data, installingVersion.current, installIdlePolls.current)
        installingVersion.current = reconciled.target
        installIdlePolls.current = reconciled.idlePolls
        if (reconciled.status) {
          if (reconciled.status.phase === 'error' && data.phase === 'idle') actionFailure.current = true
          installingVersion.current = reconciled.status.phase === 'installing' ? reconciled.status.version || null : null
          applyStatus(reconciled.status)
        }
      } catch {
        // Keep progress visible through the expected connection gap during restart.
      } finally {
        window.clearTimeout(timeout)
        if (!stopped) timer = setTimeout(() => { void poll() }, 1500)
      }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer); controller?.abort() }
  }, [])

  const runUpdateAction = async (action: 'download' | 'install') => {
    if (actionRef.current || !installStatus?.supported || installStatus.phase === 'downloading' || installStatus.phase === 'installing') return
    if (action === 'install' && installStatus.phase !== 'ready') return
    actionRef.current = true
    actionFailure.current = false
    setActionPending(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    const version = installStatus.version || result?.latestVersion || undefined
    if (action === 'install') {
      installIdlePolls.current = 0
      installingVersion.current = version || null
      setInstallStatus({ ...installStatus, phase: 'installing', version })
    }
    try {
      const response = await fetch(`/api/updates/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal })
      const data = await response.json() as InstallStatus
      if (!response.ok) {
        installingVersion.current = null
        throw new Error(data.error || `Unable to ${action} update.`)
      }
      setInstallStatus(data)
    } catch (cause) {
      if (action !== 'install' || !installingVersion.current) {
        actionFailure.current = true
        setInstallStatus({ ...installStatus, phase: 'error', error: cause instanceof Error ? cause.message : 'Update failed. Please retry.' })
      }
    } finally {
      window.clearTimeout(timeout)
      actionRef.current = false
      setActionPending(false)
    }
  }

  const saveSettings = async (settings: { automaticUpdates?: boolean; intervalSeconds?: number }) => {
    if (!installStatus || settingsRef.current) return false
    settingsRef.current = true
    setSettingsPending(true)
    setSettingsError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch('/api/updates/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings), signal: controller.signal })
      const data = await response.json() as InstallStatus
      if (!response.ok) throw new Error(data.error || 'Unable to save update settings. Please retry.')
      applyStatus(data)
      return true
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : 'Unable to save update settings. Please retry.')
      return false
    } finally {
      window.clearTimeout(timeout)
      settingsRef.current = false
      setSettingsPending(false)
    }
  }
  const saveInterval = (seconds: number) => validUpdateInterval(seconds) ? saveSettings({ intervalSeconds: seconds }) : Promise.resolve(false)
  return { intervalSeconds, saveInterval, result, checking, error, check, installStatus, actionPending, settingsPending, settingsError, setAutomaticUpdates: (automaticUpdates: boolean) => saveSettings({ automaticUpdates }), download: () => runUpdateAction('download'), install: () => runUpdateAction('install') }
}

export type AppUpdates = ReturnType<typeof useAppUpdates>
