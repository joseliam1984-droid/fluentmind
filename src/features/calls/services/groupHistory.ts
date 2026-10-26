import type { CallRecord, HistoryRow, VocabularyItem } from '../types'

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/**
 * Agrupa las filas planas del backend por call_sid conservando el orden de
 * aparición (el backend ya ordena por inicio DESC, creado ASC). Tolera
 * respuestas inesperadas devolviendo [] en vez de romper la pantalla.
 */
export function groupHistory(data: unknown): CallRecord[] {
  if (!Array.isArray(data)) return []
  const byCall = new Map<string, CallRecord>()
  for (const raw of data as Partial<HistoryRow>[]) {
    const callSid = str(raw?.call_sid)
    if (!callSid) continue
    let rec = byCall.get(callSid)
    if (!rec) {
      rec = {
        callSid,
        desde: str(raw.desde),
        inicio: str(raw.inicio),
        fin: str(raw.fin),
        estado: str(raw.estado),
        mensajes: [],
      }
      byCall.set(callSid, rec)
    }
    const original = str(raw.texto_original)
    const traducido = str(raw.texto_traducido)
    if (original || traducido) {
      rec.mensajes.push({ quien: str(raw.quien) ?? '', original: original ?? '', traducido: traducido ?? '' })
    }
  }
  return [...byCall.values()]
}

/** Valida la respuesta de GET /api/calls/:callSid/vocabulario. */
export function parseVocabulary(data: unknown): VocabularyItem[] {
  const list = (data as { vocabulario?: unknown } | null)?.vocabulario
  if (!Array.isArray(list)) throw new Error('Respuesta de vocabulario inválida.')
  return list
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      palabra: str(i.palabra) ?? '',
      traduccion: str(i.traduccion) ?? '',
      ejemplo: str(i.ejemplo) ?? '',
      categoria: str(i.categoria) ?? 'otro',
    }))
    .filter((i) => i.palabra)
}
