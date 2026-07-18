import { create } from 'zustand'
import type { AuthState, AuthActions } from '../types'

type AuthStore = AuthState & AuthActions

const initialState: AuthState = {
  user: null,
  isLoading: true,
  error: null,
}

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialState,
  setUser: (user) => set({ user, isLoading: false, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () => set(initialState),
}))
