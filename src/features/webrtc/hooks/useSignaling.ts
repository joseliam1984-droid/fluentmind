import { useState, useEffect, useCallback, useRef } from 'react'
import { signalingService } from '../services/signalingService'
import type { SignalingState } from '../types/signaling'

export function useSignaling() {
  const [state, setState] = useState<SignalingState>(signalingService.state)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const unsub = signalingService.onStateChange((newState) => {
      if (!mountedRef.current) return
      setState(newState)
      if (signalingService.error) {
        setError(signalingService.error)
      }
    })
    return () => {
      mountedRef.current = false
      unsub()
    }
  }, [])

  const connect = useCallback(async () => {
    setError(null)
    try {
      await signalingService.connect()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión'
      if (mountedRef.current) setError(msg)
    }
  }, [])

  const disconnect = useCallback(() => {
    signalingService.disconnect()
    if (mountedRef.current) {
      setError(null)
    }
  }, [])

  return {
    state,
    error,
    connected: state === 'connected',
    connect,
    disconnect,
  }
}
