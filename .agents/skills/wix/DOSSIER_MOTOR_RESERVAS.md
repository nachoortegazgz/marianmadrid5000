# DOSSIER TÉCNICO — Motor de Reservas Online
## Sistema marianmadrid5000 · Versión 0609 · 06-sep-2026

**Negocio:** Marian Madrid Peluquería y Estética · Zaragoza  
**Runtime:** Wix Velo V2 · Backend serverless  
**Motor nativo:** Wix Bookings V2 (`wix-bookings.v2`)  
**Modelo de reserva:** Servicios simples y servicios duales con gap de exposición (F1 + exposición + F2)  
**Personal activo:** 3 profesionales — no multiservice, modelo de recurso único por slot  

---

## 1. ARQUITECTURA GENERAL DEL MOTOR

El motor de reservas está distribuido en tres módulos backend especializados con responsabilidades estrictas, más un sistema de colecciones CMS de apoyo:

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Páginas Wix)                                     │
│  Formulario de reserva · Calendario de reservas            │
└────────────────────┬────────────────────────────────────────┘
                     │ webMethod (RPC seguro)
┌────────────────────▼────────────────────────────────────────┐
│  reservas.web.js   — Módulo de disponibilidad               │
│  · Consulta a Wix Bookings V2 API                           │
│  · Construcción de slots duales con gap                     │
│  · Balanceo de carga por profesional                        │
│  · Gestión de caché multicapa (RAM + CMS)                   │
│  · Rate limiting por superficie                             │
└────────────────────┬────────────────────────────────────────┘
                     │ Llamada interna
┌────────────────────▼────────────────────────────────────────┐
│  bookingSaga.js    — Orquestador transaccional              │
│  · Saga compensable con pasos y rollback                    │
│  · Locks distribuidos con heartbeat                         │
│  · Idempotencia por pairToken + payloadHash                 │
│  · Creación paralela F1 + F2 en Wix Bookings V2            │
│  · Checkout Wix eCommerce (pago online) o confirma directa │
└────────────────────┬────────────────────────────────────────┘
                     │ Primitivas atómicas
┌────────────────────▼────────────────────────────────────────┐
│  bookingCore.js    — Capa de acceso y primitivas            │
│  · _persistBooking → CitasF2                                │
│  · _lockSlotKeyOrFail / _renewLock / _unlockSlotKey        │
│  · _initTransaction / _completeTransaction / _failTransaction│
│  · createBookingElevated / cancelBookingElevated (Wix V2)  │
│  · createCheckoutElevated / confirmOrDeclineBookingElevated │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. PROFESIONALES — MODELO DE RECURSO ÚNICO (NON-MULTISERVICE)

El sistema usa el modelo **un recurso por slot** de Wix Bookings. No hay multiservice: cada slot pertenece a una única profesional cuyo `resourceId` es un GUID de la colección `MapaStaff`.

**Personal activo (datos reales de `.wix/BIBLIA FINAL.txt`):**

| Profesional | resourceId (Wix) | scheduleId (Wix) |
|---|---|---|
| MARIAN MADRID | `e556070a-6d6a-402e-8422-11133033ea76` | `06af20d4-1ec3-49fa-9075-f0691dfa7fd4` |
| ANDREA STAFF | `07f7344f-e7e4-4c53-854b-47fd82ac8d40` | `a494b829-8161-4b84-b78d-6ffed45b4abe` |
| ALBA STAFF | `9b905bfd-1a09-485d-9273-a24a20dfe648` | `94b8980d-63f4-43b1-ba86-41075e0eb63c` |

**`STAFF_RESOURCE_TYPE_ID`:** `1cd44cf8-756f-41c3-bd90-3e2ffcaf1155`  
Este ID de tipo de recurso se pasa explícitamente en cada llamada a la API de disponibilidad para filtrar únicamente recursos de tipo personal (evitando retornar slots de equipos o salas):

```javascript
// reservas.web.js:394
payload.includeResourceTypeIds = [STAFF_RESOURCE_TYPE_ID];
```

