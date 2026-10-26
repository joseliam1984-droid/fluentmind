import { describe, test, expect, vi, beforeEach } from 'vitest'
import { installWebRTCFakes, FakeRTCPeerConnection, makeFakeStream } from '@/test/webrtcFakes'

type Listener = (event: string, data: unknown) => void

const h = vi.hoisted(() => ({
  listeners: new Map<string, Listener>(),
  emit: vi.fn(),
  waitForAny: vi.fn(),
  getIceServers: vi.fn(),
}))

vi.mock('./signalingService', () => ({
  signalingService: {
    on: (event: string, fn: Listener) => {
      h.listeners.set(event, fn)
      return () => {
        if (h.listeners.get(event) === fn) h.listeners.delete(event)
      }
    },
    emit: h.emit,
    waitForAny: h.waitForAny,
  },
}))
vi.mock('@/features/calls/services/callsService', () => ({ getIceServers: h.getIceServers }))

import { webRTCService } from './webRTCService'

const ICE = 'call:ice-candidate'
const RINGING = { event: 'call:ringing', data: { roomId: 'r1' } }
const ACCEPTED = { event: 'call:accepted', data: {} }
const cand = (n: number) => ({ roomId: 'r1', candidate: { candidate: `candidate:${n}`, sdpMid: '0', sdpMLineIndex: 0 } })
const deliver = (data: unknown) => h.listeners.get(ICE)?.(ICE, data)
const peer = () => FakeRTCPeerConnection.instances[FakeRTCPeerConnection.instances.length - 1]

beforeEach(() => {
  installWebRTCFakes()
  h.listeners.clear()
  h.emit.mockReset()
  h.waitForAny.mockReset()
  h.getIceServers.mockReset()
  h.getIceServers.mockResolvedValue([{ urls: 'stun:x' }, { urls: 'turn:y', username: 'u', credential: 'c' }])
  webRTCService.destroy()
})

describe('initialize', () => {
  test('obtiene ICE servers, crea el peer con ellos y queda ready', async () => {
    await webRTCService.initialize()
    expect(webRTCService.callState).toBe('ready')
    expect(peer().config).toEqual({
      iceServers: [{ urls: 'stun:x' }, { urls: 'turn:y', username: 'u', credential: 'c' }],
    })
  })

  test('si falla la obtención de ICE servers: estado failed, error visible y relanza', async () => {
    h.getIceServers.mockRejectedValue(new Error('Empty ICE servers from backend'))
    await expect(webRTCService.initialize()).rejects.toThrow('Empty ICE')
    expect(webRTCService.callState).toBe('failed')
    expect(webRTCService.error).toContain('Empty ICE')
  })
})

describe('requestMedia', () => {
  const stubMedia = (impl: () => Promise<unknown>) =>
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(impl) } })

  test('concede el micrófono y adjunta los tracks al peer', async () => {
    const { stream, track } = makeFakeStream()
    stubMedia(async () => stream)
    await webRTCService.initialize()
    await webRTCService.requestMedia()
    expect(webRTCService.hasMedia).toBe(true)
    expect(webRTCService.callState).toBe('media-ready')
    expect(peer().addedTracks).toContain(track)
  })

  test('permiso denegado: estado permission-denied con mensaje claro', async () => {
    stubMedia(async () => { throw new DOMException('no', 'NotAllowedError') })
    await webRTCService.requestMedia()
    expect(webRTCService.callState).toBe('permission-denied')
    expect(webRTCService.error).toBe('Permiso de micrófono denegado')
    expect(webRTCService.hasMedia).toBe(false)
  })

  test('otro error del dispositivo: estado failed', async () => {
    stubMedia(async () => { throw new Error('NotFoundError: sin micrófono') })
    await webRTCService.requestMedia()
    expect(webRTCService.callState).toBe('failed')
    expect(webRTCService.error).toContain('sin micrófono')
  })
})

describe('flujo del llamante', () => {
  test('call:start → ringing (roomId) → accepted; luego la offer lleva ese roomId', async () => {
    h.waitForAny
      .mockResolvedValueOnce(RINGING)
      .mockResolvedValueOnce(ACCEPTED)
    expect(await webRTCService.initiateCall('uid-destino')).toBe('accepted')
    expect(h.emit).toHaveBeenCalledWith('call:start', { targetUid: 'uid-destino' })
    expect(h.waitForAny.mock.calls[0][0]).toContain('call:ringing')
    expect(h.waitForAny.mock.calls[1][0]).toContain('call:accepted')
    expect(webRTCService.roomId).toBe('r1')

    await webRTCService.startCall()
    expect(h.emit).toHaveBeenCalledWith('call:offer', {
      roomId: 'r1',
      sdp: { type: 'offer', sdp: 'offer-sdp' },
    })
    expect(webRTCService.callState).toBe('waiting-answer')
  })

  test('si nadie contesta (timeout de ringing) la promesa se rechaza', async () => {
    h.waitForAny.mockRejectedValueOnce(new Error('Timeout esperando "call:ringing"'))
    await expect(webRTCService.initiateCall('x')).rejects.toThrow('Timeout')
  })

  test('call:error en la fase de ringing (destinatario no disponible) corta la espera con su código', async () => {
    h.waitForAny.mockResolvedValueOnce({ event: 'call:error', data: { message: 'destinatario_no_disponible' } })
    await expect(webRTCService.initiateCall('x')).rejects.toMatchObject({ code: 'destinatario_no_disponible' })
    expect(h.waitForAny).toHaveBeenCalledTimes(1)
  })

  test('contacto ocupado se reporta con su código', async () => {
    h.waitForAny.mockResolvedValueOnce({ event: 'call:error', data: { message: 'contacto_ocupado' } })
    await expect(webRTCService.initiateCall('x')).rejects.toMatchObject({ code: 'contacto_ocupado' })
  })

  test('call:declined tras ringing (el destinatario rechazó) lanza llamada_rechazada', async () => {
    h.waitForAny.mockResolvedValueOnce(RINGING).mockResolvedValueOnce({ event: 'call:declined', data: { roomId: 'r1' } })
    await expect(webRTCService.initiateCall('x')).rejects.toMatchObject({ code: 'llamada_rechazada' })
  })

  test('call:ended mientras suena lanza llamada_finalizada', async () => {
    h.waitForAny.mockResolvedValueOnce(RINGING).mockResolvedValueOnce({ event: 'call:ended', data: {} })
    await expect(webRTCService.initiateCall('x')).rejects.toMatchObject({ code: 'llamada_finalizada' })
  })

  test('aplica la answer remota y queda negotiated', async () => {
    await webRTCService.initialize()
    await webRTCService.setRemoteAnswer({ type: 'answer', sdp: 'a' })
    expect(peer().remoteDescription?.type).toBe('answer')
    expect(webRTCService.callState).toBe('negotiated')
  })
})

