import { useEffect, useState } from 'react'
import { formatTimerDuration, timerService } from '../timers/timerService'
import { useHubTimers } from '../timers/useHubTimers'

export function TimerView() {
  useHubTimers()
  const [selectedMinutes, setSelectedMinutes] = useState(10)
  const [now, setNow] = useState(() => Date.now())
  const activeTimers = timerService.getActiveTimers()
  const primaryTimer = activeTimers[0] ?? null
  const remaining = primaryTimer ? timerService.getRemainingTime(primaryTimer, now) : selectedMinutes * 60 * 1000

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const heading = !primaryTimer
    ? 'Set a timer'
    : primaryTimer.status === 'paused' ? `${primaryTimer.label} paused` : `${primaryTimer.label} running`

  const togglePrimary = () => {
    if (!primaryTimer) {
      timerService.createTimer({ label: 'Kitchen timer', durationMs: selectedMinutes * 60 * 1000, source: 'manual' })
    } else if (primaryTimer.status === 'paused') {
      timerService.resumeTimer(primaryTimer.id)
    } else {
      timerService.pauseTimer(primaryTimer.id)
    }
  }

  return (
    <section className="timer-view" aria-labelledby="timer-title">
      <div className="timer-heading">
        <p className="eyebrow">Kitchen timer</p>
        <h1 id="timer-title">{heading}</h1>
        <p>{activeTimers.length > 1 ? `${activeTimers.length} active timers. The next one is shown here.` : 'Timers remain active throughout Hub.'}</p>
      </div>
      <div className="timer-stage" aria-live="polite" aria-atomic="true">
        <span className="timer-display">{formatTimerDuration(remaining)}</span>
        <span className="timer-status">{primaryTimer?.status === 'paused' ? 'Paused' : primaryTimer ? 'Counting down' : 'Ready'}</span>
      </div>
      <div className="timer-controls">
        <div className="timer-presets" aria-label="Timer presets">
          {[5, 10, 15, 30].map((minutes) => <button type="button" className={!primaryTimer && selectedMinutes === minutes ? 'active' : ''} aria-pressed={!primaryTimer && selectedMinutes === minutes} disabled={Boolean(primaryTimer)} key={minutes} onClick={() => setSelectedMinutes(minutes)}>{minutes} min</button>)}
        </div>
        <div className="timer-actions">
          <button className="timer-primary" type="button" onClick={togglePrimary}>{primaryTimer?.status === 'running' ? 'Pause' : primaryTimer?.status === 'paused' ? 'Resume' : 'Start timer'}</button>
          {primaryTimer ? <button className="timer-secondary" type="button" onClick={() => timerService.cancelTimer(primaryTimer.id)}>Cancel</button> : null}
        </div>
      </div>
    </section>
  )
}
