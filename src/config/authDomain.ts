/** authDomain por defecto de Firebase (dominio *.firebaseapp.com del proyecto). */
export const DEFAULT_AUTH_DOMAIN = 'fluentmind-43693.firebaseapp.com'

/**
 * Dominios propios que proxean `/__/auth/*` hacia `DEFAULT_AUTH_DOMAIN`
 * (regla de `netlify.toml`). Solo en ellos `authDomain` puede ser el propio
 * origen: es la "Opción 3" de la guía oficial de Firebase para
 * `signInWithRedirect` en Chrome M115+, Firefox 109+ y Safari 16.1+, donde el
 * almacenamiento cruzado entre dominios está bloqueado y `getRedirectResult`
 * devuelve `null` sin error si `authDomain` != origen de la página.
 *
 * Requiere además (fuera del código) añadir
 * `https://<dominio>/__/auth/handler` como URI de redirección autorizada del
 * cliente OAuth de Google y el dominio en "Authorized domains" de Firebase.
 */
export const PROXIED_AUTH_HOSTS: readonly string[] = ['getfluentmind.com']

/**
 * Elige el authDomain:
 *  1. `VITE_FIREBASE_AUTH_DOMAIN` si está definida (decisión explícita).
 *  2. El propio hostname si es un dominio con proxy de auth.
 *  3. El authDomain por defecto en cualquier otro origen (localhost, deploy
 *     previews de Netlify): ahí no hay proxy ni URI OAuth registrada.
 */
export function resolveAuthDomain(
  raw: string | undefined | null,
  hostname: string | undefined | null,
): string {
  const explicit = (raw ?? '').trim()
  if (explicit) return explicit
  const host = (hostname ?? '').trim().toLowerCase()
  return PROXIED_AUTH_HOSTS.includes(host) ? host : DEFAULT_AUTH_DOMAIN
}
