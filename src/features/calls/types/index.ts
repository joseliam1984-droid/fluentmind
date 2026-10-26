/**
 * Fila de GET /api/calls/historial (backend: database.buscarHistorialPorUsuario).
 * El backend devuelve un array PLANO con una fila por mensaje (LEFT JOIN): una
 * llamada sin mensajes aparece una vez con los campos de mensaje en null.
 */
export interface HistoryRow {
  call_sid: string
  desde: string | null
  inicio: string | null
  fin: string | null
  estado: string | null
  quien: string | null
  texto_original: string | null
  texto_traducido: string | null
  idioma_origen: string | null
  idioma_destino: string | null
  creado: string | null
}

export interface HistoryMessage {
  quien: string
  original: string
  traducido: string
}

/** Llamada telefónica traducida (Twilio), con sus mensajes agrupados. */
export interface CallRecord {
  callSid: string
  desde: string | null
  inicio: string | null
  fin: string | null
  estado: string | null
  mensajes: HistoryMessage[]
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

/** Contrato verificado en el backend (routes/users.js): el email NO se devuelve. */
export interface FindUserResponse {
  uid: string
  displayName?: string
  photoURL?: string
  /** true si el usuario tiene un socket de señalización activo ahora mismo */
  online?: boolean
}

/** GET /api/calls/:callSid/vocabulario → { vocabulario: VocabularyItem[] } (nivel A1-B1) */
export interface VocabularyItem {
  palabra: string
  traduccion: string
  ejemplo: string
  categoria: string
}
