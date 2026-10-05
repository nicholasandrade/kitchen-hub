export type HubTimerStatus = 'running' | 'paused' | 'finished' | 'cancelled'

export type HubTimer = {
  id: string
  label: string
  createdAt: number
  durationMs: number
  endsAt: number | null
  remainingMs: number
  status: HubTimerStatus
  source?: 'voice' | 'cooking' | 'manual' | 'system'
}

export type CreateTimerInput = {
  label?: string
  durationMs: number
  source?: HubTimer['source']
}