Si el usuario no selecciona profesional concreta (modo "cualquier profesional"), el sistema no filtra por `resourceId` en la llamada a Wix Bookings y obtiene slots de cualquier recurso disponible, decidiendo internamente cuál asignar mediante el algoritmo de balanceo de carga.

---

## 3. MODELO DE SERVICIO DUAL CON GAP

### 3.1 Concepto

```
F1 (Aplicación)  →  Gap/Exposición  →  F2 (Aclarado/Matizado)
phase1Duration       exposureDuration      phase2Duration
    ██████████░░░░░░░░░░░░░░░░░░░░░░░████████████
    │← Profesional ocupada →│← Libre →│← Ocup. →│
```

Durante el **gap** de exposición, la profesional queda **liberada** — puede atender otros servicios simples o empezar otro servicio dual. El slot de F2 de ese mismo cliente llega al final del gap y la profesional vuelve a estar ocupada.

### 3.2 Estructura de datos en `ServiciosCatalogo`

Cada servicio con modo dual tiene:

| Campo CMS | Tipo | Descripción |
|---|---|---|
| `allowCombine` | Boolean | Habilita modo dual |
| `linkedPhases` | Text (GUID) | serviceId del servicio F2 asociado |
| `phase1Duration` | Number | Minutos de F1 |
| `exposureDuration` | Number | Minutos del gap de exposición |
| `phase2Duration` | Number | Minutos de F2 |
| `totalDuration` | Number | Suma total (o calculado dinámicamente) |

El nombre canónico del campo es **`linkedPhases`** (fix S-01 documentado en bookingSaga.js). El alias `secondaryServiceGuid` convive en algunas rutas por compatibilidad.

---

## 4. FLUJO COMPLETO DE DISPONIBILIDAD

### 4.1 Resolución del servicio

**Entrada:** slugUrl (`/coloracion-mechas`) o serviceId (GUID)  
**Fuente de datos:** `ServiciosCatalogo` (Wix Data CMS)

```javascript
// reservas.web.js:283-334
// 1. Busca en caché RAM (TTL: 600s)
const cached = serviceCatalogRAM.get(clean);
if (cached && Date.now() - cached.timestamp < SERVICE_CACHE_TTL_MS) return cached;

// 2. Si no está en caché → query a CMS
// Por GUID: .eq("serviceId", clean)  →  fallback a .eq("_id", clean)
// Por slug: .eq("slugUrl", clean)  [Fix R-03]

// 3. _mapServiceToPresentation() construye el objeto normalizado:
//    serviceId, slugUrl, allowCombine, linkedPhases, phase1Duration,
//    exposureDuration, phase2Duration, totalDuration, staffOptions, addons...

// 4. Se almacena en RAM bajo 3 claves: clean, serviceId, slugUrl
_cacheSetBounded(serviceCatalogRAM, clean, { data: mapped, timestamp: now });
_cacheSetBounded(serviceCatalogRAM, mapped.serviceId, { data: mapped, timestamp: now });
_cacheSetBounded(serviceCatalogRAM, mapped.slugUrl, { data: mapped, timestamp: now });
```

### 4.2 Consulta de días disponibles (`getAvailableDays`)

**Llamada pública** `webMethod(Permissions.Anyone)` — usada por el calendario del frontend.

**Algoritmo:**
1. Calcula `fromLocal` = max(mañana, primer día del mes) y `toLocal` = min(maxDate, último día del mes)
2. Llama a `_listTimeSlotsV2` con **`timeSlotsPerDay: 1`** — pide solo 1 slot por día a la API de Wix para saber si hay disponibilidad ese día sin cargar todos los horarios
3. Extrae las fechas únicas del array de slots devuelto
4. Filtra por la ventana `[mañana, hoy + DIAS_LIMITE]` donde `DIAS_LIMITE = 14`
5. Devuelve array de strings `YYYY-MM-DD`

El calendario del frontend muestra en verde solo los días devueltos en este array.

### 4.3 Llamada a la API real de Wix Bookings V2

**Función central:** `_listTimeSlotsV2()` — reservas.web.js:436

