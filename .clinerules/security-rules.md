# REGLAS DE SEGURIDAD — MARIAN MADRID

## Secrets
- NUNCA exponer secretos en código
- NUNCA exponer secretos en frontend
- NUNCA exponer secretos en logs
- NUNCA exponer secretos en comentarios
- Usar EXCLUSIVAMENTE Wix Secrets Manager
- Secrets conocidos: `FISCAL_KEY`, `AUTH_JWT_KEY`, `M365_WEBHOOK_HMAC_KEY`

## Colecciones Inmutables (PROTEGIDAS)
Estas colecciones NO deben ser modificadas ni eliminadas directamente:

| Colección | Hook | Acción |
|---|---|---|
| `MOVIMIENTOS_CAJA` | beforeUpdate/beforeRemove | Lanzar `FISCAL_VIOLATION` |
| `HISTORICO_CIERRES_Z` | beforeUpdate/beforeRemove | Lanzar `FISCAL_VIOLATION` |
| `EVENTOS_SISTEMA_FACTURACION` | beforeUpdate/beforeRemove | Lanzar `SIF_VIOLATION` |
| `REGISTROS_HORARIOS_STAFF` | beforeUpdate/beforeRemove | Lanzar `LABOR_LOG_VIOLATION` |
| `CAJA_ACTUAL` | beforeRemove | Singleton protegido |
| `ASIENTOS_CONTABLES` | beforeUpdate/beforeRemove | Bloquear si POSTED/LOCKED |
| `LINEAS_ASIENTO_CONTABLE` | beforeUpdate/beforeRemove | Bloquear si asiento padre posteado |
| `INVENTARIO_STOCK_VENTA_CIERRE` | beforeUpdate/beforeRemove | Bloquear cierre firmado |

## Validaciones Obligatorias
- Validar permisos antes de modificar reservas
- Validar identidad antes de modificar contactos
- Validar stock antes de ventas
- Validar idempotencia antes de insertar
- Validar estado nativo Wix antes de cambiar estado de negocio

## Rate Limiting
- Aplicar `rateLimiter({ surface, key })` en cada webMethod
- BOOKING_MAX_REQUESTS: 5
- BOOKING_WINDOW_MS: 10000
- Usar `isKeyPersistentlyBlocked()` para abuso persistente

## Elevación de Privilegios
- Usar `wix-auth.elevate()` para operaciones asíncronas
- Usar `elevate()` en cron jobs y webhooks
- Nunca exponer permisos de administrador al cliente

## Prohibiciones Absolutas
- No usar `suppressAuth` para saltar protecciones fiscales
- No hacer `wixData.update()` sobre colecciones inmutables
- No hacer `wixData.remove()` sobre colecciones inmutables
- No exponer PII en logs
- No hacer llamadas REST desde frontend
- No usar IFrame SDK
- No usar Cart V1 ni Checkout V1 en código nuevo