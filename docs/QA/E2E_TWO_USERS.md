# Prueba manual de llamada con dos usuarios reales

Las pruebas automatizadas usan dobles (mocks) de Socket.IO, Firebase y WebRTC. **No sustituyen esta prueba.** Rellena el resultado en `QA_TEMPLATE.md`.

## Requisitos

- Dos cuentas Google distintas (A = llamante, B = receptor), cada una con sesión en un dispositivo o navegador distinto (o dos perfiles de Chrome). Ambas deben existir en el backend.
- Micrófono y auriculares en ambos (evita realimentación). HTTPS o `localhost` (el micrófono lo exige).
- Backend de Railway activo y `VITE_API_BASE_URL` apuntando a él.

## Pasos

1. A y B abren la app e inician sesión. **Esperado:** dashboard con su nombre y correo; recargar la página mantiene la sesión.
2. Ambos abren `/calls?debug=webrtc` (panel de pasos) y consola del navegador.
3. B: pulsar *Activar* si procede y confirmar que carga historial e ICE servers sin errores.
4. A: *Llamar por correo* → correo de B. **Esperado:** estado "Sonando" en A; overlay de llamada entrante en B.
5. B: *Aceptar* (concede el micrófono). **Esperado:** A pasa a *connecting* y luego *inCall*; en ambos ICE `connected`.
6. Hablar en ambos sentidos. **Esperado:** audio audible en los dos lados.
7. A pulsa *Finalizar*. **Esperado:** B recibe `call:ended`, vuelve a `idle`; micrófono liberado (icono del navegador desaparece).
8. Repetir invirtiendo roles (B llama a A).
9. Casos de error: llamar a un correo inexistente ("Usuario no encontrado."), rechazar el micrófono, B cuelga durante el ring, cortar la red de A durante la llamada.

## Qué registrar

Por cada paso: PASS/FAIL, captura de consola (sin tokens), y los logs `[FLOW]`, `[ICE]`, `[HANGUP]`. Si algo falla, adjuntar solo ese hallazgo.

## Login en PWA (investigación abierta)

Hipótesis **no demostrada**: en una PWA instalada, `signInWithRedirect` falla porque `authDomain` (`*.firebaseapp.com`) es de otro sitio que el origen de la app y los navegadores particionan el almacenamiento entre sitios. La corrección habitual (proxy de `/__/auth/*` en el dominio propio + cambiar `authDomain` + registrar la URI de redirección en el cliente OAuth de Google) toca configuración externa y **no está aplicada**.

Para demostrar la causa:

1. Instalar la PWA en el dispositivo afectado y abrir `https://<dominio>/?fmtrace=1`.
2. Iniciar sesión; copiar la traza (pasos `10 branch`, `11 redirect-start`, `50 authstate`, `60 redirect-result`).
3. Si `60 redirect-result` devuelve `uid: null` y `50 authstate` no emite usuario tras volver, la sesión no cruzó el redirect (consistente con la hipótesis). Si hay error, `61 redirect-result-error` lo identifica.
