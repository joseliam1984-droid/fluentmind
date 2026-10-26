// Regresión PWA: la app React debe seguir siendo instalable (la app anterior lo era).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const raiz = resolve(__dirname, '../..')
const manifest = JSON.parse(readFileSync(resolve(raiz, 'public/manifest.webmanifest'), 'utf-8'))
const html = readFileSync(resolve(raiz, 'index.html'), 'utf-8')

describe('PWA: manifest e iconos', () => {
  test('el manifiesto cumple lo mínimo para instalarse', () => {
    expect(manifest.name).toBe('FluentMind')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBeTruthy()
    const tamanos = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(tamanos).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true)
  })

  test('todos los iconos del manifiesto existen en public/', () => {
    for (const icono of manifest.icons as { src: string }[]) {
      expect(existsSync(resolve(raiz, 'public', icono.src)), icono.src).toBe(true)
    }
    expect(existsSync(resolve(raiz, 'public/icons/apple-touch-icon-180.png'))).toBe(true)
  })

  test('index.html enlaza manifiesto, apple-touch-icon y theme-color', () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png"')
    expect(html).toContain('name="theme-color"')
  })
})
