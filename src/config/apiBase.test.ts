import { test, expect } from 'vitest'
import { resolveApiBase, DEFAULT_API_BASE_URL } from './apiBase'

test('usa el valor por defecto si no hay variable', () => {
  expect(resolveApiBase(undefined)).toBe(DEFAULT_API_BASE_URL)
  expect(resolveApiBase('')).toBe(DEFAULT_API_BASE_URL)
  expect(resolveApiBase('   ')).toBe(DEFAULT_API_BASE_URL)
})

test('recorta espacios y barras finales', () => {
  expect(resolveApiBase(' https://api.example.com/// ')).toBe('https://api.example.com')
  expect(resolveApiBase('http://localhost:3000/')).toBe('http://localhost:3000')
})

test('rechaza valores que no son URL http(s)', () => {
  expect(() => resolveApiBase('api.example.com')).toThrow(/VITE_API_BASE_URL inválida/)
  expect(() => resolveApiBase('ftp://x.com')).toThrow(/VITE_API_BASE_URL inválida/)
})
