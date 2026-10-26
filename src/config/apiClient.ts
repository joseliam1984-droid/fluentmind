import axios, { type AxiosInstance } from 'axios'
import { auth } from '@/config/firebase'
import { API_BASE_URL } from '@/config/env'

/** Adjunta el ID token de Firebase a cada petición; falla si no hay sesión. */
export function attachAuth(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.request.use(async (config) => {
    const user = auth.currentUser
    if (!user) {
      throw new Error('Usuario no autenticado')
    }
    const token = await user.getIdToken()
    config.headers.Authorization = `Bearer ${token}`
    return config
  })
  return instance
}

/** Cliente autenticado para rutas del backend fuera de /api/calls. */
export const apiClient = attachAuth(
  axios.create({ baseURL: API_BASE_URL, timeout: 10000 }),
)
