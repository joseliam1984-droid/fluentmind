import {
  signInWithPopup,
  signInWithRedirect,
  signOut,
  GoogleAuthProvider,
  getRedirectResult,
  type User,
} from 'firebase/auth'
import { auth } from '@/config/firebase'
import { authTrace, describeError } from './authTrace'

const googleProvider = new GoogleAuthProvider()

/**
 * Detecta si el dispositivo requiere flujo Redirect en lugar de Popup.
 * 
 * Desktop (todos los navegadores) → Popup
 * Mobile Safari / Chrome          → Popup
 * iOS PWA (standalone)            → Redirect
 * Android PWA (standalone)        → Redirect
 */
function shouldUseRedirect(): boolean {
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
  const redirect = shouldUseRedirect()
  // AUTH-005 (observabilidad): rama elegida y por qué.
  authTrace('10 branch', {
    strategy: redirect ? 'redirect' : 'popup',
    standalone:
      (window.navigator as Navigator & { standalone?: boolean }).standalone ?? null,
    displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
  })

  if (redirect) {
    authTrace('11 redirect-start')
    await signInWithRedirect(auth, googleProvider)
    return null // el usuario vuelve tras el redirect
  }

  const result = await signInWithPopup(auth, googleProvider)
  // AUTH-005 (observabilidad): sonda decisiva. Compara el usuario devuelto por
  // el popup contra `auth.currentUser` en el mismo instante. Si el popup
  // resuelve pero currentUser sigue null, la sesión no cruzó al contexto de la
  // página (partición de almacenamiento) y no es un fallo de nuestro código.
  authTrace('30 popup-resolved', {
    returnedUid: result.user?.uid ?? null,
    currentUserUid: auth.currentUser?.uid ?? null,
    sameUser: !!result.user && auth.currentUser?.uid === result.user.uid,
  })
  return result.user
}

/** Mantenido por compatibilidad con LoginPage existente */
export async function loginWithGoogle(): Promise<void> {
  await login()
}

export async function handleRedirectResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth)
    // AUTH-005 (observabilidad): resultado del redirect al volver a la app.
    authTrace('60 redirect-result', {
      uid: result?.user?.uid ?? null,
      currentUserUid: auth.currentUser?.uid ?? null,
    })
    return result?.user ?? null
  } catch (err) {
    // Se registra y se re-lanza sin modificar: el manejo sigue siendo el de
    // AuthProvider. La traza no consume el error.
    authTrace('61 redirect-result-error', describeError(err))
    throw err
  }
}

export async function logout(): Promise<void> {
  await signOut(auth)
}
