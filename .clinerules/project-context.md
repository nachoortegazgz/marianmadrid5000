# CONTEXTO DEL PROYECTO — MARIAN MADRID v5002.4

## Identidad del Sistema
- **Nombre:** Marian Madrid Peluquería y Estética
- **Plataforma:** Wix Editor Clásico (NO migrar a Wix Studio)
- **Runtime:** Wix Velo V2, Backend serverless
- **SSOT:** BIBLIA DEFINITIVA v5002.4
- **Marco rector:** DIRECTRICES Y OBJETIVOS V19

## Datos del Negocio
- **Ubicación:** C/ Maurice Ravel 35, Local, 50012 Zaragoza
- **Location ID Wix:** `7a12abfd-bf30-4847-bcdf-00dc573d4802`
- **Zona horaria:** `Europe/Madrid`
- **Moneda:** `EUR`
- **País:** `ES`
- **Idioma:** `es`

## Personal Activo (3 profesionales)
> Nota: `internalConfig.js` es el SSOT y declara `STAFF.IDS = []` (a poblar) y
> `API.MARIAN_MANAGEMENT_RESOURCE_ID`. Los `scheduleId` de esta tabla provienen
> de la documentacion y NO estan verificados en el codigo; NO usarlos en codigo
> sin confirmar antes contra el CMS.

| Profesional | resourceId | scheduleId |
|---|---|---|
| MARIAN MADRID | `e556070a-6d6a-402e-8422-11133033ea76` | `06af20d4-1ec3-49fa-9075-f0691dfa7fd4` (ver nota) |
| ANDREA STAFF | `07f7344f-e7e4-4c53-854b-47fd82ac8d40` | `a494b829-8161-4b84-b78d-6ffed45b4abe` (ver nota) |
| ALBA STAFF | `9b905bfd-1a09-485d-9273-a24a20dfe648` | `94b8980d-63f4-43b1-ba86-41075e0eb63c` (ver nota) |

## STAFF_RESOURCE_TYPE_ID
`1cd44cf8-756f-41c3-bd90-3e2ffcaf1155` (constante: `API.STAFF_RESOURCE_TYPE_ID` en `internalConfig.js`)

## Documentacion SSOT (rutas reales del repo)
> Fuente normativa de codigo: `src/backend/internalConfig.js` (contrato espejo en
> `tests/cms-contract.json`, verificado por `tests/verify-core.mjs`).
> Documentacion canónica: `.agents/skills/wix/BIBLIA DEFINITIVA.md`,
> `.agents/skills/wix/DOSSIER_MOTOR_RESERVAS.md`, `.wix/` y
> `REFACTOR_BIBLE_v5002.4.md` (matrices legacy -> canonico).
> Legacy a eliminar: matriz de reemplazo en `REFACTOR_BIBLE_v5002.4.md`.

## Arquitectura de Modulos (rutas reales)
| Modulo | Ruta | Responsabilidad |
|---|---|---|
| Disponibilidad | `src/backend/reservas.web.js` | Slots, cache, resolucion `serviceId` |
| Orquestacion | `src/backend/citasManager.web.js` | Orquestacion de negocio |
| Saga | `src/backend/booking/bookingSaga.js` | Saga transaccional compensable |
| Primitivas | `src/backend/booking/bookingCore.js` | Primitivas atomicas Wix |
| Hooks | `src/backend/data.js` | Inmutabilidad fiscal/laboral |
| Webhooks | `src/backend/events.js` | Eventos y webhooks |
| Constantes | `src/backend/internalConfig.js` | SSOT de configuracion |
| Helpers | `src/public/mmUtils.js` | Helpers compartidos/frontend |
| Bridge | `src/public/widgetBridge.js` | Handshake widgets `postMessage` |
| Caja | `src/backend/cajas.web.js` | TPV, arqueos, secuencia fiscal |
| Inventario | `src/backend/inventario.web.js` | Stock y movimientos |
| Seguridad | `src/backend/security.js`, `security.web.js` | Rate limiting, RBAC |
| Horarios | `src/backend/horario.web.js`, `staff.js` | Registro horario laboral |

## Modelo de Reserva Dual con Gap
```
F1 (Aplicacion) -> Gap/Exposicion (Profesional LIBRE) -> F2 (Aclarado)
[phase1Duration]   [exposureDuration]                    [phase2Duration]
```

## Reglas Fundamentales
1. El sitio permanece en Wix Editor Clasico
2. No migrar a Wix Studio
3. Usar exclusivamente APIs Wix V2
4. Respetar las colecciones canonicas de `internalConfig.js`
5. Mantener inmutabilidad fiscal y laboral (hooks de `data.js`)
6. Cero codigo deprecated
7. No usar Cart V1 ni Checkout V1 en codigo nuevo
8. No usar IFrame SDK
9. No hacer llamadas REST desde frontend
10. Secrets exclusivamente en Wix Secrets Manager
11. No modificar hooks `FISCAL_VIOLATION` / `LABOR_LOG_VIOLATION` (ver `REFACTOR_BIBLE_v5002.4.md`)