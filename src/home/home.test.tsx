import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WeatherCard } from '../WeatherCard'
import { CalendarAgenda } from './CalendarAgenda'
import { presentEvent, nextMeeting, homeNextMeeting, countdown, getNextMeetingPresentation, type CalendarEvent } from './calendarPresentation'

const now = Date.parse('2026-10-07T13:18:00-07:00')
const event = (title: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'work:1', calendarId: 'work', calendarName: 'NIH Calendar', title,
  start: '2026-10-07T14:00:00-07:00', end: '2026-10-07T15:00:00-07:00',
  allDay: false, location: '', description: '', link: '', ...extra,
})
describe('calendar presentation', () => {
  test('normalizes prefixes without losing raw title or identity', () => {
    for (const title of ['Canceled: Team review', 'Cancelled: Team review']) {
      const displayed = presentEvent(event(title))
      expect(displayed.displayType).toBe('cancelled')
      expect(displayed.displayTitle).toBe('Team review')
      expect(displayed.rawTitle).toBe(title)
    }
    for (const title of ['Reminder - Submit draft', 'Reminder: Submit draft']) {
      expect(presentEvent(event(title)).displayTitle).toBe('Submit draft')
      expect(presentEvent(event(title)).displayType).toBe('reminder')
    }
  })
  test('selects the next genuine meeting, excluding cancellations, reminders, declines, holidays and all-day', () => {
    const events = [event('Canceled: Meeting'), event('Reminder - Meeting'), event('Meeting', {declined:true}), event('Meeting', {holiday:true}), event('Meeting', {allDay:true}), event('Team Meeting', {id:'work:valid'})].map(presentEvent)
    expect(nextMeeting(events, now)?.id).toBe('work:valid')
    expect(countdown(nextMeeting(events, now)!, now).value).toBe('42 MIN')
    expect(nextMeeting(events, now + 2 * 3600000)).toBeUndefined()
  })
  test('recognizes actual Teams, Meet and Zoom URLs and rejects lookalike hosts', () => {
    for (const [url, platform] of [['https://teams.microsoft.com/l/meetup-join/123', 'Microsoft Teams'], ['https://meet.google.com/abc-defg-hij', 'Google Meet'], ['https://us02web.zoom.us/j/123', 'Zoom']]) {
      expect(presentEvent(event('Review', {meetingLinks:[url]})).meetingPlatform).toBe(platform)
    }
    expect(presentEvent(event('Zoom Teams Meet', { description: 'https://zoom.us.evil.test/j/123' })).meetingUrl).toBeUndefined()
  })
  test('join timing, proximity, active and ending states derive from timestamps', () => {
    const meeting = presentEvent(event('Meeting', {meetingLinks:['https://meet.google.com/abc-defg-hij']}))
    expect(countdown(meeting, now).canJoin).toBe(false)
    expect(countdown(meeting, Date.parse(meeting.start)-600000).canJoin).toBe(true)
    expect(countdown(meeting, Date.parse(meeting.start)-180000).label).toBe('Starts in')
    expect(countdown(meeting, Date.parse(meeting.start)+60000).label).toBe('In progress')
    expect(countdown(meeting, Date.parse(meeting.end)-240000).label).toBe('Ends in')
    expect(countdown(meeting, Date.parse(meeting.end)).canJoin).toBe(false)
    expect(countdown(meeting, now+60000).value).toBe('41 MIN')
  })
  test('agenda hides calendar sources while preserving full titles and all-day metadata', () => {
    const title = 'TWICE Resource: Speaker Repository and Tracking System Report Review'
    const html = renderToStaticMarkup(<CalendarAgenda events={[event(title), event('Holiday', { id:'personal:1', calendarName:'Personal', allDay:true, start:'2026-10-07', end:'2026-10-08' })]} />)
    expect(html).toContain(title)
    expect(html).not.toContain('NIH Calendar')
    expect(html).toContain('All day')
    expect(html).not.toContain('Personal')
  })
})
test('weather renders all real supplied metrics, visual overrides, and missing readings honestly', () => {
  const weather = { city:'Los Angeles', condition:'Clear', currentTemp:78, highTemp:84, lowTemp:66, feelsLike:79, humidity:48, precipitationChance:10, uvIndex:6, uvCategory:'High', aqi:42, aqiCategory:'Good', sunset:'6:31 PM' }
  const html = renderToStaticMarkup(<WeatherCard weather={weather} />)
  for (const text of ['78', 'H ', '84', 'L ', '66', 'Good', 'High', '10%', '48%', '79°', '6:31 PM']) expect(html).toContain(text)
  expect(html).toContain('--weather-image:none')
  const visual = renderToStaticMarkup(<WeatherCard weather={weather} visual={{imageUrl:'/weather/rain.jpg',fallback:'linear-gradient(black,gray)'}} />)
  expect(visual).toContain('/weather/rain.jpg')
  expect(visual).toContain('has-image')
  expect(visual).toContain('linear-gradient(black,gray)')
  expect(renderToStaticMarkup(<WeatherCard weather={{...weather, aqi:null, aqiCategory:'Unavailable'}} />)).toContain('Unavailable')
})

test('the next future meeting is shown after today has no eligible meetings', () => {
  const today = presentEvent(event('Team Meeting'))
  const tomorrow = presentEvent(event('Tomorrow Meeting', {id:'work:tomorrow',start:'2026-10-19T10:00:00-07:00',end:'2026-10-19T11:00:00-07:00'}))
  expect(homeNextMeeting([today], [tomorrow], now)).toEqual({event:today,future:false})
  expect(homeNextMeeting([today], [tomorrow], Date.parse(today.end))).toEqual({event:tomorrow,future:true})
  expect(homeNextMeeting([presentEvent(event('Canceled: Meeting'))], [tomorrow], now).event).toBe(tomorrow)
  expect(homeNextMeeting([], [presentEvent({...tomorrow,cancelled:true})], now).event).toBeUndefined()
  const html = renderToStaticMarkup(<CalendarAgenda events={[]} futureEvents={[tomorrow]} />)
  expect(html).toContain('Next meeting')
  expect(html).not.toContain('No more meetings today')
  expect(html).not.toContain('Join ↗')
})
test('meeting strip adapts to proximity without changing Join timing', () => {
  const meeting = presentEvent(event('Meeting',{meetingLinks:['https://meet.google.com/abc-defg-hij']}))
  const start = Date.parse(meeting.start)
  for (const [minutes, kind] of [[150,'later-today'],[47,'approaching'],[12,'imminent'],[3,'imminent']] as const) {
    const state = getNextMeetingPresentation(meeting,start-minutes*60000)
    expect(state.kind).toBe(kind)
    expect(state.compact).toBe(minutes>120)
    expect(state.canJoin).toBe(minutes<=10)
  }
  const active = getNextMeetingPresentation(meeting,start+22*60000)
  expect(active.kind).toBe('in-progress')
  expect(active.relative).toBe('Ends in 38 MIN')
  const future = getNextMeetingPresentation(meeting,start-(24+18)*3600000)
  expect(future.kind).toBe('future-day')
  expect(future.relative).toBe('In 1D 18H')
  expect(future.duration).toBe('60 min')
})