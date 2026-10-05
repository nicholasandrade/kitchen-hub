import type { SpotifyPlaybackState } from './spotifyTypes'

type PlaybackListener = () => void

class SpotifyService {
  private playback: SpotifyPlaybackState | null = null
  private listeners = new Set<PlaybackListener>()

  getSnapshot = () => this.playback
  subscribe = (listener: PlaybackListener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setPlayback(playback: SpotifyPlaybackState | null) {
    this.playback = playback
    this.emit()
  }

  play = async () => this.setPlaying(true)
  pause = async () => this.setPlaying(false)
  next = async () => undefined
  previous = async () => undefined

  private setPlaying(isPlaying: boolean) {
    if (!this.playback) return
    this.playback = { ...this.playback, isPlaying }
    this.emit()
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }
}

export const spotifyService = new SpotifyService()
