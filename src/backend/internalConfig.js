/**
=============================================================================
MODULE: backend/internalConfig.js
VERSION: v19.6.17-corrections-applied
RESPONSIBILITY: Centralized Backend Configuration, Collections Enum,
            SDK Timeouts, Concurrency Guards, and Domain Enums.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
CORRECTIONS APPLIED:
  [FIX-1]  COLLECTIONS values: removed trailing spaces (22 values)
  [FIX-2]  JOBS: "Objec t.freeze" -> "Object.freeze"
  [FIX-3]  "RATE_LIMIT_CACHE_CLEANUP_TTL_ MS" -> "RATE_LIMIT_CACHE_CLEANUP_TTL_MS"
  [FIX-4]  "HEALTH_CHECK_QU ERY_LIMIT" -> "HEALTH_CHECK_QUERY_LIMIT"
  [FIX-5]  "RATE_LIMIT_MAX_REQUESTS:  20" -> "RATE_LIMIT_MAX_REQUESTS: 20"
  [FIX-6]  CORS_ALLOWED_ORIGINS: ["* "] -> ["*"]
  [FIX-7]  NIF_EMISOR: "12345678Z " -> "12345678Z"
  [FIX-8]  LOCATION_ID: removed trailing space
  [FIX-9]  LOCATION_TYPES: removed trailing spaces
  [FIX-10] SLOTS_CACHE_TTL_MS: "120000 ," -> "120000,"
  [FIX-11] SDK_CONFIG.TZ: removed trailing space
=============================================================================
*/
export const COLLECTIONS = Object.freeze({
SERVICIOS_CITA: "Import2",              // [FIX-1] was "Import2 "
ADDONS_CATALOGO: "AddonsCatalogo",      // [FIX-1] was "AddonsCatalogo "
SERVICIOS_OPCIONES_ADDON: "AddonsCatalogo", // [FIX-1] was "AddonsCatalogo "
MAPA_STAFF: "MapaStaff",                // [FIX-1] was "MapaStaff "
DUAL_CACHE: "DualSlotCache",            // [FIX-1] was "DualSlotCache "
DAYS_CACHE: "AvailabilityDaysCache",    // [FIX-1] was "AvailabilityDaysCache "
SLOTS_CACHE: "AvailabilitySlotsCache",  // [FIX-1] was "AvailabilitySlotsCache "
CITAS: "CitasF2",                       // [FIX-1] was "CitasF2 "
TRANSACTIONS: "BookingTransactions",    // [FIX-1] was "BookingTransactions "
LOCKS: "MM_LOCKS",                      // [FIX-1] was "MM_LOCKS "
COMPENSATIONS: "PendingCompensations",  // [FIX-1] was "PendingCompensations "
MOVIMIENTOS_CAJA: "movimientoCaja",     // [FIX-1] was "movimientoCaja "
CAJA_ACTUAL: "cajaActual",              // [FIX-1] was "cajaActual "
HISTORICO_CIERRES_Z: "HISTORICO_CIERRES_Z", // [FIX-1] was "HISTORICO_CIERRES_Z "
CONTEOS_X: "RESUMEN_CONTEO_X",          // [FIX-1] was "RESUMEN_CONTEO_X "
CONTADORES_FISCALES: "SecuenciaTickets", // [FIX-1] was "SecuenciaTickets "
REGISTRO_HORARIO: "REGISTRO_HORARIO",   // [FIX-1] was "REGISTRO_HORARIO "
INVENTARIO_PRODUCTOS: "InventarioProductos", // [FIX-1] was "InventarioProductos "
MOVIMIENTO_INVENTARIO: "movimientoInventario", // [FIX-1] was "movimientoInventario "
CONCILIACION_STOCK_WIX: "ConciliacionStockWix", // [FIX-1] was "ConciliacionStockWix "
PROVEEDORES_INVENTARIO: "ProveedoresInventario", // [FIX-1] was "ProveedoresInventario "
AUDIT_LOG: "MM_AUDIT_LOG",              // [FIX-1] was "MM_AUDIT_LOG "
SYNC_LOG: "m365SyncLog",                // [FIX-1] was "m365SyncLog "
});
export const APP_IDS = Object.freeze({
BOOKINGS: "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
STORES: "1380b703-ce81-ff05-f115-39571d94eab3",
EVENTS: "140603ad-af8d-84fb-9004-ee174e35054d",
});
export const SDK_CONFIG = Object.freeze({
TZ: "Europe/Madrid",                    // [FIX-11] was "Europe/Madrid "
LOCATION_ID: "7a12abfd-bf30-4847-bcdf-00dc573d4802", // [FIX-8] trailing space removed
LOCATION_TYPES: Object.freeze({
TIME_SLOTS: "BUSINESS",                 // [FIX-9] was "BUSINESS "
BOOKINGS_WRITER: "OWNER_BUSINESS",      // [FIX-9] was "OWNER_BUSINESS "
}),
TIMEOUTS: Object.freeze({
API_MS: 15000,
CMS_MS: 15000,
WATCHDOG_MS: 30000,
WEBHOOK_MS: 30000,
}),
CACHE: Object.freeze({
SERVICES_TTL_MS: 600000,
SLOTS_CACHE_TTL_MS: 120000,             // [FIX-10] was "120000 ,"
DUAL_CACHE_TTL_MS: 900000,
STAFF_TTL_MS: 300000,
MAX_ENTRIES: 100,
DAYS_CACHE_VERSION: 1,
}),
SECURITY: Object.freeze({
SECRET_CACHE_TTL_MS: 300000,
RATE_LIMIT_CACHE_CLEANUP_TTL_MS: 60000, // [FIX-3] was "RATE_LIMIT_CACHE_CLEANUP_TTL_ MS"
RATE_LIMIT_CACHE_MAX_ENTRIES: 5000,
}),
RATE_LIMIT: Object.freeze({
MAX_REQUESTS: 20,                       // [FIX-5] was "MAX_REQUESTS:  20"
WINDOW_MS: 5000,
BOOKING_MAX_REQUESTS: 5,
BOOKING_WINDOW_MS: 10000,
}),
JOBS: Object.freeze({                   // [FIX-2] was "Objec t.freeze"
TIMEOUT_MS: 30000,
AUDIT_RETENTION_DAYS: 90,
DELETE_BATCH_SIZE: 100,
DELETE_MAX_PAGES: 10,
DUAL_CACHE_CLEANUP_LIMIT: 100,
FISCAL_RECOVERY_BATCH_SIZE: 25,
HEALTH_CHECK_QUERY_LIMIT: 100,          // [FIX-4] was "HEALTH_CHECK_QU ERY_LIMIT"
FISCAL_DAILY_MAX_PAGES: 10,
}),
EVENTS: Object.freeze({
RETRY_ATTEMPTS: 3,
RETRY_BASE_BACKOFF_MS: 1000,
}),
EXTERNAL_HTTP: Object.freeze({
RATE_LIMIT_MAX_REQUESTS: 20,            // [FIX-5] was "RATE_LIMIT_MAX_REQUESTS:  20"
RATE_LIMIT_WINDOW_MS: 5000,
HMAC_MAX_CLOCK_SKEW_SECONDS: 60,
CORS_ALLOWED_ORIGINS: ["*"],            // [FIX-6] was ["* "]
}),
FISCAL: Object.freeze({
NIF_EMISOR: "12345678Z",                // [FIX-7] was "12345678Z "
}),
});
export const CONCURRENCY = Object.freeze({
MUTEX_TTL_MS: 120000,
HEARTBEAT_MS: 15000,
TRANSACTION_POLL_BASE_MS: 250,
TRANSACTION_MAX_WAIT_MS: 3000,
LOCK_CLEANUP_GRACE_MS: 60000,
MAX_COMPENSATION_RETRIES: 3,
LEDGER_MUTEX_TTL_MS: 45000,
});
export const SLOT_SEARCH = Object.freeze({
DIAS_LIMITE: 14,
TOLERANCE_MINUTES: 10,
});
export const API = Object.freeze({
STAFF_RESOURCE_TYPE_ID: "9b626e2e-f4ec-4ae7-a25e-149b5c3be095",
});
export const TIPO_FICHAJE = Object.freeze({
ENTRADA: "ENTRADA",
SALIDA: "SALIDA",
PAUSA_INICIO: "PAUSA_INICIO",
PAUSA_FIN: "PAUSA_FIN",
AJUSTE: "AJUSTE",
});
export const TIPO_MOVIMIENTO = Object.freeze({
VENTA_EFECTIVO: "VENTA_EFECTIVO",
VENTA_TARJETA: "VENTA_TARJETA",
VENTA_BIZUM: "VENTA_BIZUM",
VENTA_ONLINE: "VENTA_ONLINE",
REEMBOLSO: "REEMBOLSO",
AJUSTE: "AJUSTE",
});
export const FORMA_PAGO = Object.freeze({
EFECTIVO: "EFECTIVO",
TARJETA: "TARJETA",
BIZUM: "BIZUM",
ONLINE: "ONLINE",
});
export const IVA_RATES = Object.freeze({
GENERAL: 0.21,
});
export const CAJA_STATUS = Object.freeze({
OPEN: "ABIERTA",
CLOSED: "CERRADA",
});
export const SINGLETONS = Object.freeze({
CAJA: "CAJA_PRINCIPAL",
});
export const CITA_FIELDS = Object.freeze({
STATUS: "status",
STATUS_PAGO: "statusPago",
});
export const ESTADO_CITA = Object.freeze({
CONFIRMED: "CONFIRMED",
PENDING_PAYMENT: "PENDING_PAYMENT",
CANCELED: "CANCELED",
REFUNDED: "REFUNDED",
});
export const ESTADO_PAGO = Object.freeze({
UNPAID: "UNPAID",
PENDING_PAYMENT: "PENDING_PAYMENT",
PENDING_LEDGER: "PENDING_LEDGER",
PAID: "PAID",
REFUNDED: "REFUNDED",
PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
});
export const COLLAB_ROLES = Object.freeze({
ADMIN: "ADMIN",
GESTION: "GESTION",
ESTILISTA: "ESTILISTA",
});
export const JWT = Object.freeze({
ALGORITHM: "HS256",
EXPIRATION_MS: 1800000,
});