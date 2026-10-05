export type WeatherSummary = {
  city: string
  condition: string
  currentTemp: number
  highTemp: number
  lowTemp: number
  feelsLike: number
  humidity: number
  precipitationChance: number
  uvIndex: number
  uvCategory: string
  aqi: number
  aqiCategory: string
  sunset: string
  icon?: string
}

type WeatherMetricProps = {
  label: string
  value: string | number
  detail?: string
  severity?: 'positive' | 'caution' | 'warning'
}

function WeatherMetric({ label, value, detail, severity }: WeatherMetricProps) {
  return (
    <div className={`weather-metric${severity ? ` is-${severity}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  )
}

function WeatherGlyph({ icon = 'clear' }: { icon?: string }) {
  return (
    <span className="weather-glyph" role="img" aria-label={`${icon} weather`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="8" />
        <path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M37.4 10.6l-4.2 4.2M14.8 33.2l-4.2 4.2" />
      </svg>
    </span>
  )
}

function aqiSeverity(aqi: number): WeatherMetricProps['severity'] {
  if (aqi <= 50) return 'positive'
  if (aqi <= 100) return 'caution'
  return 'warning'
}

function uvSeverity(uvIndex: number): WeatherMetricProps['severity'] {
  if (uvIndex < 3) return 'positive'
  if (uvIndex < 6) return 'caution'
  return 'warning'
}

export function WeatherCard({ weather }: { weather: WeatherSummary }) {
  return (
    <section className="weather-card" aria-label={`Weather in ${weather.city}`}>
      <div className="weather-heading">
        <div>
          <p className="eyebrow">{weather.city}</p>
          <span className="weather-condition">{weather.condition}</span>
        </div>
        <WeatherGlyph icon={weather.icon} />
      </div>

      <div className="weather-primary">
        <strong>{weather.currentTemp}°</strong>
        <span><b>H {weather.highTemp}°</b><i aria-hidden="true">·</i><b>L {weather.lowTemp}°</b></span>
      </div>

      <div className="weather-metrics">
        <WeatherMetric label="AQI" value={weather.aqi} detail={weather.aqiCategory} severity={aqiSeverity(weather.aqi)} />
        <WeatherMetric label="UV" value={weather.uvIndex} detail={weather.uvCategory} severity={uvSeverity(weather.uvIndex)} />
        <WeatherMetric label="Rain" value={`${weather.precipitationChance}%`} />
        <WeatherMetric label="Humidity" value={`${weather.humidity}%`} />
      </div>

      <p className="weather-footer">Feels like {weather.feelsLike}° <span aria-hidden="true">·</span> Sunset {weather.sunset}</p>
    </section>
  )
}
