import { getIceServers } from '@/features/calls/services/callsService'
import { signalingService } from './signalingService'
import type { PeerConnectionState, CallState } from '../types'

const ICE_CANDIDATE_EVENT = 'call:ice-candidate'

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
  // roomId de la llamada activa. Se fija UNA vez al iniciar/aceptar la
  // llamada y permanece inmutable hasta destroy(). Es lo que el backend
  // necesita para enrutar offer/answer/ice-candidate (salas.get(roomId)).
  private _roomId: string | null = null
  // Reproducción de audio remoto: elemento <audio> dedicado + stream remoto.
  private _remoteAudio: HTMLAudioElement | null = null
  private _remoteStream: MediaStream | null = null

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

  get roomId(): string | null {
    return this._roomId
  }

  get remoteStream(): MediaStream | null {
    return this._remoteStream
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
    console.log('[WEBRTC-STATE] connectionState:', raw, this._ts())
    if (raw === 'disconnected' || raw === 'failed' || raw === 'closed') {
      console.log('[HANGUP]', {
        origen: 'connectionstate-disconnected',
        funcion: '_handleConnectionStateChange',
        roomId: this._roomId,
        connectionState: raw,
        timestamp: this._ts(),
      })
    }
    this._setConnectionState(raw)
    if (raw === 'failed' || raw === 'closed') {
      this._setCallState('failed')
    }
  }

  private _emitLocalCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) return // null = end of candidates
    console.log('[ROOMID] ice-candidate — roomId usado:', this._roomId)
    signalingService.emit(ICE_CANDIDATE_EVENT, {
      roomId: this._roomId,
      candidate: event.candidate.toJSON(),
    })
  }

  private _handleIceConnectionStateChange = () => {
    if (!this._peer) return
    const state = this._peer.iceConnectionState
    console.log('[WEBRTC-STATE] iceConnectionState:', state, this._ts())
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      console.log('[HANGUP]', {
        origen: 'ice-failed',
        funcion: '_handleIceConnectionStateChange',
        roomId: this._roomId,
        iceConnectionState: state,
        timestamp: this._ts(),
      })
    }
    this._setConnectionState(state as PeerConnectionState)
    if (state === 'disconnected' || state === 'failed') {
      this._setCallState('failed')
    }
  }

  private _ts(): string {
    return new Date().toISOString()
  }

  // Instrumentación del evento 'track' (SOLO diagnóstico). NO implementa
  // peer.ontrack ni reproducción de audio: únicamente registra si el media
  // remoto llega al peer.
  // Crea (una vez) el <audio> dedicado al audio remoto y cablea sus eventos.
  private _ensureRemoteAudioEl(): HTMLAudioElement {
    if (this._remoteAudio) return this._remoteAudio
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.setAttribute('playsinline', '') // Safari/iOS inline
    audio.controls = false
    audio.muted = false
    audio.volume = 1
    audio.id = 'fluentmind-remote-audio'
    audio.style.display = 'none'
    ;(['loadedmetadata', 'canplay', 'playing', 'pause', 'ended', 'error'] as const).forEach((ev) => {
      audio.addEventListener(ev, () => {
        console.log(`[REMOTE-AUDIO] event: ${ev}`, {
          readyState: audio.readyState,
          paused: audio.paused,
          muted: audio.muted,
          timestamp: this._ts(),
        })
      })
    })
    document.body.appendChild(audio)
    console.log('[REMOTE-AUDIO] <audio> creado', this._ts())
    this._remoteAudio = audio
    return audio
  }

  // Debe llamarse DENTRO del gesto del usuario (click Aceptar/Llamar) para
  // habilitar autoplay en Safari/iOS: el elemento se crea/toca durante el gesto.
  prepareRemoteAudio(): void {
    const audio = this._ensureRemoteAudioEl()
    // "Desbloqueo" best-effort dentro del gesto (aún sin fuente → puede rechazar).
    audio.play().then(() => audio.pause()).catch(() => { /* sin srcObject todavía */ })
    console.log('[REMOTE-AUDIO] prepareRemoteAudio (gesto de usuario)', this._ts())
  }

  private _handleTrack = (event: RTCTrackEvent) => {
    console.log('[WEBRTC] track event received', {
      kind: event.track?.kind ?? null,
      streamsLength: event.streams?.length ?? 0,
      streamId: event.streams?.[0]?.id ?? null,
      timestamp: this._ts(),
    })

    const stream = event.streams?.[0]
    if (!stream) {
      console.log('[REMOTE-AUDIO] track sin MediaStream asociado (event.streams vacío)')
      return
    }
    if ((event.streams?.length ?? 0) > 1) {
      console.log('[REMOTE-AUDIO] AVISO: más de un stream en el track event', {
        streams: event.streams.length,
      })
    }
    // Detalle de todos los tracks del stream remoto (item 5).
    stream.getTracks().forEach((t) => {
      console.log('[REMOTE-AUDIO] track del stream remoto', {
        kind: t.kind,
        id: t.id,
        enabled: t.enabled,
        muted: t.muted,
        streamId: stream.id,
      })
    })

    this._remoteStream = stream
    const audio = this._ensureRemoteAudioEl()
    if (audio.srcObject !== stream) {
      audio.srcObject = stream
    }

    console.log('[REMOTE-AUDIO] estado ANTES de play()', {
      readyState: audio.readyState,
      paused: audio.paused,
      muted: audio.muted,
      volume: audio.volume,
      autoplay: audio.autoplay,
      srcObject: !!audio.srcObject,
      timestamp: this._ts(),
    })
    console.log('[REMOTE-AUDIO] play() INICIO', this._ts())
    audio
      .play()
      .then(() =>
        console.log('[REMOTE-AUDIO] play() OK', {
          readyState: audio.readyState,
          paused: audio.paused,
          muted: audio.muted,
          volume: audio.volume,
          srcObject: !!audio.srcObject,
          timestamp: this._ts(),
        }),
      )
      .catch((err) =>
        console.log('[REMOTE-AUDIO] play() ERROR', {
          name: err?.name ?? 'unknown',
          message: err?.message ?? String(err),
          readyState: audio.readyState,
          paused: audio.paused,
          muted: audio.muted,
          timestamp: this._ts(),
        }),
      )
  }

  // Aplica un ICE candidate con instrumentación [ICE] (INICIO/OK/ERROR).
  // Solo logging: NO cambia la lógica de cola/flush ni el manejo de errores.
  private _addCandidateLogged(candidate: RTCIceCandidateInit, contexto: string) {
    if (!this._peer) return
    const rtc = new RTCIceCandidate(candidate)
    console.log('[ICE] addIceCandidate() INICIO', {
      contexto,
      type: rtc.type ?? null,
      sdpMid: rtc.sdpMid ?? null,
      sdpMLineIndex: rtc.sdpMLineIndex ?? null,
      timestamp: this._ts(),
    })
    this._peer
      .addIceCandidate(rtc)
      .then(() => console.log('[ICE] addIceCandidate() OK', { contexto, timestamp: this._ts() }))
      .catch((err) => console.log('[ICE] addIceCandidate() ERROR', {
        contexto,
        name: err?.name ?? 'unknown',
        message: err?.message ?? String(err),
        timestamp: this._ts(),
      }))
  }

  // Vacía la cola de ICE candidates encolados (los que llegaron ANTES de que
  // existiera remoteDescription). Se invoca justo después de setRemoteDescription
  // para que esos candidatos por fin se apliquen y la conexión ICE progrese.
  private _flushPendingCandidates() {
    if (this._pendingCandidates.length === 0) return
    console.log('[ICE] Flushing queued candidates after remoteDescription', {
      cantidad: this._pendingCandidates.length,
      timestamp: this._ts(),
    })
    // Tomar y vaciar la cola completa antes de aplicar (evita reprocesos).
    const pending = this._pendingCandidates
    this._pendingCandidates = []
    for (const candidate of pending) {
      this._addCandidateLogged(candidate, 'flush-after-remote')
    }
  }

  private _handleRemoteCandidate = (_event: string, data: unknown) => {
    // El backend reenvía { roomId, candidate } (protocolo con roomId).
    // Desempaquetamos candidate; roomId no se usa aquí (el peer ya está atado).
    const candidate = (data as { roomId?: string; candidate?: RTCIceCandidateInit })
      ?.candidate as RTCIceCandidateInit
    if (!candidate || !candidate.candidate) return

    console.log('[ICE] candidate recibido de signaling', { timestamp: this._ts() })
    if (this._peer && this._peer.remoteDescription) {
      this._addCandidateLogged(candidate, 'remoto-inmediato')
    } else {
      this._pendingCandidates.push(candidate)
      console.log('[ICE] Candidate queued', {
        motivo: this._peer ? 'sin remoteDescription' : 'sin peer',
        total: this._pendingCandidates.length,
        timestamp: this._ts(),
      })
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
    // [WEBRTC-STATE] log temporal de cambios de signalingState (solo diagnóstico)
    this._peer.onsignalingstatechange = () => {
      console.log('[WEBRTC-STATE] signalingState:', this._peer?.signalingState, this._ts())
    }
    // [WEBRTC] instrumentación del evento track (solo log, sin reproducción)
    this._peer.addEventListener('track', this._handleTrack)

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
      console.log('[ICE] Flushing queued candidates', {
        cantidad: this._pendingCandidates.length,
        timestamp: this._ts(),
      })
      for (const candidate of this._pendingCandidates) {
        this._addCandidateLogged(candidate, 'flush')
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

    // [DIAG] Estado del peer ANTES de setRemoteDescription
    console.log('[DIAG] setRemoteOffer — peer state BEFORE:', {
      signalingState: peer.signalingState,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      localDescriptionType: peer.localDescription?.type ?? null,
      remoteDescriptionType: peer.remoteDescription?.type ?? null,
    })

    try {
      console.log('[DIAG] setRemoteDescription(offer) INICIO')
      await peer.setRemoteDescription(new RTCSessionDescription(offer))
      console.log('[DIAG] setRemoteDescription(offer) OK')

      // [DIAG] Estado del peer DESPUÉS de setRemoteDescription
      console.log('[DIAG] setRemoteOffer — peer state AFTER:', {
        signalingState: peer.signalingState,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        localDescriptionType: peer.localDescription?.type ?? null,
        remoteDescriptionType: peer.remoteDescription?.type ?? null,
      })

      // remoteDescription (offer) aplicada: vaciar los ICE candidates que
      // hubieran llegado antes de este punto.
      this._flushPendingCandidates()

      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      this._setCallState('negotiating')
      return answer
    } catch (err) {
      console.log('[DIAG] setRemoteDescription(offer) ERROR:', {
        name: err instanceof Error ? err.name : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        peerSignalingState: peer.signalingState,
        peerConnectionState: peer.connectionState,
        peerIceConnectionState: peer.iceConnectionState,
        localDescriptionType: peer.localDescription?.type ?? null,
        remoteDescriptionType: peer.remoteDescription?.type ?? null,
      })
      this._error = err instanceof Error ? err.message : 'Error al procesar offer'
      this._setCallState('failed')
      throw err
    }
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = this._ensurePeer()

    // [DIAG] Estado del peer ANTES de setRemoteDescription
    console.log('[DIAG] setRemoteAnswer — peer state BEFORE:', {
      signalingState: peer.signalingState,
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      localDescriptionType: peer.localDescription?.type ?? null,
      remoteDescriptionType: peer.remoteDescription?.type ?? null,
    })

    try {
      console.log('[DIAG] setRemoteDescription(answer) INICIO', this._ts())
      await peer.setRemoteDescription(new RTCSessionDescription(answer))
      console.log('[DIAG] setRemoteDescription(answer) OK', this._ts())

      // [DIAG] Estado del peer DESPUÉS
      console.log('[DIAG] setRemoteAnswer — peer state AFTER:', {
        signalingState: peer.signalingState,
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        localDescriptionType: peer.localDescription?.type ?? null,
        remoteDescriptionType: peer.remoteDescription?.type ?? null,
      })

      // remoteDescription (answer) aplicada: vaciar los ICE candidates que
      // hubieran llegado antes de este punto.
      this._flushPendingCandidates()

      this._setCallState('negotiated')
    } catch (err) {
      console.log('[DIAG] setRemoteDescription(answer) ERROR:', {
        timestamp: this._ts(),
        name: err instanceof Error ? err.name : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        peerSignalingState: peer.signalingState,
        peerConnectionState: peer.connectionState,
        peerIceConnectionState: peer.iceConnectionState,
        localDescriptionType: peer.localDescription?.type ?? null,
        remoteDescriptionType: peer.remoteDescription?.type ?? null,
      })
      this._error = err instanceof Error ? err.message : 'Error al procesar answer'
      this._setCallState('failed')
      throw err
    }
  }

  // ── ICE Candidate management ─────────────────────────────

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this._peer && this._peer.remoteDescription) {
      const rtc = new RTCIceCandidate(candidate)
      console.log('[ICE] addIceCandidate() INICIO', {
        contexto: 'public',
        type: rtc.type ?? null,
        sdpMid: rtc.sdpMid ?? null,
        sdpMLineIndex: rtc.sdpMLineIndex ?? null,
        timestamp: this._ts(),
      })
      try {
        await this._peer.addIceCandidate(rtc)
        console.log('[ICE] addIceCandidate() OK', { contexto: 'public', timestamp: this._ts() })
      } catch (err) {
        console.log('[ICE] addIceCandidate() ERROR', {
          contexto: 'public',
          name: err instanceof Error ? err.name : 'unknown',
          message: err instanceof Error ? err.message : String(err),
          timestamp: this._ts(),
        })
      }
    } else {
      this._pendingCandidates.push(candidate)
      console.log('[ICE] Candidate queued', {
        contexto: 'public',
        total: this._pendingCandidates.length,
        timestamp: this._ts(),
      })
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

    // 1) Esperar call:ringing y CONSERVAR su payload (captura del roomId).
    const ringingData = await signalingService.waitForEvent('call:ringing', 30000)
    const roomId = (ringingData as { roomId?: string } | null)?.roomId ?? null
    this._roomId = roomId
    console.log('[FLOW] call:ringing recibido — roomId:', roomId)
    console.log('[ROOMID] initiateCall — roomId almacenado:', this._roomId)

    // 2) DECISIÓN DE ARQUITECTURA: NO crear la Offer tras ringing. El backend
    // solo reenvía call:offer DESPUÉS de call:accept, así que el llamante
    // espera call:accepted antes de generar la Offer (evita enviarla en vacío).
    console.log('[FLOW] esperando call:accepted (no se crea Offer todavía)...')
    await signalingService.waitForEvent('call:accepted', 60000)
    console.log('[FLOW] call:accepted recibido — habilitado createOffer')

    return 'accepted'
  }

  /**
   * Fase 2: Crear RTCPeerConnection, generar SDP Offer y emitirlo.
   * Llamar SOLO después de que initiateCall haya resuelto.
   */
  async startCall(): Promise<void> {
    console.log('[FLOW] createOffer — generando Offer')
    const offer = await this.createOffer()
    console.log('[ROOMID] startCall — roomId usado en call:offer:', this._roomId)
    signalingService.emit('call:offer', { roomId: this._roomId, sdp: offer })
    console.log('[FLOW] Offer enviada (call:offer)')
  }

  async acceptCall(offerSdp: RTCSessionDescriptionInit, roomId: string): Promise<void> {
    // El receptor recibe su roomId vía call:incoming (lo tiene CallsPage) y
    // lo inyecta aquí. Se fija ANTES de setRemoteOffer para que los
    // ice-candidate locales (que empiezan tras setLocalDescription) ya lo lleven.
    this._roomId = roomId
    console.log('[ROOMID] acceptCall — roomId almacenado:', this._roomId)
    const answer = await this.setRemoteOffer(offerSdp)
    console.log('[5] ANTES emit(call:answer)')
    console.log('[ROOMID] acceptCall — roomId usado en call:answer:', this._roomId)
    signalingService.emit('call:answer', { roomId: this._roomId, sdp: answer })
    console.log('[6] DESPUÉS emit(call:answer)')
  }

  // ── Cleanup ──────────────────────────────────────────────

  destroy(): void {
    console.log('[HANGUP]', {
      origen: 'destroy()',
      funcion: 'destroy',
      roomId: this._roomId,
      timestamp: this._ts(),
    })
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
      this._peer.onsignalingstatechange = null
      this._peer.removeEventListener('track', this._handleTrack)
      this._peer.close()
      this._peer = null
    }

    // Detener y quitar el <audio> remoto.
    if (this._remoteAudio) {
      try {
        this._remoteAudio.pause()
        this._remoteAudio.srcObject = null
        this._remoteAudio.remove()
      } catch { /* noop */ }
      this._remoteAudio = null
    }
    this._remoteStream = null

    this._pendingCandidates = []
    this._roomId = null
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
