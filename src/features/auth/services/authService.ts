import {
  signInWithPopup,
  signInWithRedirect,
  signOut,
  GoogleAuthProvider,
  getRedirectResult,
  type User,
} from 'firebase/auth'
import { auth } from '@/config/firebase'

const googleProvider = new GoogleAuthProvider()

/**
 * Detecta si el dispositivo requiere flujo Redirect en lugar de Popup.
 * 
 * Desktop (todos los navegadores) → Popup
 * Mobile Safari / Chrome          → Popup
 * iOS PWA (standalone)            → Redirect
 * Android PWA (standalone)        → Redirect
 */
function useRedirect(): boolean {
  if (typeof window === 'undefined') return false
  // iOS PWA (Safari)
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return true
  // Android PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return false
}

/**
 * Inicia sesión con Google usando la estrategia adecuada:
 * - Desktop/Mobile browser → signInWithPopup
 * - PWA (standalone)       → signInWithRedirect
 */
export async function login(): Promise<User | null> {
  if (useRedirect()) {
    await signInWithRedirect(auth, googleProvider)
    return null // el usuario vuelve tras el redirect
  }

  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

/** Mantenido por compatibilidad con LoginPage existente */
export async function loginWithGoogle(): Promise<void> {
  await login()
}

export async function handleRedirectResult(): Promise<User | null> {
  const result = await getRedirectResult(auth)
  return result?.user ?? null
}

export async function logout(): Promise<void> {
  await signOut(auth)
}
