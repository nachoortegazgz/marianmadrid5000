BIBLIA COMPLETA Y ESQUEMA CANÓNICO DEL ECOSISTEMA v5002.4-definitiva

DOCUMENTO MAESTRO DE INVENTARIO, CONTEXTO, APIs, CONSTANTES Y COLECCIONES (SSOT)

Este ecosistema se rige bajo los principios de Hardening 2026, asegurando la
consistencia e inmutabilidad de los flujos transaccionales, laborales, de
inventario y fiscales.

El presente documento constituye la Fuente Única de Verdad (SSOT). Todos los
nombres técnicos en inglés se preservan estrictamente para la integración nativa
con Wix V2 APIs, y todas las identidades visibles en español han sido traducidas
conservando exactamente el orden original de los términos, sin introducir
preposiciones, artículos, tildes, espacios ni caracteres especiales.

- Bloque 1: Contexto de Negocio, Wix App IDs, APIs y SDKs Críticos, la Tabla
    Maestra de 32 Colecciones, internalConfig.js y mmUtils.js. (Este bloque)
- Bloque 2: Esquema Técnico Definitivo de Campos (Colecciones 1 a 16).
- Bloque 3: Esquema Técnico Definitivo de Campos (Colecciones 17 a 32).
- Bloque 4: Matriz de Vínculos de Datos, Guía de Despliegue en Wix CMS y
    Reglas de Hooks en data.js.

📌 BLOQUE 1: CONTEXTO, APP IDs, APIs, TABLA MAESTRA Y MÓDULOS SSOT

1. CONTEXTO Y MODELO DE NEGOCIO

| Aspecto                 | Detalle                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Nombre comercial**    | Marian Madrid Peluquería y Estética                                                    |
| **Localización física**   | C/ Maurice Ravel 35, Local, 50012 Zaragoza                                             |
| **Location ID (Wix)**  | `7a12abfd-bf30-4847-bcdf-00dc573d4802`                                                 |
| **Huso horario**       | `Europe/Madrid` · **Moneda:** `EUR` · **País:** `ES` · **Idioma:** `es`                |
| **Personal activo**    | PROPIETARIA/GERENTE/ADMINISTRACIÓN/JEFA DE ESTILISTAS; MARIAN MADRID; PERSONAL CONTRATADO ESTILISTAS:ANDREA STAFF, ALBA STAFF                                                |
| **Canales operativos** | Reservas online (Wix Bookings v2 custom), TPV salón (propietario), Pasarela Pagos: WIX PAYMENTS V2; Tienda online (Wix Stores - migración a versión más actual) |
| **Marco normativo**     | SIF / Veri\*factu (RD 1007/2023, Orden HAC/1177/2024), Registro Horario (Art. 34.9 ET) |

---

2. WIX APPS INSTALADAS Y APP IDs NATIVOS

| App                          | App ID                                 | Estado    | Misión Crítica                                                   |
| ---------------------------- | -------------------------------------- | --------- | ---------------------------------------------------------------- |
| **Wix Bookings**             | `13d21c63-b5ec-5912-8397-c3a5ddb27a97` | Instalada | Gestión nativa de recursos, servicios, disponibilidad y reservas |
| **Wix Stores**               | `1380b703-ce81-ff05-f115-39571d94eab3` | Instalada | Catálogo de venta de productos físicos y control de stock        | (actualizar actual catalogo v1)
| **Wix Events**               | `140603ad-af8d-84fb-9004-ee174e35054d` | Instalada | Eventos auxiliares fuera del flujo transaccional principal       |
| **Wix Forms & Payments**     | `14ce1214-b278-a7e4-1373-00cebd1bef7c` | Instalada | Pasarela de cobros online y origen de webhook de eCommerce       |
| **Wix Invoices**             | `13ee94c1-b635-8505-3391-97919052c16f` | Instalada | No se escribe de manera directa; gestionado por el ledger fiscal |
| **Wix Members Area**         | `14cc59bc-f0b7-15b8-e1c7-89ce41d0e0c9` | Instalada | Autenticación, roles del personal y acceso de miembros           |
| **Wix Gift Cards**           | `d80111c5-a0f4-47a8-b63a-65b54d774a27` | Instalada | Gestión de tarjetas regalo sin impacto en el motor de caja       |

3. APIs Y SDKs UTILIZADOS EN BACKEND (WIX V2)

Para asegurar la robustez de la arquitectura, todas las llamadas a servicios y
pasarelas emplean los SDKs de Wix V2 con elevación de privilegios controlada
(wix-auth):

- wix-bookings.v2 (bookings / services / availabilityCalendar /
    availabilityTimeSlots): Gestión transaccional de reservas y consulta de
    slots en tiempo real.
- wix-ecom-backend (checkout / orders): Creación y monitorización de procesos
    de pago de eCommerce.
- wix-auth (elevate): Mecanismo de elevación segura ante ejecuciones
    asíncronas de cron jobs o webhooks.
- wix-data (wixData): Acceso estructurado a las colecciones del CMS.
- wix-secrets-backend (getSecret): Acceso a variables de entorno críticas y
    claves criptográficas.
- wix-crypto (createHash / createHmac / timingSafeEqual): Motor de seguridad
    para encadenamiento Veri*factu e integridad de firma.

🗂️ 4. TABLA MAESTRA DE COLECCIONES CANÓNICAS

Esta tabla constituye el mapa del ecosistema CMS. El identificador nativo en
inglés se consume directamente por las APIs en el backend, y el alias en
COLLECTIONS es el que se expone en internalConfig.js:

| \# | Misión | ID Visible (Nombre CMS)         | ID Nativa (collectionId)     | Alias en `COLLECTIONS`          | Campo de Exposición (Display) |
| -- | ------ | ------------------------------- | ---------------------------- | ------------------------------- | ----------------------------- |
| 1  | M1     | `SERVICIOS_CATALOGO`            | `ServiciosCatalogo`          | `SERVICIOS_CATALOGO`            | `title`                       |
| 2  | M1 (LEGACY) | `COMPLEMENTOS_CATALOGO`         | `ComplementosCatalogo`       | `COMPLEMENTOS_CATALOGO`         | `title`                       |
| 3  | M1     | `MAPA_STAFF`                    | `MapaStaff`                  | `MAPA_STAFF`                    | `displayName`                 |
| 4  | M1     | `CITAS_F2`                      | `CitasF2`                    | `CITAS_F2`                      | `bookingId`                   |
| 5  | M2     | `AVAILABILITY_DAYS_CACHE`       | `AvailabilityDaysCache`      | `AVAILABILITY_DAYS_CACHE`       | `_id`                         |
| 6  | M2     | `DUAL_SLOT_CACHE`               | `DualSlotCache`              | `DUAL_SLOT_CACHE`               | `pairToken`                   |
| 7  | M3     | `BOOKING_TRANSACTIONS`          | `BookingTransactions`        | `BOOKING_TRANSACTIONS`          | `pairToken`                   |
| 8  | M3     | `BOOKINGS_SERVICE_SYNC_QUEUE`   | `BookingsServiceSyncQueue`   | `BOOKINGS_SERVICE_SYNC_QUEUE`   | `_id`                         |
| 9  | M3     | `COMPENSACIONES_PENDIENTES`     | `CompensacionesPendientes`   | `COMPENSACIONES_PENDIENTES`     | `bookingId`                   |
| 10 | M3     | `M365_GRAPH_SYNC_QUEUE`         | `M365GraphSyncQueue`         | `M365_GRAPH_SYNC_QUEUE`         | `externalRecordId`            |
| 11 | M4     | `INVENTARIO_STOCK_VENTA`        | `InventarioStockVenta`       | `INVENTARIO_STOCK_VENTA`        | `productName`                 |
| 12 | M4     | `MOVIMIENTOS_INVENTARIO`        | `MovimientosInventario`      | `MOVIMIENTOS_INVENTARIO`        | `movementToken`               |
| 13 | M4     | `INVENTARIO_STOCK_VENTA_CIERRE` | `InventarioStockVentaCierre` | `INVENTARIO_STOCK_VENTA_CIERRE` | `inventoryClosingId`          |
| 14 | M4     | `PROVEEDORES_LISTA`             | `ProveedoresLista`           | `PROVEEDORES_LISTA`             | `supplierName`                |
| 15 | M5     | `CAJA_ACTUAL`                   | `CajaActual`                 | `CAJA_ACTUAL`                   | `operationDate`               |
| 16 | M5     | `MOVIMIENTOS_CAJA`              | `MovimientosCaja`            | `MOVIMIENTOS_CAJA`              | `invoiceNumber`               |
| 17 | M5     | `CONTROL_PARCIAL_X`             | `ControlParcialX`            | `CONTROL_PARCIAL_X`             | `operationDate`               |
| 18 | M5     | `HISTORICO_CIERRES_Z`           | `HistoricoCierresZ`          | `HISTORICO_CIERRES_Z`           | `operationDate`               |
| 19 | M5     | `SECUENCIA_TICKETS`             | `SecuenciaTickets`           | `SECUENCIA_TICKETS`             | `_id`                         |
| 20 | M6     | `CONFIGURACION_FISCAL`          | `ConfiguracionFiscal`        | `CONFIGURACION_FISCAL`          | `businessName`                |
| 21 | M6     | `LIBRO_IVA_FACTURAS_EXPEDIDAS`  | `LibroIVAFacturasExpedidas`  | `LIBRO_IVA_FACTURAS_EXPEDIDAS`  | `invoiceNumber`               |
| 22 | M6     | `LIBRO_IVA_FACTURAS_RECIBIDAS`  | `LibroIVAFacturasRecibidas`  | `LIBRO_IVA_FACTURAS_RECIBIDAS`  | `receptionNumber`             |
| 23 | M6     | `PLAN_CUENTAS_CONTABLES`        | `PlanCuentasContables`       | `PLAN_CUENTAS_CONTABLES`        | `accountName`                 |
| 24 | M6     | `ASIENTOS_CONTABLES`            | `AsientosContables`          | `ASIENTOS_CONTABLES`            | `entryNumber`                 |
| 25 | M6     | `LINEAS_ASIENTO_CONTABLE`       | `LineasAsientoContable`      | `LINEAS_ASIENTO_CONTABLE`       | `entryLineId`                 |
| 26 | M6     | `LIBRO_MAYOR_CONTABLE_SALDOS`   | `LibroMayorContableSaldos`   | `LIBRO_MAYOR_CONTABLE_SALDOS`   | `accountCode`                 |
| 27 | M7     | `EVENTOS_SISTEMA_FACTURACION`   | `EventosSistemaFacturacion`  | `EVENTOS_SISTEMA_FACTURACION`   | `systemEventId`               |
| 28 | M7     | `MM_AUDIT_LOG`                  | `MmAuditLog`                 | `MM_AUDIT_LOG`                  | `eventType`                   |
| 29 | M7     | `REGISTROS_HORARIOS_STAFF`      | `RegistrosHorariosStaff`     | `REGISTROS_HORARIOS_STAFF`      | `recordedAt`                  |
| 30 | Infra  | `SLOT_LOCKS`                    | `SlotLocks`                  | `SLOT_LOCKS`                    | `lockKey`                     |
| 31 | Infra  | `RATE_LIMIT_BLOCKS`             | `RateLimitBlocks`            | `RATE_LIMIT_BLOCKS`             | `_id`                         |
| 32 | Infra  | `ALERTAS_OPERATIVAS`            | `AlertasOperativas`          | `ALERTAS_OPERATIVAS`            | `_id`                         |

