import type { FindUserResponse } from '../types'

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/**
 * Valida la respuesta de POST /api/users/find según el contrato verificado en
 * el backend (fluentmind-backend, routes/users.js):
 *   200 { uid, displayName, photoURL, online }   404 { error: 'USER_NOT_FOUND' }
 * Lanza si falta uid. No incluye el cuerpo en el mensaje (puede tener datos personales).
 */
export function parseFindUserResponse(data: unknown): FindUserResponse {
  const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const uid = asString(obj.uid)
  if (!uid) {
    throw new Error('Respuesta inesperada del servidor: no se encontró uid.')
  }
  return {
    uid,
    displayName: asString(obj.displayName),
    photoURL: asString(obj.photoURL),
    online: typeof obj.online === 'boolean' ? obj.online : undefined,
  }
}
