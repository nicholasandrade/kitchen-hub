import { useEffect, useRef, useState } from 'react'
import { WeatherCard, type WeatherSummary } from '../WeatherCard'
export function LiveWeatherCard() {
  const [weather, setWeather] = useState<WeatherSummary | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  async function refresh() {
    setLoading(true)
    try {
      const response = await fetch('/api/weather', { signal: AbortSignal.timeout(15000) })
      const result = await response.json()
      if (!response.ok || !result.weather) throw new Error('Live weather is temporarily unavailable.')
      if (alive.current) { setWeather(result.weather); setStale(Boolean(result.stale)); setError('') }
    } catch {
      if (alive.current) { setError('Live weather is temporarily unavailable.'); setStale(true) }
    } finally { if (alive.current) setLoading(false) }
  }
  useEffect(() => {
    alive.current = true
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const timer = window.setInterval(() => { void refresh() }, 10 * 60000)
    return () => { alive.current = false; window.clearTimeout(initial); window.clearInterval(timer) }
  }, [])
  if (weather) return <WeatherCard weather={weather} notice={stale ? 'Last reading · refresh unavailable' : undefined} />
  return <section className="weather-card display-panel weather-loading" aria-label="Live weather">
    <p className="eyebrow">Weather</p><strong>{loading ? 'Loading conditions…' : 'Weather unavailable'}</strong>
    {error ? <><p>{error}</p><button onClick={() => void refresh()} disabled={loading}>Try again</button></> : null}
  </section>
}
