import { useSyncExternalStore } from 'react'
import { spotifyService } from '../spotify/spotifyService'
import { timerService } from '../timers/timerService'
import { useHubTimers } from '../timers/useHubTimers'
import { NowPlayingModule } from './NowPlayingModule'
import { TimerModule } from './TimerModule'

export function LiveDock({ onOpenTimers }: { onOpenTimers: () => void }) {
  useHubTimers()
  const playback = useSyncExternalStore(spotifyService.subscribe, spotifyService.getSnapshot)
  const activeTimers = timerService.getActiveTimers()
  const hasSpotify = playback !== null
  const hasTimers = activeTimers.length > 0

  if (!hasSpotify && !hasTimers) return null

  return (
    <aside className={`live-dock ${hasSpotify ? 'has-spotify' : ''} ${hasTimers ? 'has-timers' : ''}`} aria-label="Live activity">
      {playback ? (
        <NowPlayingModule
          playback={playback}
          onPlay={() => void spotifyService.play()}
          onPause={() => void spotifyService.pause()}
          onNext={() => void spotifyService.next()}
          onPrevious={() => void spotifyService.previous()}
        />
      ) : null}
      {hasTimers ? <TimerModule timer={activeTimers[0]} additionalCount={activeTimers.length - 1} onOpen={onOpenTimers} /> : null}
    </aside>
  )
}
