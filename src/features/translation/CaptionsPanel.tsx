import { useState } from 'react'
import { useCaptions } from './useCaptions'
import { isRecognitionSupported, isSynthesisSupported } from './speech'
import type { Lang } from './translationService'

/** Panel de subtítulos traducidos para una llamada en curso (ver useCaptions). */
export default function CaptionsPanel({ roomId, inCall }: { roomId: string | null; inCall: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [myLang, setMyLang] = useState<Lang>('es')
  const [speakIncoming, setSpeakIncoming] = useState(false)
  const { lines, error } = useCaptions({ roomId, active: enabled && inCall, myLang, speakIncoming })

  if (!isRecognitionSupported()) {
    return <p className="text-xs text-neutral-500">Subtítulos no disponibles: tu navegador no soporta reconocimiento de voz.</p>
  }

  return (
    <section aria-label="Subtítulos traducidos" className="space-y-2 p-3 rounded-xl bg-neutral-900 border border-neutral-800">
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700"
        >
          {enabled ? 'Desactivar subtítulos' : 'Activar subtítulos'}
        </button>
        <label className="flex items-center gap-1 text-xs text-neutral-400">
          Hablo
          <select
            value={myLang}
            onChange={(e) => setMyLang(e.target.value as Lang)}
            disabled={enabled}
            className="bg-neutral-800 rounded px-1 py-0.5"
          >
            <option value="es">español</option>
            <option value="en">inglés</option>
          </select>
        </label>
        {isSynthesisSupported() && (
          <label className="flex items-center gap-1 text-xs text-neutral-400">
            <input type="checkbox" checked={speakIncoming} onChange={(e) => setSpeakIncoming(e.target.checked)} />
            Leer en voz alta
          </label>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <ul className="space-y-1 max-h-40 overflow-y-auto">
        {lines.map((l) => (
          <li key={l.id} className={l.own ? 'text-right' : 'text-left'}>
            <span className="block text-sm">{l.text}</span>
            <span className="block text-[11px] text-neutral-500">{l.original}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
