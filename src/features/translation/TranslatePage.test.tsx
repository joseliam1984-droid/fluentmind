import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({ translate: vi.fn() }))

vi.mock('./translationService', async (orig) => {
  const real = await orig<typeof import('./translationService')>()
  return { ...real, translateText: h.translate }
})

import TranslatePage from './TranslatePage'
import { TranslationError } from './translationService'

class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  interimResults = false
  maxAlternatives = 1
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  constructor() { FakeRecognition.last = this }
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
}

beforeEach(() => {
  h.translate.mockReset()
  FakeRecognition.last = null
})

describe('TranslatePage (texto)', () => {
  test('traduce y muestra el resultado; el botón se deshabilita sin texto', async () => {
    h.translate.mockResolvedValue("Hey, how's it going?")
    render(<TranslatePage />)
    const btn = screen.getByRole('button', { name: 'Traducir' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Texto a traducir'), 'Hola')
    await userEvent.click(btn)
    expect(h.translate).toHaveBeenCalledWith('Hola', 'es', 'en')
    expect(await screen.findByLabelText('Traducción')).toHaveProperty('textContent', "Hey, how's it going?")
  })

  test('intercambiar idiomas invierte la dirección de la traducción', async () => {
    h.translate.mockResolvedValue('Hola')
    render(<TranslatePage />)
    await userEvent.click(screen.getByLabelText('Intercambiar idiomas'))
    await userEvent.type(screen.getByLabelText('Texto a traducir'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Traducir' }))
    expect(h.translate).toHaveBeenCalledWith('Hello', 'en', 'es')
  })

  test('un error del servicio se muestra y no deja traducción vieja en pantalla', async () => {
    h.translate.mockResolvedValueOnce('Uno').mockRejectedValueOnce(new TranslationError('server', 'Error del servidor al traducir.'))
    render(<TranslatePage />)
    await userEvent.type(screen.getByLabelText('Texto a traducir'), 'a')
    await userEvent.click(screen.getByRole('button', { name: 'Traducir' }))
    await screen.findByLabelText('Traducción')
    await userEvent.click(screen.getByRole('button', { name: 'Traducir' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Error del servidor al traducir.')
    expect(screen.queryByLabelText('Traducción')).toBeNull()
  })

  test('sin Web Speech API avisa en vez de mostrar un micrófono que no funciona', () => {
    render(<TranslatePage />)
    expect(screen.queryByLabelText('Hablar')).toBeNull()
    expect(screen.getByText(/no soporta reconocimiento de voz/)).toBeTruthy()
  })
})

describe('TranslatePage (voz)', () => {
  test('dictar rellena el texto y lo traduce con el idioma de origen', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    h.translate.mockResolvedValue('Good morning')
    render(<TranslatePage />)
    await userEvent.click(screen.getByLabelText('Hablar'))
    const rec = FakeRecognition.last!
    expect(rec.start).toHaveBeenCalled()
    expect(rec.lang).toBe('es-MX')
    await act(async () => {
      rec.onresult?.({ results: [[{ transcript: 'buenos días' }]] })
      rec.onend?.()
    })
    expect((screen.getByLabelText('Texto a traducir') as HTMLTextAreaElement).value).toBe('buenos días')
    expect(h.translate).toHaveBeenCalledWith('buenos días', 'es', 'en')
    expect(await screen.findByLabelText('Traducción')).toBeTruthy()
  })

  test('permiso de micrófono denegado muestra un mensaje claro', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    render(<TranslatePage />)
    await userEvent.click(screen.getByLabelText('Hablar'))
    await act(async () => {
      FakeRecognition.last!.onerror?.({ error: 'not-allowed' })
      FakeRecognition.last!.onend?.()
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Permiso de micrófono denegado.')
  })

  test('"Escuchar" lee la traducción con la voz del idioma destino', async () => {
    const speakSpy = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} lang = ''; rate = 1 })
    h.translate.mockResolvedValue('Hello')
    render(<TranslatePage />)
    await userEvent.type(screen.getByLabelText('Texto a traducir'), 'Hola')
    await userEvent.click(screen.getByRole('button', { name: 'Traducir' }))
    await userEvent.click(await screen.findByLabelText('Escuchar traducción'))
    const utterance = speakSpy.mock.calls[0][0]
    expect(utterance.text).toBe('Hello')
    expect(utterance.lang).toBe('en-US')
  })
})