📌 BLOQUE 2: ESQUEMA TÉCNICO DE COLECCIONES (1 a 16)

A continuación, presento el esquema técnico de los campos para las primeras 16
colecciones del ecosistema.

2. SERVICIOS_CATALOGO (ServiciosCatalogo)

| ID Visible            | ID Técnica         | Tipo              |
| --------------------- | ------------------ | ----------------- |
| `idElemento`          | `_id`              | `TEXT`            |
| `tituloServicio`      | `title`            | `TEXT`            |
| `slugUrl`             | `slugUrl`          | `TEXT`            |
| `categoriaNombre`     | `categoryName`     | `REFERENCE`       |
| `categoriaId`         | `categoryId`       | `TEXT`            |
| `servicioId`          | `serviceId`        | `TEXT`            |
| `permitirCombinar`    | `allowCombine`     | `BOOLEAN`         |
| `fasesEnlazadas`      | `linkedPhases`     | `TEXT`            |
| `etiqueta`           | `tagLine`          | `TEXT`            |
| `descripcion`         | `description`      | `RICH_TEXT`       |
| `tarificacionModelo`  | `pricingModel`     | `CHOICES`         |
| `precio`              | `price`            | `NUMBER`          |
| `moneda`              | `currency`         | `CHOICES`         |
| `depositoCantidad`    | `depositAmount`    | `NUMBER`          |
| `depositoTipo`        | `depositType`      | `CHOICES`         |
| `principalMultimedia` | `mainMedia`        | `IMAGE`           |
| `servicioTipo`        | `serviceType`      | `CHOICES`         |
| `fase1Duracion`       | `phase1Duration`   | `NUMBER`          |
| `exposicionDuracion`  | `exposureDuration` | `NUMBER`          |
| `fase2Duracion`       | `phase2Duration`   | `NUMBER`          |
| `buffer`              | `buffer`           | `NUMBER`          |
| `localizacion`        | `location`         | `REFERENCE`       |
| `impuestoIncluido`    | `taxIncluded`      | `BOOLEAN`         |
| `impuestoTasa`        | `taxRate`          | `NUMBER`          |
| `onlinePago`          | `onlinePayment`    | `BOOLEAN`         |
| `presencialPago`      | `inPersonPayment`  | `BOOLEAN`         |
| `articuloSku`         | `sku`              | `TEXT`            |
| `servicioOculto`      | `hidden`           | `BOOLEAN`         |
| `estado`              | `status`           | `CHOICES`         |
| `disponiblePersonal`  | `availableStaff`   | `OBJECT`          |
| `complementosOpciones`| `addOnOptions`     | `MULTI_REFERENCE` |
| `addonTitulos`        | `addOnTitles`      | `MULTI_REFERENCE` |
| `internasNotas`       | `internalNotes`    | `TEXT`            |

3. COMPLEMENTOS_CATALOGO (ComplementosCatalogo)

| ID Visible                         | ID Técnica             | Tipo        |
| ----------------------             | ---------------------- | ----------- |
| `_id`                   | `_id`                  | `TEXT`      |
| `complementoId`         | `addOnId`              | `TEXT`      |
| `bookingsAddonId`       | `bookingsAddonId`      | `TEXT`      |
| `bookingsGroupAddonId`  | `bookingsGroupAddonId` | `TEXT`      |
| `tituloComplemento`     | `title`                | `TEXT`      |
| `etiquetaComplemento`   | `tagLine`              | `TEXT`      |
| `descripcionComplemento`| `description`          | `RICH_TEXT` |
| `precioComplemento`     | `price`                | `NUMBER`    |
| `duracionComplemento`   | `durationInMinutes`    | `NUMBER`    |
| `principalMultimediaComplemento`  | `mainMedia`            | `IMAGE`     |
| `grupoInterno`         | `internalGroup`        | `TEXT`      |
| `categoriaComplemento` | `categoriaAddon`       | `CHOICES`   |
| `onlineDisponible`     | `availableOnline`      | `BOOLEAN`   |
| `cantidadMaxima`       | `maxQuantity`          | `NUMBER`    |
| `activo`               | `active`               | `BOOLEAN`   |

4. MAPA_STAFF (MapaStaff)

| ID Visible          | ID Técnica      | Tipo      |
| ------------------- | --------------- | --------- |
| `idElemento`        | `_id`           | `TEXT`    |
| `nombreStaff`       | `displayName`   | `TEXT`    |
| `recursoId`         | `resourceId`    | `TEXT`    |
| `correo`            | `email`         | `TEXT`    |
| `staffMiembroId`    | `staffMemberId` | `TEXT`    |
| `horarioId`         | `scheduleId`    | `TEXT`    |
| `localizacionId`    | `locationId`    | `TEXT`    |
| `rol`               | `rol`           | `CHOICES` |
| `telefono`          | `phone`         | `TEXT`    |
| `activo`            | `active`        | `BOOLEAN` |
| `notas`             | `notes`         | `TEXT`    |

5. CITAS_F2 (CitasF2)

| ID Visible         | ID Técnica       | Tipo       |
| ------------------ | ---------------- | ---------- |
| `idElemento`       | `_id`            | `TEXT`     |
| `reservaId`        | `bookingId`      | `TEXT`     |
| `parToken`         | `pairToken`      | `TEXT`     |
| `uiParToken`       | `uiPairToken`    | `TEXT`     |
| `revision`         | `revision`       | `NUMBER`   |
| `servicioId`       | `serviceId`      | `TEXT`     |
| `horarioId`        | `scheduleId`     | `TEXT`     |
| `recursoId`        | `resourceId`     | `TEXT`     |
| `inicioFecha`      | `startDate`      | `DATETIME` |
| `finFecha`         | `endDate`        | `DATETIME` |
| `inicioFechaLocal` | `startDateLocal` | `TEXT`     |
| `finFechaLocal`    | `endDateLocal`   | `TEXT`     |
| `fechaYmd`         | `dateYmd`        | `TEXT`     |
| `reservaTipo`      | `bookingType`    | `CHOICES`  |
| `estado`           | `status`         | `CHOICES`  |
| `pagoEstado`       | `paymentStatus`  | `CHOICES`  |
| `metadatos`        | `meta`           | `OBJECT`   |
| `contactoDetalles` | `contactDetails` | `OBJECT`   |
| `trazaId`          | `traceId`        | `TEXT`     |

6. BOOKING_TRANSACTIONS (BookingTransactions)

| ID Visible       | ID Técnica    | Tipo      |
| ---------------- | ------------- | --------- |
| `idTransaccion`  | `_id`         | `TEXT`    |
| `parToken`       | `pairToken`   | `TEXT`    |
| `estado`         | `status`      | `CHOICES` |
| `cargaHash`      | `payloadHash` | `TEXT`    |
| `resultado`      | `result`      | `OBJECT`  |
| `error`          | `error`       | `TEXT`    |
| `trazaId`        | `traceId`     | `TEXT`    |

7. COMPENSACIONES_PENDIENTES (CompensacionesPendientes)

