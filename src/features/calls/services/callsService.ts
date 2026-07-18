import axios from 'axios'
import { auth } from '@/config/firebase'
import { callsClient } from '../api/callsClient'
import type { CallsHistoryResponse, IceServer, ActivateResponse, FindUserResponse } from '../types'

const API_BASE = 'https://translvoz-pro-production.up.railway.app'

export async function getHistory(): Promise<CallsHistoryResponse> {
  const { data } = await callsClient.get<CallsHistoryResponse>('/historial')
  return data
}

export async function getIceServers(): Promise<IceServer[]> {
  const { data } = await callsClient.get<{ iceServers: IceServer[] }>('/ice-servers')
  const servers = data.iceServers ?? (Array.isArray(data) ? data : [])
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error('Empty ICE servers from backend')
  }
  return servers
}

export async function activateCall(): Promise<ActivateResponse> {
  const { data } = await callsClient.post<ActivateResponse>('/activar')
  return data
}

export async function findUserByEmail(email: string): Promise<FindUserResponse> {
  const user = auth.currentUser
  if (!user) throw new Error('Usuario no autenticado')
  const token = await user.getIdToken()
  const authHeaderValue = 'Bearer ' + token
  const { data } = await axios.post<Record<string, unknown>>(
    API_BASE + '/api/users/find',
    { email },
    { headers: { Authorization: authHeaderValue } },
  )

  // Log RAW response for debugging
  console.log('[API] POST /api/users/find raw:', JSON.stringify(data))

  // Try multiple field names the backend could use
  const uid: string | undefined =
    (data.uid as string) ??
    (data.targetUid as string) ??
    (data.id as string) ??
    (data.userId as string) ??
    ((data.user as Record<string, unknown> | undefined)?.uid as string) ??
    ((data.data as Record<string, unknown> | undefined)?.uid as string)

  if (!uid) {
    throw new Error(
      'Respuesta inesperada del servidor - no se encontro uid. Response: ' +
        JSON.stringify(data),
    )
  }

  const email_out: string = (data.email as string) ?? ''

  return { uid, email: email_out }
}