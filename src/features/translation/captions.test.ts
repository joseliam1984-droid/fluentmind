import { describe, test, expect } from 'vitest'
import { parseCaption, MAX_CAPTION_LENGTH } from './captions'

const valid = { roomId: 'r1', text: 'Hola', lang: 'es', translated: 'Hello', translatedLang: 'en', ts: 5 }

describe('parseCaption', () => {
  test('acepta un payload válido', () => {
    expect(parseCaption(valid)).toEqual(valid)
  })

  test('rechaza lo que no cumple el contrato (el contenido viene de otro usuario)', () => {
    for (const bad of [
      null, 'x', {}, { ...valid, roomId: '' }, { ...valid, lang: 'fr' }, { ...valid, translatedLang: 'de' },
      { ...valid, translated: '   ' }, { ...valid, translated: 5 }, { ...valid, text: undefined },
    ]) {
      expect(parseCaption(bad)).toBeNull()
    }
  })

  test('recorta textos excesivos y completa ts ausente', () => {
    const c = parseCaption({ ...valid, translated: 'a'.repeat(MAX_CAPTION_LENGTH + 50), ts: 'x' })!
    expect(c.translated).toHaveLength(MAX_CAPTION_LENGTH)
    expect(typeof c.ts).toBe('number')
  })
})
