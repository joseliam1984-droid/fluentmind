import { StrictMode } from 'react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  listeners: [] as Array<(u: unknown) => void | Promise<void>>,
  unsubscribe: vi.fn(),
  handleRedirectResult: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    h.listeners.push(cb)
    return () => {
      h.listeners = h.listeners.filter((l) => l !== cb)
      h.unsubscribe()
    }
  },
}))
vi.mock('@/config/firebase', () => ({ auth: {} }))
vi.mock('../services/authService', () => ({ handleRedirectResult: h.handleRedirectResult }))
vi.mock('../services/authTrace', () => ({
  authTrace: vi.fn(),
  describeError: (e: unknown) => ({ message: String(e) }),
}))

import { AuthProvider } from './AuthProvider'
import { useAuthStore } from '../store/authStore'

const emit = async (u: unknown) => {
  await act(async () => {
    await Promise.all(h.listeners.map((l) => l(u)))
  })
}

beforeEach(() => {
  h.listeners = []
  h.unsubscribe.mockReset()
  h.handleRedirectResult.mockReset()
  useAuthStore.getState().reset()
})

describe('AuthProvider', () => {
  test('restaura la sesión cuando Firebase emite un usuario', async () => {
    render(<AuthProvider>x</AuthProvider>)
    expect(useAuthStore.getState().isLoading).toBe(true)
    await emit({ uid: 'u1' })
    expect(useAuthStore.getState().user).toEqual({ uid: 'u1' })
    expect(useAuthStore.getState().isLoading).toBe(false)
    expect(h.handleRedirectResult).not.toHaveBeenCalled()
  })

  test('sin sesión y sin redirect pendiente: usuario null y deja de cargar', async () => {
    h.handleRedirectResult.mockResolvedValue(null)
    render(<AuthProvider>x</AuthProvider>)
    await emit(null)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  test('sin sesión pero con resultado de redirect: inicia sesión con ese usuario', async () => {
    h.handleRedirectResult.mockResolvedValue({ uid: 'r1' })
    render(<AuthProvider>x</AuthProvider>)
    await emit(null)
    expect(useAuthStore.getState().user).toEqual({ uid: 'r1' })
  })

  test('error del redirect: se guarda el mensaje y se deja de cargar', async () => {
    h.handleRedirectResult.mockRejectedValue(new Error('auth/redirect-failed'))
    render(<AuthProvider>x</AuthProvider>)
    await emit(null)
    expect(useAuthStore.getState().error).toBe('auth/redirect-failed')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  test('se desuscribe al desmontar', () => {
    const { unmount } = render(<AuthProvider>x</AuthProvider>)
    unmount()
    expect(h.unsubscribe).toHaveBeenCalledOnce()
  })

  test('bajo StrictMode (como main.tsx) el listener sigue vivo tras el montaje', async () => {
    render(
      <StrictMode>
        <AuthProvider>x</AuthProvider>
      </StrictMode>,
    )
    // Si el efecto no se re-suscribe tras el ciclo mount/unmount/mount de
    // StrictMode, nadie escucha y la app se queda en "Cargando..." para siempre.
    expect(h.listeners.length).toBeGreaterThan(0)
    await emit({ uid: 'u1' })
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})
