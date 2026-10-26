import { describe, test, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/config/apiClient', () => ({ apiClient: { post: h.post } }))

import { translateText, TranslationError, MAX_TEXT_LENGTH } from './translationService'

const code = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return (e as TranslationError).code
  }
  return 'no-error'
}

beforeEach(() => h.post.mockReset())

describe('translateText', () => {
  test('envía { text, from, to } a /api/translate y devuelve el texto traducido', async () => {
    h.post.mockResolvedValue({ data: { text: " Hey, how's it going? ", source: 'ai' } })
    expect(await translateText('  Hola, ¿cómo estás? ', 'es', 'en')).toBe("Hey, how's it going?")
    expect(h.post).toHaveBeenCalledWith('/api/translate', { text: 'Hola, ¿cómo estás?', from: 'es', to: 'en' })
  })

  test('valida entrada vacía, demasiado larga e idiomas iguales sin llamar al servidor', async () => {
    expect(await code(translateText('   ', 'es', 'en'))).toBe('empty')
    expect(await code(translateText('a'.repeat(MAX_TEXT_LENGTH + 1), 'es', 'en'))).toBe('too_long')
    expect(await code(translateText('hola', 'es', 'es'))).toBe('bad_language')
    expect(h.post).not.toHaveBeenCalled()
  })

  test('400 del backend → bad_language; 500 → server', async () => {
    h.post.mockRejectedValueOnce({ response: { status: 400 } })
    expect(await code(translateText('hola', 'es', 'en'))).toBe('bad_language')
    h.post.mockRejectedValueOnce({ response: { status: 500 } })
    expect(await code(translateText('hola', 'es', 'en'))).toBe('server')
  })

  test('sin respuesta del servidor → network; sin sesión → mensaje de login', async () => {
    h.post.mockRejectedValueOnce(new Error('Network Error'))
    expect(await code(translateText('hola', 'es', 'en'))).toBe('network')
    h.post.mockRejectedValueOnce(new Error('Usuario no autenticado'))
    await expect(translateText('hola', 'es', 'en')).rejects.toThrow('iniciar sesión')
  })

  test('respuesta sin texto válido → bad_response (no se inventa una traducción)', async () => {
    h.post.mockResolvedValueOnce({ data: {} })
    expect(await code(translateText('hola', 'es', 'en'))).toBe('bad_response')
    h.post.mockResolvedValueOnce({ data: { text: '   ' } })
    expect(await code(translateText('hola', 'es', 'en'))).toBe('bad_response')
  })
})
