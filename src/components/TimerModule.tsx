import { useEffect, useState } from 'react'
import { formatTimerDuration, timerService } from '../timers/timerService'
import type { HubTimer } from '../timers/timerTypes'

export function TimerModule({ timer, additionalCount, onOpen }: { timer: HubTimer; additionalCount: number; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <button className="timer-module" type="button" onClick={onOpen} aria-label={`Open timer ${timer.label}`}>
      <span><small>Timer</small><strong>{timer.label}</strong>{additionalCount > 0 ? <em>+{additionalCount} more</em> : null}</span>
      <b>{formatTimerDuration(timerService.getRemainingTime(timer, now))}</b>
    </button>
  )
}
