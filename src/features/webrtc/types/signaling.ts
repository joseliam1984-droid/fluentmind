export type SignalingState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export interface SignalingEvent {
  event: string
  data: unknown
}

export type SignalingListener = (event: string, data: unknown) => void
export type StateListener = (state: SignalingState) => void