```javascript
// Payload enviado a availabilityTimeSlots.listAvailabilityTimeSlots():
{
  serviceId: "GUID-servicio",
  fromLocalDate: "2026-09-10T00:00:00",
  toLocalDate: "2026-09-10T23:59:59",
  timeZone: "Europe/Madrid",
  bookable: true,                          // Solo slots reservables
  locations: [{ id: LOCATION_ID, locationType: "BUSINESS" }],
  includeResourceTypeIds: [STAFF_RESOURCE_TYPE_ID],
  resourceTypes: [{                        // Solo si se solicitó profesional concreta
    resourceTypeId: STAFF_RESOURCE_TYPE_ID,
    resourceIds: ["GUID-profesional"]
  }],
  customerChoices: {                       // Solo si hay addons seleccionados
    addOnIds: ["GUID-addon1", "GUID-addon2"]
  },
  timeSlotsPerDay: 1,                      // Solo para getAvailableDays
}
```

**Location ID real:** `7a12abfd-bf30-4847-bcdf-00dc573d4802`

Los slots devueltos por Wix incluyen por cada horario: `localStartDate`, `localEndDate`, `bookable`, y la lista de recursos disponibles. El sistema extrae los `resourceId` con `_extractResourceIdsFromSlot()` que normaliza los distintos formatos que Wix puede devolver (`slot.resourceId`, `slot.resource.id`, `slot.resources[].id`).

### 4.4 Construcción de pares duales (`getCertifiedDualSlots`)

Esta es la función más compleja del motor. Se activa cuando `service.allowCombine === true`.

**Algoritmo paso a paso:**

```
Para cada slotF1 disponible ese día:
  1. Calcular earliestF2 = endF1 + exposureDuration
  2. Obtener candidateResourceIds del slot F1
  3. Rankear los candidatos por carga (algoritmo de balanceo)
  4. Para cada candidato (orden ascendente de carga):
     a. Llamar _findNextSlotForServiceInternal(F2.serviceId, earliestF2, candidato)
     b. Verificar que el slot F2 devuelto incluye al mismo candidato
     c. Si coincide → elegir este candidato y este slotF2 → BREAK
  5. Si se encontró pareja válida:
     a. Generar pairToken UUID único
     b. Construir par {fase1, fase2, pairToken, candidateResourceIds, dateYMD}
     c. Persistir par en DualSlotCache con TTL=900s
```

El par de slots descartado si el staff del F2 devuelto no coincide con el candidato del F1, garantizando que ambas fases las realiza la misma profesional.

```javascript
// reservas.web.js:680-684 — verificación de coherencia del staff
const s2Staff = _extractResourceIdsFromSlot(candidateF2);
if (s2Staff.length > 0 && !s2Staff.includes(String(candidateResourceId))) continue;
chosenResourceId = candidateResourceId;
s2 = candidateF2;
break;
```

**Persistencia en `DualSlotCache`:**
```javascript
{
  _id: pairToken,          // UUID — clave de idempotencia
  pairToken,
  slotF1: { ...slot1 },    // objeto slot completo de F1
  slotF2: { ...slot2 },    // objeto slot completo de F2
  resourceId: chosenId,    // profesional asignada
  candidateResourceIds: [], // todos los candidatos evaluados
  serviceId, secondaryServiceGuid, dateYMD,
  expiresAt: now + 900s,   // TTL de 15 minutos
  status: "ACTIVE"
}
```

---

## 5. ALGORITMO DE BALANCEO POR CARGA HORARIA

Antes de asignar profesional para cualquier slot (simple o dual), el sistema calcula la carga actual de cada candidato y elige el menos ocupado.

### 5.1 Cálculo de carga

**Fuente de datos:** colección `CitasF2` — consulta las citas confirmadas o pendientes de pago de ese día para cada recurso candidato.

```javascript
// reservas.web.js:508-531 — _getBookedMinutesByResourceForDay()
wixData.query(CITAS_COL)
  .eq("dateYmd", ymd)
  .in("status", ["CONFIRMED", "PENDING_PAYMENT"])
  .in("resourceId", ids)
  .limit(1000)
```