| ID Visible        | ID Técnica      | Tipo      |
| ----------------- | --------------- | --------- |
| `idCompensacion`  | `_id`           | `TEXT`    |
| `clase`           | `kind`          | `CHOICES` |
| `reservaId`       | `bookingId`     | `TEXT`    |
| `fase`            | `phase`         | `TEXT`    |
| `estado`          | `status`        | `CHOICES` |
| `intentos`        | `attempts`      | `NUMBER`  |
| `cantidad`        | `amount`        | `NUMBER`  |
| `pagoMetodo`      | `paymentMethod` | `CHOICES` |
| `transaccionId`   | `transactionId` | `TEXT`    |
| `pedidoId`        | `orderId`       | `TEXT`    |
| `devolucionId`    | `refundId`      | `TEXT`    |
| `concepto`        | `concept`       | `TEXT`    |
| `movimientoTipo`  | `movementType`  | `TEXT`    |
| `alertaRequerida` | `alertRequired` | `BOOLEAN` |
| `ultimoError`     | `lastError`     | `TEXT`    |
| `trazaId`         | `traceId`       | `TEXT`    |

8. BOOKINGS_SERVICE_SYNC_QUEUE (BookingsServiceSyncQueue)

| ID Visible            | ID Técnica       | Tipo       |
| --------------------- | ---------------- | ---------- |
| `idCola`              | `_id`            | `TEXT`     |
| `servicioId`          | `serviceId`      | `TEXT`     |
| `cargaDeseada`        | `desiredPayload` | `OBJECT`   |
| `cargaHash`           | `payloadHash`    | `TEXT`     |
| `estado`              | `status`         | `CHOICES`  |
| `intentos`            | `attempts`       | `NUMBER`   |
| `proximoIntentoFecha` | `nextAttemptAt`  | `DATETIME` |
| `completadoFecha`     | `completedAt`    | `DATETIME` |
| `fallidoFecha`        | `failedAt`       | `DATETIME` |
| `errorCodigo`         | `errorCode`      | `TEXT`     |

9. DUAL_SLOT_CACHE (DualSlotCache)

| ID Visible            | ID Técnica             | Tipo           |
| --------------------- | ---------------------- | -------------- |
| `idParToken`          | `_id`                  | `TEXT`         |
| `parToken`            | `pairToken`            | `TEXT`         |
| `servicioId`          | `serviceId`            | `TEXT`         |
| `servicioFase1Id`     | `phase1ServiceId`      | `TEXT`         |
| `servicioFase2Id`     | `phase2ServiceId`      | `TEXT`         |
| `franjaF1`            | `slotF1`               | `OBJECT`       |
| `franjaF2`            | `slotF2`               | `OBJECT`       |
| `recursoId`           | `resourceId`           | `TEXT`         |
| `candidatoRecursoIds` | `candidateResourceIds` | `ARRAY_STRING` |
| `fechaYmd`            | `dateYmd`              | `TEXT`         |
| `expiraFecha`         | `expiresAt`            | `DATETIME`     |
| `estado`              | `status`               | `CHOICES`      |

