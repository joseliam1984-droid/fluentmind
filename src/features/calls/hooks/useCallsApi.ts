import { useState, useCallback } from 'react'
import { getHistory, getIceServers, activateCall } from '../services/callsService'
import type { CallRecord, IceServer, ActivateResponse } from '../types'

export function useCallsHistory() {
  const [data, setData] = useState<CallRecord[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getHistory()
      setData(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar historial'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { data, isLoading, error, fetch }
}

export function useIceServers() {
  const [data, setData] = useState<IceServer[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getIceServers()
      setData(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al obtener ICE servers'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { data, isLoading, error, fetch }
}

export function useActivateCall() {
  const [data, setData] = useState<ActivateResponse | null>(null)
  const [isActivating, setIsActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Devuelve true si la activación tuvo éxito (el estado `error` no sirve tras un await: es una captura obsoleta). */
  const activate = useCallback(async (): Promise<boolean> => {
    if (isActivating) return false // evitar múltiples
    setIsActivating(true)
    setError(null)
    try {
      const result = await activateCall()
      setData(result)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al activar'
      setError(msg)
      return false
    } finally {
      setIsActivating(false)
    }
  }, [isActivating])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  return { data, isActivating, error, activate, reset }
}