Para cada cita encontrada, calcula `endDate - startDate` en minutos usando fechas UTC. El resultado es un mapa `{ resourceId → minutosOcupados }`.

### 5.2 Ranking y selección

```javascript
// reservas.web.js:534-551 — _rankResourcesByLoad()
ids.sort((a, b) => {
  const ma = minutosMap[a] || 0;
  const mb = minutosMap[b] || 0;
  if (ma !== mb) return ma - mb;           // Primero el menos cargado
  return names[a].localeCompare(names[b]); // Desempate: orden alfabético
});
```

La profesional con menos minutos reservados ese día se coloca primera. Si empatan en carga, el desempate es alfabético por nombre (reproducible, sin aleatoriedad).

**Casos de uso:**
- **Servicio simple sin profesional indicada:** se elige automáticamente la menos cargada
- **Servicio dual:** se prueban los candidatos de menor a mayor carga hasta encontrar uno disponible para ambas fases
- **Profesional indicada por el usuario:** se omite el ranking — se valida directamente que esa profesional tenga disponibilidad en ambas fases

---

## 6. SAGA TRANSACCIONAL — FLUJO DE CREACIÓN DE RESERVA

### 6.1 Estructura general

La reserva se ejecuta mediante `executeBookingSaga()` en `bookingSaga.js`, usando el patrón **Saga con compensaciones** implementado por `BookingSagaOrchestrator`. Si cualquier paso falla, se ejecutan en orden inverso las funciones de compensación de los pasos ya completados.

```
Pasos de la Saga:
  [1] LockSlots         → compensation: unlock + stop heartbeat
  [2] CreateBookings    → compensation: cancelBookingElevated para cada booking creado
  [3a] CreateCheckout   → compensation: —  (pago no procesado aún)
  [3b] ConfirmPresencial→ compensation: —  (confirmación sin cargo económico)
```

### 6.2 Fase 0 — Validación y resolución

Antes de ejecutar la saga, el sistema realiza:

1. **Validación de payload:** email, metaCita, slotF1 obligatorios
2. **Resolución del serviceId:** acepta GUID o slug, normaliza con `_resolveServiceIdInternal()`
3. **Verificación del servicio:** `allowCombine` requerido si es dual
4. **Resolución del recurso:** prioridad — staff solicitada > resourceId del slot > cualquiera
5. **Revalidación en tiempo real** de disponibilidad: llama a `_resolveStaffForSlotInternal()` que ejecuta una nueva consulta a Wix Bookings V2 para confirmar que el slot sigue disponible en el momento exacto de la transacción
6. **Cálculo SSOT de tiempos F2:** si el frontend no envió `slotF2.localStartDate`, el sistema lo calcula como `f1Start + phase1Duration + exposureDuration`

### 6.3 Locks distribuidos y heartbeat

El mecanismo de exclusión mutua usa la colección `SlotLocks` (Wix Data) como coordinador distribuido.

**Formato de la clave de lock:**
```
lock:<serviceId>:<resourceId>:<localStartTime>
```

Para una reserva dual se generan **dos locks** — uno por fase — ambos con el mismo `ownerId` (el `pairToken` estable):

```javascript
// bookingSaga.js:374
lockKeys = _buildLockKeys(phases, lockResourceKey);
// Resultado ejemplo:
// ["lock:GUID-F1:GUID-recurso:2026-09-10T10:00:00",
//  "lock:GUID-F2:GUID-recurso:2026-09-10T12:30:00"]
```

**TTL del lock:** 300 segundos (5 minutos)  
**Heartbeat:** cada 15 segundos, `setInterval` que llama a `_renewLock()` para extender el TTL mientras la transacción está en curso, evitando que un lock expire durante una transacción lenta.

```javascript
// bookingSaga.js:387-389
heartbeatInterval = setInterval(() => {
  lockKeys.forEach((key) => _renewLock(key, lockOwnerId, LOCK_TTL_MS).catch(() => {}));
}, HEARTBEAT_MS); // 15000ms
```

El heartbeat siempre se limpia en el bloque `finally` para evitar fugas de interval.

