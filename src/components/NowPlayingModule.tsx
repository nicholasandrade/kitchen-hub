import type { SpotifyPlaybackState } from '../spotify/spotifyTypes'

type NowPlayingModuleProps = {
  playback: SpotifyPlaybackState
  onOpen?: () => void
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrevious: () => void
}

export function NowPlayingModule({ playback, onOpen, onPlay, onPause, onNext, onPrevious }: NowPlayingModuleProps) {
  return (
    <section className="now-playing-module" aria-label={`Now playing ${playback.trackName}`}>
      <button className="now-playing-summary" type="button" onClick={onOpen}>
        {playback.albumArtUrl ? <img src={playback.albumArtUrl} alt="" /> : <span className="album-art-placeholder" aria-hidden="true">♫</span>}
        <span><small>Now playing</small><strong>{playback.trackName}</strong><em>{playback.artistName}{playback.deviceName ? ` · Playing on ${playback.deviceName}` : ''}</em></span>
      </button>
      <div className="playback-controls" aria-label="Playback controls">
        <button type="button" onClick={onPrevious} aria-label="Previous track">‹</button>
        <button type="button" onClick={playback.isPlaying ? onPause : onPlay} aria-label={playback.isPlaying ? 'Pause' : 'Play'}>{playback.isPlaying ? 'Ⅱ' : '▶'}</button>
        <button type="button" onClick={onNext} aria-label="Next track">›</button>
      </div>
    </section>
  )
}
