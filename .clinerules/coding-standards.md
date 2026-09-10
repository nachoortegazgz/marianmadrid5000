# ESTÁNDARES DE CÓDIGO — MARIAN MADRID

## Nomenclatura Canónica v5002.4

### Servicios
| Dominio | Nombre canónico | NO usar |
|---|---|---|
| Servicio principal | `serviceId` | `primaryServiceGuid`, `bookingsServiceId`, `resolvedServiceId` |
| Servicio F2 | `linkFases` | `secondaryServiceGuid`, `f2ServiceId`, `F2ServiceId` |
| Fases internas | `phaseOneServiceId`, `phaseTwoServiceId` | `serviceIdF1`, `serviceIdF2` |
| Resolución | `resolveServiceId`, `_resolveServiceIdInternal` | `resolvePrimaryServiceId` |

### Personal y Reservas
| Dominio | Nombre canónico | NO usar |
|---|---|---|
| Profesional | `resourceId` | `staffId`, `empleada` |
| Reserva dual | `pairToken` | UUID aleatorio por reintento |
| Lock físico | `slotKey` | Usar `pairToken` como lock |

### Campos Corregidos
| Legacy | Canónico |
|---|---|
| `location` | `localizacion` |
| `locationId` | `localizacionId` |
| `statusPago` | `paymentStatus` |
| `fechaYmdMadrid` | `dateYmd` |
| `idFactura` | `invoiceNumber` |
| `idRecepcion` | `receptionNumber` |

## Estructura de Funciones
- Funciones no exportadas: prefijo `_`
- Funciones públicas: sin prefijo
- Web Methods: aplicar permisos y rate limiting en el borde
- Funciones internas: NO reimplementar RBAC

## Constantes
- Importar desde `public/mmUtils.js` y `backend/internalConfig.js`
- Nunca definir constantes duplicadas
- Usar `Object.freeze()` para objetos de configuración

## Fechas y Timezone
- Todas las fechas en `Europe/Madrid`
- Usar helpers seguros frente a DST
- Formato: `YYYY-MM-DD` para fechas, `HH:mm:ss` para horas
- Nunca usar `new Date()` sin normalizar

## Consultas CMS
- Siempre con límites y paginación
- Usar índices apropiados
- No traer campos innecesarios
- No hacer consultas dentro de bucles

## Logs y PII
- Enmascarar emails: `_maskEmail()`
- Enmascarar teléfonos: `_maskPhone()`
- Enmascarar IPs: `_maskIp()`
- Enmascarar nombres: `_maskName()`
- Generar trazabilidad: `makeTraceId()`

## Código ASCII
- Solo caracteres ASCII imprimibles en fuentes JavaScript
- Comentarios y logs en ASCII
- Sin caracteres especiales en strings de código

## Manejo de Errores
- Siempre try/catch en operaciones asíncronas
- Mensajes de error técnicos, no internos
- Registrar errores sin exponer información sensible
- Usar `withTimeout()` para operaciones con límite de tiempo

## Idempotencia
- Toda operación transaccional debe ser idempotente
- Usar `pairToken` para reservas
- Usar `movementToken` para inventario
- Usar `transactionId` para pagos
- Validar duplicados antes de insertar