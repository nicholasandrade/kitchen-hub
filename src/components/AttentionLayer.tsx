import { useEffect, useMemo, useState } from 'react'
import { timerService } from '../timers/timerService'
import { useHubTimers } from '../timers/useHubTimers'

export type AttentionReminder = {
  id: string
  title: string
  dueAt: number
}

export function AttentionLayer({ reminder }: { reminder: AttentionReminder | null }) {
  useHubTimers()
  const [now, setNow] = useState(() => Date.now())
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({})

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextNow = Date.now()
      setNow(nextNow)
      timerService.reconcile(nextNow)
    }, 1000)
    timerService.reconcile()
    return () => window.clearInterval(interval)
  }, [])

  const finishedTimer = timerService.getFinishedTimers()[0] ?? null
  const dueReminder = useMemo(() => reminder
    && reminder.dueAt <= now
    && !dismissedReminders.has(reminder.id)
    && (snoozedUntil[reminder.id] ?? 0) <= now
    ? reminder
    : null, [dismissedReminders, now, reminder, snoozedUntil])

  if (!finishedTimer && !dueReminder) return null

  return (
    <div className="attention-layer" aria-live="assertive">
      {finishedTimer ? (
        <section className="attention-card" role="alert" aria-labelledby="timer-alert-title">
          <p>Timer finished</p>
          <h2 id="timer-alert-title">{finishedTimer.label}</h2>
          <div>
            <button type="button" onClick={() => timerService.acknowledgeTimer(finishedTimer.id)}>Dismiss</button>
            <button type="button" className="attention-primary" onClick={() => timerService.addTime(finishedTimer.id, 5 * 60 * 1000)}>+5 minutes</button>
          </div>
        </section>
      ) : dueReminder ? (
        <section className="attention-card" role="alert" aria-labelledby="reminder-alert-title">
          <p>Reminder</p>
          <h2 id="reminder-alert-title">{dueReminder.title}</h2>
          <div>
            <button type="button" onClick={() => setDismissedReminders((current) => new Set(current).add(dueReminder.id))}>Dismiss</button>
            <button type="button" className="attention-primary" onClick={() => setSnoozedUntil((current) => ({ ...current, [dueReminder.id]: Date.now() + 10 * 60 * 1000 }))}>Snooze 10 min</button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
