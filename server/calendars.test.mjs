import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCalendarStore } from './calendars.mjs'

const window = { timeMin: '2026-10-07T07:00:00Z', timeMax: '2026-10-08T07:00:00Z', timeZone: 'America/Los_Angeles' }
const event = (id, hour, title = id) => ({ id, summary: title, start: { dateTime: `2026-10-07T${hour}:00:00-07:00` }, end: { dateTime: `2026-10-07T${hour}:30:00-07:00` } })
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-calendar-'))
  t.onTestFinished(() => rm(dir, { recursive: true, force: true }))
  const state = { calendars: [{ id: 'personal', summary: 'Personal', primary: true, accessRole: 'owner' }, { id: 'work', summary: 'NIH Calendar', accessRole: 'reader' }], events: { personal: [event('same', '10', 'Dentist')], work: [event('same', '11', 'Meeting'), event('sync', '13', 'Sync')] }, failures: [], requests: [], paged: false }
  const options = { selectionPath: join(dir, 'selection.json'), getAccessToken: async () => 'test-token', fetchImpl: async url => {
    state.requests.push(url)
    const id = decodeURIComponent(url.pathname.split('/')[4] || '')
    if (state.failures.includes(id)) return { ok: false, json: async () => ({ error: { message: 'Unavailable' } }) }
    if (url.pathname.endsWith('calendarList')) return { ok: true, json: async () => ({ items: state.calendars }) }
    if (state.paged && !url.searchParams.has('pageToken')) return { ok: true, json: async () => ({ items: [], nextPageToken: 'next' }) }
    return { ok: true, json: async () => ({ items: state.events[id] || [] }) }
  } }
  return { state, store: createCalendarStore(options), options }
}
test('primary and read-only secondary merge chronologically with distinct IDs', async t => {
  const { store, state } = await fixture(t)
  state.events.work.reverse()
  const result = await store.events(window)
  assert.deepEqual(result.events.map(e => e.title), ['Dentist', 'Meeting', 'Sync'])
  assert.deepEqual(result.events.map(e => e.id), ['personal:same', 'work:same', 'work:sync'])
  assert.equal(result.events[1].calendarName, 'NIH Calendar')
  assert.equal(result.calendars[1].accessRole, 'reader')
  assert.equal(result.errors.length, 0)
})
test('disabled calendars are skipped and selections survive a new store', async t => {
  const { store, state, options } = await fixture(t)
  await store.select('work', false)
  const result = await createCalendarStore(options).events(window)
  assert.equal(result.events.length, 1)
  assert.equal(result.calendars[1].selected, false)
  assert.ok(!state.requests.some(url => url.pathname.includes('/work/events')))
})
test('calendar list changes preserve selections and enable new calendars', async t => {
  const { store, state } = await fixture(t)
  await store.select('work', false)
  state.calendars.push({ id: 'new', summary: 'New calendar' })
  let calendars = await store.list()
  assert.equal(calendars[2].selected, true)
  assert.equal(calendars[1].selected, false)
  state.calendars = state.calendars.filter(c => c.id !== 'work')
  calendars = await store.list()
  assert.deepEqual(calendars.map(c => c.id), ['personal', 'new'])
})
test('secondary failure leaves primary events available', async t => {
  const { store, state } = await fixture(t)
  state.failures = ['work']
  const result = await store.events(window)
  assert.equal(result.events.length, 1)
  assert.equal(result.errors[0].calendarId, 'work')
})
test('all-day events from multiple calendars sort before timed events in local day', async t => {
  const { store, state } = await fixture(t)
  const allDay = { id: 'day', summary: 'All day', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }
  state.events.personal.push(allDay)
  state.events.work.push(allDay)
  const result = await store.events(window)
  assert.deepEqual(result.events.slice(0, 2).map(e => e.id), ['personal:day', 'work:day'])
  assert.ok(result.events.slice(0, 2).every(e => e.allDay))
})
test('pagination, cancelled events, and same-calendar repeated IDs', async t => {
  const { store, state } = await fixture(t)
  state.paged = true
  state.events.personal.push(event('same', '10'), { ...event('cancelled', '09'), status: 'cancelled' })
  const result = await store.events(window)
  assert.equal(result.events.length, 4)
  assert.equal(result.events.find(event => event.id === 'personal:cancelled').cancelled, true)
  assert.ok(state.requests.some(url => url.searchParams.get('pageToken') === 'next'))
})