describe('flujo del receptor', () => {
  test('acceptCall fija el roomId, aplica la offer y emite call:answer con ese roomId', async () => {
    await webRTCService.initialize()
    await webRTCService.acceptCall({ type: 'offer', sdp: 'o' }, 'room-7')
    expect(webRTCService.roomId).toBe('room-7')
    expect(h.emit).toHaveBeenCalledWith('call:answer', {
      roomId: 'room-7',
      sdp: { type: 'answer', sdp: 'answer-sdp' },
    })
  })
})

describe('candidatos ICE', () => {
  test('los remotos que llegan antes de remoteDescription se encolan y se aplican después', async () => {
    await webRTCService.initialize()
    deliver(cand(1))
    deliver(cand(2))
    expect(peer().addedCandidates).toHaveLength(0)
    expect(webRTCService.pendingCandidates).toHaveLength(2)

    await webRTCService.setRemoteAnswer({ type: 'answer', sdp: 'a' })
    await Promise.resolve()
    expect(peer().addedCandidates).toHaveLength(2)
    expect(webRTCService.pendingCandidates).toHaveLength(0)
  })

  test('con remoteDescription ya aplicada se agregan de inmediato', async () => {
    await webRTCService.initialize()
    await webRTCService.setRemoteAnswer({ type: 'answer', sdp: 'a' })
    deliver(cand(3))
    await Promise.resolve()
    expect(peer().addedCandidates).toHaveLength(1)
  })

  test('payloads inválidos se ignoran sin romper', async () => {
    await webRTCService.initialize()
    deliver(undefined)
    deliver({ roomId: 'r1' })
    deliver({ roomId: 'r1', candidate: {} })
    expect(webRTCService.pendingCandidates).toHaveLength(0)
  })

  test('los candidatos locales se emiten con el roomId de la llamada', async () => {
    h.waitForAny.mockResolvedValueOnce(RINGING).mockResolvedValueOnce(ACCEPTED)
    await webRTCService.initiateCall('x')
    await webRTCService.initialize()
    peer().onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate:L' }) } })
    peer().onicecandidate?.({ candidate: null }) // fin de candidatos: no se emite
    const calls = h.emit.mock.calls.filter((c) => c[0] === ICE)
    expect(calls).toEqual([[ICE, { roomId: 'r1', candidate: { candidate: 'candidate:L' } }]])
  })

  test('un candidato que llega MIENTRAS se inicializa (antes de que exista el peer) no se pierde', async () => {
    let release!: (v: unknown) => void
    h.getIceServers.mockReturnValue(new Promise((r) => { release = r }))
    const init = webRTCService.initialize()
    // el servidor ya reenvía candidatos del llamante mientras el receptor pide los ICE servers
    deliver(cand(9))
    release([{ urls: 'stun:x' }])
    await init
    await webRTCService.setRemoteOffer({ type: 'offer', sdp: 'o' })
    await Promise.resolve()
    expect(peer().addedCandidates).toHaveLength(1)
  })
})

describe('desconexión y fin de llamada', () => {
  test('connectionState failed marca la llamada como failed', async () => {
    await webRTCService.initialize()
    peer().connectionState = 'failed'
    peer().onconnectionstatechange?.()
    expect(webRTCService.callState).toBe('failed')
    expect(webRTCService.connectionState).toBe('failed')
  })

  test('destroy detiene el micrófono, cierra el peer, limpia el roomId y deja de escuchar ICE', async () => {
    const { stream, track } = makeFakeStream()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } })
    h.waitForAny.mockResolvedValueOnce(RINGING).mockResolvedValueOnce(ACCEPTED)
    await webRTCService.initiateCall('x')
    await webRTCService.initialize()
    await webRTCService.requestMedia()
    const p = peer()

    webRTCService.destroy()
    expect(track.stop).toHaveBeenCalled()
    expect(p.closed).toBe(true)
    expect(webRTCService.roomId).toBeNull()
    expect(webRTCService.hasMedia).toBe(false)
    expect(webRTCService.callState).toBe('idle')
    expect(h.listeners.has(ICE)).toBe(false)
  })

  test('tras destroy se puede iniciar otra llamada con un peer nuevo', async () => {
    await webRTCService.initialize()
    const first = peer()
    webRTCService.destroy()
    await webRTCService.initialize()
    expect(peer()).not.toBe(first)
    expect(webRTCService.callState).toBe('ready')
  })
})
