import { useEffect, useRef, useState } from 'react'
import {
  translateText,
  TranslationError,
  MAX_TEXT_LENGTH,
  type Lang,
} from './translationService'
import { isRecognitionSupported, isSynthesisSupported, listenOnce, speak, type Listening } from './speech'

const LANG_LABEL: Record<Lang, string> = { es: 'Español', en: 'Inglés' }

export default function TranslatePage() {
  const [from, setFrom] = useState<Lang>('es')
  const to: Lang = from === 'es' ? 'en' : 'es'
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const listeningRef = useRef<Listening | null>(null)
  const requestId = useRef(0)

  const canListen = isRecognitionSupported()
  const canSpeak = isSynthesisSupported()

  useEffect(() => () => listeningRef.current?.stop(), [])

  const run = async (text: string, source: Lang) => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const result = await translateText(text, source, source === 'es' ? 'en' : 'es')
      if (id !== requestId.current) return // llegó una petición más nueva
      setOutput(result)
    } catch (err) {
      if (id !== requestId.current) return
      setOutput('')
      setError(err instanceof TranslationError ? err.message : 'No se pudo traducir.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  const swap = () => {
    setFrom(to)
    setInput(output)
    setOutput(input)
    setError(null)
  }

  const startListening = () => {
    setError(null)
    setListening(true)
    listeningRef.current = listenOnce(from, {
      onText: (text) => {
        setInput(text)
        void run(text, from)
      },
      onError: (message) => setError(message),
      onEnd: () => setListening(false),
    })
  }

  return (
    <div className="flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{LANG_LABEL[from]}</span>
          <button
            onClick={swap}
            aria-label="Intercambiar idiomas"
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            ⇄
          </button>
          <span className="text-sm font-medium">{LANG_LABEL[to]}</span>
        </div>

        <div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_TEXT_LENGTH))}
            placeholder={`Escribe en ${LANG_LABEL[from].toLowerCase()}...`}
            aria-label="Texto a traducir"
            rows={4}
            className="w-full p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white resize-none"
          />
          <div className="text-right text-xs text-neutral-500">
            {input.length}/{MAX_TEXT_LENGTH}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void run(input, from)}
            disabled={loading || !input.trim()}
            className="flex-1 py-3 rounded-xl bg-white text-neutral-900 font-medium disabled:opacity-40"
          >
            {loading ? 'Traduciendo...' : 'Traducir'}
          </button>
          {canListen && (
            <button
              onClick={listening ? () => listeningRef.current?.stop() : startListening}
              aria-label={listening ? 'Detener micrófono' : 'Hablar'}
              className="px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700"
            >
              {listening ? '⏹' : '🎤'}
            </button>
          )}
        </div>
        {!canListen && (
          <p className="text-xs text-neutral-500">
            Tu navegador no soporta reconocimiento de voz; usa el texto.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {output && (
          <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
            <p aria-label="Traducción" className="text-lg">
              {output}
            </p>
            {canSpeak && (
              <button
                onClick={() => speak(output, to)}
                aria-label="Escuchar traducción"
                className="mt-2 text-sm text-neutral-400 hover:text-white"
              >
                🔊 Escuchar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