**Flujo de adquisición:**
```javascript
// bookingCore.js:226-268
// 1. Query a SlotLocks: ¿existe lock activo para esta clave con otro ownerId?
// 2. Si sí → devuelve { ok: false, code: "TOKEN_BUSY" }
// 3. Si no → INSERT del lock record con status="ACQUIRED", expiresAt, ownerId
// 4. Devuelve { ok: true, lockKey, ownerId }
```

### 6.4 Idempotencia transaccional

El sistema implementa doble protección contra duplicados:

**Primera capa — pairToken estable (determinista):**
```javascript
// bookingSaga.js:86-99
// Si el payload contiene pairToken → usar ese
// Si no → SHA256(serviceId + resourceId + f1Start + f2Start) + emailHash
// Mismo booking = mismo hash = mismo pairToken siempre
```

**Segunda capa — BookingTransactions:**
```javascript
// bookingCore.js:_initTransaction()
// transactionId = SHA256(pairToken + payloadHash)[:16]
// INSERT en BookingTransactions con status=INITIATED
// Si ya existe con status=COMPLETED → devuelve isNew:false, existing.result
// Si ya existe con status=INITIATED y age < 120s → timeout: true (en proceso)
// Si age > 120s → reclaimed: true (transacción huérfana rescatada)
```

**Tercera capa — query por pairToken en CitasF2:**
Antes de ejecutar la saga, se consulta si ya existe una cita con ese pairToken. Si existe:
- Con `estadoPago=PENDING_PAYMENT` → devuelve la URL de checkout existente sin crear nada nuevo
- Con otro estado → devuelve los datos de confirmación existentes

### 6.5 Creación de reservas en Wix Bookings V2

Para servicios duales, F1 y F2 se crean en **paralelo** con `Promise.all()`. F2 incluye un jitter de 400-1000ms para reducir contención en la API de Wix:

```javascript
// bookingSaga.js:594-598
if (isDual) {
  await Promise.all([createF1(), createF2()]);
} else {
  await createF1();
}
```

Cada creación usa `createBookingElevated()` que llama a la API real de Wix Bookings V2 con `elevate()` para saltarse las verificaciones de permisos de miembro. La llamada incluye:
- `serviceId`: GUID del servicio F1 o F2
- `bookedEntity.slot`: el slot "prístino" construido por `_forceStaffInPristineSlot()` — objeto que Wix Bookings V2 espera con el formato exacto de su API
- `contactDetails`: firstName, lastName, email, phone
- `options.flowControlSettings.skipAvailabilityValidation: false` — Wix valida disponibilidad de nuevo en el momento del create (segunda validación por parte del motor nativo de Wix)

Si la creación falla para cualquier fase, `_compensateCreatedBookings()` ejecuta `cancelBookingElevated()` para cada booking ya creado, o lo registra en `CompensacionesPendientes` si el cancelado también falla.

### 6.6 Cierre de transacción

**Pago online (`metodoPago === "ONLINE"`):**
1. `createCheckoutElevated()` — crea checkout de Wix eCommerce con los bookingIds como `catalogReference`
2. `getCheckoutUrlElevated()` — obtiene la URL de pago de Wix Payments
3. Devuelve `{ requiresPayment: true, checkoutUrl }` al frontend

**Pago presencial:**
1. `confirmOrDeclineBookingElevated(bookingId, { paymentStatus: "NOT_PAID" })` para cada booking
2. Devuelve objeto de confirmación completo con nombre, fecha, hora, profesional, total

En ambos casos:
- `_persistBooking()` escribe el registro en `CitasF2`
- `_completeTransaction()` marca la transacción como COMPLETED en `BookingTransactions`
- `_bestEffortUnlockAll()` libera todos los locks
- `_invalidateCachesInternal()` invalida la caché RAM y el registro de `AvailabilityDaysCache` para esa fecha/servicio

---

## 7. SISTEMA DE CACHÉ MULTICAPA

### 7.1 Capa 1 — RAM (instancia de función serverless)

Cuatro `Map()` en memoria con LRU manual (elimina la entrada más antigua al superar `MAX_ENTRIES = 100`):

