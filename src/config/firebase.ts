import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { authTrace, authTraceBoot } from '@/features/auth/services/authTrace'

const firebaseConfig = {
  apiKey: "AIzaSyDGWI26p3INJX5hAqY1Egvyppt1wPn0WFs",
  authDomain: 'fluentmind-43693.firebaseapp.com',
  projectId: 'fluentmind-43693',
  storageBucket: 'fluentmind-43693.firebasestorage.app',
  messagingSenderId: '31323709750',
  appId: '1:31323709750:web:8e86ddfbb5711938005397',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// ===== AUTH-DEBUG-004 (instrumentación temporal aprobada por el Arquitecto) =====
if (typeof window !== 'undefined') {
  // 2. Exponer la instancia real de Auth en window para inspección desde DevTools.
  ;(window as any).__AUTH__ = auth

  // 3. Listener adicional que registra cada emisión del SDK.
  onAuthStateChanged(auth, (user) => {
    console.log('[AUTH DEBUG]', {
      callbackUser: user,
      currentUser: auth.currentUser,
      uid: user?.uid ?? null,
      email: user?.email ?? null,
    })
  })

  // 4. Helper de inspección: snapshot del estado actual de Auth.
  ;(window as any).__AUTH_DEBUG__ = () => ({
    currentUser: (window as any).__AUTH__.currentUser,
    uid: (window as any).__AUTH__.currentUser?.uid ?? null,
    email: (window as any).__AUTH__.currentUser?.email ?? null,
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
