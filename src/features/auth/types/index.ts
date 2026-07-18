import type { User } from 'firebase/auth'

export interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
}

export interface AuthActions {
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}
