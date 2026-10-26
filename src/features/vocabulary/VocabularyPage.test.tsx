import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({ getHistory: vi.fn(), getVocabulary: vi.fn() }))

vi.mock('@/features/calls/services/callsService', () => ({
  getHistory: h.getHistory,
  getIceServers: vi.fn(),
  activateCall: vi.fn(),
  getVocabulary: h.getVocabulary,
}))

import VocabularyPage from './VocabularyPage'

const call = (sid: string, n: number) => ({
  callSid: sid, desde: '+15550001', inicio: '2026-10-01T10:00:00Z', fin: null, estado: 'finalizada',
  mensajes: Array.from({ length: n }, () => ({ quien: 'gringo', original: 'Hi', traducido: 'Hola' })),
})

beforeEach(() => {
  h.getHistory.mockReset()
  h.getVocabulary.mockReset()
})

describe('VocabularyPage', () => {
  test('lista solo las llamadas con mensajes', async () => {
    h.getHistory.mockResolvedValue([call('CA1', 2), call('CA2', 0)])
    render(<VocabularyPage />)
    expect(await screen.findByText(/2 mensajes/)).toBeTruthy()
    expect(screen.queryByText(/0 mensajes/)).toBeNull()
  })

  test('sin llamadas muestra el estado vacío (no datos inventados)', async () => {
    h.getHistory.mockResolvedValue([])
    render(<VocabularyPage />)
    expect(await screen.findByText(/Aún no hay llamadas traducidas/)).toBeTruthy()
  })

  test('al elegir una llamada pide su vocabulario y lo muestra', async () => {
    h.getHistory.mockResolvedValue([call('CA1', 2)])
    h.getVocabulary.mockResolvedValue([
      { palabra: 'drywall', traduccion: 'panel de yeso', ejemplo: 'We hang drywall.', categoria: 'trabajo' },
    ])
    render(<VocabularyPage />)
    await userEvent.click(await screen.findByRole('button', { name: /2 mensajes/ }))
    expect(h.getVocabulary).toHaveBeenCalledWith('CA1')
    const list = await screen.findByLabelText('Vocabulario')
    expect(list.textContent).toContain('drywall')
    expect(list.textContent).toContain('panel de yeso')
  })

  test('vocabulario vacío y error del servidor se informan', async () => {
    h.getHistory.mockResolvedValue([call('CA1', 1)])
    h.getVocabulary.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('500'))
    render(<VocabularyPage />)
    const btn = await screen.findByRole('button', { name: /1 mensajes/ })
    await userEvent.click(btn)
    expect(await screen.findByText(/no tiene vocabulario útil/)).toBeTruthy()
    await userEvent.click(btn)
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo extraer')
  })

  test('error al cargar el historial se muestra', async () => {
    h.getHistory.mockRejectedValue(new Error('x'))
    render(<VocabularyPage />)
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el historial')
  })
})
