export type CalendarEvent = {
  id: string; calendarId: string; calendarName: string; calendarColor?: string
  title: string; start: string; end: string; allDay: boolean
  location: string; description: string; link: string
  cancelled?: boolean; declined?: boolean; holiday?: boolean; eventType?: string
  meetingLinks?: string[]
}
export type DisplayType = 'meeting' | 'reminder' | 'cancelled' | 'standard' | 'all_day'
export type DisplayEvent = CalendarEvent & {
  rawTitle: string; displayTitle: string; displayType: DisplayType
  meetingUrl?: string; meetingPlatform?: 'Microsoft Teams' | 'Google Meet' | 'Zoom'
}

export function meetingLink(event: CalendarEvent) {
  const candidates = [...(event.meetingLinks || []), event.location, event.description]
    .flatMap(value => value.match(/https?:\/\/[^\s<>"']+/gi) || [])
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/, ''))
      if (url.protocol !== 'https:' || url.username || url.password) continue
      const host = url.hostname.toLowerCase()
      const platform: DisplayEvent['meetingPlatform'] = (host === 'teams.microsoft.com' || host === 'teams.live.com') && /^\/(l\/meetup-join|meet)\//.test(url.pathname) ? 'Microsoft Teams'
        : host === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname) ? 'Google Meet'
        : (host === 'zoom.us' || host.endsWith('.zoom.us')) && /^\/(j|my)\//.test(url.pathname) ? 'Zoom' : undefined
      if (platform) return { meetingUrl: url.href, meetingPlatform: platform }
    } catch { /* Ignore non-URL metadata. */ }
  }
  return {}
}

export function presentEvent(event: CalendarEvent): DisplayEvent {
  const cancelled = Boolean(event.cancelled || /^cancel(?:l)?ed:\s*/i.test(event.title))
  const reminder = /^(reminder\s*[-:]|task\s*[-:])/i.test(event.title)
    || event.eventType === 'task' || /\b(reminder|to[- ]?do)\b/i.test(event.title)
  const meeting = meetingLink(event)
  const displayTitle = event.title.replace(/^cancel(?:l)?ed:\s*/i, '').replace(/^(reminder|task)\s*[-:]\s*/i, '')
  const displayType: DisplayType = cancelled ? 'cancelled' : reminder ? 'reminder' : event.allDay ? 'all_day'
    : meeting.meetingUrl || /\b(meeting|appointment|sync|interview|dentist|doctor|review|call)\b/i.test(displayTitle) ? 'meeting' : 'standard'
  return { ...event, ...meeting, cancelled, rawTitle: event.title, displayTitle, displayType }
}

export function nextMeeting(events: DisplayEvent[], now: number) {
  return events.filter(event => !event.cancelled && !event.declined && !event.holiday && !event.allDay
    && event.displayType === 'meeting' && Date.parse(event.end) > now && Number.isFinite(Date.parse(event.start)))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0]
}
export function countdown(event: DisplayEvent, now: number) {
  const start = Date.parse(event.start)
  const end = Date.parse(event.end)
  const active = start <= now && now < end
  const remaining = Math.max(0, Math.ceil(((active ? end : start) - now) / 60000))
  const hours = Math.floor(remaining / 60)
  const value = hours ? `${hours} HR ${String(remaining % 60).padStart(2, '0')} MIN` : `${remaining} MIN`
  return {
    label: active ? remaining <= 5 ? 'Ends in' : 'In progress' : remaining <= 30 ? 'Starts in' : 'Next meeting',
    value: active && remaining > 5 ? 'NOW' : value,
    urgent: remaining <= 5, active,
    canJoin: Boolean(event.meetingUrl && now >= start - 10 * 60000 && now < end),
  }
}

export function homeNextMeeting(today: DisplayEvent[], future: DisplayEvent[], now: number) {
  const current = nextMeeting(today, now)
  return current ? { event: current, future: false } : { event: nextMeeting(future, now), future: true }
}

export function getNextMeetingPresentation(event: DisplayEvent, now: number) {
  const timing = countdown(event, now)
  const start = new Date(event.start)
  const current = new Date(now)
  const minutes = Math.max(0, Math.ceil((start.getTime() - now) / 60000))
  const futureDay = start.toDateString() !== current.toDateString()
  const kind = timing.active ? 'in-progress' : futureDay ? 'future-day' : minutes > 120 ? 'later-today' : minutes > 30 ? 'approaching' : 'imminent'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor(minutes / 60) % 24
  const relative = days ? `${days}D${hours ? ` ${hours}H` : ''}` : timing.value
  const duration = Math.round((Date.parse(event.end) - start.getTime()) / 60000)
  const time = start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})
  const date = futureDay ? start.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'}) : ''
  const ending = Math.max(0,Math.ceil((Date.parse(event.end)-now)/60000))
  return {
    ...timing, kind, compact: kind === 'future-day' || kind === 'later-today',
    label: timing.active ? 'In progress' : kind === 'imminent' ? 'Starts in' : 'Next meeting',
    when: date ? `${date} · ${time}` : time,
    relative: timing.active ? `Ends in ${ending} MIN` : `In ${relative}`,
    duration: Number.isFinite(duration) && duration > 0 ? `${duration} min` : '',
  }
}
