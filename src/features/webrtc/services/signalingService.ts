import { io, Socket } from 'socket.io-client'
import { auth } from '@/config/firebase'
import { API_BASE_URL } from '@/config/env'
import type { SignalingState, SignalingListener, StateListener } from '../types/signaling'

const SERVER_URL = API_BASE_URL

class SignalingService {
  private _socket: Socket | null = null
  private _state: SignalingState = 'disconnected'
  private _error: string | null = null
  private _stateListeners: StateListener[] = []
  private _eventListeners: Map<string, SignalingListener[]> = new Map()
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null

  get state(): SignalingState {
    return this._state
  }

  get error(): string | null {
    return this._error
  }

  get connected(): boolean {
    return this._state === 'connected'
  }

  onStateChange(fn: StateListener): () => void {
    this._stateListeners.push(fn)
    return () => {
      this._stateListeners = this._stateListeners.filter((l) => l !== fn)
    }
  }

  on(event: string, fn: SignalingListener): () => void {
    const list = this._eventListeners.get(event) || []
    list.push(fn)
    this._eventListeners.set(event, list)
    return () => {
      const updated = list.filter((l) => l !== fn)
      if (updated.length === 0) {
        this._eventListeners.delete(event)
      } else {
        this._eventListeners.set(event, updated)
      }
    }
  }

  /**
   * Escucha un evento UNA SOLA vez y resuelve la promesa con los datos.
   * Útil para esperar call:ringing / call:accepted.
   */
  waitForEvent(event: string, timeoutMs: number = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const unsub = this.on(event, (_e, data) => {
        unsub()
        if (timer !== null) clearTimeout(timer)
        resolve(data)
      })
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          unsub()
          reject(new Error(`Timeout esperando "${event}"`))
        }, timeoutMs)
      }
    })
  }

  /**
   * Espera el PRIMERO de varios eventos (p. ej. call:ringing o call:error) y
   * resuelve con cuál llegó. Un solo timer y limpieza de todos los listeners,
   * para que el evento "perdedor" no deje rechazos sin manejar.
   */
  waitForAny(events: string[], timeoutMs: number = 30000): Promise<{ event: string; data: unknown }> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const unsubs: Array<() => void> = []
      const cleanup = () => {
        unsubs.forEach((u) => u())
        if (timer !== null) clearTimeout(timer)
      }
      for (const event of events) {
        unsubs.push(
          this.on(event, (_e, data) => {
            cleanup()
            resolve({ event, data })
          }),
        )
      }
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          cleanup()
          reject(new Error(`Timeout esperando "${events.join('" o "')}"`))
        }, timeoutMs)
      }
    })
  }

  private _emit(event: string, data: unknown): void {
    const listeners = this._eventListeners.get(event)
    if (listeners) {
      listeners.forEach((fn) => fn(event, data))
    }
  }

  /** Iniciar heartbeat cada 15s. Limpia intervalo anterior si existe. */
  private _startHeartbeat(): void {
    this._stopHeartbeat()
    this._heartbeatTimer = setInterval(() => {
      this.emit('heartbeat')
      this._log('HEARTBEAT_SENT')
    }, 15000)
  }

  /** Detener heartbeat. */
  private _stopHeartbeat(): void {
    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }

  /** Log temporal con timestamp en consola */
  private _log(label: string, detail?: string): void {
    const d = new Date()
    const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
    console.log(`[${ts}] ${label}${detail ? ` ${detail}` : ''}`)
  }

  private _setState(state: SignalingState): void {
    this._state = state
    this._stateListeners.forEach((fn) => fn(state))
  }

  async connect(): Promise<void> {
    if (this._socket?.connected) return

    this._setState('connecting')
    this._error = null

    const user = auth.currentUser
    if (!user) {
      this._error = 'Usuario no autenticado'
      this._setState('error')
      throw new Error(this._error)
    }

    try {
      const token = await user.getIdToken()

      this._socket = io(SERVER_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      })

      this._socket.on('connect', () => {
        this._setState('connected')
        this._startHeartbeat()
        this._log('CONNECT')
      })

      this._socket.on('disconnect', (reason) => {
        this._setState('disconnected')
        this._stopHeartbeat()
        this._log('DISCONNECT', reason)
      })

      this._socket.io.on('reconnect_attempt', () => {
        this._setState('reconnecting')
      })

      this._socket.on('connect_error', (err) => {
        this._error = err.message
        this._setState('error')
      })

      // Forward all incoming events to registered listeners
      this._socket.onAny((event, ...args) => {
        if (event === 'heartbeat') {
          this._log('HEARTBEAT_RESPONSE')
        } else if (event === 'call:ringing') this._log('CALL_RINGING')
        else if (event === 'call:incoming') this._log('CALL_INCOMING')
        else if (event === 'call:accepted') this._log('CALL_ACCEPTED')
        else if (event === 'call:error') {
          const msg = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0])
          this._log('CALL_ERROR', msg)
        }
        this._emit(event, args.length === 1 ? args[0] : args)
      })
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Error de conexión'
      this._setState('error')
      throw err
    }
  }

  emit(event: string, data?: unknown): void {
    if (!this._socket?.connected) {
      console.warn('[Signaling] Intento de emit sin conexión:', event)
      return
    }
    if (event === 'call:start') {
      const uid = typeof data === 'object' && data !== null ? (data as any).targetUid ?? JSON.stringify(data) : data
      this._log('CALL_START', `targetUid=${uid}`)
    }
    this._socket.emit(event, data)
  }

  disconnect(): void {
    this._stopHeartbeat()
    if (this._socket) {
      this._socket.removeAllListeners()
      this._socket.disconnect()
      this._socket = null
    }
    this._setState('disconnected')
    this._error = null
  }
}

export const signalingService = new SignalingService()
