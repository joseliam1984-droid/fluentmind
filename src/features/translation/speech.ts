import type { Lang } from './translationService'

/** Locales de voz por idioma. */
export const SPEECH_LOCALE: Record<Lang, string> = { es: 'es-MX', en: 'en-US' }

// La Web Speech API no está en lib.dom: tipos mínimos de lo que se usa.
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
interface RecognitionErrorEvent {
  error: string
}
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const isRecognitionSupported = (): boolean => recognitionCtor() !== null
export const isSynthesisSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'

const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Permiso de micrófono denegado.',
  'service-not-allowed': 'El navegador no permite el reconocimiento de voz.',
  'no-speech': 'No se escuchó nada. Inténtalo de nuevo.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'El reconocimiento de voz necesita conexión a internet.',
}

export interface Listening {
  stop(): void
}

/**
 * Reconoce UNA frase en el idioma dado (reconocimiento del navegador: en
 * Chrome/Edge/Safari el audio se envía al servicio de voz del navegador).
 */
export function listenOnce(
  lang: Lang,
  handlers: {
    onText: (text: string) => void
    /** `code` es el error del navegador (p. ej. 'not-allowed', 'no-speech'). */
    onError: (message: string, code: string) => void
    onEnd: () => void
  },
): Listening {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    handlers.onError('Tu navegador no soporta reconocimiento de voz.', 'unsupported')
    handlers.onEnd()
    return { stop() {} }
  }
  const rec = new Ctor()
  rec.lang = SPEECH_LOCALE[lang]
  rec.interimResults = false
  rec.maxAlternatives = 1
  rec.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript?.trim()
    if (text) handlers.onText(text)
  }
  rec.onerror = (e) =>
    handlers.onError(RECOGNITION_ERRORS[e.error] ?? 'No se pudo reconocer la voz.', e.error)
  rec.onend = () => handlers.onEnd()
  try {
    rec.start()
  } catch {
    handlers.onError('No se pudo iniciar el micrófono.', 'start-failed')
    handlers.onEnd()
  }
  return { stop: () => rec.stop() }
}

/** Lee el texto en voz alta en el idioma dado. Devuelve false si no hay síntesis. */
export function speak(text: string, lang: Lang): boolean {
  if (!isSynthesisSupported()) return false
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = SPEECH_LOCALE[lang]
  u.rate = 0.95
  window.speechSynthesis.speak(u)
  return true
}
