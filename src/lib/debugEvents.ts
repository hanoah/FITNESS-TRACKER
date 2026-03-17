/**
 * Lightweight structured local debug event stream.
 * Ring buffer of recent events for troubleshooting.
 */

export interface DebugEvent {
  eventName: string
  timestamp: number
  sessionId?: number
  exerciseSlot?: string
  setId?: number
  status?: 'start' | 'success' | 'fail'
  errorCode?: string
  meta?: Record<string, unknown>
}

const MAX_EVENTS = 500
const buffer: DebugEvent[] = []

export function emitDebugEvent(event: Omit<DebugEvent, 'timestamp'>) {
  const full: DebugEvent = { ...event, timestamp: Date.now() }
  buffer.push(full)
  if (buffer.length > MAX_EVENTS) {
    buffer.shift()
  }
}

export function getDebugEvents(): DebugEvent[] {
  return [...buffer]
}

export function clearDebugEvents() {
  buffer.length = 0
}

export function exportDebugEventsAsJson(): string {
  return JSON.stringify(getDebugEvents(), null, 2)
}
