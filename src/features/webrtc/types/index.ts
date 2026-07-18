export type PeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'

export type CallDirection = 'outgoing' | 'incoming'

export type CallState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'requesting-permission'
  | 'media-ready'
  | 'permission-denied'
  | 'creating-offer'
  | 'waiting-answer'
  | 'creating-answer'
  | 'negotiating'
  | 'negotiated'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'failed'

export interface MediaDevices {
  audioInput: MediaDeviceInfo[]
  audioOutput: MediaDeviceInfo[]
  videoInput: MediaDeviceInfo[]
}

export interface CallConfig {
  iceServers: RTCIceServer[]
  direction: CallDirection
}
