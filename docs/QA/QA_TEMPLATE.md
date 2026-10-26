# QA Template — FluentMind

## 1. Objetivo

## 2. Señalización (si aplica)

- [ ] Evento 1
- [ ] Evento 2
- [ ] Evento 3

## 3. Backend

- [ ] API endpoints responden (status, payload)
- [ ] WebSocket/Socket.IO conecta
- [ ] Railway logs sin errores
- [ ] Respuestas dentro de timeout esperado

## 4. Frontend

- [ ] Componente renderiza correctamente
- [ ] Estados: loading / empty / error / success
- [ ] Sin props undefined o null inesperados
- [ ] Eventos de usuario disparan handlers correctos

## 5. Network

- [ ] Peticiones HTTP status esperado
- [ ] Payloads request/response coinciden con tipos
- [ ] Eventos Socket.IO nombre y payload correctos
- [ ] Sin peticiones huérfanas o duplicadas

## 6. Logs

- [ ] Marcas de instrumentación presentes y secuenciales
- [ ] Sin errores en handlers
- [ ] Heartbeat activo (si aplica)

## 7. Consola

- [ ] 0 errores JS
- [ ] 0 errores de red
- [ ] 0 warnings de Firebase / librerías

## 8. Producción

- [ ] Bundle hash coincide con último commit
- [ ] Deploy timestamp posterior al commit
- [ ] Staging responde correctamente (URL fija)
- [ ] Sin contenido legacy no migrado

## 9. Seguridad

- [ ] Firebase Auth: onAuthStateChanged protege rutas
- [ ] ID Token adjunto en requests autenticadas
- [ ] Sin exposición de API keys en cliente
- [ ] Socket.IO autenticado con token

## 10. Regresiones

- [ ] Funcionalidad previa intacta
- [ ] Sin side effects en módulos no modificados
- [ ] Flujo completo ejecutado sin errores

## 11. Evidencia

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1.1 | Descripción | **PASS** / **FAIL** | Método de verificación |

## 12. Resultado

- [ ] **PASS** — Sin bloqueadores
- [ ] **FAIL** — Bloqueador identificado
- [ ] **INCOMPLETO** — Pendiente de evidencia
