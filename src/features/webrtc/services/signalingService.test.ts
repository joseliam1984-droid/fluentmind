import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

type Handler = (...args: unknown[]) => void

class FakeSocket {
  connected = false
  handlers = new Map<string, Handler>()
  managerHandlers = new Map<string, Handler>()
  anyHandler: Handler | null = null
  emitted: Array<[string, unknown]> = []
  disconnected = false
  io = { on: (e: string, fn: Handler) => { this.managerHandlers.set(e, fn) } }
  on(e: string, fn: Handler) { this.handlers.set(e, fn) }
  onAny(fn: Handler) { this.anyHandler = fn }
  emit(e: string, d?: unknown) { this.emitted.push([e, d]) }
  removeAllListeners() { this.handlers.clear() }
  disconnect() { this.disconnected = true; this.connected = false }
  // helpers de test
  fire(e: string, ...a: unknown[]) { this.handlers.get(e)?.(...a) }
  serverEvent(e: string, ...a: unknown[]) { this.anyHandler?.(e, ...a) }
}

const h = vi.hoisted(() => ({
  socket: null as unknown,
  io: vi.fn(),
  currentUser: null as null | { getIdToken: () => Promise<string> },
}))

vi.mock('socket.io-client', () => ({ io: h.io }))
vi.mock('@/config/firebase', () => ({
  auth: {
    get currentUser() {
      return h.currentUser
    },
  },
}))

import { signalingService } from './signalingService'

let sock: FakeSocket

beforeEach(() => {
  sock = new FakeSocket()
  h.io.mockReset()
  h.io.mockImplementation(() => sock)
  h.currentUser = { getIdToken: async () => 'tok-123' }
})

afterEach(() => {
  signalingService.disconnect()
})

describe('connect', () => {
  test('sin usuario autenticado falla con estado error y no abre socket', async () => {
    h.currentUser = null
    await expect(signalingService.connect()).rejects.toThrow('Usuario no autenticado')
    expect(signalingService.state).toBe('error')
    expect(h.io).not.toHaveBeenCalled()
  })

  test('envía el ID token en auth y pasa a connected al conectar', async () => {
    await signalingService.connect()
    const [, opts] = h.io.mock.calls[0]
    expect(opts.auth).toEqual({ token: 'tok-123' })
    expect(signalingService.state).toBe('connecting')
    sock.connected = true
    sock.fire('connect')
    expect(signalingService.connected).toBe(true)
  })

  test('connect_error guarda el mensaje y estado error', async () => {
    await signalingService.connect()
    sock.fire('connect_error', new Error('token inválido'))
    expect(signalingService.state).toBe('error')
    expect(signalingService.error).toBe('token inválido')
  })

  test('reconnect_attempt refleja estado reconnecting y disconnect lo marca disconnected', async () => {
    await signalingService.connect()
    sock.managerHandlers.get('reconnect_attempt')?.()
    expect(signalingService.state).toBe('reconnecting')
    sock.fire('disconnect', 'transport close')
    expect(signalingService.state).toBe('disconnected')
  })
})

describe('heartbeat', () => {
  test('emite heartbeat cada 15 s mientras está conectado y se detiene al desconectar', async () => {
    vi.useFakeTimers()
    await signalingService.connect()
    sock.connected = true
    sock.fire('connect')
    vi.advanceTimersByTime(15000)
    vi.advanceTimersByTime(15000)
    expect(sock.emitted.filter(([e]) => e === 'heartbeat')).toHaveLength(2)
    signalingService.disconnect()
    sock.connected = true
    vi.advanceTimersByTime(60000)
    expect(sock.emitted.filter(([e]) => e === 'heartbeat')).toHaveLength(2)
  })
})

describe('eventos', () => {
  test('reenvía eventos del servidor a los listeners y permite desuscribir', async () => {
    await signalingService.connect()
    const fn = vi.fn()
    const off = signalingService.on('call:incoming', fn)
    sock.serverEvent('call:incoming', { roomId: 'r1' })
    expect(fn).toHaveBeenCalledWith('call:incoming', { roomId: 'r1' })
    off()
    sock.serverEvent('call:incoming', { roomId: 'r2' })
    expect(fn).toHaveBeenCalledOnce()
  })

  test('waitForEvent resuelve con el payload y limpia el timeout', async () => {
    vi.useFakeTimers()
    await signalingService.connect()
    const p = signalingService.waitForEvent('call:ringing', 30000)
    sock.serverEvent('call:ringing', { roomId: 'r9' })
    await expect(p).resolves.toEqual({ roomId: 'r9' })
    expect(vi.getTimerCount()).toBe(0)
  })

  test('waitForEvent rechaza por timeout y deja de escuchar', async () => {
    vi.useFakeTimers()
    await signalingService.connect()
    const p = signalingService.waitForEvent('call:accepted', 1000)
    const assertion = expect(p).rejects.toThrow('Timeout esperando "call:accepted"')
    vi.advanceTimersByTime(1000)
    await assertion
  })
})

describe('emit', () => {
  test('sin conexión no emite y avisa por consola', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    signalingService.emit('call:start', { targetUid: 'x' })
    expect(warn).toHaveBeenCalled()
  })

  test('conectado emite el evento con su payload', async () => {
    await signalingService.connect()
    sock.connected = true
    signalingService.emit('call:accept', { roomId: 'r1' })
    expect(sock.emitted).toContainEqual(['call:accept', { roomId: 'r1' }])
  })
})

describe('waitForAny', () => {
  test('resuelve con el primer evento que llega e ignora y limpia el resto', async () => {
    vi.useFakeTimers()
    await signalingService.connect()
    const p = signalingService.waitForAny(['call:ringing', 'call:error'], 30000)
    sock.serverEvent('call:error', { message: 'contacto_ocupado' })
    await expect(p).resolves.toEqual({ event: 'call:error', data: { message: 'contacto_ocupado' } })
    expect(vi.getTimerCount()).toBe(0)
    // el otro evento ya no tiene listener: no hay rechazos pendientes
    sock.serverEvent('call:ringing', { roomId: 'x' })
  })

  test('rechaza por timeout una sola vez', async () => {
    vi.useFakeTimers()
    await signalingService.connect()
    const p = signalingService.waitForAny(['a', 'b'], 500)
    const assertion = expect(p).rejects.toThrow('Timeout esperando')
    vi.advanceTimersByTime(500)
    await assertion
  })
})
