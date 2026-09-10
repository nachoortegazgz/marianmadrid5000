# ESQUEMA DE COLECCIONES CANÓNICAS

> Fuente normativa de IDs nativas: `src/backend/internalConfig.js` (contrato idéntico en `tests/cms-contract.json`, verificado por `tests/verify-core.mjs`). **Ante cualquier divergencia entre esta tabla y `internalConfig.js`, prevalece `internalConfig.js`.**
>
> ESTADO REAL v5002.4: `COLLECTIONS` declara **31 claves**. La fila `COMPLEMENTOS_CATALOGO` (n.º 2) es legacy (ver `tests/verify-core.mjs`); el catalogo de complementos se espera como `EXTRAS_CATALOGO`/`AddonsCatalogo` según `tests/verify-sanitization.mjs`. No usar `ComplementosCatalogo` en codigo nuevo.

## Tabla Maestra (32 filas segun BIBLIA; 31 vigentes en internalConfig.js)
| # | ID Visible | ID Nativa | Alias COLLECTIONS | Display Field | Estado |
|---|---|---|---|---|---|
| 1 | SERVICIOS_CATALOGO | ServiciosCatalogo | SERVICIOS_CATALOGO | title | Vigente |
| 2 | COMPLEMENTOS_CATALOGO | ComplementosCatalogo | COMPLEMENTOS_CATALOGO | title | LEGACY - no declarar |
| 3 | MAPA_STAFF | MapaStaff | MAPA_STAFF | displayName | Vigente |
| 4 | CITAS_F2 | CitasF2 | CITAS_F2 | bookingId | Vigente |
| 5 | AVAILABILITY_DAYS_CACHE | AvailabilityDaysCache | AVAILABILITY_DAYS_CACHE | _id | Vigente |
| 6 | DUAL_SLOT_CACHE | DualSlotCache | DUAL_SLOT_CACHE | pairToken | Vigente |
| 7 | BOOKING_TRANSACTIONS | BookingTransactions | BOOKING_TRANSACTIONS | pairToken | Vigente |
| 8 | BOOKINGS_SERVICE_SYNC_QUEUE | BookingsServiceSyncQueue | BOOKINGS_SERVICE_SYNC_QUEUE | _id | Vigente |
| 9 | COMPENSACIONES_PENDIENTES | CompensacionesPendientes | COMPENSACIONES_PENDIENTES | bookingId | Vigente |
| 10 | M365_GRAPH_SYNC_QUEUE | M365GraphSyncQueue | M365_GRAPH_SYNC_QUEUE | externalRecordId | Vigente |
| 11 | INVENTARIO_STOCK_VENTA | InventarioStockVenta | INVENTARIO_STOCK_VENTA | productName | Vigente |
| 12 | MOVIMIENTOS_INVENTARIO | MovimientosInventario | MOVIMIENTOS_INVENTARIO | movementToken | Vigente |
| 13 | INVENTARIO_STOCK_VENTA_CIERRE | InventarioStockVentaCierre | INVENTARIO_STOCK_VENTA_CIERRE | inventoryClosingId | Vigente |
| 14 | PROVEEDORES_LISTA | ProveedoresLista | PROVEEDORES_LISTA | supplierName | Vigente |
| 15 | CAJA_ACTUAL | CajaActual | CAJA_ACTUAL | operationDate | Vigente |
| 16 | MOVIMIENTOS_CAJA | MovimientosCaja | MOVIMIENTOS_CAJA | invoiceNumber | Vigente |
| 17 | CONTROL_PARCIAL_X | ControlParcialX | CONTROL_PARCIAL_X | operationDate | Vigente |
| 18 | HISTORICO_CIERRES_Z | HistoricoCierresZ | HISTORICO_CIERRES_Z | operationDate | Vigente |
| 19 | SECUENCIA_TICKETS | SecuenciaTickets | SECUENCIA_TICKETS | _id | Vigente |
| 20 | CONFIGURACION_FISCAL | ConfiguracionFiscal | CONFIGURACION_FISCAL | businessName | Vigente |
| 21 | LIBRO_IVA_FACTURAS_EXPEDIDAS | LibroIvaFacturasExpedidas | LIBRO_IVA_FACTURAS_EXPEDIDAS | invoiceNumber | Vigente |
| 22 | LIBRO_IVA_FACTURAS_RECIBIDAS | LibroIvaFacturasRecibidas | LIBRO_IVA_FACTURAS_RECIBIDAS | receptionNumber | Vigente |
| 23 | PLAN_CUENTAS_CONTABLES | PlanCuentasContables | PLAN_CUENTAS_CONTABLES | accountName | Vigente |
| 24 | ASIENTOS_CONTABLES | AsientosContables | ASIENTOS_CONTABLES | entryNumber | Vigente |
| 25 | LINEAS_ASIENTO_CONTABLE | LineasAsientoContable | LINEAS_ASIENTO_CONTABLE | entryLineId | Vigente |
| 26 | LIBRO_MAYOR_CONTABLE_SALDOS | MayorContableSaldos | LIBRO_MAYOR_CONTABLE_SALDOS | accountCode | Vigente |
| 27 | EVENTOS_SISTEMA_FACTURACION | EventosSistemaFacturacion | EVENTOS_SISTEMA_FACTURACION | systemEventId | Vigente |
| 28 | MM_AUDIT_LOG | MmAuditLog | MM_AUDIT_LOG | eventType | Vigente |
| 29 | REGISTROS_HORARIOS_STAFF | RegistrosHorariosStaff | REGISTROS_HORARIOS_STAFF | recordedAt | Vigente |
| 30 | SLOT_LOCKS | SlotLocks | SLOT_LOCKS | lockKey | Vigente |
| 31 | RATE_LIMIT_BLOCKS | RateLimitBlocks | RATE_LIMIT_BLOCKS | _id | Vigente |
| 32 | ALERTAS_OPERATIVAS | AlertasOperativas | ALERTAS_OPERATIVAS | _id | Vigente |

## Colecciones Legacy Absorbidas (NO USAR)
| Legacy | Destino |
|---|---|
| CONCILIACION_STOCK_WIX | MOVIMIENTOS_INVENTARIO |
| SYNC_M365 | M365_GRAPH_SYNC_QUEUE |
| AVAILABILITY_SLOTS_CACHE | DUAL_SLOT_CACHE |
| MUTEXES | SLOT_LOCKS |
| CONTADORES_FISCALES | SECUENCIA_TICKETS |
| AUDITORIA | MM_AUDIT_LOG |
| PENDING_COMPENSATIONS | COMPENSACIONES_PENDIENTES |

## Índices Críticos
| Colección | Índice | Tipo |
|---|---|---|
| CitasF2 | idx_bookingId | Único |
| CitasF2 | idx_pairToken | Normal |
| CitasF2 | idx_res_dates | Compuesto (resourceId + startDate + endDate) |
| SlotLocks | lockKey + status | Compuesto |
| BookingTransactions | pairToken | Único |
| MovimientosCaja | invoiceNumber | Único por serie |
| MovimientosInventario | movementToken | Único |
| HistoricoCierresZ | operationDate | Único |