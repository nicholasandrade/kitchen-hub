import { localTimerRepository, type TimerRepository } from './timerRepository'
import type { CreateTimerInput, HubTimer } from './timerTypes'

type TimerListener = () => void

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `timer-${Date.now()}-${Math.random().toString(16).slice(2)}`

export class TimerService {
  private timers: HubTimer[]
  private listeners = new Set<TimerListener>()
  private repository: TimerRepository

  constructor(repository: TimerRepository = localTimerRepository) {
    this.repository = repository
    this.timers = this.reconcileTimers(repository.load(), Date.now())
    this.persist()
  }

  getSnapshot = () => this.timers

  subscribe = (listener: TimerListener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  createTimer({ label = 'Timer', durationMs, source = 'manual' }: CreateTimerInput) {
    const safeDuration = Math.max(1000, Math.round(durationMs))
    const now = Date.now()
    const timer: HubTimer = {
      id: makeId(), label: label.trim() || 'Timer', createdAt: now, durationMs: safeDuration,
      endsAt: now + safeDuration, remainingMs: safeDuration, status: 'running', source,
    }
    this.update([...this.timers, timer])
    return timer
  }

  pauseTimer(id: string) {
    const now = Date.now()
    this.patch(id, (timer) => timer.status === 'running'
      ? { ...timer, status: 'paused', remainingMs: this.remaining(timer, now), endsAt: null }
      : timer)
  }

  resumeTimer(id: string) {
    const now = Date.now()
    this.patch(id, (timer) => timer.status === 'paused'
      ? { ...timer, status: 'running', endsAt: now + Math.max(1000, timer.remainingMs) }
      : timer)
  }

  cancelTimer(id: string) {
    this.patch(id, (timer) => ({ ...timer, status: 'cancelled', endsAt: null, remainingMs: 0 }))
  }

  addTime(id: string, milliseconds: number) {
    const amount = Math.max(1000, Math.round(milliseconds))
    const now = Date.now()
    this.patch(id, (timer) => {
      if (timer.status === 'running') return { ...timer, endsAt: (timer.endsAt ?? now) + amount, durationMs: timer.durationMs + amount }
      if (timer.status === 'paused') return { ...timer, remainingMs: timer.remainingMs + amount, durationMs: timer.durationMs + amount }
      return { ...timer, status: 'running', endsAt: now + amount, remainingMs: amount, durationMs: timer.durationMs + amount }
    })
  }

  acknowledgeTimer(id: string) {
    this.update(this.timers.filter((timer) => timer.id !== id))
  }

  getRemainingTime(timerOrId: HubTimer | string, now = Date.now()) {
    const timer = typeof timerOrId === 'string' ? this.timers.find((item) => item.id === timerOrId) : timerOrId
    return timer ? this.remaining(timer, now) : 0
  }

  getActiveTimers() {
    return this.timers
      .filter((timer) => timer.status === 'running' || timer.status === 'paused')
      .sort((a, b) => this.getRemainingTime(a) - this.getRemainingTime(b))
  }

  getFinishedTimers() {
    return this.timers.filter((timer) => timer.status === 'finished')
  }

  reconcile(now = Date.now()) {
    const next = this.reconcileTimers(this.timers, now)
    if (next !== this.timers) this.update(next)
  }

  private remaining(timer: HubTimer, now: number) {
    if (timer.status === 'running' && timer.endsAt !== null) return Math.max(0, timer.endsAt - now)
    return Math.max(0, timer.remainingMs)
  }

  private reconcileTimers(timers: HubTimer[], now: number) {
    let changed = false
    const next = timers.map((timer) => {
      if (timer.status === 'running' && timer.endsAt !== null && timer.endsAt <= now) {
        changed = true
        return { ...timer, status: 'finished' as const, endsAt: null, remainingMs: 0 }
      }
      return timer
    })
    return changed ? next : timers
  }

  private patch(id: string, change: (timer: HubTimer) => HubTimer) {
    this.update(this.timers.map((timer) => timer.id === id ? change(timer) : timer))
  }

  private update(next: HubTimer[]) {
    this.timers = next
    this.persist()
    this.listeners.forEach((listener) => listener())
  }

  private persist() {
    this.repository.save(this.timers)
  }
}

export const timerService = new TimerService()

export const formatTimerDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
