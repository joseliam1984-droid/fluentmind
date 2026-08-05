import { useEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/config/firebase'
import { useAuthStore } from '../store/authStore'
import { handleRedirectResult } from '../services/authService'
import { authTrace, describeError } from '../services/authTrace'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false)
  const setUser = useAuthStore((s) => s.setUser)
  const setError = useAuthStore((s) => s.setError)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // AUTH-005 (observabilidad): confirma que el listener queda vivo.
    authTrace('49 authstate-subscribe')

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // AUTH-005 (observabilidad): cada emisión del SDK, con o sin usuario.
      authTrace('50 authstate', { uid: firebaseUser?.uid ?? null })
      if (firebaseUser) {
        setUser(firebaseUser)
      } else {
        // No cached session — check for redirect result
        try {
          const redirectUser = await handleRedirectResult()
          if (redirectUser) {
            setUser(redirectUser)
          } else {
            setUser(null)
          }
        } catch (err) {
          authTrace('62 authprovider-catch', describeError(err))
          const message = err instanceof Error ? err.message : 'Auth error'
          setError(message)
        }
      }
    })

    return () => {
      authTrace('51 authstate-unsubscribe')
      unsubscribe()
    }
  }, [setUser, setError])

  return <>{children}</>
}
