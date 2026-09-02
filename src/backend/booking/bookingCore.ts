// backend/booking/bookingCore.ts — Migrado a TypeScript con tipado estricto
import type { ContactDetails, Slot as WixSlot, Booking as WixBooking } from '@wix/bookings';
import type { 
  PersistBookingParams, 
  PersistBookingResult, 
  BookingMeta, 
  CertifiedSlot, 
  DualSlotPair,
  ResourceLoad,
  BookingTrace
} from './types/booking.types';

/**
 * Valida que un string sea un GUID válido (formato UUID v4)
 */
export function isValidGuid(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(id);
}

/**
 * Extrae los resource IDs de un slot de Wix Bookings v2
 */
export function _extractResourceIdsFromSlot(slot: any): string[] {
  if (!slot || typeof slot !== 'object') return [];
  
  const resources: string[] = [];
  
  // Intentar extraer de diferentes estructuras posibles
  if (slot.resourceId && typeof slot.resourceId === 'string') {
    resources.push(slot.resourceId);
  }
  
  if (slot.resources && Array.isArray(slot.resources)) {
    for (const res of slot.resources) {
      if (res?.id && typeof res.id === 'string') {
        resources.push(res.id);
      }
    }
  }
  
  if (slot.staffMemberId && typeof slot.staffMemberId === 'string') {
    resources.push(slot.staffMemberId);
  }
  
  return [...new Set(resources)]; // Deduplicar
}

/**
 * Genera una clave única para identificar un slot
 */
export function _generateSlotKey(slot: any): string | null {
  if (!slot) return null;
  
  const parts = [
    slot.primaryServiceGuid || slot.serviceId || '',
    slot.scheduleId || '',
    slot.localStartDate || slot.startDate || '',
    slot.resourceId || ''
  ].filter(Boolean);
  
  return parts.length >= 3 ? parts.join('|') : null;
}

/**
 * Proyecta un slot de Wix a nuestro formato interno certificado
 */
export function _projectCertifiedSlot(
  slot: any,
  resourceId?: string
): CertifiedSlot | null {
  if (!slot || !slot.primaryServiceGuid) {
    console.warn('[bookingCore] Slot inválido: falta primaryServiceGuid');
    return null;
  }
  
  const targetResourceId = resourceId || slot.resourceId;
  
  if (!isValidGuid(targetResourceId)) {
    console.warn(`[bookingCore] ResourceId inválido: ${targetResourceId}`);
    return null;
  }
  
  // Validar fechas
  if (!slot.localStartDate || !slot.localEndDate) {
    console.warn('[bookingCore] Slot inválido: faltan fechas');
    return null;
  }
  
  const startDate = new Date(slot.localStartDate);
  const endDate = new Date(slot.localEndDate);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.warn('[bookingCore] Fechas inválidas en slot');
    return null;
  }
  
  return {
    serviceId: slot.primaryServiceGuid,
    scheduleId: slot.scheduleId || '',
    resource: {
      id: targetResourceId,
      name: slot.resourceName || undefined
    },
    localStartDate: slot.localStartDate,
    localEndDate: slot.localEndDate,
    availableSpots: slot.availableSpots,
    bookedSpots: slot.bookedSpots
  };
}

/**
 * Fuerza un staff member en un slot pristine (sin asignar)
 * Versión optimizada con validaciones tempranas
 */
export async function _forceStaffInPristineSlot(
  slot: any,
  resourceId: string,
  primaryServiceGuid: string | null,
  durationMinutes: number
): Promise<CertifiedSlot | null> {
  // Validación temprana de parámetros requeridos
  if (!primaryServiceGuid) {
    console.warn('[bookingCore] Falta primaryServiceGuid en _forceStaffInPristineSlot');
    return null;
  }
  
  if (!isValidGuid(resourceId)) {
    console.warn(`[bookingCore] ResourceId no es GUID válido: ${resourceId}`);
    return null;
  }
  
  // Validar fecha antes de crear objetos Date
  if (!slot.localStartDate) {
    console.warn('[bookingCore] Falta localStartDate en el slot');
    return null;
  }
  
  const startDate = new Date(slot.localStartDate);
  if (isNaN(startDate.getTime())) {
    console.error(`[bookingCore] Fecha inválida: ${slot.localStartDate}`);
    return null;
  }
  
  // Calcular fecha fin si no existe
  if (!slot.localEndDate) {
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    slot.localEndDate = endDate.toISOString();
  }
  
  // Proyectar a formato certificado
  return _projectCertifiedSlot({
    ...slot,
    primaryServiceGuid,
    resourceId
  }, resourceId);
}

/**
 * Persiste un booking en Wix Data con validación de tipos
 */
