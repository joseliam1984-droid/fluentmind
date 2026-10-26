# Contrato frontend ↔ backend

**Estado: verificado** contra el código del backend (repo privado `fluentmind-backend`, commit `ce778c6`: `routes/*.js`, `services/signalingServer.js`, `docs/CONTRATO_EVENTOS.md` v1.2) y, para las rutas marcadas ✔, contra el servicio desplegado en Railway (respuestas observadas el 2026-10-14).

Base: `VITE_API_BASE_URL`. Rutas autenticadas llevan `Authorization: Bearer <Firebase ID token>`; Socket.IO envía `auth: { token }` (el backend rechaza sockets sin token válido).

## REST

| Método y ruta | Auth | Petición | Respuesta |
|---|---|---|---|
| `GET /api/calls/historial` ✔ (401 sin token) | sí | — | historial del usuario |
| `GET /api/calls/ice-servers` | sí | — | `{ iceServers: IceServer[] }` (credenciales Twilio temporales; pedir una vez por llamada) |
| `POST /api/calls/activar` | sí | — | `{ numero }` |
| `GET /api/calls/:callSid/vocabulario` | sí | — | `{ vocabulario: [{palabra, traduccion, ejemplo, categoria}] }` (no usado por el frontend aún) |
| `POST /api/users/find` ✔ (401 sin token) | sí | `{ email }` | `200 { uid, displayName, photoURL, online }` · `404 { error: 'USER_NOT_FOUND' }` · `400 { error }`. **No devuelve email.** |
| `POST /api/translate` ✔ (200 verificado) | **no** (ver riesgos) | `{ text, from, to }` con `from`/`to` ∈ `'es' \| 'en'` | `200 { text, source: 'ai' }` · `400 { error }` (texto vacío o idioma no soportado) · `500 { error: 'Error al traducir' }` |

Ejemplo real observado: `{"text":"Hola, ¿cómo estás?","from":"es","to":"en"}` → `{"text":"Hey, how's it going?","source":"ai"}`.

## Socket.IO (Contrato Oficial de Eventos v1.2)

Cliente → servidor: `call:start {targetUid}`, `call:accept {roomId}`, `call:decline {roomId}`, `call:offer {roomId, sdp}`, `call:answer {roomId, sdp}`, `call:ice-candidate {roomId, candidate}`, `call:hangup {roomId}`, `call:mute`, `call:speaker` (sin efecto en backend), `heartbeat`.

Servidor → cliente: `call:incoming {roomId, fromUserId}`, `call:ringing {roomId}`, `call:accepted {roomId}`, `call:declined {roomId}`, `call:ended {roomId, razon}` (`colgada` | `peer_desconectado`), `call:error {message}` (`destinatario_no_disponible` | `contacto_ocupado`), `user:online/offline {uid}`, `heartbeat {ok, hora}`.

El servidor solo reenvía offer/answer/ice-candidate. Reconexión: gracia de 10 s antes de dar la llamada por terminada; sockets sin heartbeat >30 s se desconectan.

## Cómo lo usa el frontend

- Búsqueda por email → si `online === false` se avisa de inmediato (sin esperar 30 s).
- `call:error` y `call:declined` cortan la espera del llamante con un mensaje específico.
- Rechazar una llamada entrante emite `call:decline` (antes solo se cerraba la UI).
- Traducción: `translateText()` → `POST /api/translate` (`src/features/translation`).

## Riesgos del backend detectados (no modificados)

1. `POST /api/translate` **no exige autenticación** ni tiene límite de uso (confirmado en `routes/translate.js` y en `docs/DEUDA_TECNICA.md`): cualquiera puede gastar saldo de OpenAI. El frontend ya envía el token, así que añadir `requiereUsuario` no rompe nada.
2. Socket.IO con `cors: { origin: '*' }` y `app.use(cors())` abierto.
3. `GET /api/config` es público y devuelve `twilioPhone`.
