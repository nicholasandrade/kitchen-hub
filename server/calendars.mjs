import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export function createCalendarStore({ selectionPath, getAccessToken, fetchImpl = fetch }) {
  let selections = null
  let saveQueue = Promise.resolve()
  const loadSelections = async () => {
    if (selections) return selections
    try { selections = JSON.parse(await readFile(selectionPath, 'utf8')) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      selections = {}
    }
    return selections
  }
  const pages = async (path, params, token) => {
    const items = []
    let pageToken
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`)
      url.search = new URLSearchParams({ ...params, ...(pageToken ? { pageToken } : {}) }).toString()
      const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message || 'Calendar could not be loaded.')
      items.push(...(payload.items || []))
      pageToken = payload.nextPageToken
    } while (pageToken)
    return items
  }
  const list = async (token) => {
    const saved = await loadSelections()
    const items = await pages('users/me/calendarList', { maxResults: '250' }, token)
    return items.filter(item => !item.deleted).map(item => ({
      id: item.id, name: item.summaryOverride || item.summary || 'Calendar',
      primary: Boolean(item.primary), accessRole: item.accessRole,
      backgroundColor: item.backgroundColor,
      selected: typeof saved[item.id] === 'boolean' ? saved[item.id] : true,
    }))
  }
  return {
    async list() { return list(await getAccessToken()) },
    async select(id, selected) {
      const saved = await loadSelections()
      const next = { ...saved, [id]: selected }
      const operation = saveQueue.then(async () => {
        await mkdir(dirname(selectionPath), { recursive: true })
        await writeFile(`${selectionPath}.tmp`, JSON.stringify(next), { mode: 0o600 })
        await rename(`${selectionPath}.tmp`, selectionPath)
      })
      selections = next
      saveQueue = operation.catch(() => {})
      await operation
    },
    async events({ timeMin, timeMax, timeZone }) {
      const token = await getAccessToken()
      const calendars = await list(token)
      const enabled = calendars.filter(calendar => calendar.selected)
      const results = await Promise.allSettled(enabled.map(async calendar => {
        const items = await pages(`calendars/${encodeURIComponent(calendar.id)}/events`, {
          timeMin, timeMax, timeZone, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500',
        }, token)
        return items.filter(event => event.id && event.start?.dateTime || event.id && event.start?.date).map(event => ({
          id: `${calendar.id}:${event.id}`, calendarId: calendar.id, calendarName: calendar.name,
          cancelled: event.status === 'cancelled', declined: Boolean(event.attendees?.some(person => person.self && person.responseStatus === 'declined')),
          holiday: /(?:^|[.#])holiday(?:s)?(?:[.#@]|$)/i.test(calendar.id), eventType: event.eventType || '',
          meetingLinks: [event.hangoutLink, ...(event.conferenceData?.entryPoints || []).filter(point => point.entryPointType === 'video').map(point => point.uri)].filter(Boolean),
          calendarColor: calendar.backgroundColor || '', title: String(event.summary || 'Untitled event'),
          start: event.start.dateTime || event.start.date || '', end: event.end?.dateTime || event.end?.date || '',
          allDay: Boolean(event.start.date && !event.start.dateTime), location: String(event.location || ''),
          description: String(event.description || ''), link: String(event.htmlLink || ''),
        }))
      }))
      const errors = results.flatMap((result, index) => result.status === 'rejected'
        ? [{ calendarId: enabled[index].id, calendarName: enabled[index].name, message: result.reason.message }] : [])
      const unique = new Map(results.flatMap(result => result.status === 'fulfilled' ? result.value : []).map(event => [event.id, event]))
      const localParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      const sortKey = event => {
        if (event.allDay) return `${event.start}T00:00:00`
        const parts = Object.fromEntries(localParts.formatToParts(new Date(event.start)).map(part => [part.type, part.value]))
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
      }
      const events = [...unique.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || Number(b.allDay) - Number(a.allDay) || a.id.localeCompare(b.id))
      return { events, calendars, errors, timeZone }
    },
  }
}
