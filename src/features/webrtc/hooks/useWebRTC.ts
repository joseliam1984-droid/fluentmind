import { useState, useCallback, useEffect, useRef } from 'react'
import { webRTCService } from '../services/webRTCService'
import type { CallState, PeerConnectionState } from '../types'

export function useWebRTC() {
  const [callState, setCallState] = useState<CallState>(webRTCService.callState)
  const [connectionState, setConnectionState] = useState<PeerConnectionState>(
    webRTCService.connectionState,
  )
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [hasMedia, setHasMedia] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const unsub = webRTCService.onStateChange(() => {
      if (!mountedRef.current) return
      setCallState(webRTCService.callState)
      setConnectionState(webRTCService.connectionState)
      setHasMedia(webRTCService.hasMedia)
      setIsReady(webRTCService.callState === 'ready')
      if (webRTCService.error) {
        setError(webRTCService.error)
      }
    })
    return () => {
      mountedRef.current = false
      unsub()
    }
  }, [])

  const initialize = useCallback(async () => {
    setError(null)
    try {
      await webRTCService.initialize()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al inicializar WebRTC'
      if (mountedRef.current) setError(msg)
    }
  }, [])

  const requestMedia = useCallback(async () => {
    setError(null)
    await webRTCService.requestMedia()
    if (webRTCService.error && mountedRef.current) {
      setError(webRTCService.error)
    }
  }, [])

  const startCall = useCallback(async () => {
    setError(null)
    try {
      await webRTCService.startCall()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar llamada'
      if (mountedRef.current) setError(msg)
    }
  }, [])

  const acceptCall = useCallback(async (offerSdp: RTCSessionDescriptionInit) => {
    setError(null)
    try {
      await webRTCService.acceptCall(offerSdp)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al aceptar llamada'
      if (mountedRef.current) setError(msg)
    }
  }, [])

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    try {
      await webRTCService.addIceCandidate(candidate)
    } catch {
      // ignore
    }
  }, [])

  const destroy = useCallback(() => {
    webRTCService.destroy()
    if (mountedRef.current) {
      setIsReady(false)
      setHasMedia(false)
      setError(null)
    }
  }, [])

  return {
    callState,
    connectionState,
    error,
    isReady,
    hasMedia,
    localStream: webRTCService.localStream,
    pendingCandidates: webRTCService.pendingCandidates,
    initialize,
    requestMedia,
    startCall,
    acceptCall,
    addIceCandidate,
    destroy,
  }
}
