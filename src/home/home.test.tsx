import { cookingProgress } from './cookingProgress'
import { describe, test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WeatherCard } from '../WeatherCard'
import { CalendarAgenda } from './CalendarAgenda'
import { agendaForNextMeeting, presentEvent, nextMeeting, homeNextMeeting, countdown, getNextMeetingPresentation, type CalendarEvent } from './calendarPresentation'

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
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const title = 'TWICE Resource: Speaker Repository and Tracking System Report Review'
    const html = renderToStaticMarkup(<CalendarAgenda events={[event(title), event('Holiday', { id:'personal:1', calendarName:'Personal', allDay:true, start:'2026-10-07', end:'2026-10-08' })]} />)
    clock.mockRestore()
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
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const html = renderToStaticMarkup(<CalendarAgenda events={[]} futureEvents={[tomorrow]} />)
  clock.mockRestore()
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
test('agenda advances to the next meeting day and includes that whole day', () => {
  const finished = presentEvent(event('Friday meeting', {start:'2026-10-09T09:00:00-07:00',end:'2026-10-09T10:00:00-07:00'}))
  const upcoming = presentEvent(event('Tuesday Meeting',{id:'work:tue',start:'2026-10-13T09:00:00-07:00',end:'2026-10-13T10:00:00-07:00'}))
  const reminder = presentEvent(event('Reminder - Tuesday task',{id:'work:task',start:'2026-10-13T08:00:00-07:00',end:'2026-10-13T08:30:00-07:00'}))
  const allDay = presentEvent(event('Tuesday all day',{id:'work:all',allDay:true,start:'2026-10-13',end:'2026-10-14'}))
  const later = presentEvent(event('Wednesday Meeting',{id:'work:wed',start:'2026-10-14T09:00:00-07:00',end:'2026-10-14T10:00:00-07:00'}))
  const events = [finished,upcoming,reminder,allDay,later]
  const result = agendaForNextMeeting(events,Date.parse('2026-10-09T20:00:00-07:00'))
  expect(result.events.map(event=>event.id)).toEqual([allDay.id,reminder.id])
  expect(agendaForNextMeeting(events,Date.parse(finished.start)).events).toEqual([])
  expect(agendaForNextMeeting([],now).events).toEqual([])
})
test('task-like preparation stays a reminder and featured identity is omitted only once', () => {
 const task = presentEvent(event('Submit items for discussion during weekly meeting'))
 expect(task.displayType).toBe('reminder')
 const first = presentEvent(event('Meeting', {id:'same',calendarId:'work'}))
 const other = presentEvent(event('Meeting', {id:'same',calendarId:'personal'}))
 expect(agendaForNextMeeting([first,other,task],now).events).toEqual([other,task])
})
test('featured title occurs once and no duplicate empty message is rendered', () => {
 const clock = vi.spyOn(Date,'now').mockReturnValue(now)
 const html = renderToStaticMarkup(<CalendarAgenda events={[event('Unique meeting')]} />)
 expect(html.split('Unique meeting')).toHaveLength(2)
 expect(html).not.toContain('No more meetings today')
 const empty = renderToStaticMarkup(<CalendarAgenda events={[]} />)
 expect(empty).toContain('Nothing else scheduled today.')
 expect(empty).not.toContain('agenda-label')
 clock.mockRestore()
})

test('cooking progress is step position with safe bounds', () => {
 expect(cookingProgress(0,11)).toBeCloseTo(100/11)
 expect(cookingProgress(10,11)).toBe(100)
 expect(cookingProgress(0,0)).toBe(0)
 expect(cookingProgress(20,11)).toBe(100)
})
test('weather context is accessible and stale notice remains visible', () => {
 const weather = {city:'LA',condition:'Clear',currentTemp:70,highTemp:80,lowTemp:60,feelsLike:70,humidity:50,precipitationChance:0,uvIndex:6,uvCategory:'High',aqi:30,aqiCategory:'Good',sunset:'6:30 PM'}
 const html = renderToStaticMarkup(<WeatherCard weather={weather} notice="Last reading · refresh unavailable" />)
 expect(html).toContain('Weather data information')
 expect(html).toContain('Last reading')
 expect(html).not.toContain('weather-attribution')
 expect(html).toContain('Peak UV')
 expect(html).toContain('Rain chance')
})

test('today keeps remaining reminders even when the featured meeting is on another day', () => {
 const reminder = presentEvent(event('Reminder - Send draft'))
 const future = presentEvent(event('Meeting',{id:'future',start:'2026-10-13T09:00:00-07:00',end:'2026-10-13T10:00:00-07:00'}))
 expect(agendaForNextMeeting([reminder,future],now).events).toEqual([reminder])
})
test('imminent, active and distant meetings retain one large countdown and Join timing', () => {
 const meeting = event('A long discussion title about next week’s team planning and priorities',{meetingLinks:['https://meet.google.com/abc-defg-hij']})
 const start = Date.parse(meeting.start)
 for (const offset of [-3*86400000,-3*60000,22*60000]) {
  const clock=vi.spyOn(Date,'now').mockReturnValue(start+offset)
  const html=renderToStaticMarkup(<CalendarAgenda events={[meeting]} />)
  expect(html).toContain('meeting-strip-relative')
  expect(html.includes('Join ↗')).toBe(offset>=-600000)
  expect(html.split(meeting.title)).toHaveLength(2)
  clock.mockRestore()
 }
})
