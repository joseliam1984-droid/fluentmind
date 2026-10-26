import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { authTrace, authTraceBoot } from '@/features/auth/services/authTrace'
import { firebaseConfig, AUTH_DEBUG } from '@/config/env'

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// ===== AUTH-DEBUG-004 (instrumentación temporal aprobada por el Arquitecto) =====
// Limitada a desarrollo o `?authdebug=1`: expone la instancia de Auth y
// registra datos del usuario, por lo que no debe estar activa para usuarios
// finales. La investigación del login sigue abierta, de ahí que se conserve.
if (typeof window !== 'undefined' && AUTH_DEBUG) {
  ;(window as unknown as { __AUTH__: typeof auth }).__AUTH__ = auth

  onAuthStateChanged(auth, (user) => {
    console.log('[AUTH DEBUG]', {
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      hasCurrentUser: !!auth.currentUser,
    })
  })

  ;(window as unknown as { __AUTH_DEBUG__: () => unknown }).__AUTH_DEBUG__ = () => ({
    uid: auth.currentUser?.uid ?? null,
    email: auth.currentUser?.email ?? null,
  })
}
// ===== FIN AUTH-DEBUG-004 =====

// AUTH-005 (observabilidad): punto cero de la traza. Registra entorno del
// dispositivo y el authDomain configurado para poder contrastarlo con el
// origen real de la página. No altera la inicialización de Firebase.
authTraceBoot()
authTrace('02 firebase-config', {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  originMatchesAuthDomain:
    typeof window !== 'undefined' && window.location.hostname === firebaseConfig.authDomain,
})

export default app
