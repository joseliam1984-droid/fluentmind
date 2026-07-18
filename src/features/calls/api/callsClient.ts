import axios from 'axios'
import { auth } from '@/config/firebase'

const API_BASE = 'https://translvoz-pro-production.up.railway.app'

export const callsClient = axios.create({
  baseURL: `${API_BASE}/api/calls`,
  timeout: 10000,
})

// Attach Firebase ID token to every request
callsClient.interceptors.request.use(async (config) => {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Usuario no autenticado')
  }
  const token = await user.getIdToken()
  config.headers.Authorization = `Bearer ${token}`
  return config
})
