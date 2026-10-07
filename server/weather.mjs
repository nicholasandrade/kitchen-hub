export function condition(code, day) {
  if (code === 0) return { condition: day ? 'Clear' : 'Clear night', icon: day ? 'clear' : 'night-clear' }
  if (code <= 2) return { condition: 'Partly cloudy', icon: day ? 'partly-cloudy' : 'night-cloudy' }
  if (code === 3) return { condition: 'Cloudy', icon: 'cloudy' }
  if (code <= 48) return { condition: 'Fog', icon: 'fog' }
  if (code >= 95) return { condition: 'Thunderstorms', icon: 'storm' }
  if ([71,73,75,77,85,86].includes(code)) return { condition: 'Snow', icon: 'snow' }
  return { condition: 'Rain', icon: 'rain' }
}
export function normalizeWeather(forecast, air, city) {
  const current = forecast.current
  const daily = forecast.daily
  const number = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
  if (!current || !daily || number(current.temperature_2m) === null) throw new Error('Weather provider returned incomplete conditions.')
  const uv = number(daily.uv_index_max?.[0])
  const aqi = number(air?.current?.us_aqi)
  const sunset = daily.sunset?.[0]?.slice(11,16)
  const sunsetHour = sunset ? Number(sunset.slice(0,2)) : null
  return {
    city, ...condition(current.weather_code, current.is_day === 1),
    currentTemp: number(current.temperature_2m), feelsLike: number(current.apparent_temperature),
    highTemp: number(daily.temperature_2m_max?.[0]), lowTemp: number(daily.temperature_2m_min?.[0]),
    humidity: number(current.relative_humidity_2m), precipitationChance: number(daily.precipitation_probability_max?.[0]),
    uvIndex: uv, uvCategory: uv === null ? 'Unavailable' : uv < 3 ? 'Low' : uv < 6 ? 'Moderate' : uv < 8 ? 'High' : uv < 11 ? 'Very high' : 'Extreme',
    aqi, aqiCategory: aqi === null ? 'Unavailable' : aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Sensitive groups' : aqi <= 200 ? 'Unhealthy' : aqi <= 300 ? 'Very unhealthy' : 'Hazardous',
    sunset: sunsetHour === null ? 'Unavailable' : `${sunsetHour % 12 || 12}:${sunset.slice(3)} ${sunsetHour >= 12 ? 'PM' : 'AM'}`,
    updatedAt: new Date().toISOString(), source: 'Open-Meteo · CAMS',
  }
}
export function createWeatherService({ getLocation, fetchImpl = fetch, now = Date.now }) {
  let cache
  let pending
  return async () => {
    const location = getLocation()
    const key = JSON.stringify(location)
    if (cache?.key === key && now() - cache.time < 10 * 60000) return { weather: cache.weather, stale: false }
    if (pending) return pending
    pending = (async () => {
      const get = async url => {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(12000) })
        if (!response.ok) throw new Error('Weather provider is unavailable.')
        return response.json()
      }
      const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), timezone: 'auto', forecast_days: '1' })
      const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
      forecastUrl.search = new URLSearchParams({ ...Object.fromEntries(params), temperature_unit: 'fahrenheit', current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code', daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunset' }).toString()
      const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
      airUrl.search = new URLSearchParams({ ...Object.fromEntries(params), current: 'us_aqi' }).toString()
      try {
        const [forecast, air] = await Promise.all([get(forecastUrl), get(airUrl).catch(() => null)])
        const weather = normalizeWeather(forecast, air, location.city)
        cache = { key, time: now(), weather }
        return { weather, stale: false }
      } catch (error) {
        if (cache?.key === key) return { weather: cache.weather, stale: true }
        throw error
      } finally { pending = undefined }
    })()
    return pending
  }
}
