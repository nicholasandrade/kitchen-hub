export type SpotifyPlaybackState = {
  isPlaying: boolean
  trackId: string
  trackName: string
  artistName: string
  albumName?: string
  albumArtUrl?: string
  deviceName?: string
  durationMs?: number
  progressMs?: number
}
