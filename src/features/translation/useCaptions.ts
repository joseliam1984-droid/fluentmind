import { useEffect, useRef, useState } from 'react'
import { signalingService } from '@/features/webrtc/services/signalingService'
import { translateText, TranslationError, type Lang } from './translationService'
import { listenOnce, speak, type Listening } from './speech'
import { parseCaption, type CaptionPayload } from './captions'

export interface CaptionLine {
  id: number
  own: boolean
  /** Lo que se muestra: para el otro usuario, su frase traducida a mi idioma. */
  text: string
  /** Frase original en el idioma de quien habló. */
  original: string
}

const MAX_LINES = 20
// Errores del reconocimiento tras los cuales reintentar no sirve.
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'unsupported', 'start-failed'])

/**
 * Subtítulos traducidos durante una llamada:
 *  - Reconoce MI voz (Web Speech API), la traduce con POST /api/translate y la
 *    envía al otro usuario con `call:caption`.
 *  - Recibe `call:caption` del otro usuario y lo muestra (y opcionalmente lo lee).
 * No toca el audio WebRTC. Requiere que el backend haga relay de `call:caption`.
 */
export function useCaptions(opts: {
  roomId: string | null
  active: boolean
  myLang: Lang
  speakIncoming: boolean
}) {
  const { roomId, active, myLang, speakIncoming } = opts
  const [lines, setLines] = useState<CaptionLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(0)
  const speakRef = useRef(speakIncoming)
  speakRef.current = speakIncoming

  useEffect(() => {
    if (!active || !roomId) return
    const otherLang: Lang = myLang === 'es' ? 'en' : 'es'
    let stopped = false
    let current: Listening | null = null
    let retry: ReturnType<typeof setTimeout> | null = null

    const push = (line: Omit<CaptionLine, 'id'>) =>
      setLines((prev) => [...prev, { ...line, id: ++idRef.current }].slice(-MAX_LINES))

    const off = signalingService.on('call:caption', (_e, data) => {
      const c: CaptionPayload | null = parseCaption(data)
      if (!c || c.roomId !== roomId) return
      push({ own: false, text: c.translated, original: c.text })
      if (speakRef.current) speak(c.translated, c.translatedLang)
    })

    const loop = () => {
      if (stopped) return
      current = listenOnce(myLang, {
        onText: (text) => {
          void (async () => {
            try {
              const translated = await translateText(text, myLang, otherLang)
              if (stopped) return
              signalingService.emit('call:caption', {
                roomId, text, lang: myLang, translated, translatedLang: otherLang, ts: Date.now(),
              })
              push({ own: true, text: translated, original: text })
              setError(null)
            } catch (err) {
              setError(err instanceof TranslationError ? err.message : 'No se pudo traducir.')
            }
          })()
        },
        onError: (message, code) => {
          if (code === 'no-speech' || code === 'aborted') return // silencio: normal
          setError(message)
          if (FATAL.has(code)) stopped = true
        },
        onEnd: () => {
          if (!stopped) retry = setTimeout(loop, 300)
        },
      })
    }
    loop()

    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      current?.stop()
      off()
    }
  }, [active, roomId, myLang])

  const clear = () => setLines([])
  return { lines, error, clear }
}