| Map | Clave | TTL | Contenido |
|---|---|---|---|
| `availabilityCache` | `serviceId__resources__addons__from__to__ts:N` | 120 s | Array de slots devueltos por Wix Bookings V2 |
| `serviceCatalogRAM` | slugUrl / serviceId / clean | 600 s | Objeto servicio mapeado de `ServiciosCatalogo` |
| `staffDisplayCache` | resourceId | 300 s | Nombre visible de la profesional |
| `inflightRequests` | misma clave que `availabilityCache` | Vida de la Promise | Deduplicación de llamadas concurrentes |

La `inflightRequests` es el mecanismo de **deduplicación de llamadas simultáneas**: si dos requests del frontend piden disponibilidad para el mismo servicio/día al mismo tiempo, la segunda espera la Promise de la primera en vez de lanzar otra llamada a Wix Bookings V2:

```javascript
// reservas.web.js:452-453
const inflight = inflightRequests.get(cacheKey);
if (inflight) return inflight;
// ... lanza la llamada real, registra la Promise en inflightRequests
// finally: inflightRequests.delete(cacheKey)
```

La caché RAM se purga mediante `purgeExpiredRamCaches()`, llamado por el cron `cleanExpiredSlotsCache` (01:10 diario).

### 7.2 Capa 2 — `AvailabilityDaysCache` (Wix Data CMS)

**Propósito:** caché de qué días del mes tienen al menos un slot disponible, con invalidación event-driven.

**Clave de documento:** `${DAYS_CACHE_VERSION}__${serviceId}__${hash(resourceIds)}__${yearMonth}`

Cuando una reserva se confirma, `_invalidateCachesInternal()` elimina el documento de ese mes/servicio de esta colección. El frontend en la siguiente petición no encontrará caché y lanzará una consulta fresca a Wix Bookings V2.

Cron de limpieza: `cleanExpiredDaysCache` (01:00 diario).

### 7.3 Capa 3 — `DualSlotCache` (Wix Data CMS)

**Propósito:** almacena los pares F1+F2 calculados para servicios duales, identificados por su `pairToken`. TTL de 15 minutos (`DUAL_CACHE_TTL_MS = 900000ms`).

Cuando el usuario avanza al formulario de reserva con un par dual concreto, el `pairToken` en el payload de la saga referencia este registro. Permite recuperar `slotF1`/`slotF2`/`resourceId` sin recalcular todo el algoritmo de búsqueda dual.

Cron de limpieza: `cleanupExpiredDualCache` (XX:20 horario).

### 7.4 Invalidación de caché tras reserva confirmada

```javascript
// bookingSaga.js:730
await _invalidateCachesInternal(phaseOneServiceId, madridDateYMD, finalResourceId, traceId);

// reservas.web.js:725-766 — _invalidateCachesInternal():
// 1. Borra todas las entradas de availabilityCache que empiecen por serviceId
for (const k of availabilityCache.keys()) {
  if (String(k).startsWith(prefix)) availabilityCache.delete(k);
}
// 2. Remove el documento de AvailabilityDaysCache para ese yearMonth+serviceId
await wixData.remove(DAYS_CACHE_COL, daysCacheId, { suppressAuth: true });
// 3. Borra todos los registros de DualSlotCache para ese serviceId+dateYMD
await wixData.query(DUAL_CACHE_COL).eq("serviceId", ...).eq("dateYMD", ...).find()
// ... remove cada uno
```

---

## 8. COLECCIONES CMS DE APOYO AL MOTOR

Las colecciones usadas directamente por el motor de reservas (de las 28 del esquema canónico):

