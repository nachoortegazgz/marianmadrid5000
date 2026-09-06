# 🤖 INSTRUCCIONES DE REFACTORIZACIÓN (CLI/VS CODE)

## 1. CONTEXTO
Este proyecto se rige por la **Biblia v5002.4-definitiva**. Todo el código debe alinearse con el esquema canónico definido. **Cualquier ID legacy encontrada debe ser eliminada.**

## 2. REGLAS DE ORO (G10 ASCII STRICT)
1.  **Cero Legacy:** No permitir alias (`slug` -> `slugUrl`, `PendingCompensations` -> `CompensacionesPendientes`).
2.  **Naming:**
    *   IDs Nativas (Wix V2): Invariables (`serviceId`, `bookingId`).
    *   IDs Visibles: Traducción al español `camelCase` (ej: `serviceId` -> `servicioId`).
    *   **No usar:** Espacios, preposiciones (de/del), o adverbios en los nombres.
3.  **Hooks:** **JAMÁS** modificar los hooks de `backend/data.js` que lanzan `FISCAL_VIOLATION` o `LABOR_LOG_VIOLATION`. Si el código refactorizado rompe estos hooks, **revertir y alertar**.

## 3. MATRIZ DE REEMPLAZO (PROCESAR SECUENCIALMENTE)

El asistente debe recorrer los archivos por este orden:
1. `backend/` (data.js, jsw, web.js)
2. `public/` (mmUtils.js)
3. `pages/` (frontend)

### A. Colecciones y Alias
| ID Legacy (Buscar) | ID Canónica (Reemplazar) |
|---|---|
| `CONCILIACION_STOCK_WIX` | `MOVIMIENTOS_INVENTARIO` |
| `SYNC_M365` | `M365_GRAPH_SYNC_QUEUE` |
| `AVAILABILITY_SLOTS_CACHE` | `DUAL_SLOT_CACHE` |
| `CONTADORES_FISCALES` | `SECUENCIA_TICKETS` |
| `AUDITORIA` | `MM_AUDIT_LOG` |
| `LOCKS` | `SLOT_LOCKS` |

### B. Campos Críticos (Refactorización de código)
*Aplicar búsqueda global con este mapeo:*

| Campo Legacy (Legacy) | ID Canónica (Target) |
|---|---|
| `.slug` | `.slugUrl` |
| `.tipoServicio` | `.serviceType` |
| `.tiempoFase1` | `.phase1Duration` |
| `.pagoOnline` | `.onlinePayment` |
| `.pagoPresencial` | `.inPersonPayment` |
| `.statusPago` | `.paymentStatus` |
| `.fechaYmdMadrid` | `.dateYmd` |
| `.idFactura` | `.invoiceNumber` |

## 4. FLUJO DE TRABAJO PARA EL AGENTE
1.  **Indexación:** Leer todos los archivos `.js` y `.jsw` en `backend/` y `public/`.
2.  **Análisis:** Identificar ocurrencias de IDs de la "Matriz de Correspondencia".
3.  **Sustitución Segura:**
    *   Realizar cambios archivo por archivo.
    *   Para cada cambio, verificar si el archivo es un **Hook de Datos** (`data.js`). Si lo es, validar que la lógica de inmutabilidad (`FISCAL_VIOLATION`) no se altere.
    *   Actualizar las importaciones de `internalConfig.js` si la colección cambió de nombre.
4.  **Verificación Final:**
    *   Ejecutar escaneo de búsqueda buscando términos legacy (ej. `slug`, `PendingCompensations`, `ConciliacionStockWix`).
    *   Si el escaneo devuelve resultados, repetir paso 3.

---

### Excepciones documentadas (estado de la alineacion v5002.4)
- `src/backend/data.js`: las lecturas tolerantes (`tiempoFase1`, `numeroTicket`, `fechaHora`, `diaKey`) son el **camino de migracion** de registros CMS existentes; se conservan porque el hook re-escribe el campo canonico. Los hooks `FISCAL_VIOLATION` / `LABOR_LOG_VIOLATION` no se tocan.
- `src/public/widgetBridge.js`: el payload `MM_CONTEXT` envia `slugUrl` (canonico) y `slug` (alias deprecated) hasta que los HTML widgets del CMS migren a `slugUrl`.
- `scripts/align-wix-collections.mjs`: script de migracion; referencia los nombres legacy como patrones de busqueda por diseño.
