import { useEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/config/firebase'
import { useAuthStore } from '../store/authStore'
import { handleRedirectResult } from '../services/authService'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false)
  const setUser = useAuthStore((s) => s.setUser)
  const setError = useAuthStore((s) => s.setError)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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
          const message = err instanceof Error ? err.message : 'Auth error'
          setError(message)
        }
      }
    })

    return () => unsubscribe()
  }, [setUser, setError])

  return <>{children}</>
}
