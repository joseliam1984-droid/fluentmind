import type { Lang } from './translationService'

/**
 * Payload propuesto del evento `call:caption` (docs/TRANSLATION.md). El
 * backend debe reenviarlo tal cual al otro participante de la sala.
 */
export interface CaptionPayload {
  roomId: string
  text: string
  lang: Lang
  translated: string
  translatedLang: Lang
  ts: number
}

export const MAX_CAPTION_LENGTH = 500

const isLang = (v: unknown): v is Lang => v === 'es' || v === 'en'

/** Valida un `call:caption` entrante (no se confía en el contenido del otro usuario). */
export function parseCaption(data: unknown): CaptionPayload | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (typeof d.roomId !== 'string' || !d.roomId) return null
  if (typeof d.text !== 'string' || typeof d.translated !== 'string') return null
  if (!isLang(d.lang) || !isLang(d.translatedLang)) return null
  const text = d.text.trim().slice(0, MAX_CAPTION_LENGTH)
  const translated = d.translated.trim().slice(0, MAX_CAPTION_LENGTH)
  if (!translated) return null
  return {
    roomId: d.roomId,
    text,
    lang: d.lang,
    translated,
    translatedLang: d.translatedLang,
    ts: typeof d.ts === 'number' ? d.ts : Date.now(),
  }
}
