import type { HubTimer } from './timerTypes'

const TIMER_KEY = 'kitchen-hub:timers:v1'

export interface TimerRepository {
  load(): HubTimer[]
  save(timers: HubTimer[]): void
}

export const localTimerRepository: TimerRepository = {
  load: () => {
    try {
      const saved = localStorage.getItem(TIMER_KEY)
      if (!saved) return []
      const timers = JSON.parse(saved) as HubTimer[]
      return Array.isArray(timers) ? timers.filter((timer) => timer?.id && timer?.durationMs > 0) : []
    } catch {
      return []
    }
  },
  save: (timers) => {
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify(timers))
    } catch {
      // The in-memory timer service remains usable if browser storage is unavailable.
    }
  },
}
