// Service Worker "self-destruct".
// Reemplaza cualquier Service Worker antiguo (de la PWA previa) que estuviera
// sirviendo un bundle obsoleto desde caché. El navegador revalida /sw.js en la
// siguiente navegación (Netlify lo sirve con Cache-Control: max-age=0,
// must-revalidate), detecta este script nuevo, lo instala y activa; entonces:
//   1) toma control inmediato de los clientes,
//   2) borra TODOS los Cache Storage,
//   3) se desregistra a sí mismo,
//   4) recarga los clientes abiertos -> cargan el bundle actual, ya sin SW.
// No cachea nada ni intercepta fetch: su único propósito es autodestruirse.

self.addEventListener('install', () => {
  // Tomar control de inmediato sin esperar a que se cierren pestañas.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1) Controlar los clientes abiertos ya mismo.
      await self.clients.claim()

      // 2) Eliminar todas las cachés (app-shell antiguo incluido).
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))

      // 3) Desregistrar este Service Worker.
      await self.registration.unregister()

      // 4) Forzar recarga de los clientes -> sin SW, cargan el bundle actual.
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        console.log('[PWA] Old Service Worker removed. Cache cleared. Running latest bundle.')
        client.navigate(client.url)
      }
    })(),
  )
})
