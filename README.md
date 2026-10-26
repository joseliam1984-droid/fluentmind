# FluentMind

Aplicación web de llamadas de voz entre usuarios (WebRTC + señalización Socket.IO) con inicio de sesión de Google (Firebase Auth). El backend es un servicio aparte (Railway) y **no** está en este repositorio.

**Stack:** React 19 · TypeScript 6 · Vite 8 · Tailwind 4 · Zustand · React Router 7 · Firebase 12 · socket.io-client · axios.

## Funcionalidades

- Login con Google (popup en navegador, redirect en PWA instalada) y restauración de sesión.
- Rutas protegidas: `/` (Dashboard), `/calls`, `/profile`.
- Llamadas: activar número, historial, llamada por correo, llamada entrante (aceptar/rechazar), colgar, audio remoto.
- Traducción es↔en (`/translate`): texto vía `POST /api/translate` y voz con reconocimiento/síntesis del navegador (dictar → traducir → escuchar).
- Vocabulario (`/vocab`): vocabulario A1-B1 extraído por el backend de tus llamadas telefónicas traducidas (`GET /api/calls/:callSid/vocabulario`).
- Subtítulos traducidos durante una llamada entre usuarios: implementados en el frontend pero **desactivados** (`VITE_ENABLE_CAPTIONS=false`) hasta que el backend implemente el relay `call:caption`. Ver `docs/TRANSLATION.md` y `docs/backend-patch/PATCH.md`.

## Requisitos

Node 22+ y npm.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias |
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` | Oxlint |
| `npm run typecheck` | Comprobación de tipos (sin emitir) |
| `npm test` | Pruebas automatizadas (Vitest + jsdom + Testing Library). Usan dobles de Firebase, Socket.IO y WebRTC |
| `npm run build` | `tsc -b` + build de producción en `dist/` |

## Configuración

Copia `.env.example` a `.env.local`. Todas las variables son opcionales; si faltan se usan los valores del proyecto actual (`src/config/env.ts`).

- `VITE_API_BASE_URL`: URL del backend (REST + Socket.IO). Sin barra final.
- `VITE_FIREBASE_*`: configuración web de Firebase. Es pública por diseño; la protección real son los dominios autorizados y las reglas en la consola de Firebase.

Diagnóstico (no activo para usuarios finales):

- `?authdebug=1` (o modo dev): expone `window.__AUTH__` y registra `[AUTH DEBUG]`.
- `?fmtrace=1`: visor de la traza de autenticación (AUTH-005).
- `?debug=webrtc` en `/calls`: panel de pasos WebRTC.

## Despliegue (Netlify)

`netlify.toml` publica `dist/` y redirige todo a `index.html` (SPA). Antes de desplegar: `npm run lint && npm run typecheck && npm test && npm run build`. Define `VITE_*` en Netlify solo si difieren de los valores por defecto, y comprueba que el dominio de Netlify esté en *Authorized domains* de Firebase Auth.

## Documentación

- `docs/API_CONTRACT.md`: endpoints y eventos del backend (verificado contra su código y el servicio desplegado) y riesgos detectados.
- `docs/TRANSLATION.md`: estado de la traducción y contrato propuesto para la traducción en llamada.
- `docs/backend-patch/PATCH.md`: hallazgos de seguridad del backend y parche preparado (módulos probados; sin aplicar).
- `docs/QA/QA_TEMPLATE.md`: plantilla de QA.
- `docs/QA/E2E_TWO_USERS.md`: prueba manual de llamada con dos usuarios y diagnóstico del login en PWA.
