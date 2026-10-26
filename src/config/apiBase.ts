/** URL por defecto del backend (Railway). Se usa si VITE_API_BASE_URL no está definida. */
export const DEFAULT_API_BASE_URL = 'https://translvoz-pro-production.up.railway.app'

/**
 * Normaliza la URL base del backend: recorta espacios y barras finales.
 * Si el valor es vacío/indefinido devuelve el valor por defecto.
 * Lanza si el valor no es una URL http(s) válida, para fallar pronto y con
 * un mensaje claro en lugar de producir peticiones a rutas inválidas.
 */
export function resolveApiBase(raw: string | undefined | null): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '')
  if (!value) return DEFAULT_API_BASE_URL
  if (!/^https?:\/\/[^\s/]+/i.test(value)) {
    throw new Error(`VITE_API_BASE_URL inválida: se esperaba una URL http(s), recibido "${value}"`)
  }
  return value
}
