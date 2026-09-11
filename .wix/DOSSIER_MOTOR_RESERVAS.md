# DOSSIER MOTOR DE RESERVAS - INDICE

Contenido canonico en: `.agents/skills/wix/DOSSIER_MOTOR_RESERVAS.md`
(DOSSIER TECNICO - Motor de Reservas Online, version 0609 / 06-sep-2026).

Arquitectura del motor en este repositorio:
- Disponibilidad:   src/backend/reservas.web.js (slots, cache, resolucion serviceId)
- Orquestacion:     src/backend/citasManager.web.js
- Saga:             src/backend/booking/bookingSaga.js (saga transaccional compensable)
- Primitivas:       src/backend/booking/bookingCore.js (primitivas atomicas Wix)
- WebMethods:       src/backend/reservas.web.js + src/backend/citasManager.web.js
- Bridge frontend:  src/public/widgetBridge.js (handshake postMessage)

Modelo de reserva dual con gap:
  F1 (Aplicacion) -> Gap/Exposicion (Profesional LIBRE) -> F2 (Aclarado)
  [phase1Duration]   [exposureDuration]                    [phase2Duration]

IDs canonicos:
- serviceId    (servicio principal F1)
- linkFases    (servicio F2 / aclarado)
- resourceId   (profesional)
- pairToken    (reserva dual, idempotencia y lock)
- bookingId    (reserva nativa Wix)

Colecciones implicadas: SERVICIOS_CATALOGO, MAPA_STAFF, CITAS_F2,
AVAILABILITY_DAYS_CACHE, DUAL_SLOT_CACHE, BOOKING_TRANSACTIONS,
BOOKINGS_SERVICE_SYNC_QUEUE, COMPENSACIONES_PENDIENTES, SLOT_LOCKS.