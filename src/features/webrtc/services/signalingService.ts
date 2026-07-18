import { io, Socket } from 'socket.io-client'
import { auth } from '@/config/firebase'
import type { SignalingState, SignalingListener, StateListener } from '../types/signaling'

const SERVER_URL = 'https://translvoz-pro-production.up.railway.app'

class SignalingService {
  private _socket: Socket | null = null
  private _state: SignalingState = 'disconnected'
  private _error: string | null = null
  private _stateListeners: StateListener[] = []
  private _eventListeners: Map<string, SignalingListener[]> = new Map()

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
      const unsub = this.on(event, (_e, data) => {
        unsub()
        resolve(data)
      })
      if (timeoutMs > 0) {
        setTimeout(() => {
          unsub()
          reject(new Error(`Timeout esperando "${event}"`))
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
      })

      this._socket.on('disconnect', () => {
        this._setState('disconnected')
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
    this._socket.emit(event, data)
  }

  disconnect(): void {
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