10. SLOT_LOCKS (SlotLocks) — LEGADO: ver SLOT_LOCKS en infraestructura (Bloque 3, esquema #30)

| ID Visible             | ID Técnica  | Tipo       |
| ---------------------- | ----------- | ---------- |
| `idCerrojo`            | `_id`       | `TEXT`     |
| `cerrojoClave`         | `lockKey`   | `TEXT`     |
| `cerrojoPropietarioId` | `traceId`   | `TEXT`     |
| `expiraFecha`          | `expiresAt` | `DATETIME` |

11. INVENTARIO_STOCK_VENTA (InventarioStockVenta)

| ID Visible                        | ID Técnica                | Tipo       |
| --------------------------------- | ------------------------- | ---------- |
| `idElemento`                      | `_id`                     | `TEXT`     |
| `articuloSku`                     | `sku`                     | `TEXT`     |
| `productoNombre`                  | `productName`             | `TEXT`     |
| `descripcion`                     | `description`             | `TEXT`     |
| `categoria`                       | `category`                | `TEXT`     |
| `ventaPrecioImpuestoIncluido`     | `salePriceTaxIncluded`    | `NUMBER`   |
| `costoSinImpuesto`                | `costExTax`               | `NUMBER`   |
| `proveedor`                       | `supplier`                | `TEXT`     |
| `stockEsperado`                   | `stockExpected`           | `NUMBER`   |
| `bajoStockAlerta`                 | `lowStockAlert`           | `NUMBER`   |
| `reordenPunto`                    | `reorderPoint`            | `NUMBER`   |
| `localizacion`                    | `location`                | `TEXT`     |
| `wixProductoId`                   | `wixProductId`            | `TEXT`     |
| `wixVarianteId`                   | `wixVariantId`            | `TEXT`     |
| `necesitaWixConciliacion`         | `needsWixReconciliation`  | `BOOLEAN`  |
| `activo`                          | `active`                  | `BOOLEAN`  |
| `ultimoInventarioMovimientoFecha` | `lastInventoryMovementAt` | `DATETIME` |
| `ultimoInventarioMovimientoId`    | `lastInventoryMovementId` | `TEXT`     |

12. MOVIMIENTOS_INVENTARIO (MovimientosInventario)

| ID Visible                  | ID Técnica                  | Tipo      |
| --------------------------- | --------------------------- | --------- |
| `idMovimiento`              | `_id`                       | `TEXT`    |
| `movimientoToken`           | `movementToken`             | `TEXT`    |
| `articuloSku`               | `sku`                       | `TEXT`    |
| `productoNombre`            | `productName`               | `TEXT`    |
| `cantidad`                  | `quantity`                  | `NUMBER`  |
| `cantidadDelta`             | `quantityDelta`             | `NUMBER`  |
| `stockPrevio`               | `stockBefore`               | `NUMBER`  |
| `stockPosterior`            | `stockAfter`                | `NUMBER`  |
| `movimientoTipo`            | `movementType`              | `CHOICES` |
| `motivo`                    | `reason`                    | `TEXT`    |
| `referenciaId`              | `referenceId`               | `TEXT`    |
| `pedidoId`                  | `orderId`                   | `TEXT`    |
| `devolucionId`              | `refundId`                  | `TEXT`    |
| `actorCorreo`               | `actorEmail`                | `TEXT`    |
| `actorMiembroId`            | `actorMemberId`             | `TEXT`    |
| `requiereWixConciliacion`   | `requiresWixReconciliation` | `BOOLEAN` |
| `nativoComercialMovimiento` | `nativeCommercialMovement`  | `BOOLEAN` |
| `wixProductoId`             | `wixProductId`              | `TEXT`    |
| `wixVarianteId`             | `wixVariantId`              | `TEXT`    |
| `trazaId`                   | `traceId`                   | `TEXT`    |

13. INVENTARIO_STOCK_VENTA_CIERRE (InventarioStockVentaCierre)

| ID Visible            | ID Técnica           | Tipo       |
| --------------------- | -------------------- | ---------- |
| `inventarioCierreId`  | `inventoryClosingId` | `TEXT`     |
| `fiscalEjercicio`     | `fiscalYear`         | `NUMBER`   |
| `cierreFecha`         | `closingDate`        | `DATETIME` |
| `cierreTipo`          | `closingType`        | `TEXT`     |
| `articuloSku`         | `sku`                | `TEXT`     |
| `productoId`          | `productId`          | `TEXT`     |
| `productoDescripcion` | `productDescription` | `TEXT`     |
| `existenciasCantidad` | `stockQuantity`      | `NUMBER`   |
| `unitarioCosto`       | `unitCost`           | `NUMBER`   |
| `existenciasValor`    | `stockValue`         | `NUMBER`   |
| `cuentaCodigo`        | `accountCode`        | `TEXT`     |
| `debeSaldo`           | `debitBalance`       | `NUMBER`   |
| `haberSaldo`          | `creditBalance`      | `NUMBER`   |
| `cierreHash`          | `closingHash`        | `TEXT`     |
| `cierreFirma`         | `closingSignature`   | `TEXT`     |
| `trazaId`             | `traceId`            | `TEXT`     |

14. PROVEEDORES_LISTA (ProveedoresLista)

| ID Visible                     | ID Técnica                   | Tipo      |
| ------------------------------ | ---------------------------- | --------- |
| `idElemento`                   | `_id`                        | `TEXT`    |
| `proveedorNombre`              | `supplierName`               | `TEXT`    |
| `comercialesTerminosOrigen`    | `commercialTermsSource`      | `TEXT`    |
| `minimoPedidoSinImpuesto`      | `minimumOrderExTax`          | `NUMBER`  |
| `gratisEnvioUmbralSinImpuesto` | `freeShippingThresholdExTax` | `NUMBER`  |
| `plazoEntregaTiempo`           | `leadTime`                   | `TEXT`    |
| `ventajas`                     | `advantages`                 | `TEXT`    |
| `notas`                        | `notes`                      | `TEXT`    |
| `activo`                       | `active`                     | `BOOLEAN` |

15. CAJA_ACTUAL (CajaActual)

| ID Visible             | ID Técnica           | Tipo       |
| ---------------------- | -------------------- | ---------- |
| `idElemento`           | `_id`                | `TEXT`     |
| `operacionFecha`       | `operationDate`      | `TEXT`     |
| `cajaRegistroEstado`   | `cashRegisterStatus` | `CHOICES`  |
| `totalSaldo`           | `totalBalance`       | `NUMBER`   |
| `efectivoSaldo`        | `cashBalance`        | `NUMBER`   |
| `tarjetaSaldo`         | `cardBalance`        | `NUMBER`   |
| `bizumSaldo`           | `bizumBalance`       | `NUMBER`   |
| `onlineSaldo`          | `onlineBalance`      | `NUMBER`   |
| `totalOperaciones`     | `totalOperations`    | `NUMBER`   |
| `aperturaFecha`        | `openedAt`           | `DATETIME` |
| `cierreFecha`          | `closedAt`           | `DATETIME` |
| `ultimaActividadFecha` | `lastActivityAt`     | `DATETIME` |

16. MOVIMIENTOS_CAJA (MovimientosCaja)

| ID Visible                     | ID Técnica                  | Tipo       |
| ------------------------------ | --------------------------- | ---------- |
| `idRegistro`                   | `_id`                       | `TEXT`     |
| `secuenciaNumero`              | `sequenceNumber`            | `NUMBER`   |
| `facturaNumero`                | `invoiceNumber`             | `TEXT`     |
| `operacionFecha`               | `operationDate`             | `TEXT`     |
| `fiscalPeriodo`                | `fiscalPeriod`              | `TEXT`     |
| `movimientoTipo`               | `movementType`              | `CHOICES`  |
| `operacionNaturaleza`          | `operationNature`           | `CHOICES`  |
| `pagoMetodo`                   | `paymentMethod`             | `CHOICES`  |
| `totalCantidad`                | `totalAmount`               | `NUMBER`   |
| `gravableCantidad`             | `taxableAmount`             | `NUMBER`   |
| `impuestoCantidad`             | `taxAmount`                 | `NUMBER`   |
| `impuestoTasa`                 | `taxRate`                   | `NUMBER`   |
| `impuestoTratamiento`          | `taxTreatment`              | `CHOICES`  |
| `contableSigno`                | `accountingSign`            | `NUMBER`   |
| `contableCantidad`             | `accountingAmount`          | `NUMBER`   |
| `descripcion`                  | `description`               | `TEXT`     |
| `lineaArticulos`               | `lineItems`                 | `ARRAY`    |
| `rectificadaFacturaReferencia` | `rectifiedInvoiceReference` | `TEXT`     |
| `previoRegistroHash`           | `previousRecordHash`        | `TEXT`     |
| `actualRegistroHash`           | `currentRecordHash`         | `TEXT`     |
| `digitalFirma`                 | `digitalSignature`          | `TEXT`     |
| `negocioTributariaId`          | `businessTaxId`             | `TEXT`     |
| `esquemaIntegridadVersion`     | `schemaIntegrityVersion`    | `TEXT`     |
| `registroOrigen`               | `recordSource`              | `TEXT`     |
| `reservaIdVinculada`           | `reservaIdVinculada`        | `TEXT`     |
| `transaccionId`                | `transactionId`             | `TEXT`     |
| `recursoId`                    | `resourceId`                | `TEXT`     |
| `registradoFecha`              | `registeredAt`              | `DATETIME` |
| `trazaId`                      | `traceId`                   | `TEXT`     |

Recibido. Correcciones aplicadas al SSOT:

1. location -> localizacion
2. locationId -> localizacionId

Continuamos con el bloque solicitado.

📌 BLOQUE 3: ESQUEMA TÉCNICO DE COLECCIONES (17 a 32)

Este bloque cubre la infraestructura fiscal, contable, de auditoría y operativa
del sistema.

17. CONTROL_PARCIAL_X (ControlParcialX)

| ID Visible         | ID Técnica             | Tipo       |
| ------------------ | ---------------------- | ---------- |
| `idElemento`       | `_id`                  | `TEXT`     |
| `operacionFecha`   | `operationDate`        | `TEXT`     |
| `contadoEfectivo`  | `countedCash`          | `NUMBER`   |
| `esperadoEfectivo` | `expectedCash`         | `NUMBER`   |
| `descuadreCantidad`   | `discrepancyAmount`    | `NUMBER`   |
| `cuadreEstado`     | `reconciliationStatus` | `CHOICES`  |
| `contadoFecha`     | `countedAt`            | `DATETIME` |
| `arqueadoFecha`    | `reconciledAt`         | `DATETIME` |
| `trazaId`   | `traceId`              | `TEXT`     |

18. HISTORICO_CIERRES_Z (HistoricoCierresZ)

| ID Visible                   | ID Técnica                | Tipo       |
| ---------------------------- | ------------------------- | ---------- |
| `idCierreZ`                  | `_id`                     | `TEXT`     |
| `operacionFecha`             | `operationDate`           | `TEXT`     |
| `cierreEstado`               | `closingStatus`           | `CHOICES`  |
| `consolidadoTotalCantidad`      | `consolidatedTotalAmount` | `NUMBER`   |
| `brutasVentasTotal`          | `grossSalesTotal`         | `NUMBER`   |
| `netaGravableCantidad`          | `netTaxableAmount`        | `NUMBER`   |
| `netaImpuestoCantidad`          | `netTaxAmount`            | `NUMBER`   |
| `totalEfectivo`              | `totalCash`               | `NUMBER`   |
| `totalTarjeta`               | `totalCard`               | `NUMBER`   |
| `totalBizum`                 | `totalBizum`              | `NUMBER`   |
| `totalOnline`                | `totalOnline`             | `NUMBER`   |
| `totalDevoluciones`          | `totalRefunds`            | `NUMBER`   |
| `totalPropinas`              | `totalTips`               | `NUMBER`   |
| `totalAjustes`               | `totalAdjustments`        | `NUMBER`   |
| `totalOperaciones`           | `totalOperations`         | `NUMBER`   |
| `inicioSecuencia`            | `startSequence`           | `NUMBER`   |
| `finSecuencia`               | `endSequence`             | `NUMBER`   |
| `inicioTicketNumero`         | `startTicketNumber`       | `TEXT`     |
| `finTicketNumero`            | `endTicketNumber`         | `TEXT`     |
| `inicioRegistroHash`         | `startRecordHash`         | `TEXT`     |
| `finRegistroHash`            | `endRecordHash`           | `TEXT`     |
| `movimientoTipoDesglose`     | `movementTypeBreakdown`   | `OBJECT`   |
| `impuestoTipoDesglose`       | `taxTypeBreakdown`        | `OBJECT`   |
| `esIntegridadVerificada`     | `isIntegrityVerified`     | `BOOLEAN`  |
| `auditadosRegistrosCantidad` | `auditedRecordsCount`     | `NUMBER`   |
| `cierreHash`                 | `closingHash`             | `TEXT`     |
| `cierreFirma`                | `closingSignature`        | `TEXT`     |
| `cierreOrigen`               | `closingSource`           | `CHOICES`  |
| `cierreEsquemaVersion`       | `closingSchemaVersion`    | `TEXT`     |
| `horariaZona`                | `timeZone`                | `TEXT`     |
| `cerradoFecha`               | `closedAt`                | `DATETIME` |
| `verificadoFecha`            | `verifiedAt`              | `DATETIME` |
| `trazaId`             | `traceId`                 | `TEXT`     |

19. SECUENCIA_TICKETS (SecuenciaTickets)

| ID Visible            | ID Técnica         | Tipo     |
| --------------------- | ------------------ | -------- |
| `idElemento`          | `_id`              | `TEXT`   |
| `secuenciaContadores` | `sequenceCounters` | `OBJECT` |

20. CONFIGURACION_FISCAL (ConfiguracionFiscal)

| ID Visible                   | ID Técnica             | Tipo      |
| ---------------------------- | ---------------------- | --------- |
| `idElemento`                 | `_id`                  | `TEXT`    |
| `tributariaId`               | `taxId`                | `TEXT`    |
| `negocioNombre`              | `businessName`         | `TEXT`    |
| `calleDireccion`             | `streetAddress`        | `TEXT`    |
| `postalCodigo`               | `postalCode`           | `TEXT`    |
| `ciudad`                     | `city`                 | `TEXT`    |
| `subdivisionProvincia`       | `subdivision`          | `TEXT`    |
| `pais`                       | `country`              | `TEXT`    |
| `moneda`                     | `currency`             | `TEXT`    |
| `horariaZona`                | `timeZone`             | `TEXT`    |
| `tributarioRegimen`          | `taxRegime`            | `CHOICES` |
| `esSiiSujeto`                | `isSiiSubject`         | `BOOLEAN` |
| `predeterminadaFacturaSerie` | `defaultInvoiceSeries` | `TEXT`    |
| `configuracionVersion`       | `configVersion`        | `TEXT`    |
| `activo`                     | `active`               | `BOOLEAN` |

21. LIBRO_IVA_FACTURAS_EXPEDIDAS (LibroIvaFacturasExpedidas)

| ID Visible                       | ID Técnica                   | Tipo       |
| -------------------------------- | ---------------------------- | ---------- |
| `idElemento`                     | `_id`                        | `TEXT`     |
| `tributarioRegistroId`           | `taxRecordId`                | `TEXT`     |
| `diarioAsientoId`                | `journalEntryId`             | `TEXT`     |
| `facturaNumero`                  | `invoiceNumber`              | `TEXT`     |
| `facturaSerie`                   | `invoiceSeries`              | `TEXT`     |
| `finalFacturaNumero`             | `finalInvoiceNumber`         | `TEXT`     |
| `expedicionFecha`                | `issueDate`                  | `DATETIME` |
| `operacionFecha`                 | `operationDate`              | `DATETIME` |
| `fiscalEjercicio`                | `fiscalYear`                 | `NUMBER`   |
| `fiscalPeriodo`                  | `fiscalPeriod`               | `TEXT`     |
| `facturaTipo`                    | `invoiceType`                | `TEXT`     |
| `totalFacturaCantidad`              | `totalInvoiceAmount`         | `NUMBER`   |
| `gravableCantidad`                  | `taxableAmount`              | `NUMBER`   |
| `impuestoTasa`                   | `taxRate`                    | `NUMBER`   |
| `repercutidoImpuestoCantidad`       | `outputTaxAmount`            | `NUMBER`   |
| `equivalenciaRecargoTasa`        | `equivalenceSurchargeRate`   | `NUMBER`   |
| `equivalenciaRecargoCantidad`       | `equivalenceSurchargeAmount` | `NUMBER`   |
| `ingresoConcepto`                | `incomeConcept`              | `TEXT`     |
| `computableIngresoCantidad`         | `computableIncomeAmount`     | `NUMBER`   |
| `destinatarioTributariaId`       | `recipientTaxId`             | `TEXT`     |
| `destinatarioNombre`             | `recipientName`              | `TEXT`     |
| `destinatarioIdentificacionTipo` | `recipientIdType`            | `TEXT`     |
| `destinatarioPaisCodigo`         | `recipientCountryCode`       | `TEXT`     |
| `operacionClave`                 | `operationKey`               | `TEXT`     |
| `operacionCalificacion`          | `operationQualification`     | `TEXT`     |
| `exentaOperacion`                | `exemptOperation`            | `TEXT`     |
| `actividadCodigo`                | `activityCode`               | `TEXT`     |
| `actividadTipo`                  | `activityType`               | `TEXT`     |
| `iaeEpigrafe`                    | `iaeHeading`                 | `TEXT`     |
| `pagoFecha`                      | `paymentDate`                | `DATETIME` |
| `cobradoCantidad`                   | `collectedAmount`            | `NUMBER`   |
| `cobroMedio`                     | `collectionMethod`           | `TEXT`     |
| `cobroMedioIdentificacion`       | `collectionMethodIdentifier` | `TEXT`     |
| `retencionTasa`                  | `withholdingTaxRate`         | `NUMBER`   |
| `retencionCantidad`                 | `withholdingTaxAmount`       | `NUMBER`   |
| `externaReferencia`              | `externalReference`          | `TEXT`     |
| `rectificadaFacturaId`           | `rectifiedInvoiceId`         | `TEXT`     |
| `trazaId`                 | `traceId`                    | `TEXT`     |
| `registradoFecha`                | `registeredAt`               | `DATETIME` |

22. LIBRO_IVA_FACTURAS_RECIBIDAS (LibroIvaFacturasRecibidas)

| ID Visible                    | ID Técnica                    | Tipo       |
| ----------------------------- | ----------------------------- | ---------- |
| `idElemento`                  | `_id`                         | `TEXT`     |
| `tributarioRegistroId`        | `taxRecordId`                 | `TEXT`     |
| `diarioAsientoId`             | `journalEntryId`              | `TEXT`     |
| `recepcionNumero`             | `receptionNumber`             | `TEXT`     |
| `proveedorFacturaSerieNumero` | `supplierInvoiceSeriesNumber` | `TEXT`     |
| `finalFacturaNumero`          | `finalInvoiceNumber`          | `TEXT`     |
| `finalRecepcionNumero`        | `finalReceptionNumber`        | `TEXT`     |
| `expedicionFecha`             | `issueDate`                   | `DATETIME` |
| `operacionFecha`              | `operationDate`               | `DATETIME` |
| `recepcionFecha`              | `receptionDate`               | `DATETIME` |
| `fiscalEjercicio`             | `fiscalYear`                  | `NUMBER`   |
| `fiscalPeriodo`               | `fiscalPeriod`                | `TEXT`     |
| `facturaTipo`                 | `invoiceType`                 | `TEXT`     |
| `totalFacturaCantidad`           | `totalInvoiceAmount`          | `NUMBER`   |
| `gravableCantidad`               | `taxableAmount`               | `NUMBER`   |
| `impuestoTasa`                | `taxRate`                     | `NUMBER`   |
| `soportadoImpuestoCantidad`      | `inputTaxAmount`              | `NUMBER`   |
| `deducibleImpuestoCantidad`      | `deductibleTaxAmount`         | `NUMBER`   |
| `equivalenciaRecargoTasa`     | `equivalenceSurchargeRate`    | `NUMBER`   |
| `equivalenciaRecargoCantidad`    | `equivalenceSurchargeAmount`  | `NUMBER`   |
| `gastoConcepto`               | `expenseConcept`              | `TEXT`     |
| `deducibleGastoCantidad`         | `deductibleExpenseAmount`     | `NUMBER`   |
| `proveedorTributariaId`       | `supplierTaxId`               | `TEXT`     |
| `proveedorNombre`             | `supplierName`                | `TEXT`     |
| `proveedorIdentificacionTipo` | `supplierIdType`              | `TEXT`     |
| `proveedorPaisCodigo`         | `supplierCountryCode`         | `TEXT`     |
| `operacionClave`              | `operationKey`                | `TEXT`     |
| `esInversionBien`             | `isInvestmentAsset`           | `BOOLEAN`  |
| `esInversionSujetoPasivo`     | `isReverseCharge`             | `BOOLEAN`  |
| `deduciblePosteriorPeriodo`   | `deductibleLaterPeriod`       | `BOOLEAN`  |
| `deduccionEjercicio`          | `deductionYear`               | `NUMBER`   |
| `deduccionPeriodo`            | `deductionPeriod`             | `TEXT`     |
| `actividadCodigo`             | `activityCode`                | `TEXT`     |
| `actividadTipo`               | `activityType`                | `TEXT`     |
| `iaeEpigrafe`                 | `iaeHeading`                  | `TEXT`     |
| `pagoFecha`                   | `paymentDate`                 | `DATETIME` |
| `pagadoCantidad`                 | `paidAmount`                  | `NUMBER`   |
| `pagoMetodo`                  | `paymentMethod`               | `TEXT`     |
| `pagoMetodoIdentificacion`    | `paymentMethodIdentifier`     | `TEXT`     |
| `externaReferencia`           | `externalReference`           | `TEXT`     |
| `trazaId`              | `traceId`                     | `TEXT`     |
| `registradoFecha`             | `registeredAt`                | `DATETIME` |

23. PLAN_CUENTAS_CONTABLES (PlanCuentasContables)

| ID Visible                        | ID Técnica                 | Tipo       |
| --------------------------------- | -------------------------- | ---------- |
| `idElemento`                      | `_id`                      | `TEXT`     |
| `cuentaCodigo`                    | `accountCode`              | `TEXT`     |
| `cuentaNombre`                    | `accountName`              | `TEXT`     |
| `cuentaGrupo`                     | `accountGroup`             | `TEXT`     |
| `cuentaSubgrupo`                  | `accountSubgroup`          | `TEXT`     |
| `cuentaNaturaleza`                | `accountNature`            | `TEXT`     |
| `operacionCategoria`              | `operationCategory`        | `TEXT`     |
| `operacionSubcategoria`           | `operationSubcategory`     | `TEXT`     |
| `predeterminadaImpuestoTasa`      | `defaultTaxRate`           | `NUMBER`   |
| `repercutidoImpuestoCuentaCodigo` | `outputTaxAccountCode`     | `TEXT`     |
| `repercutidoImpuestoCuentaNombre` | `outputTaxAccountName`     | `TEXT`     |
| `soportadoImpuestoCuentaCodigo`   | `inputTaxAccountCode`      | `TEXT`     |
| `soportadoImpuestoCuentaNombre`   | `inputTaxAccountName`      | `TEXT`     |
| `predeterminadaDebeCuentaCodigo`  | `defaultDebitAccountCode`  | `TEXT`     |
| `predeterminadaDebeCuentaNombre`  | `defaultDebitAccountName`  | `TEXT`     |
| `predeterminadaHaberCuentaCodigo` | `defaultCreditAccountCode` | `TEXT`     |
| `predeterminadaHaberCuentaNombre` | `defaultCreditAccountName` | `TEXT`     |
| `predeterminadoCosteCentro`       | `defaultCostCenter`        | `TEXT`     |
| `activo`                          | `active`                   | `BOOLEAN`  |
| `validadaPorGestoria`             | `validatedByAgency`        | `BOOLEAN`  |
| `validacionFecha`                 | `validationDate`           | `DATETIME` |

24. ASIENTOS_CONTABLES (AsientosContables)

| ID Visible                   | ID Técnica                  | Tipo       |
| ---------------------------- | --------------------------- | ---------- |
| `idElemento`                 | `_id`                       | `TEXT`     |
| `diarioAsientoId`            | `journalEntryId`            | `TEXT`     |
| `asientoNumero`              | `entryNumber`               | `NUMBER`   |
| `fiscalEjercicio`            | `fiscalYear`                | `NUMBER`   |
| `fiscalPeriodo`              | `fiscalPeriod`              | `TEXT`     |
| `operacionFecha`             | `operationDate`             | `DATETIME` |
| `fiscalOperacionFecha`       | `fiscalOperationDate`       | `DATETIME` |
| `asientoConcepto`            | `entryConcept`              | `TEXT`     |
| `totalDebe`                  | `totalDebit`                | `NUMBER`   |
| `totalHaber`                 | `totalCredit`               | `NUMBER`   |
| `totalDocumentoCantidad`        | `totalDocumentAmount`       | `NUMBER`   |
| `asientoTipo`                | `entryType`                 | `TEXT`     |
| `asientoEstado`              | `entryStatus`               | `TEXT`     |
| `operacionCategoria`         | `operationCategory`         | `TEXT`     |
| `operacionSubcategoria`      | `operationSubcategory`      | `TEXT`     |
| `moneda`                     | `currency`                  | `TEXT`     |
| `pagoMetodo`                 | `paymentMethod`             | `TEXT`     |
| `wixPedidoId`                | `wixOrderId`                | `TEXT`     |
| `wixDevolucionId`            | `wixRefundId`               | `TEXT`     |
| `wixReservaId`               | `wixBookingId`              | `TEXT`     |
| `transaccionId`              | `transactionId`             | `TEXT`     |
| `facturaSerie`               | `invoiceSeries`             | `TEXT`     |
| `facturaNumero`              | `invoiceNumber`             | `TEXT`     |
| `facturaExpedicionFecha`     | `invoiceIssueDate`          | `DATETIME` |
| `facturaTipo`                | `invoiceType`               | `TEXT`     |
| `externaReferencia`          | `externalReference`         | `TEXT`     |
| `rectificadoAsientoId`       | `rectifiedEntryId`          | `TEXT`     |
| `rectificacionMotivo`        | `rectificationReason`       | `TEXT`     |
| `operativoResponsableId`     | `operationalManagerId`      | `TEXT`     |
| `registradorMiembroId`       | `recordingMemberId`         | `TEXT`     |
| `registradorNombre`          | `recordingName`             | `TEXT`     |
| `costeCentroId`              | `costCenterId`              | `TEXT`     |
| `iaeActividadCodigo`         | `iaeActivityCode`           | `TEXT`     |
| `registroOrigen`             | `recordSource`              | `TEXT`     |
| `origenId`                   | `sourceId`                  | `TEXT`     |
| `esquemaVersion`             | `schemaVersion`             | `TEXT`     |
| `integridadAlgoritmoVersion` | `integrityAlgorithmVersion` | `TEXT`     |
| `previoHash`                 | `previousHash`              | `TEXT`     |
| `asientoHash`                | `entryHash`                 | `TEXT`     |
| `asientoFirma`               | `entrySignature`            | `TEXT`     |
| `trazaId`             | `traceId`                   | `TEXT`     |
| `registradoFecha`            | `registeredAt`              | `DATETIME` |
| `operacionHorariaZona`       | `operationTimeZone`         | `TEXT`     |

25. LINEAS_ASIENTO_CONTABLE (LineasAsientoContable)

| ID Visible                | ID Técnica             | Tipo       |
| ------------------------- | ---------------------- | ---------- |
| `idElemento`              | `_id`                  | `TEXT`     |
| `asientoLineaId`          | `entryLineId`          | `TEXT`     |
| `diarioAsientoId`         | `journalEntryId`       | `TEXT`     |
| `lineaNumero`             | `lineNumber`           | `NUMBER`   |
| `cuentaCodigo`            | `accountCode`          | `TEXT`     |
| `cuentaNombre`            | `accountName`          | `TEXT`     |
| `cuentaGrupo`             | `accountGroup`         | `TEXT`     |
| `debeCantidad`               | `debitAmount`          | `NUMBER`   |
| `haberCantidad`              | `creditAmount`         | `NUMBER`   |
| `netoCantidad`               | `netAmount`            | `NUMBER`   |
| `lineaDescripcion`        | `lineDescription`      | `TEXT`     |
| `gravableCantidad`           | `taxableAmount`        | `NUMBER`   |
| `impuestoTasa`            | `taxRate`              | `NUMBER`   |
| `impuestoCantidad`           | `taxAmount`            | `NUMBER`   |
| `ivaOperacionClave`       | `vatOperationKey`      | `TEXT`     |
| `contraparteTributariaId` | `counterpartyTaxId`    | `TEXT`     |
| `contraparteNombre`       | `counterpartyName`     | `TEXT`     |
| `operacionCategoria`      | `operationCategory`    | `TEXT`     |
| `productoServicioCodigo`  | `productServiceCode`   | `TEXT`     |
| `costeCentroId`           | `costCenterId`         | `TEXT`     |
| `operativoResponsableId`  | `operationalManagerId` | `TEXT`     |
| `externaReferencia`       | `externalReference`    | `TEXT`     |
| `lineaHash`               | `lineHash`             | `TEXT`     |
| `trazaId`          | `traceId`              | `TEXT`     |
| `operacionFecha`          | `operationDate`        | `DATETIME` |
| `registradoFecha`         | `registeredAt`         | `DATETIME` |

26. LIBRO_MAYOR_CONTABLE_SALDOS (LibroMayorContableSaldos)

| ID Visible          | ID Técnica             | Tipo       |
| ------------------- | ---------------------- | ---------- |
| `idElemento`        | `_id`                  | `TEXT`     |
| `generalMayorId`    | `generalLedgerId`      | `TEXT`     |
| `cuentaCodigo`      | `accountCode`          | `TEXT`     |
| `cuentaNombre`      | `accountName`          | `TEXT`     |
| `fiscalEjercicio`   | `fiscalYear`           | `NUMBER`   |
| `fiscalPeriodo`     | `fiscalPeriod`         | `TEXT`     |
| `inicialDebeSaldo`  | `initialDebitBalance`  | `NUMBER`   |
| `inicialHaberSaldo` | `initialCreditBalance` | `NUMBER`   |
| `debeMovimientos`   | `debitMovements`       | `NUMBER`   |
| `haberMovimientos`  | `creditMovements`      | `NUMBER`   |
| `finalDebeSaldo`    | `finalDebitBalance`    | `NUMBER`   |
| `finalHaberSaldo`   | `finalCreditBalance`   | `NUMBER`   |
| `calculoFecha`      | `calculationDate`      | `DATETIME` |
| `trazaId`    | `traceId`              | `TEXT`     |

27. EVENTOS_SISTEMA_FACTURACION (EventosSistemaFacturacion)

| ID Visible             | ID Técnica            | Tipo       |
| ---------------------- | --------------------- | ---------- |
| `idElemento`           | `_id`                 | `TEXT`     |
| `sistemaEventoId`      | `systemEventId`       | `TEXT`     |
| `eventoFechaHora`      | `eventDateTime`       | `DATETIME` |
| `eventoTipo`           | `eventType`           | `TEXT`     |
| `severidad`            | `severity`            | `CHOICES`  |
| `resultado`            | `result`              | `TEXT`     |
| `eventoOrigen`         | `eventSource`         | `TEXT`     |
| `responsableUsuarioId` | `responsibleUserId`   | `TEXT`     |
| `responsableMiembroId` | `responsibleMemberId` | `TEXT`     |
| `diarioAsientoId`      | `journalEntryId`      | `TEXT`     |
| `transaccionId`        | `transactionId`       | `TEXT`     |
| `referenciaId`         | `referenceId`         | `TEXT`     |
| `seguroDetalle`        | `secureDetail`        | `OBJECT`   |
| `previoEventoHash`     | `previousEventHash`   | `TEXT`     |
| `eventoHash`           | `eventHash`           | `TEXT`     |
| `eventoFirma`          | `eventSignature`      | `TEXT`     |
| `sistemaVersion`       | `systemVersion`       | `TEXT`     |
| `esquemaVersion`       | `schemaVersion`       | `TEXT`     |
| `trazaId`       | `traceId`             | `TEXT`     |

28. MM_AUDIT_LOG (MmAuditLog)

| ID Visible        | ID Técnica   | Tipo       |
| ----------------- | ------------ | ---------- |
| `idElemento`      | `_id`        | `TEXT`     |
| `eventoTipo`      | `eventType`  | `TEXT`     |
| `nivel`           | `level`      | `CHOICES`  |
| `mensaje`         | `message`    | `TEXT`     |
| `origen`          | `source`     | `TEXT`     |
| `recursoId`       | `resourceId` | `TEXT`     |
| `trazaId`  | `traceId`    | `TEXT`     |
| `registradoFecha` | `loggedAt`   | `DATETIME` |
| `datos`           | `data`       | `OBJECT`   |

29. REGISTROS_HORARIOS_STAFF (RegistrosHorariosStaff)

| ID Visible               | ID Técnica             | Tipo       |
| ------------------------ | ---------------------- | ---------- |
| `idElemento`             | `_id`                  | `TEXT`     |
| `recursoId`              | `resourceId`           | `TEXT`     |
| `recursoNombre`          | `resourceName`         | `TEXT`     |
| `registradoFecha`        | `recordedAt`           | `DATETIME` |
| `registradaHora`         | `recordedTime`         | `TEXT`     |
| `diaClave`               | `dayKey`               | `TEXT`     |
| `mesClave`               | `monthKey`             | `TEXT`     |
| `fichajeEventoTipo`      | `clockEventType`       | `CHOICES`  |
| `tipoTurno`              | `type`                 | `TEXT`     |
| `empleadaIdentificador`  | `employeeIdentifier`   | `TEXT`     |
| `empleadaNombre`         | `employeeName`         | `TEXT`     |
| `registradoPor`          | `registeredBy`         | `CHOICES`  |
| `registradoPorMiembroId` | `registeredByMemberId` | `TEXT`     |
| `ajusteMotivo`           | `adjustmentReason`     | `TEXT`     |
| `dispositivoIp`          | `deviceIp`             | `TEXT`     |
| `dispositivoIpDireccion` | `deviceIpAddress`      | `TEXT`     |
| `firma`                  | `signature`            | `TEXT`     |
| `meta`                   | `meta`                 | `OBJECT`   |
| `trazaId`         | `traceId`              | `TEXT`     |

30. SLOT_LOCKS (SlotLocks)

| ID Visible             | ID Técnica  | Tipo       |
| ---------------------- | ----------- | ---------- |
| `idCerrojo`            | `_id`       | `TEXT`     |
| `cerrojoClave`         | `lockKey`   | `TEXT`     |
| `cerrojoPropietarioId` | `traceId`   | `TEXT`     |
| `expiraFecha`          | `expiresAt` | `DATETIME` |

31. RATE_LIMIT_BLOCKS (RateLimitBlocks)

| ID Visible    | ID Técnica  | Tipo       |
| ------------- | ----------- | ---------- |
| `idElemento`  | `_id`       | `TEXT`     |
| `superficie`  | `surface`   | `TEXT`     |
| `clave`       | `key`       | `TEXT`     |
| `expiraFecha` | `expiresAt` | `DATETIME` |

32. ALERTAS_OPERATIVAS (AlertasOperativas)

| ID Visible       | ID Técnica  | Tipo      |
| ---------------- | ----------- | --------- |
| `idElemento`     | `_id`       | `TEXT`    |
| `alertaTipo`     | `alertType` | `TEXT`    |
| `severidad`      | `severity`  | `CHOICES` |
| `mensaje`        | `message`   | `TEXT`    |
| `estado`         | `status`    | `CHOICES` |
| `trazaId` | `traceId`   | `TEXT`    |

📌 BLOQUE 4: MATRIZ DE VÍNCULOS, INMUTABILIDAD (HOOKS) Y DESPLIEGUE

Este es el bloque final de la arquitectura. Define cómo interactúan las 32
colecciones y establece las salvaguardas de inmutabilidad necesarias para el
cumplimiento fiscal y laboral.

1. MATRIZ DE VÍNCULOS Y RELACIONES ENTRE COLECCIONES

Esta matriz define el flujo lógico de los datos. Toda referencia cruzada debe
mantenerse íntegra en los hooks de escritura.

┌─────────────────────────────┐
│   CATEGORIA_SERVICIO        │
│   (Display: nombreCategoria)│
└──────────────▲──────────────┘
               │ 1:1 (Reference)
┌─────────────────────────────┐   ┌──────────────┴──────────────┐   ┌─────────────────────────────┐
│       MAPA_STAFF            │   │      SERVICIOS_CATALOGO     │   │     COMPLEMENTOS_CATALOGO   │
│   (Display: displayName)    │◄──┤  (Display: title)           ├──►│   (Display: title)          │
└──────────────┬──────────────┘   └──────────────┬──────────────┘   └─────────────────────────────┘
               │ 1:N (Multi-Ref)                 │ 1:1 (Self-Ref F2)               ▲
               │                                 ▼                                 │
               │                  ┌─────────────────────────────┐                  │
               │                  │      SERVICIOS_CATALOGO     │                  │
               │                  │       (Sub-servicio F2)     │                  │
               │                  └─────────────────────────────┘                  │
               │                                                                   │
               ├───────────────────────────────────────────────────────────────────┤
               ▼ (Asignación staff y complementos)                                 │
┌─────────────────────────────┐                                                    │
│          CITAS_F2           ├────────────────────────────────────────────────────┘
│  (Reserva, Slots y Fechas)  │
└──────────────┬──────────────┘
               │ 1:1 (reservaIdVinculada)
               ▼
┌─────────────────────────────┐
│       MOVIMIENTOS_CAJA      │
│(Ledger Inmutable / Cierre Z)│
└──────────────┬──────────────┘
               │ 1:1 (sourceId)
               ▼
┌─────────────────────────────┐
│     ASIENTOS_CONTABLES      │
│  (Partida doble y balance)  │
└──────────────┬──────────────┘
               │ 1:N (journalEntryId)
               ▼
┌─────────────────────────────┐
│  LIBRO_MAYOR_CONTABLE_SALDOS│
└─────────────────────────────┘

2. REGLAS DE INMUTABILIDAD Y PROTECCIÓN (BACKEND HOOKS)

Para cumplir con la normativa SIF / Veri*factu y el registro laboral
obligatorio, se implementan las siguientes restricciones en backend/data.js:

| Colección                     | Hook                            | Regla de Negocio                                                                         |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `MOVIMIENTOS_CAJA`            | `beforeUpdate` / `beforeRemove` | **Prohibido.** Lanza `FISCAL_VIOLACION`.                                                 |
| `HISTORICO_CIERRES_Z`         | `beforeUpdate` / `beforeRemove` | **Prohibido.** Lanza `FISCAL_VIOLACION`.                                                 |
| `EVENTOS_SISTEMA_FACTURACION` | `beforeUpdate` / `beforeRemove` | **Prohibido.** Lanza `SIF_VIOLACION`.                                                    |
| `REGISTROS_HORARIOS_STAFF`    | `beforeUpdate` / `beforeRemove` | **Prohibido.** Lanza `LABOR_LOG_VIOLACION`.                                              |
| `CAJA_ACTUAL`                 | `beforeRemove`                  | **Prohibido.** Singleton protegido.                                                      |
| `ServiciosCatalogo`           | `beforeInsert` / `beforeUpdate` | Validar esquema: `phase1Duration + exposureDuration + phase2Duration === totalDuration`. |
| `MapaStaff`                   | `beforeInsert` / `beforeUpdate` | Validar unicidad de `resourceId` y `staffMemberId`.                                      |

3. GUÍA DE DESPLIEGUE EN WIX DATA CMS

Siga estrictamente este orden para asegurar que las referencias (References) y
Multi-References se resuelvan correctamente.

1. Nivel 0 (Auxiliares): Crear CategoriasServicio, MapaStaff, ProveedoresLista,
    ConfiguracionFiscal. Importar CSVs y establecer Display Fields.
2. Nivel 1 (Catálogo): Crear ServiciosCatalogo y ComplementosCatalogo.
    Configurar las referencias a CategoriasServicio y MapaStaff.
3. Nivel 2 (Transaccional): Crear CitasF2, SlotLocks, BookingTransactions,
    CompensacionesPendientes, DualSlotCache, InventarioStockVenta,
    MovimientosInventario.
4. Nivel 3 (Fiscal/Contable): Crear CajaActual, MovimientosCaja, CierresZ,
    SecuenciaTickets, PlanCuentasContables, AsientosContables,
    LineasAsientoContable, LibroMayorContableSaldos.
5. Nivel 4 (Infraestructura/Audit): Crear MmAuditLog,
    EventosSistemaFacturacion, RegistrosHorariosStaff, RateLimitBlocks,
    AlertasOperativas.

6. RESUMEN FINAL DEL ECOSISTEMA CANÓNICO

Este documento constituye el ANEXO TÉCNICO DEFINITIVO del ecosistema
MARIANMADRID v5002.4. Consolida toda la lógica de control, constantes, funciones
y configuraciones en un único índice de referencia para el desarrollo,
mantenimiento y auditoría del sistema.

📕 ANEXO: BIBLIA DE ELEMENTOS Y CONFIGURACIÓN (SSOT)

1. MAPA DE CONSTANTES Y ENUMS (internalConfig.js)

El comportamiento del sistema está gobernado por SDK_CONFIG y objetos inmutables
(Object.freeze).

- Identidades de Sistema:
  - SDK_CONFIG.TZ: "Europe/Madrid"
  - SDK_CONFIG.LOCATION_ID: "7a12abfd-bf30-4847-bcdf-00dc573d4802"
- Gestión Fiscal (IVA):
  - IVA_RATES: { GENERAL: 0.21, REDUCIDO: 0.10, SUPERREDUCIDO: 0.04,
        EXENTO: 0.0 }
- Estados de Negocio:
  - ESTADO_PAGO: UNPAID, NOT_PAID, PENDING_PAYMENT, PENDING_LEDGER, PAID,
        REFUNDED, PARTIALLY_REFUNDED.
  - CAJA_STATUS: ABIERTA, CERRADA.
  - COLLAB_ROLES: ADMIN, GESTION, ESTILISTA.
- Tipos de Operación:
  - TIPO_FICHAJE: ENTRADA, SALIDA, PAUSA_INICIO, PAUSA_FIN, AJUSTE.
  - FORMA_PAGO: EFECTIVO, TARJETA, BIZUM, ONLINE.

1. DICCIONARIO DE FUNCIONES Y HELPERS (Backend y Frontend)

2.1 Backend: Funciones Públicas (Exportadas)

Acceso controlado a través de la capa de servicios.

- BookingCore: createBookingElevated, cancelBookingElevated,
    rescheduleBookingElevated, getCertifiedDualSlotsOptimized.
- CitasManager: processDualBooking, confirmPayment, rescheduleDualBookings.
- Cajas: getCashierState, registerManualTransaction, registerXCount,
    registerZClosing.
- Security: rateLimiter, isAdmin, isCajero, requireMarianManager.
- Staff: getAllStaff, findStaff, getStaffDisplayName.

2.2 Backend: Funciones Internas (Prefijo _)

Lógica protegida para encapsular operaciones críticas o inmutables.

- BookingCore: _initTransaction,_lockSlotKeyOrFail, _unlockSlotKey,
    _persistBooking, _generatePairToken.
- CitasManager: _getCitaMeta,_logAuditEvent, _setCitasPaymentState.
- Cajas: _verifyFiscalHashChainIntegrity.
- Data Hooks: ServiciosCatalogo_beforeInsert, MovimientosCaja_beforeInsert
    (Control fiscal inmutable).

2.3 Frontend/Público: Helpers (mmUtils.js)

Utilitarios seguros para uso en widgets e interfaces.

- Validación/Normalización: _safeTrim,_safeEmail, _safePhone,_looksLikeGuid,
    _safeSlugOrId.
- Timezone/Fechas: getUtcDateFromMadridLocal, getMadridLocalStringNoZ,
    _toDateSafe.
- Seguridad/PII: _maskEmail,_maskIp, _maskPhone,_maskName, _hashKey,
    makeTraceId.
- Async: withTimeout, _executeWithRetry.

1. IDENTIDADES CANÓNICAS (CORRECCIONES APLICADAS)

La siguiente tabla resume las identidades clave corregidas tras la revisión de
errores técnicos (nomenclatura consistente):

| Identidad Nativa (Wix) | Identidad Visible (Correcta) |
| ---------------------- | ---------------------------- |
| `location`             | `localizacion`                  |
| `locationId`           | `localizacionId`                |
| `historicalZClosings`  | `HistoricoCierresZ`          |
| `invoiceNumber`        | `facturaNumero`              |
| `receptionNumber`      | `recepcionNumero`            |
| `cajaRegistroEstado`   | `cajaRegistroEstado`         |
| `slugUrl`              | `slugUrl`                    |
| `pairToken`            | `parToken`                   |
| `bookingId`            | `reservaId`                  |

1. CONFIGURACIONES DE DASHBOARD Y ENTORNO

- Entorno Técnico:
  - Wix Velo, Node.js environment.
  - Base de datos: Wix Data (CMS).
  - Secretos: Wix Secrets Manager (FISCAL_KEY, AUTH_JWT_KEY, etc.).
- Integraciones:
  - M365: Sincronización vía Webhooks (HMAC-SHA256).
  - Fiscalidad: Veri*factu / SIF.
  - Pagos: Wix Payments / Checkout.
- Ajustes de Wix Apps:
  - Bookings: Uso exclusivo de V2.
  - Stores: Uso de V1 (Catálogo plano sin migraciones a V3).
  - Invoices: Escritura delegada al módulo cajas.web.js (prohibido escritura
        directa).

1. REGLAS DE SEGURIDAD Y AUDITORÍA

1. Inmutabilidad: Todos los documentos en MovimientosCaja, CierresZ,
    EventosSistemaFacturacion y RegistrosHorariosStaff tienen los hooks
    beforeUpdate y beforeRemove bloqueados mediante la excepción
    FISCAL_VIOLATION.
1. Traza: Cualquier inserción o modificación crítica requiere un traceId
    generado por makeTraceId().
1. Rate Limiting: El acceso a la disponibilidad y a la API de reservas está
    protegido por un limitador de ventana deslizante en memoria
    (SDK_CONFIG.RATE_LIMIT).
1. Cero Legacy: Se ha purgado cualquier alias antiguo (ej. MmLocks ->
    SLOT_LOCKS).

Dossier completo. Este anexo, junto con los bloques anteriores y los archivos de
configuración adjuntados, constituye la documentación definitiva del ecosistema.
Todo el desarrollo futuro debe alinearse con este estándar de nombres y
funciones.

Este anexo proporciona la Matriz de Correspondencia Oficial. Es la guía
obligatoria para la refactorización de todo el código fuente del ecosistema
(backend, frontend y webhooks) hacia el estándar v5002.4-definitiva.

Todas las referencias en código a las "IDs Legacy" deben ser sustituidas por las
"IDs Canónicas".

📑 ANEXO: MATRIZ DE CORRESPONDENCIA (LEGACY VS. CANÓNICA)

1. Mapeo de Colecciones (Renombrado y Absorción)

Esta tabla indica dónde buscar los datos si su código anterior apuntaba a una
colección que ha cambiado de nombre o sido absorbida.

| ID Legacy (Descartada)                 | Acción         | ID Canónica (Destino)       |
| :------------------------------------- | :------------- | :-------------------------- |
| `CONCILIACION_STOCK_WIX`               | **Absorbida**  | `MOVIMIENTOS_INVENTARIO`    |
| `SYNC_M365`                            | **Absorbida**  | `M365_GRAPH_SYNC_QUEUE`     |
| `AVAILABILITY_SLOTS_CACHE`             | **Absorbida**  | `DUAL_SLOT_CACHE`           |
| `MUTEXES`                              | **Absorbida**  | `SLOT_LOCKS`                |
| `COMPLEMENTOS_CATALOGO` (consulta CMS) | **Descartada** | **Wix Bookings API V2**     |
| `CONTADORES_FISCALES`                  | **Renombrada** | `SECUENCIA_TICKETS`         |
| `AUDITORIA`                            | **Renombrada** | `MM_AUDIT_LOG`              |
| `PENDING_COMPENSATIONS`                | **Renombrada** | `COMPENSACIONES_PENDIENTES` |

1. Mapeo de Campos Críticos (Refactorización de Consultas)

Lista de campos donde se ha normalizado la nomenclatura a inglés canónico
(camelCase) o español corregido según los criterios definidos (sin
preposiciones, sin espacios).

| Campo Legacy       | ID Canónica        | Colección                   |
| :----------------- | :----------------- | :-------------------------- |
| `location`         | `localizacion`        | Servicios / Staff           |
| `locationId`       | `localizacionId`      | Servicios / Staff           |
| `slug`             | `slugUrl`          | `ServiciosCatalogo`         |
| `tituloServicio`   | `title`            | `ServiciosCatalogo`         |
| `duracionTotal`    | `totalDuration`    | `ServiciosCatalogo`         |
| `tiempoFase1`      | `phase1Duration`   | `ServiciosCatalogo`         |
| `tiempoExposicion` | `exposureDuration` | `ServiciosCatalogo`         |
| `tiempoFase2`      | `phase2Duration`   | `ServiciosCatalogo`         |
| `pagoOnline`       | `onlinePayment`    | `ServiciosCatalogo`         |
| `pagoPresencial`   | `inPersonPayment`  | `ServiciosCatalogo`         |
| `impuestoIva`      | `taxRate`          | `ServiciosCatalogo`         |
| `statusPago`       | `paymentStatus`    | `CitasF2`                   |
| `tipo`             | `bookingType`      | `CitasF2`                   |
| `fechaYmdMadrid`   | `dateYmd`          | `CitasF2`                   |
| `idFactura`        | `invoiceNumber`    | `MovimientosCaja`           |
| `idRecepcion`      | `receptionNumber`  | `LibroIvaFacturasRecibidas` |

1. Mapeo de Lógica y Funciones (Refactorización de Código)

Guía para actualizar las llamadas a funciones en los módulos .js y .web.js.

| Función Legacy                     | Función Canónica               | Módulo                    |
| :--------------------------------- | :----------------------------- | :------------------------ |
| `toDateSafe`                       | `_toDateSafe`                  | `public/mmUtils.js`       |
| `_resolvePrimaryServiceIdInternal` | `_resolveServiceIdInternal`    | `backend/reservas.web.js` |
| `SDK_CONFIG.TIMEOUTS.API_MS`       | `SDK_CONFIG?.TIMEOUTS?.API_MS` | Varios (Uso opcional)     |
| `STATUS_PAGO_LEGACY`               | **ELIMINADO**                  | Varios (Cero Legacy)      |
| `LOCKS`                            | `SLOT_LOCKS`                   | `internalConfig.js`       |

1. MATRIZ DE CONFIGURACIONES DE ENTORNO

Ajustes requeridos en el Dashboard de Wix para mantener la coherencia con esta
arquitectura:

| Ajuste                    | Configuración Requerida                                                     |
| :------------------------ | :-------------------------------------------------------------------------- |
| **Zona Horaria**          | `Europe/Madrid` (Configuración del Sitio)                                   |
| **Idioma**                | `es` (Español)                                                              |
| **Integración eCommerce** | Webhook de `wixEcom_onOrderPaymentStatusUpdated` activo                     |
| **Auth**                  | Elevación `wix-auth.elevate` para todas las escrituras en `MovimientosCaja` |
| **Secrets Manager**       | Claves: `FISCAL_KEY`, `AUTH_JWT_KEY`, `M365_WEBHOOK_HMAC_KEY`               |

Notas finales para el equipo de desarrollo:

1. Refactorización: Al realizar el despliegue, asegúrese de ejecutar una
    búsqueda global (Ctrl+Shift+F) de las IDs Legacy listadas en la Sección 1
    y 2 para asegurar que no queden referencias en los módulos frontend o
    backend.
2. Inmutabilidad: No intentar ejecutar wixData.update o wixData.remove sobre
    colecciones protegidas (ver bloques anteriores). Utilizar exclusivamente las
    funciones exportadas en los módulos web.js correspondientes.
3. Validación: Tras la refactorización, verificar que los logs de auditoría en
    MmAuditLog no reporten FISCAL_VIOLATION ni LABOR_LOG_VIOLATION.

Este anexo cierra la documentación técnica. El sistema Marian Madrid v5002.4 es
ahora un ecosistema tipado, inmutable y coherente.
