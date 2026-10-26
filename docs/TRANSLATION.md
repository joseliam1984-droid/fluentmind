# Traducción español ↔ inglés: estado y contrato propuesto

## Qué existe hoy (verificado)

| Capacidad | Estado | Dónde |
|---|---|---|
| Traducción de **texto** es↔en | **Implementada de extremo a extremo** | Backend `POST /api/translate` (OpenAI `gpt-4o-mini`); frontend `/translate` |
| Traducción de **voz** (dictar → traducir → escuchar) | **Implementada en el frontend** reutilizando `/api/translate` | Reconocimiento y síntesis del **navegador** (Web Speech API, `src/features/translation/speech.ts`) |
| Traducción de voz **durante una llamada entre usuarios** | **No existe** | El signaling "NO implementa traducción" (`signalingServer.js`); el audio va punto a punto por WebRTC y el backend nunca lo ve |
| Traducción en llamadas telefónicas Twilio | Existe en el backend (panel SSE `/calls/panel-eventos`) | Fuera del alcance de la app WebRTC |
| STT/TTS en el servidor | No existen (solo `chat.completions`) | `services/ai.js` |

Límites de la voz con Web Speech API: depende del navegador (Chrome/Edge/Safari; Firefox no tiene reconocimiento), el audio se envía al servicio de voz del navegador, y requiere HTTPS y permiso de micrófono. La función se oculta cuando el navegador no la soporta.

## Propuesta: traducción durante la llamada (requiere backend)

Como el audio WebRTC no pasa por el servidor, la opción más simple y coherente con la arquitectura actual es **subtítulos traducidos por texto**:

1. Cada cliente reconoce **su propia voz** (Web Speech API, idioma del hablante).
2. El cliente traduce el texto con `POST /api/translate` (REST) y envía el resultado al otro usuario por el canal en tiempo real.
3. El receptor muestra el subtítulo y, opcionalmente, lo lee con `speechSynthesis` en su idioma.

### Cambios necesarios en el backend (lista exacta)

1. **`signalingServer.js`: nuevo evento relay `call:caption`** (bidireccional, igual que offer/answer):
   - Cliente → servidor: `{ roomId: string, text: string, lang: 'es'|'en', translated: string, translatedLang: 'es'|'en', ts: number }`.
   - Servidor → otro participante de la sala: el mismo payload. Validar que el emisor pertenece a la sala (`otroSocket(sala, socket.id)`), limitar `text`/`translated` a 500 caracteres y descartar si no hay sala.
   - Añadirlo a `docs/CONTRATO_EVENTOS.md` (v1.3) — requiere aprobación del Arquitecto según ese documento.
2. **`routes/translate.js`: exigir `requiereUsuario`** (hoy es público) y añadir límite por usuario (p. ej. N peticiones/minuto). El frontend ya envía el token.
3. **CORS**: restringir `origin` de Express y de Socket.IO al dominio de la app.
4. (Opcional) STT/TTS en servidor si se quiere calidad uniforme entre navegadores: endpoints nuevos con su propio contrato; no se proponen aquí.

### Frontend (ya implementado, desactivado por defecto)

`src/features/translation/{useCaptions,CaptionsPanel,captions}.ts(x)`: reconoce mi voz → `POST /api/translate` → emite `call:caption`; escucha `call:caption`, valida el payload y muestra (y opcionalmente lee) el subtítulo. Se muestra en `CallsPage` durante `inCall` solo si `VITE_ENABLE_CAPTIONS=true`. Probado con dobles (mocks); **no** verificado con backend ni usuarios reales.

Riesgos a validar en la prueba real: algunos navegadores (sobre todo móviles) no permiten reconocimiento de voz mientras WebRTC tiene el micrófono; el reconocimiento envía el audio al servicio de voz del navegador.

El código del backend (relay + validación + pruebas) está preparado en `docs/backend-patch/`. Mientras no esté desplegado, no activar la bandera: el servidor descartaría el evento.
