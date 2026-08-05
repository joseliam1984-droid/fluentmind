import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
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
