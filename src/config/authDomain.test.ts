import { describe, expect, test } from 'vitest'
import { DEFAULT_AUTH_DOMAIN, PROXIED_AUTH_HOSTS, resolveAuthDomain } from './authDomain'

describe('resolveAuthDomain', () => {
  test('en getfluentmind.com usa el propio dominio (proxy de /__/auth)', () => {
    expect(resolveAuthDomain(undefined, 'getfluentmind.com')).toBe('getfluentmind.com')
    expect(resolveAuthDomain('', 'GetFluentMind.com')).toBe('getfluentmind.com')
  })

  test('en localhost y deploy previews mantiene el authDomain por defecto', () => {
    expect(resolveAuthDomain(undefined, 'localhost')).toBe(DEFAULT_AUTH_DOMAIN)
    expect(resolveAuthDomain(undefined, 'deploy-preview-3--x.netlify.app')).toBe(DEFAULT_AUTH_DOMAIN)
    expect(resolveAuthDomain(undefined, undefined)).toBe(DEFAULT_AUTH_DOMAIN)
  })

  test('no confunde subdominios o sufijos con el dominio propio', () => {
    expect(resolveAuthDomain(undefined, 'getfluentmind.com.evil.test')).toBe(DEFAULT_AUTH_DOMAIN)
    expect(resolveAuthDomain(undefined, 'evil-getfluentmind.com')).toBe(DEFAULT_AUTH_DOMAIN)
  })

  test('VITE_FIREBASE_AUTH_DOMAIN explícita tiene prioridad', () => {
    expect(resolveAuthDomain(' auth.ejemplo.test ', 'getfluentmind.com')).toBe('auth.ejemplo.test')
  })

  test('el único dominio proxeado es el de producción', () => {
    expect(PROXIED_AUTH_HOSTS).toEqual(['getfluentmind.com'])
  })
})
