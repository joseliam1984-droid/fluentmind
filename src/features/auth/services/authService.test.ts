import { describe, test, expect, vi, beforeEach } from 'vitest'

const fb = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
  getRedirectResult: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  ...fb,
  GoogleAuthProvider: class {},
}))
vi.mock('@/config/firebase', () => ({ auth: { currentUser: null } }))
vi.mock('./authTrace', () => ({
  authTrace: vi.fn(),
  describeError: (e: unknown) => ({ message: String(e) }),
}))

import { login, logout, handleRedirectResult } from './authService'
import { authTrace } from './authTrace'

function setStandalone(displayMode: boolean, iosStandalone?: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: displayMode }))
  Object.defineProperty(window.navigator, 'standalone', { value: iosStandalone, configurable: true })
}

beforeEach(() => {
  Object.values(fb).forEach((f) => f.mockReset())
  setStandalone(false, undefined)
})

describe('login', () => {
  test('navegador normal: usa popup y devuelve el usuario', async () => {
    fb.signInWithPopup.mockResolvedValue({ user: { uid: 'u1' } })
    const user = await login()
    expect(fb.signInWithPopup).toHaveBeenCalledOnce()
    expect(fb.signInWithRedirect).not.toHaveBeenCalled()
    expect(user).toEqual({ uid: 'u1' })
  })

  test('PWA Android/desktop (display-mode: standalone): usa redirect y devuelve null', async () => {
    setStandalone(true)
    fb.signInWithRedirect.mockResolvedValue(undefined)
    expect(await login()).toBeNull()
    expect(fb.signInWithRedirect).toHaveBeenCalledOnce()
    expect(fb.signInWithPopup).not.toHaveBeenCalled()
  })

  test('PWA iOS (navigator.standalone): usa redirect', async () => {
    setStandalone(false, true)
    fb.signInWithRedirect.mockResolvedValue(undefined)
    await login()
    expect(fb.signInWithRedirect).toHaveBeenCalledOnce()
  })

  test('propaga el error del popup (cerrado/bloqueado)', async () => {
    fb.signInWithPopup.mockRejectedValue(new Error('auth/popup-closed-by-user'))
    await expect(login()).rejects.toThrow('popup-closed-by-user')
  })
})

describe('handleRedirectResult', () => {
  test('devuelve el usuario cuando hay resultado', async () => {
    fb.getRedirectResult.mockResolvedValue({ user: { uid: 'r1' } })
    expect(await handleRedirectResult()).toEqual({ uid: 'r1' })
  })

  test('devuelve null cuando no hay redirect pendiente', async () => {
    fb.getRedirectResult.mockResolvedValue(null)
    expect(await handleRedirectResult()).toBeNull()
  })

  test('registra y re-lanza el error sin tragarlo', async () => {
    fb.getRedirectResult.mockRejectedValue(new Error('boom'))
    await expect(handleRedirectResult()).rejects.toThrow('boom')
    expect(authTrace).toHaveBeenCalledWith('61 redirect-result-error', expect.anything())
  })
})

test('logout llama a signOut', async () => {
  fb.signOut.mockResolvedValue(undefined)
  await logout()
  expect(fb.signOut).toHaveBeenCalledOnce()
})
