import { useSyncExternalStore } from 'react'
import { timerService } from './timerService'

export const useHubTimers = () => useSyncExternalStore(timerService.subscribe, timerService.getSnapshot)
