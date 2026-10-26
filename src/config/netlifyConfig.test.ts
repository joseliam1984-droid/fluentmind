// Regresión de despliegue: el proxy de Firebase Auth en netlify.toml.
// Si alguien reordena o cambia estas reglas, el login por redirect vuelve a
// fallar en silencio (getRedirectResult === null) en navegadores modernos.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { DEFAULT_AUTH_DOMAIN } from './authDomain'

interface Redirect { from?: string; to?: string; status?: string; force?: string }

function leerRedirects(): Redirect[] {
  const toml = readFileSync(resolve(__dirname, '../../netlify.toml'), 'utf-8').replace(/\r/g, '')
  return toml
    .split('[[redirects]]')
    .slice(1)
    .map((bloque) => {
      const r: Redirect = {}
      for (const m of bloque.split('\n[')[0].matchAll(/^\s*(\w+)\s*=\s*"?([^"\n#]+?)"?\s*(?:#.*)?$/gm)) {
        r[m[1] as keyof Redirect] = m[2]
      }
      return r
    })
}

describe('netlify.toml: proxy de /__/auth/*', () => {
  const reglas = leerRedirects()
  const iProxy = reglas.findIndex((r) => r.from === '/__/auth/*')
  const iSpa = reglas.findIndex((r) => r.from === '/*')

  test('existe la regla de proxy hacia el handler de Firebase con :splat', () => {
    expect(iProxy).toBeGreaterThanOrEqual(0)
    expect(reglas[iProxy].to).toBe(`https://${DEFAULT_AUTH_DOMAIN}/__/auth/:splat`)
  })

  test('es un proxy transparente (200), nunca una redirección 301/302', () => {
    expect(reglas[iProxy].status).toBe('200')
    expect(reglas[iProxy].force).toBe('true')
  })

  test('va ANTES del fallback SPA /* (Netlify aplica la primera coincidencia)', () => {
    expect(iSpa).toBeGreaterThanOrEqual(0)
    expect(iProxy).toBeLessThan(iSpa)
  })
})
