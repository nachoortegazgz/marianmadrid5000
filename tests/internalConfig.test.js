// tests/internalConfig.test.js
// Contrato SSOT: los valores de COLLECTIONS deben coincidir con los nombres
// reales de las colecciones del CMS (ver .wix/CMS ARQUITECTURA FINAL.txt).
// Los hooks de data.js se resuelven por reflexion sobre ese nombre; un valor
// divergente desactiva silenciosamente la proteccion fiscal y laboral.
import { describe, it, expect } from 'vitest';
import { COLLECTIONS } from '../src/backend/internalConfig.js';

describe('SSOT de colecciones CMS (arquitectura canonical)', () => {
  it('mapea cada clave al nombre CMS canonico', () => {
    expect(COLLECTIONS.SERVICIOS_CATALOGO).toBe('ServiciosCatalogo');
    expect(COLLECTIONS.MAPA_STAFF).toBe('MapaStaff');
    expect(COLLECTIONS.CITAS_F2).toBe('CitasF2');
    expect(COLLECTIONS.AVAILABILITY_DAYS_CACHE).toBe('AvailabilityDaysCache');
    expect(COLLECTIONS.DUAL_SLOT_CACHE).toBe('DualSlotCache');
    expect(COLLECTIONS.BOOKING_TRANSACTIONS).toBe('BookingTransactions');
    // Nota: la cabecera #7 del doc de arquitectura muestra "PendingCompensations",
    // pero la Biblia v5002.4 lo declara legacy; el canonico es CompensacionesPendientes.
    expect(COLLECTIONS.COMPENSACIONES_PENDIENTES).toBe('CompensacionesPendientes');
    expect(COLLECTIONS.M365_GRAPH_SYNC_QUEUE).toBe('M365GraphSyncQueue');
    expect(COLLECTIONS.INVENTARIO_STOCK_VENTA).toBe('InventarioStockVenta');
    expect(COLLECTIONS.MOVIMIENTOS_INVENTARIO).toBe('MovimientosInventario');
    expect(COLLECTIONS.INVENTARIO_STOCK_VENTA_CIERRE).toBe('InventarioStockVentaCierre');
    expect(COLLECTIONS.PROVEEDORES_LISTA).toBe('ProveedoresLista');
    expect(COLLECTIONS.CAJA_ACTUAL).toBe('CajaActual');
    expect(COLLECTIONS.MOVIMIENTOS_CAJA).toBe('MovimientosCaja');
    expect(COLLECTIONS.CONTROL_PARCIAL_X).toBe('ControlParcialX');
    expect(COLLECTIONS.CIERRES_Z).toBe('HistoricoCierresZ');
    expect(COLLECTIONS.SECUENCIA_TICKETS).toBe('SecuenciaTickets');
    expect(COLLECTIONS.CONFIGURACION_FISCAL).toBe('ConfiguracionFiscal');
    expect(COLLECTIONS.LIBRO_IVA_FACTURAS_EXPEDIDAS).toBe('LibroIvaFacturasExpedidas');
    expect(COLLECTIONS.LIBRO_IVA_FACTURAS_RECIBIDAS).toBe('LibroIvaFacturasRecibidas');
    expect(COLLECTIONS.PLAN_CUENTAS_CONTABLES).toBe('PlanCuentasContables');
    expect(COLLECTIONS.ASIENTOS_CONTABLES).toBe('AsientosContables');
    expect(COLLECTIONS.LINEAS_ASIENTO_CONTABLE).toBe('LineasAsientoContable');
    expect(COLLECTIONS.LIBRO_MAYOR_CONTABLE_SALDOS).toBe('MayorContableSaldos');
    expect(COLLECTIONS.EVENTOS_SISTEMA_FACTURACION).toBe('EventosSistemaFacturacion');
    expect(COLLECTIONS.MM_AUDIT_LOG).toBe('MmAuditLog');
    expect(COLLECTIONS.REGISTROS_HORARIOS_STAFF).toBe('RegistrosHorariosStaff');
    expect(COLLECTIONS.SLOT_LOCKS).toBe('SlotLocks');
    expect(COLLECTIONS.RATE_LIMIT_BLOCKS).toBe('RateLimitBlocks');
    expect(COLLECTIONS.ALERTAS_OPERATIVAS).toBe('AlertasOperativas');
  });

  it('no conserva claves de colecciones eliminadas por la arquitectura', () => {
    // COMPLEMENTOS_CATALOGO: sustituida por la API nativa de add-ons de Wix Bookings V2.
    expect(Object.hasOwn(COLLECTIONS, 'COMPLEMENTOS_CATALOGO')).toBe(false);
    // ConciliacionStockWix, AvailabilitySlotsCache, MmLocks: eliminadas y absorbidas.
    expect(Object.values(COLLECTIONS)).not.toContain('ConciliacionStockWix');
    expect(Object.values(COLLECTIONS)).not.toContain('AvailabilitySlotsCache');
    expect(Object.values(COLLECTIONS)).not.toContain('MmLocks');
  });
});
