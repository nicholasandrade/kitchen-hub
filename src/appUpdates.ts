import { useEffect, useRef, useState } from 'react'

export const UPDATE_INTERVAL_KEY = 'kitchen-hub:update-interval-seconds'
export const validUpdateInterval = (value: number) => Number.isInteger(value) && value >= 5 && value <= 86400
export type ReleaseCheck = { currentVersion: string; latestVersion: string | null; updateAvailable: boolean; releaseUrl: string; checkedAt: string }

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
  const requestRef = useRef<AbortController | null>(null)

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

  const saveInterval = (seconds: number) => {
    if (!validUpdateInterval(seconds)) return
    try { localStorage.setItem(UPDATE_INTERVAL_KEY, String(seconds)) } catch { /* Keep the setting for this session. */ }
    setIntervalSeconds(seconds)
  }
  return { intervalSeconds, saveInterval, result, checking, error, check }
}

export type AppUpdates = ReturnType<typeof useAppUpdates>
