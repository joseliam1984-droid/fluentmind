import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  authCb: null as null | ((u: unknown) => void | Promise<void>),
  login: vi.fn(),
  logout: vi.fn(),
  handleRedirectResult: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    h.authCb = cb
    return () => {}
  },
}))
vi.mock('@/config/firebase', () => ({ auth: {} }))
vi.mock('@/features/auth/services/authService', () => ({
  loginWithGoogle: h.login,
  logout: h.logout,
  handleRedirectResult: h.handleRedirectResult,
}))
vi.mock('@/features/auth/services/authTrace', () => ({
  authTrace: vi.fn(),
  describeError: (e: unknown) => ({ message: String(e) }),
}))
// La página de llamadas depende de sockets/WebRTC; se prueba por separado.
vi.mock('@/features/calls/pages/CallsPage', () => ({ default: () => <div>CALLS_PAGE</div> }))
vi.mock('@/features/translation/TranslatePage', () => ({ default: () => <div>TRANSLATE_PAGE</div> }))
vi.mock('@/features/vocabulary/VocabularyPage', () => ({ default: () => <div>VOCAB_PAGE</div> }))

import App from './App'
import { useAuthStore } from '@/features/auth/store/authStore'

const user = { uid: 'u1', displayName: 'Ana Pérez', email: 'ana@example.com', photoURL: null }
const emit = (u: unknown) => act(async () => { await h.authCb?.(u) })

beforeEach(() => {
  h.authCb = null
  h.login.mockReset().mockResolvedValue(undefined)
  h.logout.mockReset().mockResolvedValue(undefined)
  h.handleRedirectResult.mockReset().mockResolvedValue(null)
  useAuthStore.getState().reset()
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  test('mientras Firebase restaura la sesión muestra "Cargando..."', () => {
    render(<App />)
    expect(screen.getByText('Cargando...')).toBeTruthy()
    expect(screen.queryByText('Iniciar sesión con Google')).toBeNull()
  })

  test('sin sesión muestra el login y no las rutas protegidas', async () => {
    window.history.pushState({}, '', '/calls')
    render(<App />)
    await emit(null)
    expect(screen.getByText('Iniciar sesión con Google')).toBeTruthy()
    expect(screen.queryByText('CALLS_PAGE')).toBeNull()
  })

  test('el botón de login invoca el login con Google', async () => {
    render(<App />)
    await emit(null)
    await userEvent.click(screen.getByText('Iniciar sesión con Google'))
    expect(h.login).toHaveBeenCalledOnce()
  })

  test('si el login falla, el usuario ve un mensaje de error', async () => {
    h.login.mockRejectedValue(new Error('auth/popup-blocked'))
    render(<App />)
    await emit(null)
    await userEvent.click(screen.getByText('Iniciar sesión con Google'))
    expect(await screen.findByText(/No se pudo iniciar sesión/)).toBeTruthy()
  })

  test('con sesión restaurada muestra el dashboard con los datos del usuario', async () => {
    render(<App />)
    await emit(user)
    expect(screen.getByText('Ana Pérez', { selector: 'h2' })).toBeTruthy()
    expect(screen.getByText('ana@example.com')).toBeTruthy()
  })

  test('con sesión, /calls renderiza la página de llamadas', async () => {
    window.history.pushState({}, '', '/calls')
    render(<App />)
    await emit(user)
    expect(screen.getByText('CALLS_PAGE')).toBeTruthy()
  })

  test('con sesión, /translate renderiza la página de traducción', async () => {
    window.history.pushState({}, '', '/translate')
    render(<App />)
    await emit(user)
    expect(screen.getByText('TRANSLATE_PAGE')).toBeTruthy()
  })

  test('una ruta inexistente redirige al dashboard en vez de dejar la pantalla en blanco', async () => {
    window.history.pushState({}, '', '/no-existe')
    render(<App />)
    await emit(user)
    expect(screen.getByText('Ana Pérez', { selector: 'h2' })).toBeTruthy()
  })

  test('con sesión, /vocab renderiza la página de vocabulario', async () => {
    window.history.pushState({}, '', '/vocab')
    render(<App />)
    await emit(user)
    expect(screen.getByText('VOCAB_PAGE')).toBeTruthy()
  })

  test('todas las acciones de navegación están habilitadas (no hay botones decorativos)', async () => {
    render(<App />)
    await emit(user)
    for (const name of [/Traducir/, /Vocabulario/, /Llamadas/, /Perfil/]) {
      const buttons = screen.getAllByRole('button', { name }) as HTMLButtonElement[]
      expect(buttons.length).toBe(2)
      buttons.forEach((b) => expect(b.disabled).toBe(false))
    }
  })

  test('Llamadas navega a /calls y Salir cierra sesión', async () => {
    render(<App />)
    await emit(user)
    await userEvent.click(screen.getAllByRole('button', { name: /Llamadas/ })[0])
    expect(screen.getByText('CALLS_PAGE')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(h.logout).toHaveBeenCalledOnce()
  })
})
