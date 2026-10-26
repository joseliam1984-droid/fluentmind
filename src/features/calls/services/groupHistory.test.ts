import { describe, test, expect } from 'vitest'
import { groupHistory, parseVocabulary } from './groupHistory'

const row = (o: Record<string, unknown>) => ({
  call_sid: 'CA1', desde: '+15550001', inicio: '2026-10-01T10:00:00Z', fin: null, estado: 'finalizada',
  quien: null, texto_original: null, texto_traducido: null, idioma_origen: null, idioma_destino: null, creado: null,
  ...o,
})

describe('groupHistory', () => {
  test('agrupa filas planas por call_sid y conserva el orden de mensajes', () => {
    const out = groupHistory([
      row({ quien: 'gringo', texto_original: 'Hello', texto_traducido: 'Hola' }),
      row({ quien: 'jose', texto_original: 'Buenas', texto_traducido: 'Good' }),
      row({ call_sid: 'CA2', desde: '+15550002' }),
    ])
    expect(out.map((c) => c.callSid)).toEqual(['CA1', 'CA2'])
    expect(out[0].mensajes).toEqual([
      { quien: 'gringo', original: 'Hello', traducido: 'Hola' },
      { quien: 'jose', original: 'Buenas', traducido: 'Good' },
    ])
  })

  test('una llamada sin mensajes (LEFT JOIN con nulls) queda con mensajes vacíos', () => {
    const out = groupHistory([row({})])
    expect(out).toHaveLength(1)
    expect(out[0].mensajes).toEqual([])
    expect(out[0].estado).toBe('finalizada')
  })

  test('entradas inesperadas no rompen: objeto, null, filas sin call_sid', () => {
    expect(groupHistory({ llamadas: [] })).toEqual([])
    expect(groupHistory(null)).toEqual([])
    expect(groupHistory([null, {}, { call_sid: '' }, row({})])).toHaveLength(1)
  })
})

describe('parseVocabulary', () => {
  test('devuelve los items válidos y descarta los que no tienen palabra', () => {
    const out = parseVocabulary({
      vocabulario: [
        { palabra: 'drywall', traduccion: 'panel de yeso', ejemplo: 'We hang drywall.', categoria: 'trabajo' },
        { traduccion: 'sin palabra' },
        'basura',
      ],
    })
    expect(out).toEqual([
      { palabra: 'drywall', traduccion: 'panel de yeso', ejemplo: 'We hang drywall.', categoria: 'trabajo' },
    ])
  })

  test('lista vacía es válida; forma inválida lanza', () => {
    expect(parseVocabulary({ vocabulario: [] })).toEqual([])
    expect(() => parseVocabulary({})).toThrow('inválida')
    expect(() => parseVocabulary(null)).toThrow('inválida')
  })
})
