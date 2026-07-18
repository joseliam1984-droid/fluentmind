import { getIceServers } from '@/features/calls/services/callsService'
import { signalingService } from './signalingService'
import type { PeerConnectionState, CallState } from '../types'

const ICE_CANDIDATE_EVENT = 'ice-candidate'

type StateListener = () => void

class WebRTCService {
  private _connectionState: PeerConnectionState = 'new'
  private _callState: CallState = 'idle'
  private _peer: RTCPeerConnection | null = null
  private _localStream: MediaStream | null = null
  private _pendingCandidates: RTCIceCandidateInit[] = []
  private _error: string | null = null
  private _listeners: StateListener[] = []
  private _unsubIceCandidate: (() => void) | null = null

  get connectionState(): PeerConnectionState {
    return this._connectionState
  }

  get callState(): CallState {
    return this._callState
  }

  get peer(): RTCPeerConnection | null {
    return this._peer
  }

  get localStream(): MediaStream | null {
    return this._localStream
  }

  get hasMedia(): boolean {
    return this._localStream !== null
  }

  get error(): string | null {
    return this._error
  }

  onStateChange(fn: StateListener): () => void {
    this._listeners.push(fn)
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn)
    }
  }

  private _emit() {
    this._listeners.forEach((fn) => fn())
  }

  private _setCallState(state: CallState) {
    this._callState = state
    this._emit()
  }

  private _setConnectionState(state: PeerConnectionState) {
    this._connectionState = state
    this._emit()
  }

  private _handleConnectionStateChange = () => {
    if (!this._peer) return
    const raw = this._peer.connectionState as PeerConnectionState
    this._setConnectionState(raw)
    if (raw === 'failed' || raw === 'closed') {
      this._setCallState('failed')
    }
  }

  private _emitLocalCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) return // null = end of candidates
    signalingService.emit(ICE_CANDIDATE_EVENT, event.candidate.toJSON())
  }

  private _handleIceConnectionStateChange = () => {
    if (!this._peer) return
    const state = this._peer.iceConnectionState
    this._setConnectionState(state as PeerConnectionState)
    if (state === 'disconnected' || state === 'failed') {
      this._setCallState('failed')
    }
  }

  private _handleRemoteCandidate = (_event: string, data: unknown) => {
    const candidate = data as RTCIceCandidateInit
    if (!candidate || !candidate.candidate) return

    if (this._peer && this._peer.remoteDescription) {
      this._peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
        // ignore errors for outdated candidates
      })
    } else {
      this._pendingCandidates.push(candidate)
    }
  }

  private _setupSignaling() {
    this._unsubIceCandidate?.()
    this._unsubIceCandidate = signalingService.on(
      ICE_CANDIDATE_EVENT,
      this._handleRemoteCandidate,
    )
  }

  private _ensurePeer(rpcConfig?: RTCConfiguration): RTCPeerConnection {
    if (this._peer) return this._peer

    this._peer = new RTCPeerConnection(rpcConfig ?? {})

    this._peer.onconnectionstatechange = this._handleConnectionStateChange
    this._peer.oniceconnectionstatechange = this._handleIceConnectionStateChange
    this._peer.onicecandidate = this._emitLocalCandidate

    // Subscribe to incoming ICE candidates via signaling
    this._setupSignaling()

    // Attach any existing local stream tracks
    if (this._localStream) {
      this._localStream.getTracks().forEach((track) => {
        if (this._peer) this._peer.addTrack(track, this._localStream!)
      })
    }

    // Flush pending ICE candidates
    if (this._pendingCandidates.length > 0) {
      for (const candidate of this._pendingCandidates) {
        this._peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      }
      this._pendingCandidates = []
    }

    return this._peer
  }

  async initialize(): Promise<void> {
    if (this._callState === 'initializing') return
    this._callState = 'initializing'
    this._error = null
    this._emit()

    try {
      const iceServers = await getIceServers()

      const config: RTCIceServer[] = iceServers.map((s) => ({
        urls: s.urls,
        ...(s.username ? { username: s.username } : {}),
        ...(s.credential ? { credential: s.credential } : {}),
      }))

      this._ensurePeer({ iceServers: config })

      this._connectionState = 'new'
      this._callState = 'ready'
      this._emit()
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Error al inicializar WebRTC'
      this._connectionState = 'failed'
      this._callState = 'failed'
      this._emit()
      throw err
    }
  }

  async requestMedia(): Promise<void> {
    if (this._localStream) {
      this._setCallState('media-ready')
      return
    }

    this._setCallState('requesting-permission')
    this._error = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this._localStream = stream

      if (this._peer) {
        stream.getTracks().forEach((track) => {
          this._peer!.addTrack(track, stream)
        })
      }

      this._setCallState('media-ready')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        this._error = 'Permiso de micrófono denegado'
        this._setCallState('permission-denied')
      } else {
        const msg = err instanceof Error ? err.message : 'Error al acceder al micrófono'
        this._error = msg
        this._setCallState('failed')
      }
    }
  }

  // ── SDP Negotiation ──────────────────────────────────────

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const peer = this._ensurePeer()
    this._setCallState('creating-offer')

    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      this._setCallState('waiting-answer')
      return offer
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Error al crear offer'
      this._setCallState('failed')
      throw err
    }
  }

  async setRemoteOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    const peer = this._ensurePeer()
    this._setCallState('creating-answer')

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      this._setCallState('negotiating')
      return answer
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Error al procesar offer'
      this._setCallState('failed')
      throw err
    }
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = this._ensurePeer()

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(answer))
      this._setCallState('negotiated')
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Error al procesar answer'
      this._setCallState('failed')
      throw err
    }
  }

  // ── ICE Candidate management ─────────────────────────────

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this._peer && this._peer.remoteDescription) {
      try {
        await this._peer.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        // ignore errors for outdated candidates
      }
    } else {
      this._pendingCandidates.push(candidate)
    }
  }

  get pendingCandidates(): RTCIceCandidateInit[] {
    return [...this._pendingCandidates]
  }

  // ── High-level call actions ──────────────────────────────

  /**
   * Fase 1: Emitir call:start y esperar call:ringing o call:accepted.
   * NO crea PeerConnection ni SDP todavía.
   */
  async initiateCall(targetUid: string): Promise<'ringing' | 'accepted'> {
    signalingService.emit('call:start', { targetUid })

    // Esperar el primer evento que llegue
    const result = await Promise.race([
      signalingService.waitForEvent('call:ringing', 30000).then(() => 'ringing' as const),
      signalingService.waitForEvent('call:accepted', 30000).then(() => 'accepted' as const),
    ])
    return result
  }

  /**
   * Fase 2: Crear RTCPeerConnection, generar SDP Offer y emitirlo.
   * Llamar SOLO después de que initiateCall haya resuelto.
   */
  async startCall(): Promise<void> {
    const offer = await this.createOffer()
    signalingService.emit('offer', { sdp: offer })
  }

  async acceptCall(offerSdp: RTCSessionDescriptionInit): Promise<void> {
    const answer = await this.setRemoteOffer(offerSdp)
    signalingService.emit('answer', { sdp: answer })
  }

  // ── Cleanup ──────────────────────────────────────────────

  destroy(): void {
    // Unsubscribe from signaling
    this._unsubIceCandidate?.()
    this._unsubIceCandidate = null

    if (this._localStream) {
      this._localStream.getTracks().forEach((t) => t.stop())
      this._localStream = null
    }

    if (this._peer) {
      this._peer.onconnectionstatechange = null
      this._peer.oniceconnectionstatechange = null
      this._peer.onicecandidate = null
      this._peer.close()
      this._peer = null
    }

    this._pendingCandidates = []
    this._connectionState = 'closed'
    this._callState = 'idle'
    this._error = null
    this._emit()
  }

  reset(): void {
    this.destroy()
  }
}

export const webRTCService = new WebRTCService()
