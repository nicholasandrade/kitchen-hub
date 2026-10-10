import type { CSSProperties } from 'react'
export type WeatherSummary = {
  city: string; condition: string; currentTemp: number; highTemp: number | null; lowTemp: number | null
  feelsLike: number | null; humidity: number | null; precipitationChance: number | null; uvIndex: number | null
  uvCategory: string; aqi: number | null; aqiCategory: string; sunset: string; icon?: string
}
export type WeatherVisual = { imageUrl?: string; overlay?: string; fallback?: string }
type MetricProps = { label: string; value: string | number; icon: string; detail?: string; severity?: string }
function WeatherMetric({ label, value, icon, detail, severity }: MetricProps) {
  return <div className={`weather-metric${severity ? ` is-${severity}` : ''}`}>
    <span className="weather-metric-label"><i aria-hidden="true">{icon}</i>{label}</span>
    <strong>{value}</strong>{detail ? <small>{detail}</small> : null}
  </div>
}
function WeatherGlyph({ icon = 'clear' }: { icon?: string }) {
  const cloudy = /cloud|rain|storm|fog|snow/.test(icon)
  return <span className="weather-glyph" role="img" aria-label={`${icon} weather`}>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {cloudy ? <><path d="M12 34h25a8 8 0 0 0 0-16 12 12 0 0 0-23-3 10 10 0 0 0-2 19Z" />{/rain|storm/.test(icon) ? <path d="m17 39-2 5m11-5-2 5m11-5-2 5" /> : null}</>
        : icon.includes('night') ? <path d="M34 36A17 17 0 0 1 19 8a17 17 0 1 0 15 28Z" />
        : <><circle cx="24" cy="24" r="8" /><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M37.4 10.6l-4.2 4.2M14.8 33.2l-4.2 4.2" /></>}
    </svg>
  </span>
}
export function WeatherCard({ weather, visual = {}, notice }: { weather: WeatherSummary; visual?: WeatherVisual; notice?: string }) {
  const value = (number: number | null, suffix = '') => number === null ? '—' : `${number}${suffix}`
  const style = {
    '--weather-image': visual.imageUrl ? `url(${JSON.stringify(visual.imageUrl)})` : 'none',
    '--weather-overlay': visual.overlay,
    '--weather-fallback': visual.fallback,
  } as CSSProperties
  return <section className={`weather-card display-panel${visual.imageUrl ? ' has-image' : ''}`} style={style} aria-label={`Weather in ${weather.city}`}>
    <div className="weather-hero">
      <div className="weather-heading"><div><p className="eyebrow">{weather.city}</p><span className="weather-condition">{weather.condition}</span></div><div className="weather-header-controls"><WeatherGlyph icon={weather.icon} /><details className="weather-info"><summary aria-label="Weather data information">ⓘ</summary><div>Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noopener noreferrer">CAMS</a> · CC BY 4.0. UV and rain chance are daily forecasts. Sunset is today’s recorded forecast time, including after it has passed.</div></details></div></div>
      <div className="weather-primary"><strong>{weather.currentTemp}°</strong><span><b>H {value(weather.highTemp, '°')}</b><b>L {value(weather.lowTemp, '°')}</b></span></div>
    </div>
    <div className="weather-metrics">
      <WeatherMetric label="AQI" icon="≋" value={value(weather.aqi)} detail={weather.aqiCategory} severity={weather.aqi === null ? undefined : weather.aqi <= 50 ? 'positive' : weather.aqi <= 100 ? 'caution' : 'warning'} />
      <WeatherMetric label="Peak UV" icon="☼" value={value(weather.uvIndex)} detail={weather.uvCategory} severity={weather.uvIndex === null ? undefined : weather.uvIndex < 3 ? 'positive' : weather.uvIndex < 6 ? 'caution' : 'warning'} />
      <WeatherMetric label="Rain chance" icon="☂" value={value(weather.precipitationChance, '%')} severity="water" />
      <WeatherMetric label="Humidity" icon="◒" value={value(weather.humidity, '%')} severity="water" />
      <WeatherMetric label="Feels like" icon="≈" value={value(weather.feelsLike, '°')} />
      <WeatherMetric label="Today’s sunset" icon="☷" value={weather.sunset} />
    </div>
    {notice ? <p className="weather-notice" role="status">{notice}</p> : null}
  </section>
}
