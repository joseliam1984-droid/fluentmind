import { apiClient } from '@/config/apiClient'
import { callsClient } from '../api/callsClient'
import { parseFindUserResponse } from './parseFindUser'
import { groupHistory, parseVocabulary } from './groupHistory'
import type { CallRecord, IceServer, ActivateResponse, FindUserResponse, VocabularyItem } from '../types'

export async function getHistory(): Promise<CallRecord[]> {
  const { data } = await callsClient.get<unknown>('/historial')
  return groupHistory(data)
}

export async function getVocabulary(callSid: string): Promise<VocabularyItem[]> {
  const { data } = await callsClient.get<unknown>(`/${encodeURIComponent(callSid)}/vocabulario`)
  return parseVocabulary(data)
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
  const { data } = await apiClient.post<unknown>('/api/users/find', { email })
  return parseFindUserResponse(data)
}