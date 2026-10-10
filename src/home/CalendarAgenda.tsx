import { useEffect, useMemo, useState } from 'react'
import { agendaForNextMeeting, getNextMeetingPresentation, homeNextMeeting, presentEvent, type CalendarEvent, type DisplayEvent } from './calendarPresentation'

function time(event: DisplayEvent) {
  return event.allDay ? 'All day' : new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function AgendaTime({ event }: { event: DisplayEvent }) {
  const parts = event.allDay ? [] : new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(event.start))
  return <time dateTime={event.start} aria-label={time(event)}>
    <span>{event.allDay ? 'All day' : parts.filter(part => part.type !== 'dayPeriod').map(part => part.value).join('').trim()}</span>
    {parts.some(part => part.type === 'dayPeriod') ? <span className="agenda-period">{parts.find(part => part.type === 'dayPeriod')?.value}</span> : null}
  </time>
}
function AgendaIcon({ bell = false }: { bell?: boolean }) {
  return <svg className="agenda-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    {bell ? <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></> : <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6m10-6v6M3 11h18" /></>}
  </svg>
}
export function CalendarAgenda({ events, futureEvents = [] }: { events: CalendarEvent[]; futureEvents?: CalendarEvent[] }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const interval = window.setInterval(tick, 15000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [])
  const displayed = useMemo(() => events.map(presentEvent), [events])
  const futureDisplayed = useMemo(() => futureEvents.map(presentEvent), [futureEvents])
  const next = homeNextMeeting(displayed, futureDisplayed, now)
  const agenda = agendaForNextMeeting([...displayed, ...futureDisplayed], now)
  const upcoming = next.event
  const state = upcoming ? getNextMeetingPresentation(upcoming, now) : null
  const todayHasRemaining = displayed.some(event => !event.cancelled && !event.declined && new Date(event.allDay ? `${event.end}T00:00:00` : event.end).getTime() > now)
  return <div className="calendar-agenda">
    {!todayHasRemaining ? <p className="calendar-day-status">Nothing else scheduled today.</p> : null}
    {upcoming && state ? <section className={`next-meeting meeting-strip is-${state.kind}${state.compact ? ' is-compact' : ''}${state.urgent ? ' is-urgent' : ''}${state.active ? ' is-active' : ''}`} aria-label="Up next">
      <div className="meeting-strip-summary">
        <div className="meeting-strip-heading"><p className="eyebrow">{state.active ? 'Ends in' : state.label}</p><span>{state.when}{state.duration ? ` | ${state.duration}` : ''}</span></div>
        <div className="meeting-strip-title"><h3>{upcoming.displayTitle}</h3></div>
      </div>
      <strong className="meeting-strip-relative">{state.active ? state.relative.replace('Ends in ', '') : state.compact ? state.relative : state.value}</strong>
      {state.canJoin ? <a className="meeting-join" href={upcoming.meetingUrl} target="_blank" rel="noopener noreferrer">Join ↗</a> : null}
    </section> : null}
    {agenda.events.length ? <><p className="agenda-label eyebrow">{agenda.date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} agenda</p>
    <ol className="calendar-events">
      {agenda.events.map(event => <li key={event.id} className={`agenda-event is-${event.displayType}${event.declined ? ' is-declined' : ''}`}>
        <AgendaTime event={event} />
        <span className="agenda-event-detail">
          {event.displayType === 'cancelled' ? <span className="event-badge is-cancelled">⊘ Cancelled</span>
            : event.declined ? <span className="event-badge">Declined</span>
            : event.displayType === 'reminder' ? <span className="event-badge is-reminder"><AgendaIcon bell />Reminder</span>
            : event.allDay ? <span className="event-badge">All day</span> : null}
          <strong>{event.displayTitle}</strong>
          {event.location && !event.meetingPlatform && !/https?:\/\//i.test(event.location) ? <small>{event.location}</small> : null}
        </span>
      </li>)}
    </ol></> : null}
  </div>
}
