import { useEffect, useState } from 'react'
import { useCallsHistory } from '@/features/calls/hooks/useCallsApi'
import { getVocabulary } from '@/features/calls/services/callsService'
import type { VocabularyItem } from '@/features/calls/types'

function formatDate(raw: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  return Number.isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Vocabulario A1-B1 extraído por el backend de las llamadas telefónicas
 * traducidas del usuario (GET /api/calls/:callSid/vocabulario). Solo las
 * llamadas con mensajes tienen material para extraer.
 */
export default function VocabularyPage() {
  const history = useCallsHistory()
  const { fetch: fetchHistory } = history
  const [selected, setSelected] = useState<string | null>(null)
  const [items, setItems] = useState<VocabularyItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const calls = (history.data ?? []).filter((c) => c.mensajes.length > 0)

  const open = async (callSid: string) => {
    setSelected(callSid)
    setItems(null)
    setError(null)
    setLoading(true)
    try {
      setItems(await getVocabulary(callSid))
    } catch {
      setError('No se pudo extraer el vocabulario. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold">Vocabulario de tus llamadas</h2>

        {history.isLoading && <p className="text-sm text-neutral-500">Cargando llamadas...</p>}
        {history.error && !history.isLoading && (
          <p role="alert" className="text-sm text-red-400">No se pudo cargar el historial.</p>
        )}
        {!history.isLoading && !history.error && calls.length === 0 && (
          <p className="text-sm text-neutral-500">
            Aún no hay llamadas traducidas con conversación. Cuando tengas una, aquí aparecerá el vocabulario que aprendiste.
          </p>
        )}

        <ul className="space-y-2">
          {calls.map((c) => (
            <li key={c.callSid}>
              <button
                onClick={() => void open(c.callSid)}
                aria-pressed={selected === c.callSid}
                className="w-full text-left p-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800"
              >
                <span className="block text-sm font-medium">{c.desde ? `De ${c.desde}` : 'Llamada traducida'}</span>
                <span className="block text-xs text-neutral-500">
                  {formatDate(c.inicio)} · {c.mensajes.length} mensajes
                </span>
              </button>
            </li>
          ))}
        </ul>

        {loading && <p className="text-sm text-neutral-500">Extrayendo vocabulario...</p>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {items && items.length === 0 && (
          <p className="text-sm text-neutral-500">Esta llamada no tiene vocabulario útil para aprender.</p>
        )}
        {items && items.length > 0 && (
          <ul aria-label="Vocabulario" className="space-y-2">
            {items.map((it) => (
              <li key={it.palabra} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800">
                <p className="font-medium">
                  {it.palabra} <span className="text-neutral-500">→ {it.traduccion}</span>
                </p>
                {it.ejemplo && <p className="text-sm text-neutral-400 italic">{it.ejemplo}</p>}
                <p className="text-xs text-neutral-600">{it.categoria}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