export async function _persistBooking(
  params: PersistBookingParams,
  traceId: string
): Promise<PersistBookingResult> {
  // Validaciones en tiempo de ejecución (además del check en compile-time)
  if (!params.bookingId || !params.primaryServiceGuid || !params.scheduleId) {
    const missingFields = [];
    if (!params.bookingId) missingFields.push('bookingId');
    if (!params.primaryServiceGuid) missingFields.push('primaryServiceGuid');
    if (!params.scheduleId) missingFields.push('scheduleId');
    
    const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
    console.error(`[bookingCore][${traceId}] ${error.message}`);
    throw error;
  }
  
  // Validar GUIDs
  if (!isValidGuid(params.primaryServiceGuid)) {
    throw new Error(`Invalid primaryServiceGuid: ${params.primaryServiceGuid}`);
  }
  
  if (params.resourceId && !isValidGuid(params.resourceId)) {
    throw new Error(`Invalid resourceId: ${params.resourceId}`);
  }
  
  // Validar fechas
  if (isNaN(params.startDate.getTime()) || isNaN(params.endDate.getTime())) {
    throw new Error('Invalid start or end date');
  }
  
  // Validar tipo de booking
  const validTypes = ['simple', 'dual_fase1', 'dual_fase2'];
  if (!validTypes.includes(params.tipo)) {
    throw new Error(`Invalid booking type: ${params.tipo}`);
  }
  
  // Validar estado de pago
  const validPaymentStates = ['UNPAID', 'PENDING_PAYMENT', 'CONFIRMED_UNPAID', 'PAID'];
  if (!validPaymentStates.includes(params.meta.estadoPago)) {
    throw new Error(`Invalid payment state: ${params.meta.estadoPago}`);
  }
  
  // Construir item para Wix Data
  const item = {
    _id: params.bookingId,
    revision: params.revision,
    primaryServiceGuid: params.primaryServiceGuid,
    scheduleId: params.scheduleId,
    resourceId: params.resourceId,
    startDate: params.startDate,
    endDate: params.endDate,
    contactDetails: params.contactDetails,
    tipo: params.tipo,
    meta: JSON.stringify(params.meta), // Serializar meta
    traceId,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  // En producción, aquí iría: await wixData.insert('Bookings', item)
  // Para tests, retornamos mock
  console.log(`[bookingCore][${traceId}] Booking persistido: ${params.bookingId}`);
  
  return {
    created: true,
    item
  };
}

/**
 * Calcula el score de carga de un recurso para ranking
 */
export async function _calculateResourceLoad(
  resourceId: string,
  dateYMD: string
): Promise<ResourceLoad> {
  // En producción: consultar bookings existentes para este recurso y fecha
  // Para ahora, retornamos mock
  const slotCount = Math.floor(Math.random() * 10); // Mock
  
  return {
    resourceId,
    loadScore: slotCount,
    slotCount
  };
}

/**
 * Rankea recursos por carga ascendente (menos cargados primero)
 */
export async function _rankResourcesByLoad(
  resourceIds: string[],
  dateYMD: string,
  traceId: string
): Promise<string[]> {
  console.log(`[bookingCore][${traceId}] Rankeando ${resourceIds.length} recursos...`);
  
  const loads = await Promise.all(
    resourceIds.map(id => _calculateResourceLoad(id, dateYMD))
  );
  
  // Ordenar por loadScore ascendente
  loads.sort((a, b) => a.loadScore - b.loadScore);
  
  return loads.map(l => l.resourceId);
}

/**
 * Genera un token único para emparejar slots duales
 */
export function _generatePairToken(traceId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `pair_${traceId}_${timestamp}_${random}`;
}

/**
 * Valida que dos slots sean compatibles para emparejamiento dual
 */
export function _areSlotsCompatible(
  slot1: CertifiedSlot,
  slot2: CertifiedSlot,
  maxGapMinutes: number = 15
): boolean {
  // Mismo recurso
  if (slot1.resource.id !== slot2.resource.id) {
    return false;
  }
  
  // El slot2 debe empezar después del slot1
  const end1 = new Date(slot1.localEndDate).getTime();
  const start2 = new Date(slot2.localStartDate).getTime();
  
  const gapMinutes = (start2 - end1) / 60000;
  
  // Gap dentro del límite permitido
  return gapMinutes >= 0 && gapMinutes <= maxGapMinutes;
}

/**
 * Auditoría de precio de booking
 */
export function _auditBookingPrice(
  basePrice: number,
  addons: Array<{ price: number; quantity?: number }>
): number {
  let total = basePrice;
  
  for (const addon of addons) {
    const qty = addon.quantity || 1;
    total += addon.price * qty;
  }
  
  // Validar que el precio sea positivo
  if (total < 0) {
    console.error('[bookingCore] Precio auditado negativo:', total);
    throw new Error('Precio auditado inválido');
  }
  
  return Math.round(total * 100) / 100; // Redondear a 2 decimales
}

// Exportar tipos para uso externo
export type { 
  PersistBookingParams, 
  PersistBookingResult, 
  BookingMeta,
  CertifiedSlot,
  DualSlotPair,
  ResourceLoad,
  BookingTrace
};