| Colección | CollectionID | Rol en el motor | Escritura | Lectura |
|---|---|---|---|---|
| `SERVICIOS_CATALOGO` | `ServiciosCatalogo` | Catálogo de servicios con config dual | Solo admin | Motor (caché 600s) |
| `MAPA_STAFF` | `MapaStaff` | resourceId, scheduleId, nombre de cada profesional | Solo admin | Motor (caché 300s) |
| `CITAS_F2` | `CitasF2` | Registro de cada cita creada (F1 y F2) | bookingSaga | Motor (balanceo, dedup) |
| `AVAILABILITY_DAYS_CACHE` | `AvailabilityDaysCache` | Caché de días disponibles por mes | Motor | Motor |
| `DUAL_SLOT_CACHE` | `DualSlotCache` | Pares F1+F2 calculados (TTL 15min) | Motor | Motor |
| `BOOKING_TRANSACTIONS` | `BookingTransactions` | Saga transaccional + idempotencia | bookingCore | bookingCore |
| `COMPENSACIONES_PENDIENTES` | `CompensacionesPendientes` | Bookings que no pudieron cancelarse | bookingSaga | cron |
| `SLOT_LOCKS` | `SlotLocks` | Mutex distribuido por slot | bookingCore | bookingCore |

**Índices críticos declarados en la BIBLIA:**
- `CitasF2`: `idx_bookingId` (único), `idx_pairToken`, `idx_res_dates` (resourceId + startDate + endDate)
- `SlotLocks`: compuesto por `lockKey` + `status`

---

## 9. REVALIDACIÓN REAL DE DISPONIBILIDAD ANTES DEL PAGO

Un aspecto crítico de la arquitectura es que **nunca confía en la caché para confirmar una reserva**. Antes de adquirir locks y ejecutar la saga, el sistema ejecuta:

```javascript
// bookingSaga.js:306-322
const resourceValidation = await _resolveStaffForSlotInternal(
  phaseOneServiceId, f1LocalStart, f1LocalEndSSOT,
  f2LocalStart, f2LocalEnd, resourceIdForResolve
);
```

Esta función lanza una nueva llamada a `_listTimeSlotsV2` con `skipCache: true`, consultando directamente la API de Wix Bookings V2 en tiempo real. Si el slot ya no está disponible (otro cliente lo reservó entre que el primer usuario vio el calendario y llegó al formulario), la respuesta es:
```
{ status: "ERROR", error: { code: "SLOT_UNAVAILABLE", message: "..." } }
```

Para la verificación de un slot concreto (cuando el frontend confirma antes de pagar), existe también `revalidateExactAvailabilitySlot()` que usa `availabilityTimeSlots.getAvailabilityTimeSlot()` — el endpoint puntual de Wix Bookings V2 para un slot específico:

```javascript
// reservas.web.js:401
const result = await availabilityTimeSlots.getAvailabilityTimeSlot({
  serviceId, localStartDate, localEndDate,
  location: LOCATION_TS, timeZone: "Europe/Madrid",
  includeResourceTypeIds: [STAFF_RESOURCE_TYPE_ID],
});
// Verifica rawSlot.bookable === true
// Verifica que el resourceId requerido está en los candidatos del slot
```

---

## 10. MANTENIMIENTO Y JOBS PROGRAMADOS

| Cron | Expresión | Función | Descripción |
|---|---|---|---|
| `cleanExpiredLocks` | `15 * * * *` | cada hora (:15) | Purga locks expirados en `SlotLocks` |
| `cleanupExpiredDualCache` | `20 * * * *` | cada hora (:20) | Elimina pares duales expirados de `DualSlotCache` |
| `runPendingCompensationsJob` | `30 * * * *` | cada hora (:30) | Procesa `CompensacionesPendientes` — reintenta cancelaciones fallidas |
| `cleanExpiredDaysCache` | `0 1 * * *` | diario 01:00 | Purga `AvailabilityDaysCache` expirados |
| `cleanExpiredSlotsCache` | `10 1 * * *` | diario 01:10 | Purga caché RAM de slots (resetea Map) |
| `systemHealthCheck` | `0 7 * * *` | diario 07:00 | Comprueba BD, secretos, ledger fiscal |

---

## 11. PROTECCIONES DE SEGURIDAD

