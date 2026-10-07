import { test, expect } from 'vitest'
import { normalizeWeather, createWeatherService } from './weather.mjs'
const forecast = {current:{temperature_2m:72.4,apparent_temperature:71.6,relative_humidity_2m:52,weather_code:0,is_day:1},daily:{temperature_2m_max:[80],temperature_2m_min:[60],precipitation_probability_max:[20],uv_index_max:[7],sunset:['2026-10-07T18:31']}}
test('weather normalization uses provider data and AQI/UV categories', () => {
  const result = normalizeWeather(forecast,{current:{us_aqi:42}},'City')
  expect(result).toMatchObject({city:'City',currentTemp:72,feelsLike:72,highTemp:80,lowTemp:60,aqi:42,aqiCategory:'Good',uvCategory:'High',sunset:'6:31 PM'})
  expect(normalizeWeather(forecast,null,'City').aqi).toBeNull()
})
test('weather caches requests and preserves real readings on upstream failure', async () => {
  let time = 0, fail = false, calls = 0
  const get = createWeatherService({now:()=>time,getLocation:()=>({city:'City',latitude:34,longitude:-118}),fetchImpl:async url=>{
    calls++
    if(fail) throw new Error('Offline')
    return {ok:true,json:async()=>String(url).includes('air-quality')?{current:{us_aqi:42}}:forecast}
  }})
  expect((await get()).stale).toBe(false)
  await get()
  expect(calls).toBe(2)
  time = 11*60000; fail = true
  expect(await get()).toMatchObject({stale:true,weather:{currentTemp:72}})
})
test('first weather failure rejects instead of producing demo readings', async () => {
  const get = createWeatherService({getLocation:()=>({city:'City',latitude:34,longitude:-118}),fetchImpl:async()=>{throw new Error('Offline')}})
  await expect(get()).rejects.toThrow('Offline')
})
