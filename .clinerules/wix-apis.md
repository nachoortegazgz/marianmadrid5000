# APIS WIX V2 — MARIAN MADRID

## APIs Principales
| API | Uso |
|---|---|
| `wix-bookings.v2` | Reservas, servicios, disponibilidad |
| `wix-ecom-backend` | Checkout, pedidos |
| `wix-auth` | Elevación de privilegios |
| `wix-data` | Acceso a colecciones CMS |
| `wix-secrets-backend` | Acceso a secretos |
| `wix-crypto` | Hash y HMAC |
| `wix-members-backend` | Miembros y autenticación |

## Wix Bookings V2
### Funciones principales
- `availabilityTimeSlots.listAvailabilityTimeSlots()`
- `availabilityTimeSlots.getAvailabilityTimeSlot()`
- `bookings.createBooking()`
- `bookings.cancelBooking()`
- `bookings.queryBookings()`

### Payload de disponibilidad
```javascript
{
  serviceId: "GUID-servicio",
  fromLocalDate: "YYYY-MM-DDTHH:mm:ss",
  toLocalDate: "YYYY-MM-DDTHH:mm:ss",
  timeZone: "Europe/Madrid",
  bookable: true,
  locations: [{ id: LOCATION_ID, locationType: "BUSINESS" }],
  includeResourceTypeIds: [STAFF_RESOURCE_TYPE_ID],
  resourceTypes: [{ resourceTypeId: STAFF_RESOURCE_TYPE_ID, resourceIds: ["GUID"] }],
  customerChoices: { addOnIds: ["GUID-addon"] },
  timeSlotsPerDay: 1
}
```

## Wix eCommerce
### Checkout
- Usar `createCheckout()` con `channelType` definido
- Al menos una línea de pedido
- NO usar Cart V1 ni Checkout V1

### Pedidos
- Consultar entidad nativa antes de cambiar estado
- Webhook recomendado: `wixEcom_onOrderPaymentStatusUpdated`

## Wix Payments / Cashier
- Webhook de pago para estado/método
- Webhook de pedido para información del pedido
- Idempotencia por `eventId`, `transactionId`, `orderId`

## Wix Data
### Consultas
```javascript
// Correcto
const results = await wixData.query(COLLECTION)
  .eq("campo", valor)
  .limit(100)
  .find();

// Con paginación
const results = await wixData.query(COLLECTION)
  .eq("campo", valor)
  .limit(50)
  .skip(offset)
  .find();
```

### Hooks en data.js
```javascript
export function MovimientosCaja_beforeUpdate(item, context) {
  throw new Error("FISCAL_VIOLATION");
}

export function MovimientosCaja_beforeRemove(item, context) {
  throw new Error("FISCAL_VIOLATION");
}
```

## Wix Secrets
```javascript
import { getSecret } from 'wix-secrets-backend';

const fiscalKey = await getSecret("FISCAL_KEY");
```

## Wix Crypto
```javascript
import { createHash, createHmac, timingSafeEqual } from 'wix-crypto';

const hash = createHash("sha256").update(data).digest("hex");
const hmac = createHmac("sha256", key).update(data).digest("hex");
```

## Wix Auth
```javascript
import { elevate } from 'wix-auth';

const elevatedFunction = elevate(async () => {
  // Operación privilegiada
});
```

## Prohibiciones
- No usar APIs deprecated
- No usar IFrame SDK
- No hacer fetch/axios desde frontend a APIs Wix
- No usar Cart V1 ni Checkout V1
- No mezclar Stores Catalog V1 con V3