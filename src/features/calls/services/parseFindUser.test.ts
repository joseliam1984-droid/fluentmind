import { test, expect } from 'vitest'
import { parseFindUserResponse } from './parseFindUser'

test('respuesta completa del contrato del backend', () => {
  expect(
    parseFindUserResponse({ uid: 'u1', displayName: 'Ana', photoURL: 'https://x/y.png', online: true }),
  ).toEqual({ uid: 'u1', displayName: 'Ana', photoURL: 'https://x/y.png', online: true })
})

test('online false se conserva (permite avisar "desconectado" sin esperar)', () => {
  expect(parseFindUserResponse({ uid: 'u1', online: false }).online).toBe(false)
})

test('campos opcionales ausentes o de tipo incorrecto quedan undefined', () => {
  const r = parseFindUserResponse({ uid: 'u1', displayName: 5, online: 'si' })
  expect(r.displayName).toBeUndefined()
  expect(r.online).toBeUndefined()
})

test('lanza sin uid y no filtra el cuerpo en el mensaje', () => {
  let message = ''
  try {
    parseFindUserResponse({ displayName: 'Secreto Nombre' })
  } catch (e) {
    message = (e as Error).message
  }
  expect(message).toMatch(/no se encontró uid/)
  expect(message).not.toContain('Secreto')
})

test('entradas no objeto o uid no string lanzan', () => {
  expect(() => parseFindUserResponse(null)).toThrow()
  expect(() => parseFindUserResponse('texto')).toThrow()
  expect(() => parseFindUserResponse({ uid: 123 })).toThrow()
})
