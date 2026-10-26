import { apiClient } from '@/config/apiClient'

export type Lang = 'es' | 'en'

/** El backend (services/ai.js) limita la salida a ~500 tokens; se limita la entrada para no truncar. */
export const MAX_TEXT_LENGTH = 500

export class TranslationError extends Error {
  constructor(
    public readonly code: 'empty' | 'too_long' | 'bad_language' | 'network' | 'server' | 'bad_response',
    message: string,
  ) {
    super(message)
    this.name = 'TranslationError'
  }
}

/**
 * POST /api/translate  { text, from, to }  →  { text, source }
 * Contrato verificado en el backend (routes/translate.js) y contra el servicio
 * desplegado. Errores del backend: 400 { error } (texto vacío / idioma no
 * soportado) y 500 { error: 'Error al traducir' }.
 */
export async function translateText(text: string, from: Lang, to: Lang): Promise<string> {
  const clean = text.trim()
  if (!clean) throw new TranslationError('empty', 'Escribe o di algo para traducir.')
  if (clean.length > MAX_TEXT_LENGTH) {
    throw new TranslationError('too_long', `El texto supera ${MAX_TEXT_LENGTH} caracteres.`)
  }
  if (from === to) throw new TranslationError('bad_language', 'Elige idiomas distintos.')

  try {
    const { data } = await apiClient.post<unknown>('/api/translate', { text: clean, from, to })
    const out = (data as { text?: unknown } | null)?.text
    if (typeof out !== 'string' || !out.trim()) {
      throw new TranslationError('bad_response', 'El servidor devolvió una traducción inválida.')
    }
    return out.trim()
  } catch (err) {
    if (err instanceof TranslationError) throw err
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 400) throw new TranslationError('bad_language', 'No se pudo traducir ese texto.')
    if (status !== undefined) throw new TranslationError('server', 'Error del servidor al traducir.')
    if (err instanceof Error && err.message === 'Usuario no autenticado') {
      throw new TranslationError('network', 'Debes iniciar sesión primero.')
    }
    throw new TranslationError('network', 'Sin conexión con el servidor. Inténtalo de nuevo.')
  }
}