| Mecanismo | Implementación | Propósito |
|---|---|---|
| Rate limiting por superficie | `rateLimiter({ surface, key })` en cada webMethod | Limitar abuso por IP/usuario en cada endpoint |
| Bloqueo persistente cross-instancia | `isKeyPersistentlyBlocked()` → `RateLimitBlocks` | Detectar abuso que sobrevive cold starts |
| Locks mutex distribuidos | `SlotLocks` + heartbeat | Evitar doble booking concurrente |
| Idempotencia doble | pairToken + BookingTransactions | Evitar duplicados por retry del cliente |
| `elevate()` de Wix | `createBookingElevated`, `confirmOrDeclineBookingElevated` | Ejecutar operaciones privilegiadas en nombre del sistema sin exponer permisos de administrador al cliente |
| Rate limit específico en bookings | `BOOKING_MAX_REQUESTS: 5, BOOKING_WINDOW_MS: 10000` | 0.5 bookings/seg por cliente — protección contra bots |

---

## 12. FLUJO END-TO-END — DIAGRAMA SECUENCIAL

```
CLIENTE (navegador)           BACKEND VELO                    WIX BOOKINGS V2
       │                           │                                │
       │─ getAvailableDays() ─────►│                               │
       │                    ┌──────┤ caché RAM?                    │
       │                    │  HIT │◄─────────────────────────────►│ NO
       │                    └──────┤                               │
       │                    ┌──────┤ listAvailabilityTimeSlots()   │
       │                    │      │──────────────────────────────►│
       │                    │      │◄─────── slots[]  ─────────────│
       │◄─── días[] ────────┘      │                               │
       │                           │                               │
       │─ getCertifiedDualSlots() ─►│                              │
       │                           │── F1 slots ─────────────────►│
       │                           │◄─ slots[] ───────────────────│
       │                           │   (Para cada slot F1:)        │
       │                           │── F2 next slot ─────────────►│
       │                           │◄─ slotF2 ────────────────────│
       │                           │   rankear por carga           │
       │                           │   guardar en DualSlotCache   │
       │◄─── pares [{F1,F2}] ──────│                               │
       │                           │                               │
       │─ executeBookingSaga() ────►│                              │
       │  {slotF1, slotF2,          │                               │
       │   pairToken, cliente}      │── revalidar en tiempo real ─►│
       │                           │◄─ bookable? ─────────────────│
       │                           │   adquirir lock F1            │
       │                           │   adquirir lock F2            │
       │                           │   iniciar heartbeat           │
       │                           │── createBooking(F1) ─────────►│
       │                           │── createBooking(F2) ─────────►│ (paralelo)
       │                           │◄─ bookingId F1 + F2 ─────────│
       │          [pago ONLINE]    │── createCheckout() ──────────►│ (Wix eCommerce)
       │◄─── checkoutUrl ──────────│◄─ checkoutUrl ───────────────│
       │                           │                               │
       │          [pago PRESENCIAL]│── confirmBooking(F1) ────────►│
       │                           │── confirmBooking(F2) ────────►│
       │◄─── confirmación ─────────│                               │
       │                           │   persistBooking → CitasF2    │
       │                           │   completeTransaction         │
       │                           │   unlock locks                │
       │                           │   invalidar caché             │
```

---

## 13. LIMITACIONES Y ASPECTOS PENDIENTES

| Aspecto | Estado actual | Impacto |
|---|---|---|
| `_persistBooking` no escribe campos canónicos de CitasF2 | Pendiente desde v0904 | El balanceo consulta `dateYmd` y `resourceId` — si no se escriben correctamente en el insert, los conteos de carga serán parciales para citas recién creadas |
| `meta` serializado como JSON.stringify | Pendiente | Impide filtros por subcampos de `meta` en Wix Data |
| Rate limiter sin persistencia de violaciones | Mitad implementada | La función `isKeyPersistentlyBlocked()` existe pero nunca recibe inserts |
| Caché dual solo en Wix Data (no invalidación de los pares individuales tras booking) | Parcial | Los pares expirados se eliminan por TTL (15min) o por cron, no por evento de booking |

---

*Documento generado a partir del análisis directo del código fuente de la versión 0609 del 06-sep-2026.*  
*Módulos de referencia: `reservas.web.js` (906L), `bookingSaga.js` (756L), `bookingCore.js` (859L).*  
*Fuente operativa: `.wix/BIBLIA FINAL.txt` v5002.3-canonical-full-stack.*
