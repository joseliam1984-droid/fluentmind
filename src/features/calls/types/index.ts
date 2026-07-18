export interface CallEntry {
  direction: 'inbound' | 'outbound'
  startedAt?: string
  createdAt?: string
  timestamp?: string
  duration?: number
}

export interface CallsHistoryResponse {
  llamadas?: CallEntry[]
  conversations?: CallEntry[]
  history?: CallEntry[]
}

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface ActivateResponse {
  numero: string
  number?: string
}

export interface FindUserResponse {
  uid: string
  email: string
}
