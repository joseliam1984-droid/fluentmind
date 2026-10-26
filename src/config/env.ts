import { resolveApiBase } from './apiBase'
import { resolveAuthDomain } from './authDomain'

/**
 * Configuración central. Todo se lee de variables VITE_* con un valor por
 * defecto equivalente al comportamiento anterior (ver .env.example).
 * Nota: la configuración web de Firebase es pública por diseño; la seguridad
 * se aplica con reglas de Firebase y dominios autorizados, no ocultándola.
 */
const env = import.meta.env

export const API_BASE_URL = resolveApiBase(env.VITE_API_BASE_URL)

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyDGWI26p3INJX5hAqY1Egvyppt1wPn0WFs',
  authDomain: resolveAuthDomain(
    env.VITE_FIREBASE_AUTH_DOMAIN,
    typeof window !== 'undefined' ? window.location.hostname : undefined,
  ),
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'fluentmind-43693',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'fluentmind-43693.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '31323709750',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:31323709750:web:8e86ddfbb5711938005397',
}

/**
 * Diagnóstico de autenticación (window.__AUTH__ y logs [AUTH DEBUG], que
 * incluyen datos del usuario). Solo en desarrollo o con `?authdebug=1`.
 */
export const AUTH_DEBUG =
  env.DEV ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('authdebug') === '1')

/**
 * Subtítulos traducidos durante la llamada (evento call:caption). Apagado por
 * defecto: el backend debe implementar primero el relay (docs/TRANSLATION.md).
 */
export const CAPTIONS_ENABLED = env.VITE_ENABLE_CAPTIONS === 'true'
