import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

type Handlers = {
  onText: (t: string) => void
  onError: (m: string, c: string) => void
  onEnd: () => void
}

const h = vi.hoisted(() => ({
  listeners: new Map<string, (e: string, d: unknown) => void>(),
  emit: vi.fn(),
  translate: vi.fn(),
  speak: vi.fn(),
  handlers: null as null | Handlers,
  stop: vi.fn(),
  listenCalls: 0,
}))

vi.mock('@/features/webrtc/services/signalingService', () => ({
  signalingService: {
    on: (e: string, fn: (e: string, d: unknown) => void) => {
      h.listeners.set(e, fn)
      return () => h.listeners.delete(e)
    },
    emit: h.emit,
  },
}))
vi.mock('./translationService', async (orig) => {
  const real = await orig<typeof import('./translationService')>()
  return { ...real, translateText: h.translate }
})
vi.mock('./speech', () => ({
  listenOnce: (_lang: string, handlers: Handlers) => {
    h.handlers = handlers
    h.listenCalls++
    return { stop: h.stop }
  },
  speak: h.speak,
}))

import { useCaptions } from './useCaptions'
import { TranslationError } from './translationService'

const base = { roomId: 'r1', active: true, myLang: 'es' as const, speakIncoming: false }

beforeEach(() => {
  h.listeners.clear()
  h.emit.mockReset()
  h.translate.mockReset()
  h.speak.mockReset()
  h.stop.mockReset()
  h.handlers = null
  h.listenCalls = 0
})

describe('useCaptions', () => {
  test('mi voz: reconoce, traduce y la envía con call:caption al otro usuario', async () => {
    h.translate.mockResolvedValue('Hello')
    const { result } = renderHook(() => useCaptions(base))
    await act(async () => { h.handlers!.onText('Hola') })
    await waitFor(() => expect(h.emit).toHaveBeenCalled())
    expect(h.translate).toHaveBeenCalledWith('Hola', 'es', 'en')
    const [event, payload] = h.emit.mock.calls[0]
    expect(event).toBe('call:caption')
    expect(payload).toMatchObject({ roomId: 'r1', text: 'Hola', lang: 'es', translated: 'Hello', translatedLang: 'en' })
    expect(result.current.lines).toEqual([expect.objectContaining({ own: true, text: 'Hello', original: 'Hola' })])
  })

  test('recibe un subtítulo del otro usuario y lo muestra; ignora otras salas y basura', () => {
    const { result } = renderHook(() => useCaptions(base))
    const incoming = h.listeners.get('call:caption')!
    act(() => {
      incoming('call:caption', { roomId: 'OTRA', text: 'x', lang: 'en', translated: 'y', translatedLang: 'es' })
      incoming('call:caption', 'basura')
      incoming('call:caption', { roomId: 'r1', text: 'Good morning', lang: 'en', translated: 'Buenos días', translatedLang: 'es' })
    })
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0]).toMatchObject({ own: false, text: 'Buenos días', original: 'Good morning' })
    expect(h.speak).not.toHaveBeenCalled()
  })

  test('con "leer en voz alta" lee el subtítulo entrante en el idioma traducido', () => {
    renderHook(() => useCaptions({ ...base, speakIncoming: true }))
    act(() => {
      h.listeners.get('call:caption')!('call:caption', {
        roomId: 'r1', text: 'Hi', lang: 'en', translated: 'Hola', translatedLang: 'es',
      })
    })
    expect(h.speak).toHaveBeenCalledWith('Hola', 'es')
  })

  test('un fallo de traducción muestra el error y NO envía nada al otro usuario', async () => {
    h.translate.mockRejectedValue(new TranslationError('server', 'Error del servidor al traducir.'))
    const { result } = renderHook(() => useCaptions(base))
    await act(async () => { h.handlers!.onText('Hola') })
    await waitFor(() => expect(result.current.error).toBe('Error del servidor al traducir.'))
    expect(h.emit).not.toHaveBeenCalled()
  })

  test('permiso de micrófono denegado: muestra el error y no reintenta', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCaptions(base))
    act(() => { h.handlers!.onError('Permiso de micrófono denegado.', 'not-allowed'); h.handlers!.onEnd() })
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(result.current.error).toBe('Permiso de micrófono denegado.')
    expect(h.listenCalls).toBe(1)
  })

  test('el silencio (no-speech) no es un error y se vuelve a escuchar', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useCaptions(base))
    act(() => { h.handlers!.onError('No se escuchó nada.', 'no-speech'); h.handlers!.onEnd() })
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(result.current.error).toBeNull()
    expect(h.listenCalls).toBe(2)
  })

  test('inactivo o sin roomId: no escucha ni se suscribe; al desmontar libera todo', () => {
    renderHook(() => useCaptions({ ...base, active: false }))
    renderHook(() => useCaptions({ ...base, roomId: null }))
    expect(h.listenCalls).toBe(0)
    expect(h.listeners.size).toBe(0)

    const { unmount } = renderHook(() => useCaptions(base))
    expect(h.listeners.has('call:caption')).toBe(true)
    unmount()
    expect(h.stop).toHaveBeenCalled()
    expect(h.listeners.has('call:caption')).toBe(false)
  })
})
