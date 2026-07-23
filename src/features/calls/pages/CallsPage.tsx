import { useEffect, useState, useCallback, useRef } from 'react'
import { useCallsHistory, useIceServers, useActivateCall } from '../hooks/useCallsApi'
import { signalingService } from '@/features/webrtc/services/signalingService'
import { webRTCService } from '@/features/webrtc/services/webRTCService'
import { findUserByEmail } from '../services/callsService'
import type { SignalingState } from '@/features/webrtc/types/signaling'
import type { CallState, PeerConnectionState } from '@/features/webrtc/types'

// ── Debug flag ────────────────────────────────────────────────
// Activar: añadir ?debug=webrtc a la URL
const DEBUG = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === 'webrtc'

// ── In-app log ──────────────────────────────────────────────

const logs: string[] = []

// ── Debug step helpers (solo visible con ?debug=webrtc) ─────

type StepStatus = '⏳' | '🔄' | '✅' | '❌' | '⏰'

function DebugStepRow({ label, status, detail }: { label: string; status: StepStatus; detail?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] font-mono">
      <span className="w-4 text-center">{status}</span>
      <span className="text-neutral-300">{label}</span>
      {detail && <span className="text-neutral-500 ml-auto">{detail}</span>}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────

function formatDateTime(raw?: string): string {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    return d.toLocaleDateString('es', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return raw }
}

function directionLabel(dir: string): string {
  return dir === 'inbound' ? '📞 Entrante' : '📞 Saliente'
}

// ── StatusBadge ─────────────────────────────────────────────

function StatusBadge({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const color = ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : 'text-neutral-400'
  return (
    <div className="flex justify-between py-1.5 px-3 rounded-lg bg-neutral-900 text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────

export default function CallsPage() {
  const history = useCallsHistory()
  const ice = useIceServers()
  const activate = useActivateCall()
  const [copied, setCopied] = useState(false)

  // WebRTC test state
  const [sigState, setSigState] = useState<SignalingState>(signalingService.state)
  const [callState, setCallState] = useState<CallState>(webRTCService.callState)
  const [connState, setConnState] = useState<PeerConnectionState>(webRTCService.connectionState)
  const [hasMedia, setHasMedia] = useState(false)
  const [isSigConnected, setIsSigConnected] = useState(false)
  const [offerReceived, setOfferReceived] = useState<RTCSessionDescriptionInit | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef(0)
  const [incomingCaller, setIncomingCaller] = useState<{ uid?: string; email?: string } | null>(null)
  const [callRoomId, setCallRoomId] = useState<string | null>(null)
  // Fase A/B: desacoplar aceptación (call:accept) del procesamiento de la Offer.
  const acceptedRef = useRef(false)                                 // el usuario ya pulsó Aceptar
  const roomIdRef = useRef<string | null>(null)                     // roomId estable para listeners
  const offerRef = useRef<RTCSessionDescriptionInit | null>(null)   // Offer recibida
  const processingRef = useRef(false)                               // evita procesar la Offer 2 veces

  // ── Call-by-email modal state ─────────────────────────
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // ── Debug state (solo con ?debug=webrtc) ─────────────────
  const [iceServersStatus, setIceServersStatus] = useState<StepStatus>('⏳')
  const [iceTiming, setIceTiming] = useState<string>('')
  const [initStatus, setInitStatus] = useState<StepStatus>('⏳')
  const [mediaStatus, setMediaStatus] = useState<StepStatus>('⏳')
  const [sdpOfferStatus, setSdpOfferStatus] = useState<StepStatus>('⏳')
  const [sdpAnswerStatus, setSdpAnswerStatus] = useState<StepStatus>('⏳')
  const [setLocalStatus, setSetLocalStatus] = useState<StepStatus>('⏳')
  const [setRemoteStatus, setSetRemoteStatus] = useState<StepStatus>('⏳')
  const [iceConnStatus, setIceConnStatus] = useState<StepStatus>('⏳')
  const [peerConnStatus, setPeerConnStatus] = useState<StepStatus>('⏳')
  const iceStartRef = useRef(0)

  const addLog = useCallback((msg: string) => {
    counterRef.current++
    const id = counterRef.current
    const t = new Date().toLocaleTimeString()
    const line = `[${t}] #${id} ${msg}`
    logs.push(line)
    if (logs.length > 100) logs.shift()
    setLogLines([...logs])
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  // Fase B: procesar la Offer SOLO cuando la llamada ya fue aceptada y la
  // Offer llegó. Idempotente (processingRef). Lo invocan tanto el listener de
  // call:offer como handleAcceptCall (según cuál ocurra último).
  const processOfferIfReady = useCallback(async () => {
    if (processingRef.current) return
    if (!acceptedRef.current || !offerRef.current || !roomIdRef.current) return
    processingRef.current = true
    console.log('[FLOW] acceptCall() — Offer disponible y llamada aceptada')
    try {
      await webRTCService.acceptCall(offerRef.current, roomIdRef.current)
      console.log('[FLOW] Answer creada + call:answer enviada')
      addLog('✅ Answer enviada (SDP con audio)')
      setIncomingCaller(null)
    } catch (err) {
      processingRef.current = false
      console.log('[FLOW] ERROR acceptCall():', err instanceof Error ? err.message : String(err))
      addLog(`❌ Accept error: ${err instanceof Error ? err.message : err}`)
    }
  }, [addLog])

  // Diagnóstico temporal: reflejar en el visor de depuración (el mismo que
  // copia el botón "Copiar") los logs etiquetados que hoy solo van a
  // console.log. NO toca la lógica de WebRTC: intercepta console.log a nivel UI
  // y reenvía a addLog() los mensajes con prefijo conocido.
  useEffect(() => {
    const original = console.log.bind(console)
    const TAG = /^\[(ICE|FLOW|WEBRTC-STATE|WEBRTC|DIAG|ROOMID|ANSWER|PWA)\]/
    console.log = (...args: unknown[]) => {
      original(...args)
      const first = args[0]
      if (typeof first === 'string' && TAG.test(first)) {
        const line = args
          .map((a) => {
            if (typeof a === 'string') return a
            try { return JSON.stringify(a) } catch { return String(a) }
          })
          .join(' ')
        addLog(line)
      }
    }
    return () => {
      console.log = original
    }
  }, [addLog])

  // Subscribe to service state changes
  useEffect(() => {
    const unsubSig = signalingService.onStateChange((s) => {
      setSigState(s)
      setIsSigConnected(s === 'connected')
      addLog(`Signaling: ${s}${signalingService.error ? ' — ' + signalingService.error : ''}`)
    })
    const unsubWeb = webRTCService.onStateChange(() => {
      const cs = webRTCService.callState
      const peer = webRTCService.connectionState
      setCallState(cs)
      setConnState(peer)
      setHasMedia(webRTCService.hasMedia)
      if (webRTCService.error) addLog(`WebRTC error: ${webRTCService.error}`)

      // ── Debug tracking ─────────────────────────────────
      if (!DEBUG) return
      if (cs === 'ready') { setInitStatus('✅'); setIceServersStatus('✅') }
      if (cs === 'requesting-permission') setMediaStatus('🔄')
      if (cs === 'media-ready') setMediaStatus('✅')
      if (cs === 'permission-denied') setMediaStatus('❌')
      if (cs === 'creating-offer' || cs === 'creating-answer') { setSdpOfferStatus('🔄'); setSdpAnswerStatus('🔄') }
      if (cs === 'waiting-answer') { setSdpOfferStatus('✅'); setSetLocalStatus('✅') }
      if (cs === 'negotiating') { setSdpAnswerStatus('✅'); setSetLocalStatus('✅'); setSetRemoteStatus('✅') }
      if (cs === 'negotiated') { setSdpAnswerStatus('✅'); setSetLocalStatus('✅'); setSetRemoteStatus('✅') }
      if (cs === 'failed') {
        if (initStatus === '🔄') setInitStatus('❌')
        if (mediaStatus === '🔄') setMediaStatus('❌')
        if (sdpOfferStatus === '🔄') setSdpOfferStatus('❌')
        if (sdpAnswerStatus === '🔄') setSdpAnswerStatus('❌')
        if (webRTCService.error?.includes('timeout')) setIceServersStatus('⏰')
        else if (iceServersStatus === '🔄') setIceServersStatus('❌')
      }
      if (peer === 'connected') { setIceConnStatus('✅'); setPeerConnStatus('✅') }
      if (peer === 'failed' || peer === 'disconnected') { setIceConnStatus('❌'); setPeerConnStatus('❌') }
      if (peer === 'connecting') { setIceConnStatus('🔄'); setPeerConnStatus('🔄') }
    })
    // Listen for incoming offers (call:offer per protocolo oficial)
    const unsubOffer = signalingService.on('call:offer', (_e, data) => {
      const d = data as { roomId?: string; sdp?: RTCSessionDescriptionInit }
      if (d?.sdp) {
        offerRef.current = d.sdp
        setOfferReceived(d.sdp)
        console.log('[FLOW] Offer recibida')
        addLog('📥 Offer recibida')
        // Fase B: si el usuario ya aceptó, procesar la Offer ahora.
        void processOfferIfReady()
      }
    })
    // Listen for answers (call:answer per protocolo oficial). El llamante
    // debe aplicar la Answer como Remote Description para completar la
    // negociación (antes solo se registraba, dejando el peer a medias).
    const unsubAnswer = signalingService.on('call:answer', (_e, data) => {
      console.log('[8] Llamante recibe call:answer')
      addLog('📥 Answer recibida')
      const d = data as { roomId?: string; sdp?: RTCSessionDescriptionInit }
      if (!d?.sdp) {
        addLog('⚠️ call:answer sin sdp')
        return
      }
      console.log('[ANSWER] Answer recibida — entregando a setRemoteAnswer, roomId:', d?.roomId)
      webRTCService
        .setRemoteAnswer(d.sdp)
        .then(() => addLog('✅ Answer aplicada (setRemoteDescription)'))
        .catch((err) => addLog(`❌ setRemoteAnswer error: ${err instanceof Error ? err.message : err}`))
    })
    // Listen for ICE candidates (call:ice-candidate per protocolo oficial)
    const unsubIce = signalingService.on('call:ice-candidate', () => {
      addLog('📥 ICE candidate recibido')
    })
    // Listen for call:ringing (diagnóstico)
    const unsubRinging = signalingService.on('call:ringing', () => {
      addLog('📞 call:ringing recibido')
    })
    // Listen for call:incoming → show incoming call UI + store roomId
    const unsubIncoming = signalingService.on('call:incoming', (_e, data) => {
      const d = data as { roomId?: string; fromUserId?: string }
      // Nueva llamada entrante: reiniciar estado de fases A/B.
      acceptedRef.current = false
      offerRef.current = null
      processingRef.current = false
      roomIdRef.current = d?.roomId || null
      setOfferReceived(null)
      setCallRoomId(d?.roomId || null)
      setIncomingCaller(d?.fromUserId ? { uid: d.fromUserId } : null)
      addLog(`📞 Llamada entrante de ${d?.fromUserId || 'desconocido'}`)
    })
    return () => {
      unsubSig(); unsubWeb(); unsubOffer(); unsubAnswer(); unsubIce(); unsubRinging(); unsubIncoming()
    }
  }, [addLog, processOfferIfReady])

  // ── Debug: track ICE servers fetch ───────────────────────
  useEffect(() => {
    if (!DEBUG) return
    if (ice.isLoading) {
      iceStartRef.current = Date.now()
      setIceServersStatus('🔄')
    }
    if (ice.error) {
      const ms = iceStartRef.current ? Date.now() - iceStartRef.current : 0
      setIceTiming(`${ms}ms`)
      const isTimeout = ice.error.toLowerCase().includes('timeout')
      setIceServersStatus(isTimeout ? '⏰' : '❌')
    }
    if (ice.data && ice.data.length > 0) {
      const ms = iceStartRef.current ? Date.now() - iceStartRef.current : 0
      setIceTiming(`${ms}ms`)
      setIceServersStatus('✅')
    }
  }, [ice.isLoading, ice.error, ice.data, DEBUG])

  // ── Test actions ──────────────────────────────────────────

  const handleConnectSignaling = useCallback(async () => {
    addLog('Conectando signaling...')
    try {
      await signalingService.connect()
      addLog('✅ Signaling conectado')
    } catch (err) {
      addLog(`❌ Signaling error: ${err instanceof Error ? err.message : err}`)
    }
  }, [addLog])

  const handleInitWebRTC = useCallback(async () => {
    addLog('Inicializando WebRTC...')
    try {
      await webRTCService.initialize()
      addLog('✅ WebRTC listo (ICE servers obtenidos)')
    } catch (err) {
      addLog(`❌ WebRTC init error: ${err instanceof Error ? err.message : err}`)
    }
  }, [addLog])

  const handleRequestMic = useCallback(async () => {
    addLog('Solicitando micrófono...')
    await webRTCService.requestMedia()
    if (webRTCService.hasMedia) {
      addLog('✅ Micrófono concedido')
    } else {
      addLog(`❌ Micrófono: ${webRTCService.error || 'denegado'}`)
    }
  }, [addLog])

  const handleStartCall = useCallback(async () => {
    addLog('Iniciando llamada (creando offer)...')
    try {
      await webRTCService.startCall()
      addLog('✅ Offer enviada, esperando answer...')
    } catch (err) {
      addLog(`❌ StartCall error: ${err instanceof Error ? err.message : err}`)
    }
  }, [addLog])

  // FASE A: aceptar la llamada. Emite call:accept de inmediato (sin exigir
  // offerReceived) y prepara media/ICE. NO crea la Answer aquí: eso ocurre en
  // Fase B (processOfferIfReady) cuando llegue call:offer.
  const handleAcceptCall = useCallback(async () => {
    console.log('[FLOW] Aceptar pulsado')
    if (!callRoomId) {
      addLog('❌ No hay roomId para aceptar')
      return
    }

    // 1) Emitir call:accept de inmediato (rompe la espera mutua).
    acceptedRef.current = true
    signalingService.emit('call:accept', { roomId: callRoomId })
    console.log('[FLOW] call:accept enviado')
    addLog('📤 call:accept enviado')

    // 2) Preparar WebRTC + micrófono para poder crear la Answer en Fase B.
    if (webRTCService.callState === 'idle' || webRTCService.callState === 'failed') {
      addLog('⚙️ Inicializando WebRTC...')
      try {
        await webRTCService.initialize()
        addLog('✅ WebRTC inicializado (ICE servers)')
      } catch (err) {
        addLog(`❌ Init error: ${err instanceof Error ? err.message : err}`)
        return
      }
    }
    if (!webRTCService.hasMedia) {
      addLog('🎤 Solicitando micrófono...')
      await webRTCService.requestMedia()
      if (!webRTCService.hasMedia) {
        addLog(`❌ Micrófono: ${webRTCService.error || 'denegado'}`)
        return
      }
      addLog('✅ Micrófono + audio tracks adjuntos')
    }

    // 3) Si la Offer ya llegó (o llega mientras preparábamos media), Fase B.
    void processOfferIfReady()
  }, [callRoomId, addLog, processOfferIfReady])

  const handleRejectCall = useCallback(() => {
    setIncomingCaller(null)
    setOfferReceived(null)
    addLog('❌ Llamada rechazada')
  }, [addLog])

  const handleDestroy = useCallback(() => {
    webRTCService.destroy()
    signalingService.disconnect()
    setOfferReceived(null)
    addLog('🧹 Recursos liberados')
  }, [addLog])

  const handleClearLog = useCallback(() => {
    logs.length = 0
    setLogLines([])
  }, [])

  const handleCopyLog = useCallback(() => {
    navigator.clipboard.writeText(logLines.join('\n')).catch(() => {})
  }, [logLines])

  // ── Email call handlers ─────────────────────────────────

  const openEmailModal = useCallback(() => {
    setEmailInput('')
    setEmailError(null)
    setShowEmailModal(true)
  }, [])

  const closeEmailModal = useCallback(() => {
    setShowEmailModal(false)
    setEmailInput('')
    setEmailError(null)
    setEmailLoading(false)
  }, [])

  const handleEmailCall = useCallback(async () => {
    const email = emailInput.trim()
    if (!email) {
      setEmailError('Ingresa un correo electrónico')
      return
    }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Correo electrónico inválido')
      return
    }

    setEmailLoading(true)
    setEmailError(null)

    try {
      const user = await findUserByEmail(email)
      // User found — proceed with call
      setShowEmailModal(false)
      addLog(`🔍 Usuario encontrado: ${user.uid} (${user.email})`)

      // Ensure signaling is connected
      if (!signalingService.connected) {
        await signalingService.connect()
        addLog('✅ Signaling conectado')
      }

      // ── Fase 1: call:start + esperar ringing/accepted ──
      addLog(`📞 Enviando call:start a ${user.email}...`)
      const status = await webRTCService.initiateCall(user.uid)
      addLog(`📞 Respuesta: ${status === 'ringing' ? '📳 Sonando' : '✅ Aceptada'}`)

      // ── Fase 2: WebRTC + offer (solo tras confirmación) ──
      if (webRTCService.callState === 'idle' || webRTCService.callState === 'failed') {
        await webRTCService.initialize()
        addLog('✅ WebRTC inicializado')
      }

      if (!webRTCService.hasMedia) {
        await webRTCService.requestMedia()
        if (!webRTCService.hasMedia) {
          addLog('❌ Micrófono no disponible')
          return
        }
        addLog('✅ Micrófono concedido')
      }

      addLog('📞 Creando offer...')
      await webRTCService.startCall()
      addLog(`✅ Offer enviada a ${user.email}`)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { status?: number } }
        if (axiosErr.response?.status === 404) {
          setEmailError('Usuario no encontrado.')
        } else {
          setEmailError('Usuario desconectado.')
        }
      } else if (err instanceof Error) {
        if (err.message === 'Usuario no autenticado') {
          setEmailError('Debes iniciar sesión primero.')
        } else {
          setEmailError('Usuario desconectado.')
        }
      } else {
        setEmailError('Usuario desconectado.')
      }
    } finally {
      setEmailLoading(false)
      setEmailInput('')
    }
  }, [emailInput, addLog])

  // ── Activation handlers ───────────────────────────────────

  useEffect(() => { history.fetch(); ice.fetch() }, []) // eslint-disable-line

  const handleActivate = useCallback(async () => {
    await activate.activate()
    if (!activate.error) history.fetch()
  }, [activate.activate, activate.error, history.fetch])

  const doCopy = useCallback(async () => {
    const num = activate.data?.numero || activate.data?.number || ''
    if (!num) return
    try {
      await navigator.clipboard.writeText(num)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = num; ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }, [activate.data])

  const phoneNumber = activate.data?.numero || activate.data?.number || ''
  const isActivated = !!phoneNumber

  const allCalls = [
    ...(history.data?.llamadas ?? []),
    ...(history.data?.conversations ?? []),
    ...(history.data?.history ?? []),
  ]

  return (
    <div className="flex flex-col px-4 py-4 gap-4 pb-24">
      {/* ═══ WEBRTC TEST PANEL ═══ */}
      <details open className="rounded-xl bg-neutral-900 border border-yellow-700/50 overflow-hidden">
        <summary className="px-4 py-3 bg-yellow-900/20 text-yellow-300 font-bold text-sm cursor-pointer select-none">
          🧪 Validación WebRTC
        </summary>
        <div className="p-4 space-y-3">
          {/* Status grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatusBadge label="Signaling" value={sigState} ok={isSigConnected} />
            <StatusBadge label="CallState" value={callState} ok={callState === 'negotiated' || callState === 'connected' || callState === 'media-ready'} />
            <StatusBadge label="Connection" value={connState} ok={connState === 'connected' as PeerConnectionState} />
            <StatusBadge label="Micrófono" value={hasMedia ? '✅' : '❌'} ok={hasMedia} />
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleConnectSignaling} disabled={isSigConnected}
              className="py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors">
              {isSigConnected ? '✅ Signaling' : '🔌 Conectar Signaling'}
            </button>
            <button onClick={handleInitWebRTC}
              className="py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">
              ⚙️ Inicializar WebRTC
            </button>
            <button onClick={handleRequestMic} disabled={hasMedia}
              className="py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors">
              🎤 Solicitar Micrófono
            </button>
            <button onClick={handleStartCall}
              className="py-2 px-3 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors">
              📞 Iniciar Llamada
            </button>
            <button onClick={handleAcceptCall} disabled={!offerReceived}
              className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors">
              {offerReceived ? '✅ Aceptar Llamada' : '⏳ Esperando offer...'}
            </button>
            <button onClick={handleDestroy}
              className="py-2 px-3 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium transition-colors">
              🧹 Liberar Recursos
            </button>
          </div>

          {/* Log panel */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-500">Logs</span>
              <div className="flex gap-2">
                <button onClick={handleCopyLog} className="text-[10px] text-neutral-600 hover:text-neutral-400">📋 Copiar</button>
                <button onClick={handleClearLog} className="text-[10px] text-neutral-600 hover:text-neutral-400">🗑️ Limpiar</button>
              </div>
            </div>
            <div ref={logRef} className="h-32 overflow-y-auto bg-black/40 rounded-lg p-2 font-mono text-[11px] leading-5 text-neutral-400 select-text">
              {logLines.length === 0 && (
                <span className="text-neutral-700">Esperando acciones...</span>
              )}
              {logLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>

          {/* ═══ DEBUG STEPS PANEL (solo ?debug=webrtc) ═══ */}
          {DEBUG && (
            <div className="border-t border-yellow-800/30 pt-3 mt-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider text-yellow-600 font-bold">🔬 Diagnóstico WebRTC</span>
                <span className="text-[10px] text-neutral-600">(DEBUG)</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                <div>
                  <DebugStepRow label="1. initialize()" status={initStatus} />
                  <DebugStepRow label="2. GET /ice-servers" status={iceServersStatus} detail={iceTiming} />
                  <DebugStepRow label="3. requestMedia()" status={mediaStatus} />
                  <DebugStepRow label="4. createOffer/Answer" status={sdpOfferStatus === '✅' ? sdpOfferStatus : sdpAnswerStatus === '🔄' ? '🔄' : sdpOfferStatus} />
                  <DebugStepRow label="5. setLocalDescription" status={setLocalStatus} />
                </div>
                <div>
                  <DebugStepRow label="6. setRemoteDescription" status={setRemoteStatus} />
                  <DebugStepRow label="7. ICE Connection" status={iceConnStatus} />
                  <DebugStepRow label="8. Connection State" status={peerConnStatus} />
                </div>
              </div>
            </div>
          )}
        </div>
      </details>

      {/* ═══ REST OF CALLS UI ═══ */}

      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">📞</span>
        <div>
          <h2 className="text-xl font-bold">Llamadas</h2>
          <p className="text-sm text-neutral-500">Traduce llamadas telefónicas reales con IA</p>
        </div>
      </div>

      {ice.data && (
        <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
          <p className="text-xs text-green-400">✓ ICE servers obtenidos ({ice.data.length})</p>
        </div>
      )}
      {ice.error && (
        <div className="p-3 rounded-xl bg-neutral-900 border border-red-800/50">
          <p className="text-xs text-red-400">✗ ICE servers: {ice.error}</p>
        </div>
      )}

      {/* ═══ NEW CALL BUTTON ═══ */}
      <button onClick={openEmailModal}
        className="w-full py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">
        ➕ Nueva llamada
      </button>

      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">Activación</h3>
        {!isActivated && !activate.isActivating && !activate.error && (
          <>
            <p className="text-sm text-neutral-500 mb-4">Activa tu número virtual para recibir llamadas traducidas.</p>
            <button onClick={handleActivate} className="w-full py-3 px-6 rounded-xl bg-white text-neutral-900 font-medium hover:bg-neutral-200 transition-colors">
              Activar llamadas
            </button>
          </>
        )}
        {activate.isActivating && (
          <div className="flex items-center gap-3 py-3">
            <div className="animate-pulse w-5 h-5 rounded-full bg-yellow-500" />
            <span className="text-sm text-neutral-400">Obteniendo número...</span>
          </div>
        )}
        {activate.error && !activate.isActivating && (
          <div>
            <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-red-900/30 border border-red-800/50">
              <span className="text-red-400 text-sm">❌ {activate.error}</span>
            </div>
            <button onClick={handleActivate} className="w-full py-3 px-6 rounded-xl bg-neutral-800 text-white font-medium hover:bg-neutral-700 transition-colors">
              Intentar de nuevo
            </button>
          </div>
        )}
        {isActivated && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-400 text-sm font-medium">✅ Activado</span>
            </div>
            <div className="mb-3 p-4 rounded-lg bg-neutral-800">
              <p className="text-xs text-neutral-500 mb-1">Tu número para recibir llamadas</p>
              <p className="text-xl font-mono font-bold tracking-wider text-white">{phoneNumber}</p>
              <p className="text-xs text-neutral-600 mt-1">Dale este número a quien te va a llamar</p>
            </div>
            <button onClick={doCopy} className="w-full py-3 px-6 rounded-xl bg-neutral-800 text-white font-medium hover:bg-neutral-700 transition-colors">
              {copied ? '✅ Copiado' : '📋 Copiar número'}
            </button>
          </div>
        )}
      </div>

      {ice.isLoading && (
        <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
          <p className="text-xs text-neutral-500">Obteniendo ICE servers...</p>
        </div>
      )}

      <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-1">Historial</h3>
      {history.isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse text-neutral-500 text-sm">Cargando historial...</div>
        </div>
      )}
      {history.error && !history.isLoading && (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="text-3xl mb-2">⚠️</span>
          <p className="text-red-400 text-sm">No se pudo cargar el historial</p>
        </div>
      )}
      {!history.isLoading && !history.error && allCalls.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="text-3xl mb-2">📭</span>
          <p className="text-neutral-500 text-sm">Aún no tienes llamadas</p>
        </div>
      )}
      {!history.isLoading && allCalls.length > 0 && (
        <div className="space-y-2">
          {allCalls.map((call, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-neutral-900 border border-neutral-800">
              <span className="text-xl">📞</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{directionLabel(call.direction)}</p>
                <p className="text-xs text-neutral-500">
                  {formatDateTime(call.startedAt || call.createdAt || call.timestamp)}
                  {call.duration ? ` · ${call.duration}s` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ EMAIL CALL MODAL ═══ */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeEmailModal}>
          <div className="w-full max-w-sm mx-4 p-6 rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-5">Llamar a</h3>

            <label className="block text-sm text-neutral-400 mb-1.5">Correo electrónico</label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !emailLoading) handleEmailCall() }}
              placeholder="usuario@ejemplo.com"
              className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white text-sm
                placeholder:text-neutral-600 focus:outline-none focus:border-blue-500 transition-colors
                disabled:opacity-50"
              disabled={emailLoading}
              autoFocus
            />

            {emailError && (
              <p className="mt-2 text-sm text-red-400">{emailError}</p>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={closeEmailModal} disabled={emailLoading}
                className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-medium
                  hover:bg-neutral-700 disabled:opacity-50 transition-colors text-sm">
                Cancelar
              </button>
              <button onClick={handleEmailCall} disabled={emailLoading}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium
                  hover:bg-blue-500 disabled:opacity-50 disabled:cursor-wait transition-colors text-sm">
                {emailLoading ? 'Buscando...' : 'Llamar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ INCOMING CALL OVERLAY ═══ */}
      {incomingCaller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => {}}>
          <div className="w-full max-w-xs mx-4 p-8 rounded-3xl bg-neutral-900 border border-neutral-700 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}>

            {/* Avatar / icon */}
            <div className="relative mx-auto mb-5 w-20 h-20 rounded-full bg-green-600/20 border-2 border-green-500 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full animate-ping bg-green-500/20" />
              <span className="text-4xl relative z-10">📞</span>
            </div>

            {/* Caller info */}
            <p className="text-lg font-semibold text-white mb-1">Llamada entrante</p>
            <p className="text-sm text-neutral-400 mb-2">
              {incomingCaller.email || incomingCaller.uid || 'Contacto'}
            </p>

            {/* Spinner while waiting for offer */}
            {!offerReceived && (
              <div className="flex items-center justify-center gap-2 mb-6 text-xs text-neutral-500">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                Estableciendo conexión...
              </div>
            )}
            {offerReceived && (
              <p className="text-xs text-green-400 mb-6">✓ Listo para conectar</p>
            )}

            {/* Action buttons */}
            <div className="flex gap-6 justify-center">
              <button onClick={handleRejectCall}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700
                  text-white text-2xl flex items-center justify-center
                  transition-all duration-150 shadow-lg hover:shadow-red-600/30
                  hover:scale-105 active:scale-95">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              <button onClick={handleAcceptCall}
                className={`w-16 h-16 rounded-full flex items-center justify-center
                  transition-all duration-150 shadow-lg
                  ${offerReceived
                    ? 'bg-green-600 hover:bg-green-500 active:bg-green-700 cursor-pointer hover:scale-105 active:scale-95 hover:shadow-green-600/30'
                    : 'bg-green-800 opacity-50 cursor-pointer'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" fill="currentColor" />
                </svg>
              </button>
            </div>

            {/* Label under buttons */}
            <div className="flex justify-center gap-12 mt-2 text-xs text-neutral-500">
              <span>Rechazar</span>
              <span className={offerReceived ? 'text-green-400' : 'text-neutral-600'}>
                {offerReceived ? 'Aceptar' : '...'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
