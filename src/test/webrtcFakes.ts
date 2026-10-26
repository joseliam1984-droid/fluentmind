import { vi } from 'vitest'

/** Dobles mínimos de las APIs WebRTC (jsdom no las implementa). NO sustituyen una prueba real. */
export class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = []
  config: unknown
  remoteDescription: { type: string; sdp?: string } | null = null
  localDescription: { type: string; sdp?: string } | null = null
  signalingState = 'stable'
  connectionState = 'new'
  iceConnectionState = 'new'
  onconnectionstatechange: (() => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null
  onsignalingstatechange: (() => void) | null = null
  listeners = new Map<string, (e: unknown) => void>()
  addedTracks: unknown[] = []
  addedCandidates: unknown[] = []
  closed = false

  constructor(config?: unknown) {
    this.config = config
    FakeRTCPeerConnection.instances.push(this)
  }
  addEventListener(name: string, fn: (e: unknown) => void) { this.listeners.set(name, fn) }
  removeEventListener(name: string) { this.listeners.delete(name) }
  addTrack(track: unknown) { this.addedTracks.push(track) }
  async createOffer() { return { type: 'offer', sdp: 'offer-sdp' } }
  async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' } }
  async setLocalDescription(d: { type: string; sdp?: string }) { this.localDescription = d }
  async setRemoteDescription(d: { type: string; sdp?: string }) { this.remoteDescription = d }
  async addIceCandidate(c: unknown) {
    if (!this.remoteDescription) throw new DOMException('no remoteDescription', 'InvalidStateError')
    this.addedCandidates.push(c)
  }
  close() { this.closed = true }
}

export class FakeRTCIceCandidate {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
  type = 'host'
  constructor(init: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }) {
    this.candidate = init.candidate
    this.sdpMid = init.sdpMid ?? null
    this.sdpMLineIndex = init.sdpMLineIndex ?? null
  }
}

export class FakeRTCSessionDescription {
  type: string
  sdp?: string
  constructor(init: { type: string; sdp?: string }) {
    this.type = init.type
    this.sdp = init.sdp
  }
}

export function makeFakeStream() {
  const track = { kind: 'audio', stop: vi.fn() }
  return { track, stream: { getTracks: () => [track] } }
}

export function installWebRTCFakes() {
  FakeRTCPeerConnection.instances = []
  vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection)
  vi.stubGlobal('RTCIceCandidate', FakeRTCIceCandidate)
  vi.stubGlobal('RTCSessionDescription', FakeRTCSessionDescription)
}
