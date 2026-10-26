import axios from 'axios'
import { API_BASE_URL } from '@/config/env'
import { attachAuth } from '@/config/apiClient'

export const callsClient = attachAuth(
  axios.create({
    baseURL: `${API_BASE_URL}/api/calls`,
    timeout: 10000,
  }),
)
