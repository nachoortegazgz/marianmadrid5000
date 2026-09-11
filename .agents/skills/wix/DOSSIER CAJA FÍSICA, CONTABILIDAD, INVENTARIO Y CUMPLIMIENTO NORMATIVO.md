# DOSSIER TÉCNICO — CAJA FÍSICA, CONTABILIDAD, INVENTARIO Y CUMPLIMIENTO NORMATIVO

Sistema: **Marian Madrid Peluquería y Estética**
Versión de referencia: **v5002.4-definitiva**
Runtime: **Wix Velo / Wix SDK V2 / Wix Data CMS**
Zona horaria: **Europe/Madrid**
Moneda: **EUR**
Negocio: **C/ Maurice Ravel 35, Local, 50012 Zaragoza**
Marco normativo objetivo: **SIF / Veri*factu, IVA, facturación, contabilidad española, registro horario laboral, RGPD/LOPDGDD**

> **Nota de alcance:** este dossier se genera como documentación técnica canónica basada en la BIBLIA v5002.4, las Directrices V19, el Checklist del sitio y el Dossier del Motor de Reservas. Para certificar el código desplegado, debe auditarse el código real de los módulos de caja, inventario, contabilidad, hooks de `data.js` y webhooks de pagos/pedidos. El código puede implementar controles técnicos de cumplimiento, pero la certificación legal “100% cumplimiento” requiere validación externa fiscal, contable, laboral y de protección de datos.

---

## 1. OBJETO DEL DOSSIER

Este documento describe de forma profesional, descriptiva y técnica todos los flujos de trabajo del ecosistema Marian Madrid relacionados con:

1. **Transacciones en caja física del salón.**
2. **Cobros presenciales y online vinculados a reservas.**
3. **Ventas de productos físicos en salón y online.**
4. **Devoluciones, reembolsos y rectificaciones.**
5. **Movimientos de caja, arqueos X y cierres Z.**
6. **Inventario de productos para la venta.**
7. **Compras, gastos y facturas recibidas.**
8. **Contabilización automática en partida doble.**
9. **Libros de IVA expedidos y recibidos.**
10. **Eventos del sistema de facturación SIF / Veri*factu.**
11. **Registro horario laboral del personal.**
12. **Trazabilidad, auditoría y entrega documental al contable.**

El objetivo es que cada operación económica, laboral o administrativa quede registrada en las colecciones canónicas del CMS con:

- Identificación de fecha y período fiscal.
- Importe bruto, base imponible y cuota tributaria.
- Método de pago.
- Origen Wix o manual.
- Usuario responsable.
- Profesional o recurso vinculado.
- Reserva, pedido, devolución o factura relacionada.
- Cadena de integridad con hash y firma.
- Trazabilidad mediante `traceId`.
- Bloqueo de modificación o borrado cuando la norma lo exija.

---

## 2. ARQUITECTURA GENERAL DE TRANSACCIONES, CAJA, INVENTARIO Y CONTABILIDAD

```text
┌─────────────────────────────────────────────────────────────────┐
│                    CANALES DE ORIGEN                            │
│                                                                 │
│  Wix Bookings V2      Wix Stores V1      Wix eCommerce/Payments │
│  Wix Gift Cards       Wix Forms          TPV / Caja física      │
│  Wix Members          Wix Invoices       Registro horario staff │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│               CAPA DE VALIDACIÓN Y ORQUESTACIÓN                 │
│                                                                 │
│  · Validación de sesión, rol y permisos                         │
│  · Validación de idempotencia                                   │
│  · Validación de estado nativo Wix                              │
│  · Recálculo servidor de importes, impuestos y stock            │
│  · Generación de traceId                                        │
│  · Aplicación de Europe/Madrid                                  │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LEDGER TRANSACCIONAL Y FISCAL                   │
│                                                                 │
│  MOVIMIENTOS_CAJA        SECUENCIA_TICKETS     CAJA_ACTUAL      │
│  CONTROL_PARCIAL_X       HISTORICO_CIERRES_Z                    │
│  MOVIMIENTOS_INVENTARIO  INVENTARIO_STOCK_VENTA                 │
│  INVENTARIO_STOCK_VENTA_CIERRE                                  │
│  LIBRO_IVA_FACTURAS_EXPEDIDAS                                   │
│  LIBRO_IVA_FACTURAS_RECIBIDAS                                   │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 CAPA CONTABLE Y DE AUDITORÍA                    │
│                                                                 │
│  ASIENTOS_CONTABLES                                             │
│  LINEAS_ASIENTO_CONTABLE                                        │
│  LIBRO_MAYOR_CONTABLE_SALDOS                                    │
│  PLAN_CUENTAS_CONTABLES                                         │
│  EVENTOS_SISTEMA_FACTURACION                                    │
│  MM_AUDIT_LOG                                                   │
│  REGISTROS_HORARIOS_STAFF                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. WIX APPS NATIVAS INTERVINIENTES

| App Wix | Rol en el flujo económico | Tratamiento en el ecosistema |
|---|---|---|
| **Wix Bookings V2** | Servicios, profesionales, disponibilidad, reservas, confirmaciones, cancelaciones. | Fuente nativa de reservas. Cada reserva se refleja en `CitasF2` y, si hay cobro, en `MovimientosCaja`, libros fiscales y contabilidad. |
| **Wix Stores Catalog V1** | Catálogo de productos físicos, variantes, precios, inventario base. | Se usa Catalog V1. No se deben mezclar operaciones de Catalog V3. El inventario fiscal y contable se apoya en colecciones propias con `wixProductId` y `wixVariantId`. |
| **Wix eCommerce / Checkout** | Pedidos online, checkout, líneas de pedido, estados de pedido. | El pedido Wix es fuente confirmatoria. No se consolida contablemente hasta validar pago y pedido nativo. |
| **Wix Payments / Cashier** | Pagos, transacciones, reembolsos, estados de pago. | El evento de pago es la prueba principal. Se recomienda el webhook de pago de Wix Cashier cuando se requiere estado o método de pago. |
| **Wix Invoices** | Emisión documental de facturas. | No se escribe directamente de forma arbitraria. La emisión queda delegada y vinculada al ledger fiscal a través de los módulos autorizados. |
| **Wix Gift Cards** | Venta y canje de tarjetas regalo. | Debe reconciliarse con caja y contabilidad. La venta se trata como anticipo o pasivo hasta el canje, salvo criterio fiscal externo documentado. |
| **Wix Members Area** | Identidad, sesión, roles, acceso de personal. | Determina quién registra movimientos, cierres, ajustes, fichajes o devoluciones. |
| **Wix Forms** | Formularios, contacto, consentimientos. | No genera movimiento contable por sí mismo, pero alimenta contactos y evidencias de consentimiento RGPD. |
| **Wix Secrets Manager** | Claves criptográficas y secretos. | Almacena `FISCAL_KEY`, `AUTH_JWT_KEY`, `M365_WEBHOOK_HMAC_KEY` y otras claves. Nunca se exponen en frontend. |
| **Wix Auth** | Elevación de privilegios backend. | `wix-auth.elevate` para operaciones asíncronas, cron jobs, webhooks y escrituras protegidas. |
| **Wix Data** | CMS y colecciones propias. | Soporte del ledger fiscal, contable, laboral y de auditoría. |
| **Wix Crypto** | Hash y HMAC. | Motor de integridad para cadena fiscal, asientos, eventos de facturación y registros laborales. |

---

## 4. COLECCIONES CANÓNICAS RELACIONADAS

### 4.1 Caja física y operaciones presenciales

| Colección | Alias COLLECTIONS | Misión |
|---|---|---|
| `CAJA_ACTUAL` | `CAJA_ACTUAL` | Estado vivo de la caja abierta o cerrada, saldos por método de pago y última actividad. |
| `MOVIMIENTOS_CAJA` | `MOVIMIENTOS_CAJA` | Ledger inmutable de cobros, pagos, devoluciones, ajustes, anticipos y rectificaciones. |
| `CONTROL_PARCIAL_X` | `CONTROL_PARCIAL_X` | Arqueos parciales X sin cierre fiscal definitivo. |
| `HISTORICO_CIERRES_Z` | `HISTORICO_CIERRES_Z` | Cierres Z diarios o de turno, consolidados, inmutables y firmados. |
| `SECUENCIA_TICKETS` | `SECUENCIA_TICKETS` | Contadores secuenciales de tickets y facturas por serie y período. |

### 4.2 Inventario

| Colección | Alias COLLECTIONS | Misión |
|---|---|---|
| `INVENTARIO_STOCK_VENTA` | `INVENTARIO_STOCK_VENTA` | Maestro de artículos a la venta con SKU, precio, coste, stock y vínculo Wix. |
| `MOVIMIENTOS_INVENTARIO` | `MOVIMIENTOS_INVENTARIO` | Movimientos de entrada, salida, devolución, ajuste, compra y regularización. |
| `INVENTARIO_STOCK_VENTA_CIERRE` | `INVENTARIO_STOCK_VENTA_CIERRE` | Cierre de inventario valorado por ejercicio fiscal. |
| `PROVEEDORES_LISTA` | `PROVEEDORES_LISTA` | Proveedores y condiciones comerciales básicas. |

### 4.3 Fiscal y contable

| Colección | Alias COLLECTIONS | Misión |
|---|---|---|
| `CONFIGURACION_FISCAL` | `CONFIGURACION_FISCAL` | Datos del negocio, NIF, régimen, series de factura, moneda y zona horaria. |
| `LIBRO_IVA_FACTURAS_EXPEDIDAS` | `LIBRO_IVA_FACTURAS_EXPEDIDAS` | Libro de facturas emitidas y tickets simplificados con IVA repercutido. |
| `LIBRO_IVA_FACTURAS_RECIBIDAS` | `LIBRO_IVA_FACTURAS_RECIBIDAS` | Libro de facturas recibidas con IVA soportado y gasto deducible. |
| `PLAN_CUENTAS_CONTABLES` | `PLAN_CUENTAS_CONTABLES` | Plan General Contable adaptado al negocio. |
| `ASIENTOS_CONTABLES` | `ASIENTOS_CONTABLES` | Asientos en partida doble con integridad y traza. |
| `LINEAS_ASIENTO_CONTABLE` | `LINEAS_ASIENTO_CONTABLE` | Líneas de debe y haber por cuenta, impuesto y concepto. |
| `LIBRO_MAYOR_CONTABLE_SALDOS` | `LIBRO_MAYOR_CONTABLE_SALDOS` | Saldos por cuenta y período. |

### 4.4 Auditoría, facturación y laboral

| Colección | Alias COLLECTIONS | Misión |
|---|---|---|
| `EVENTOS_SISTEMA_FACTURACION` | `EVENTOS_SISTEMA_FACTURACION` | Eventos SIF/Veri*factu: emisión, rectificación, cierre, error, validación. |
| `MM_AUDIT_LOG` | `MM_AUDIT_LOG` | Auditoría operativa general con PII enmascarada. |
| `REGISTROS_HORARIOS_STAFF` | `REGISTROS_HORARIOS_STAFF` | Fichajes laborales inmutables del personal. |

### 4.5 Colecciones de soporte transaccional

| Colección | Misión |
|---|---|
| `CITAS_F2` | Reservas simples y duales, estado de pago, recurso, servicio y traza. |
| `BOOKING_TRANSACTIONS` | Idempotencia de sagas de reserva. |
| `COMPENSACIONES_PENDIENTES` | Reintentos de cancelaciones, reembolsos o compensaciones fallidas. |
| `MAPA_STAFF` | Personal activo, `resourceId`, roles, contacto y horario. |
| `SERVICIOS_CATALOGO` | Servicios con precio, duración, impuestos y disponibilidad. |
| `COMPLEMENTOS_CATALOGO` | Complementos asociados a servicios. |
| `ALERTAS_OPERATIVAS` | Alertas de descuadre, stock bajo, fallo de hash, webhook fallido, etc. |

---

## 5. PRINCIPIOS DE CUMPLIMIENTO APLICABLES

### 5.1 Fiscal y facturación

El sistema está diseñado para alinearse con:

- Reglamento de facturación y obligaciones de expedición de facturas o tickets.
- IVA: correcta separación de base imponible, cuota y tipo impositivo.
- SIF / Veri*factu según RD 1007/2023 y Orden HAC/1177/2024.
- Secuencialidad de facturas y tickets.
- Conservación de registros.
- Trazabilidad de rectificaciones.
- Eventos de facturación con hash y firma.
- No alteración posterior de registros fiscales.

### 5.2 Contable

El sistema debe permitir:

- Registro en partida doble.
- Asientos cuadrados: `totalDebe === totalCredit`.
- Relación entre asiento, factura, movimiento de caja, pedido, reserva o devolución.
- Libro Mayor por cuenta y período.
- Cierre de ejercicio con inventario valorado.
- Evidencia de origen de cada apunte.

### 5.3 Laboral

El sistema implementa:

- Registro diario de jornada mediante `REGISTROS_HORARIOS_STAFF`.
- Inmutabilidad de fichajes.
- Identificación del recurso mediante `resourceId`.
- Identificación del trabajador mediante `employeeIdentifier` y `employeeName`.
- Registro de tipo de evento: `ENTRADA`, `SALIDA`, `PAUSA_INICIO`, `PAUSA_FIN`, `AJUSTE`.
- Registro de responsable del fichaje: `registeredBy`, `registeredByMemberId`.
- Firma del registro.
- Exportación para gestoría o contable.

### 5.4 Protección de datos

El sistema aplica privacidad por diseño:

- Minimización de datos personales.
- Enmascarado de PII en logs.
- Acceso por roles.
- Consentimiento en formularios.
- Conservación limitada según finalidad.
- Registro de auditoría sin datos innecesarios.
- No exposición de secretos.
- Cumplimiento RGPD/LOPDGDD sujeto a validación externa y políticas legales del sitio.

---

## 6. FLUJO 1 — APERTURA DE CAJA FÍSICA

### 6.1 Descripción

Un usuario autorizado abre la sesión de caja del salón. El sistema crea o actualiza el singleton `CAJA_ACTUAL` con estado `ABIERTA`.

### 6.2 Origen

- Dashboard interno o módulo de caja.
- Autenticación Wix Members.
- Rol permitido: `ADMIN`, `GESTION` o usuario con permiso de caja.

### 6.3 Validaciones

- No puede existir una caja abierta para la misma `operationDate` salvo recuperación controlada.
- La fecha se calcula en `Europe/Madrid`.
- Se registra `traceId`.
- Se audita en `MM_AUDIT_LOG`.

### 6.4 Colecciones afectadas

#### `CAJA_ACTUAL`

Campos clave:

| Campo técnico | Uso |
|---|---|
| `operationDate` | Fecha operativa en formato `YYYY-MM-DD`. |
| `cashRegisterStatus` | `ABIERTA`. |
| `totalBalance` | Saldo total inicial o acumulado. |
| `cashBalance` | Saldo efectivo. |
| `cardBalance` | Saldo tarjeta. |
| `bizumBalance` | Saldo Bizum. |
| `onlineBalance` | Saldo online. |
| `totalOperations` | Número de operaciones. |
| `openedAt` | Fecha/hora de apertura. |
| `lastActivityAt` | Última actividad. |

#### `MM_AUDIT_LOG`

Campos clave:

| Campo técnico | Uso |
|---|---|
| `eventType` | `CASH_OPEN`. |
| `level` | `INFO`. |
| `source` | Módulo de caja. |
| `traceId` | Trazabilidad. |
| `loggedAt` | Fecha de auditoría. |

#### `EVENTOS_SISTEMA_FACTURACION`

Opcionalmente:

| Campo técnico | Uso |
|---|---|
| `eventType` | `CASH_SESSION_OPEN`. |
| `severity` | `INFO`. |
| `result` | `SUCCESS`. |
| `eventSource` | Caja. |
| `responsibleMemberId` | Usuario que abre caja. |

### 6.5 Normativa relacionada

- Control interno de caja.
- Trazabilidad operativa.
- Base para arqueo y cierre diario.

### 6.6 Documento para contable

- Apertura de caja con fecha, usuario y saldo inicial.
- Si existe fondo inicial, movimiento de caja tipo `APERTURA` o `FONDO_INICIAL`.

---

## 7. FLUJO 2 — COBRO PRESENCIAL DE UNA RESERVA WIX BOOKINGS

### 7.1 Descripción

Una cliente recibe un servicio en el salón. La reserva existe en Wix Bookings V2 y se refleja en `CitasF2`. El cobro se registra en caja física o TPV del salón.

### 7.2 Origen

- Wix Bookings V2.
- TPV o módulo de caja.
- Profesional vinculado mediante `resourceId`.

### 7.3 Validaciones

- La reserva existe en `CitasF2`.
- El estado de pago no es ya `PAID` o `REFUNDED`.
- El usuario tiene permiso para cobrar.
- El servicio tiene precio, tipo de IVA y duración correctos.
- El importe se recalcula en servidor.
- Se genera `traceId`.

### 7.4 Colecciones afectadas

#### `CITAS_F2`

Actualización de estado:

| Campo técnico | Uso |
|---|---|
| `paymentStatus` | `PAID`. |
| `status` | Estado operativo de la cita. |
| `traceId` | Trazabilidad del cobro. |
| `meta` | Puede incluir referencia de pago presencial. |

#### `MOVIMIENTOS_CAJA`

Registro principal del cobro:

| Campo técnico | Contenido |
|---|---|
| `sequenceNumber` | Número secuencial del ticket. |
| `invoiceNumber` | Número de factura o ticket simplificado. |
| `operationDate` | Fecha en `Europe/Madrid`. |
| `fiscalPeriod` | Período fiscal, por ejemplo `2026-09`. |
| `movementType` | `VENTA_SERVICIO`. |
| `operationNature` | `INGRESO`. |
| `paymentMethod` | `EFECTIVO`, `TARJETA`, `BIZUM` u `ONLINE`. |
| `totalAmount` | Importe total IVA incluido. |
| `taxableAmount` | Base imponible. |
| `taxAmount` | Cuota IVA. |
| `taxRate` | Tipo aplicado, por ejemplo `0.21`. |
| `taxTreatment` | `REPERCUTIDO`. |
| `accountingSign` | `1`. |
| `accountingAmount` | Importe contable. |
| `description` | Concepto legible. |
| `lineItems` | Líneas del servicio, complemento, precio y cuenta. |
| `rectifiedInvoiceReference` | Vacío si no es rectificativa. |
| `previousRecordHash` | Hash del movimiento anterior. |
| `currentRecordHash` | Hash del movimiento actual. |
| `digitalSignature` | Firma HMAC con secreto fiscal. |
| `businessTaxId` | NIF del negocio. |
| `schemaIntegrityVersion` | Versión del esquema de integridad. |
| `recordSource` | `POS`, `BOOKING`, `MANUAL`, etc. |
| `reservaIdVinculada` | `bookingId` Wix. |
| `transactionId` | Referencia de pago si existe. |
| `resourceId` | Profesional que realizó el servicio. |
| `registeredAt` | Fecha de registro. |
| `traceId` | Trazabilidad. |

#### `SECUENCIA_TICKETS`

Actualización del contador:

| Campo técnico | Uso |
|---|---|
| `sequenceCounters` | Contadores por serie, año o tipo de documento. |

#### `LIBRO_IVA_FACTURAS_EXPEDIDAS`

Registro del IVA repercutido:

| Campo técnico | Contenido |
|---|---|
| `invoiceNumber` | Número de factura/ticket. |
| `invoiceSeries` | Serie documental. |
| `issueDate` | Fecha de expedición. |
| `operationDate` | Fecha de operación. |
| `fiscalYear` | Ejercicio. |
| `fiscalPeriod` | Período. |
| `invoiceType` | `SIMPLIFICADA`, `ORDINARIA`, etc. |
| `totalInvoiceAmount` | Total. |
| `taxableAmount` | Base imponible. |
| `taxRate` | Tipo IVA. |
| `outputTaxAmount` | IVA repercutido. |
| `incomeConcept` | Servicio cobrado. |
| `recipientTaxId` | NIF cliente si factura completa. |
| `recipientName` | Nombre cliente si factura completa. |
| `operationKey` | Clave de operación. |
| `collectionMethod` | Efectivo, tarjeta, Bizum, online. |
| `traceId` | Trazabilidad. |

#### `ASIENTOS_CONTABLES`

Asiento de ingreso:

| Campo técnico | Contenido |
|---|---|
| `journalEntryId` | ID único del asiento. |
| `entryNumber` | Número de asiento. |
| `fiscalYear` | Ejercicio. |
| `fiscalPeriod` | Período. |
| `operationDate` | Fecha. |
| `entryConcept` | Cobro servicio. |
| `totalDebit` | Total debe. |
| `totalCredit` | Total haber. |
| `totalDocumentAmount` | Importe documento. |
| `entryType` | `INGRESO_SERVICIO`. |
| `entryStatus` | `POSTED`. |
| `paymentMethod` | Método de pago. |
| `wixBookingId` | Reserva vinculada. |
| `invoiceNumber` | Factura/ticket. |
| `previousHash` | Hash anterior. |
| `entryHash` | Hash del asiento. |
| `entrySignature` | Firma. |
| `traceId` | Trazabilidad. |

#### `LINEAS_ASIENTO_CONTABLE`

Ejemplo configurable:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Caja o banco según método | Total IVA incluido | 0 |
| 2 | Ingresos por servicios | 0 | Base imponible |
| 3 | IVA repercutido | 0 | Cuota IVA |

Las cuentas concretas se obtienen de `PLAN_CUENTAS_CONTABLES`.

#### `EVENTOS_SISTEMA_FACTURACION`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `INVOICE_ISSUED` o `SIMPLIFIED_INVOICE_ISSUED`. |
| `result` | `SUCCESS`. |
| `eventSource` | Caja / facturación. |
| `transactionId` | Movimiento relacionado. |
| `eventHash` | Hash del evento. |
| `eventSignature` | Firma. |

#### `MM_AUDIT_LOG`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `BOOKING_POS_CHARGE`. |
| `level` | `INFO`. |
| `resourceId` | Profesional. |
| `traceId` | Trazabilidad. |

### 7.5 Normativa relacionada

- Facturación.
- IVA repercutido.
- Registro de ingresos.
- Contabilidad.
- Trazabilidad SIF.

### 7.6 Documento para contable

- Ticket o factura simplificada.
- Movimiento de caja.
- Asiento contable.
- Línea de libro de IVA expedidas.
- Relación con reserva Wix y profesional.

---

## 8. FLUJO 3 — COBRO ONLINE DE UNA RESERVA

### 8.1 Descripción

Una cliente paga online una reserva mediante Wix eCommerce / Wix Payments. El sistema no confía en el estado local: espera el evento nativo de pago o pedido.

### 8.2 Origen

- Wix Bookings V2.
- Wix eCommerce Checkout.
- Wix Payments / Cashier.
- Webhook recomendado: evento de pago de Wix Cashier cuando se requiere estado o método de pago.
- Webhook de pedido cuando se requiere información del pedido.

### 8.3 Validaciones

- El pago no se acepta por estado local.
- Se valida idempotencia por `eventId`, `orderId`, `transactionId` o combinación equivalente.
- Se consulta la entidad nativa antes de cambiar estado de negocio.
- Se verifica importe, moneda y estado.
- Se genera `traceId`.

### 8.4 Colecciones afectadas

#### `BOOKING_TRANSACTIONS`

| Campo técnico | Uso |
|---|---|
| `pairToken` | Token estable de la reserva. |
| `status` | `COMPLETED` tras pago válido. |
| `payloadHash` | Hash del payload. |
| `result` | Resultado consolidado. |
| `traceId` | Trazabilidad. |

#### `CITAS_F2`

| Campo técnico | Uso |
|---|---|
| `paymentStatus` | `PAID` o `PENDING_LEDGER` si falta contabilización. |
| `traceId` | Trazabilidad. |

#### `MOVIMIENTOS_CAJA`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `VENTA_SERVICIO` o `ANTICIPO_RESERVA`. |
| `operationNature` | `INGRESO`. |
| `paymentMethod` | `ONLINE`. |
| `transactionId` | Referencia de transacción Wix. |
| `reservaIdVinculada` | `bookingId`. |
| `recordSource` | `WEBHOOK_PAGO`. |
| `currentRecordHash` | Hash del movimiento. |
| `digitalSignature` | Firma fiscal. |

#### `LIBRO_IVA_FACTURAS_EXPEDIDAS`

Mismo criterio que cobro presencial, pero con método de cobro online.

#### `ASIENTOS_CONTABLES` y `LINEAS_ASIENTO_CONTABLE`

Asiento configurable:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Banco / pasarela / cuenta de cobros online | Total | 0 |
| 2 | Ingresos servicios o anticipos | 0 | Base |
| 3 | IVA repercutido | 0 | Cuota |

Si es anticipo:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Banco / pasarela | Total | 0 |
| 2 | Anticipos de clientes | 0 | Base |
| 3 | IVA según tratamiento | 0 | Cuota |

El tratamiento exacto del anticipo debe ser validado por asesoría fiscal.

#### `EVENTOS_SISTEMA_FACTURACION`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `PAYMENT_CONFIRMED`, `INVOICE_ISSUED`, `ADVANCE_PAYMENT_RECORDED`. |
| `referenceId` | `orderId`, `transactionId`, `bookingId`. |
| `eventHash` | Hash. |
| `eventSignature` | Firma. |

### 8.5 Normativa relacionada

- Pagos online.
- IVA.
- Facturación.
- Conservación de evidencias de pago.
- SIF / Veri*factu.

### 8.6 Documento para contable

- Extracto de pago Wix.
- Movimiento de caja online.
- Factura o ticket.
- Asiento contable.
- Libro de IVA expedidas.

---

## 9. FLUJO 4 — VENTA DE PRODUCTO FÍSICO EN SALÓN

### 9.1 Descripción

El salón vende un producto físico directamente a la cliente, por ejemplo champú, tratamiento o tarjeta regalo física. El producto puede estar vinculado al catálogo Wix Stores V1.

### 9.2 Origen

- TPV / caja física.
- Catálogo `INVENTARIO_STOCK_VENTA`.
- Opcionalmente referencia a producto Wix Stores: `wixProductId`, `wixVariantId`.

### 9.3 Validaciones

- El artículo existe y está activo.
- Hay stock suficiente o se autoriza stock negativo excepcional.
- Precio e IVA se recalculan en servidor.
- Se descuenta inventario de forma idempotente.
- Se genera `movementToken`.
- Se genera `traceId`.

### 9.4 Colecciones afectadas

#### `INVENTARIO_STOCK_VENTA`

| Campo técnico | Uso |
|---|---|
| `sku` | Código de artículo. |
| `productName` | Nombre del producto. |
| `salePriceTaxIncluded` | Precio venta IVA incluido. |
| `costExTax` | Coste sin impuesto. |
| `stockExpected` | Stock después del movimiento. |
| `lastInventoryMovementAt` | Fecha del último movimiento. |
| `lastInventoryMovementId` | ID del último movimiento. |
| `wixProductId` | Producto Wix Stores. |
| `wixVariantId` | Variante Wix Stores. |
| `needsWixReconciliation` | Si requiere conciliación con Wix. |

#### `MOVIMIENTOS_INVENTARIO`

| Campo técnico | Contenido |
|---|---|
| `movementToken` | Token idempotente. |
| `sku` | Artículo. |
| `productName` | Nombre. |
| `quantity` | Cantidad vendida. |
| `quantityDelta` | Delta negativo. |
| `stockBefore` | Stock previo. |
| `stockAfter` | Stock posterior. |
| `movementType` | `SALE`, `POS_SALE`, `OUT`. |
| `reason` | Venta en salón. |
| `referenceId` | Referencia ticket o movimiento caja. |
| `actorEmail` | Usuario operador. |
| `actorMemberId` | ID miembro. |
| `requiresWixReconciliation` | Booleano. |
| `nativeCommercialMovement` | Si impacta catálogo nativo. |
| `wixProductId` | Producto Wix. |
| `wixVariantId` | Variante Wix. |
| `traceId` | Trazabilidad. |

#### `MOVIMIENTOS_CAJA`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `VENTA_PRODUCTO`. |
| `operationNature` | `INGRESO`. |
| `paymentMethod` | `EFECTIVO`, `TARJETA`, `BIZUM`, `ONLINE`. |
| `totalAmount` | Total cobrado. |
| `taxableAmount` | Base. |
| `taxAmount` | IVA. |
| `lineItems` | Array con SKU, cantidad, precio, cuenta y tasa. |
| `invoiceNumber` | Ticket/factura. |
| `currentRecordHash` | Hash. |
| `digitalSignature` | Firma. |

#### `LIBRO_IVA_FACTURAS_EXPEDIDAS`

Registro de venta de producto con IVA repercutido.

#### `ASIENTOS_CONTABLES`

Asiento configurable de venta de mercaderías:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Caja/banco | Total | 0 |
| 2 | Venta de mercaderías | 0 | Base |
| 3 | IVA repercutido | 0 | Cuota |

Coste de la mercancía vendida:

El sistema puede registrar la salida de existencias y su coste mediante cuentas configurables. La cuenta exacta depende del método contable validado por el contable.

#### `MM_AUDIT_LOG`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `POS_PRODUCT_SALE`. |
| `level` | `INFO`. |
| `traceId` | Trazabilidad. |

### 9.5 Normativa relacionada

- Venta minorista.
- IVA.
- Ticket o factura simplificada.
- Control de inventario.
- Contabilidad de existencias.

### 9.6 Documento para contable

- Ticket/factura.
- Movimiento de caja.
- Movimiento de inventario.
- Asiento de venta.
- Libro IVA expedidas.
- Conciliación con Wix Stores si aplica.

---

## 10. FLUJO 5 — VENTA ONLINE DE PRODUCTO WIX STORES

### 10.1 Descripción

Una cliente compra un producto en la tienda online. Wix Stores Catalog V1 gestiona catálogo y checkout eCommerce. El sistema consolida contablemente tras confirmar pedido y pago.

### 10.2 Origen

- Wix Stores V1.
- Wix eCommerce Checkout.
- Wix Payments / Cashier.
- Webhooks de pedido y pago.

### 10.3 Validaciones

- El pedido Wix existe.
- El pago está confirmado por evento nativo.
- Las líneas de pedido contienen producto, cantidad, precio e impuestos.
- El inventario se descuenta o reconcilia.
- No se procesa dos veces el mismo pedido.
- Se genera `traceId`.

### 10.4 Colecciones afectadas

#### `INVENTARIO_STOCK_VENTA`

Actualización de stock por venta online.

#### `MOVIMIENTOS_INVENTARIO`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `ONLINE_SALE`, `SALE`, `OUT`. |
| `referenceId` | `orderId`. |
| `orderId` | Pedido Wix. |
| `sku` | SKU vendido. |
| `quantityDelta` | Negativo. |
| `stockBefore` / `stockAfter` | Control de stock. |
| `requiresWixReconciliation` | Verdadero si Wix también descuenta stock. |

#### `MOVIMIENTOS_CAJA`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `VENTA_PRODUCTO_ONLINE`. |
| `operationNature` | `INGRESO`. |
| `paymentMethod` | `ONLINE`. |
| `transactionId` | Transacción Wix. |
| `totalAmount` | Total pedido. |
| `lineItems` | Líneas del pedido. |
| `recordSource` | `WEBHOOK_ORDER` o `WEBHOOK_PAYMENT`. |

#### `LIBRO_IVA_FACTURAS_EXPEDIDAS`

Registro de venta online.

#### `ASIENTOS_CONTABLES`

Asiento de venta online:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Pasarela/banco | Total | 0 |
| 2 | Venta mercaderías | 0 | Base |
| 3 | IVA repercutido | 0 | Cuota |

Si hay gastos de envío:

- Se contabilizan como ingreso o servicio según criterio contable.
- Se registra tipo IVA aplicable validado por asesoría.

#### `EVENTOS_SISTEMA_FACTURACION`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `ECOM_ORDER_PAID`, `INVOICE_ISSUED`. |
| `referenceId` | `orderId`. |
| `transactionId` | Pago. |

### 10.5 Normativa relacionada

- Comercio electrónico.
- Facturación.
- IVA.
- Conservación de pedidos y pagos.
- Derecho de desistimiento y devoluciones, si aplica.

### 10.6 Documento para contable

- Pedido Wix.
- Pago Wix.
- Factura/ticket.
- Movimiento de caja online.
- Movimiento de inventario.
- Asiento contable.
- Libro IVA expedidas.

---

## 11. FLUJO 6 — DEVOLUCIONES Y REEMBOLSOS

### 11.1 Descripción

Se produce una devolución total o parcial de un servicio, producto o reserva. Puede originarse en Wix Payments, Wix eCommerce, Wix Bookings o caja física.

### 11.2 Origen

- Reembolso online Wix Payments.
- Devolución en salón.
- Cancelación de reserva con reembolso.
- Devolución de producto físico.

### 11.3 Validaciones críticas

- No se acepta doble reembolso para el mismo `refundId`.
- El reembolso debe estar confirmado por entidad nativa Wix si es online.
- Si es físico, requiere autorización de rol competente.
- Debe existir factura, ticket o movimiento original referenciado.
- El stock debe actualizarse si vuelve un producto.
- Se genera `traceId`.

### 11.4 Colecciones afectadas

#### `MOVIMIENTOS_CAJA`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `DEVOLUCION_SERVICIO`, `DEVOLUCION_PRODUCTO`, `REEMBOLSO_RESERVA`. |
| `operationNature` | `EGRESO` o `RECTIFICACION`. |
| `paymentMethod` | Método del reembolso. |
| `totalAmount` | Importe negativo o con signo contable `-1`. |
| `accountingSign` | `-1`. |
| `rectifiedInvoiceReference` | Factura/ticket original. |
| `refundId` | ID reembolso Wix. |
| `transactionId` | Transacción original. |
| `reservaIdVinculada` | Reserva si aplica. |
| `currentRecordHash` | Hash. |
| `digitalSignature` | Firma. |

#### `LIBRO_IVA_FACTURAS_EXPEDIDAS`

Rectificación:

| Campo técnico | Contenido |
|---|---|
| `invoiceNumber` | Número de rectificación. |
| `rectifiedInvoiceId` | Factura original. |
| `invoiceType` | `RECTIFICATIVA`. |
| `totalInvoiceAmount` | Importe negativo o rectificativo. |
| `outputTaxAmount` | IVA rectificativo. |

#### `MOVIMIENTOS_INVENTARIO`

Si vuelve producto:

| Campo técnico | Contenido |
|---|---|
| `movementType` | `RETURN`, `IN`. |
| `quantityDelta` | Positivo. |
| `stockBefore` / `stockAfter` | Control. |
| `refundId` | Reembolso relacionado. |
| `referenceId` | Movimiento original. |

#### `ASIENTOS_CONTABLES`

Asiento de devolución configurable:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Devoluciones de ventas o cuenta correctora | Base | 0 |
| 2 | IVA repercutido rectificado | Cuota | 0 |
| 3 | Caja/banco/pasarela | 0 | Total |

Para producto devuelto a existencias:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Existencias o cuenta configurada | Coste | 0 |
| 2 | Coste de ventas / variación existencias | 0 | Coste |

#### `COMPENSACIONES_PENDIENTES`

Si el reembolso no pudo ejecutarse inmediatamente:

| Campo técnico | Contenido |
|---|---|
| `kind` | `REFUND`. |
| `bookingId` | Reserva. |
| `orderId` | Pedido. |
| `refundId` | Reembolso. |
| `amount` | Importe. |
| `paymentMethod` | Método. |
| `status` | `PENDING`, `RETRYING`, `FAILED`, `COMPLETED`. |
| `attempts` | Intentos. |
| `lastError` | Error. |
| `traceId` | Trazabilidad. |

#### `EVENTOS_SISTEMA_FACTURACION`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `REFUND_PROCESSED`, `RECTIFIED_INVOICE_ISSUED`. |
| `severity` | `INFO` o `WARNING`. |
| `referenceId` | `refundId`. |

### 11.5 Normativa relacionada

- Rectificación de facturas.
- IVA rectificativo.
- Reembolsos.
- Evidencia de devolución.
- Protección al consumidor.

### 11.6 Documento para contable

- Factura/ticket original.
- Documento rectificativo.
- Movimiento de caja negativo.
- Reembolso Wix si online.
- Movimiento de inventario si hay retorno.
- Asiento contable.
- Libro IVA expedidas rectificado.

---

## 12. FLUJO 7 — TARJETAS REGALO

### 12.1 Descripción

El sistema contempla venta y canje de tarjetas regalo, ya sea mediante Wix Gift Cards o mediante registro manual en caja.

### 12.2 Tratamiento recomendado

La venta de una tarjeta regalo no siempre constituye ingreso definitivo inmediato. Habitualmente puede tratarse como anticipo o pasivo hasta el canje, salvo criterio fiscal validado.

### 12.3 Venta de tarjeta regalo

#### `MOVIMIENTOS_CAJA`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `VENTA_TARJETA_REGALO` o `ANTICIPO_TARJETA_REGALO`. |
| `operationNature` | `INGRESO`. |
| `paymentMethod` | Método de cobro. |
| `taxTreatment` | Según criterio fiscal validado. |
| `description` | Tarjeta regalo, importe y referencia. |
| `referenceId` | ID de tarjeta regalo. |

#### `ASIENTOS_CONTABLES`

Ejemplo configurable:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Caja/banco | Total | 0 |
| 2 | Anticipos de clientes / pasivo tarjeta regalo | 0 | Base o total según criterio |

### 12.4 Canje de tarjeta regalo

Cuando la cliente usa la tarjeta para pagar un servicio o producto:

#### `MOVIMIENTOS_CAJA`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `CANJE_TARJETA_REGALO`. |
| `operationNature` | `INGRESO_NO_COBRADO` o `APLICACION_ANTICIPO`. |
| `paymentMethod` | `TARJETA_REGALO`. |
| `referenceId` | ID tarjeta. |
| `description` | Canje por servicio/producto. |

#### Reconocimiento de ingreso

Si el canje paga un servicio:

- Se genera ingreso por servicio.
- Se aplica IVA según servicio.
- Se registra factura/ticket.
- Se contabiliza contra anticipo.

#### `ASIENTOS_CONTABLES`

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Anticipo tarjeta regalo | Importe aplicado | 0 |
| 2 | Ingresos servicio/producto | 0 | Base |
| 3 | IVA repercutido | 0 | Cuota |

### 12.5 Conciliación con Wix Gift Cards

Cada venta o canje debe reconciliarse con:

- ID de tarjeta regalo.
- Importe emitido.
- Importe canjeado.
- Saldo restante.
- Fecha de caducidad.
- Cliente o referencia.
- Usuario responsable.

Si la integración nativa no escribe automáticamente en el ledger, se debe generar un informe de conciliación y registrar manualmente mediante módulo autorizado.

### 12.6 Documento para contable

- Venta de tarjetas.
- Canjes.
- Saldos pendientes.
- Asientos de anticipo.
- Asientos de reconocimiento de ingreso.
- Conciliación con Wix Gift Cards.

---

## 13. FLUJO 8 — MOVIMIENTOS MANUALES DE CAJA: APORTE, RETIRO, AJUSTE

### 13.1 Descripción

El salón puede necesitar movimientos no asociados directamente a una venta: fondo inicial, retiro para banco, pago a proveedor, gasto menor, ajuste por descuadre, etc.

### 13.2 Roles permitidos

- `ADMIN`.
- `GESTION` con permiso de caja.
- Determinados movimientos sensibles pueden requerir `ADMIN`.

### 13.3 Tipos de movimiento

| Tipo | Ejemplo |
|---|---|
| `APORTE` | Entrada de efectivo para cambio. |
| `RETIRO` | Retirada de efectivo para ingreso bancario. |
| `AJUSTE` | Corrección por descuadre justificado. |
| `GASTO` | Gasto operativo con o sin factura. |
| `PAGO_PROVEEDOR` | Pago de factura de proveedor. |
| `ANTICIPO` | Cobro anticipado. |
| `FONDO_INICIAL` | Fondo de apertura. |

### 13.4 Validaciones

- Motivo obligatorio.
- Importe positivo o negativo según naturaleza.
- Autorización según rol.
- Asociación a factura recibida si es gasto deducible.
- Registro de `traceId`.
- Auditoría en `MM_AUDIT_LOG`.

### 13.5 Colecciones afectadas

#### `MOVIMIENTOS_CAJA`

| Campo técnico | Contenido |
|---|---|
| `movementType` | Tipo manual. |
| `operationNature` | `INGRESO`, `EGRESO`, `AJUSTE`. |
| `paymentMethod` | `EFECTIVO`, `TARJETA`, `BIZUM`, `ONLINE`, `TARJETA_REGALO`. |
| `description` | Motivo claro. |
| `taxTreatment` | `SOPORTADO`, `EXENTO`, `NO_SUJETO`, etc. |
| `accountingSign` | `1` o `-1`. |
| `previousRecordHash` | Hash previo. |
| `currentRecordHash` | Hash actual. |
| `digitalSignature` | Firma. |

#### `LIBRO_IVA_FACTURAS_RECIBIDAS`

Si el gasto tiene factura recibida deducible.

#### `ASIENTOS_CONTABLES`

Según naturaleza del gasto o movimiento.

#### `MM_AUDIT_LOG`

Registro de acción manual.

### 13.6 Documento para contable

- Justificante interno.
- Movimiento de caja.
- Factura recibida si existe.
- Asiento contable.
- Autorización y usuario responsable.

---

## 14. FLUJO 9 — ARQUEO PARCIAL X

### 14.1 Descripción

El arqueo X permite contar el efectivo en caja durante la jornada sin cerrar fiscalmente el día.

### 14.2 Origen

- Usuario de caja.
- Módulo TPV.
- Dashboard interno.

### 14.3 Validaciones

- Debe existir caja abierta.
- El conteo se registra con fecha/hora.
- Se compara contra efectivo esperado.
- Se calcula descuadre.
- No genera cierre Z.

### 14.4 Colecciones afectadas

#### `CONTROL_PARCIAL_X`

| Campo técnico | Contenido |
|---|---|
| `operationDate` | Fecha operativa. |
| `countedCash` | Efectivo contado. |
| `expectedCash` | Efectivo esperado según movimientos. |
| `discrepancyAmount` | Diferencia. |
| `reconciliationStatus` | `CUADRADA`, `DESCUADRE_POSITIVO`, `DESCUADRE_NEGATIVO`. |
| `countedAt` | Fecha del conteo. |
| `reconciledAt` | Fecha de validación. |
| `traceId` | Trazabilidad. |

#### `ALERTAS_OPERATIVAS`

Si hay descuadre:

| Campo técnico | Contenido |
|---|---|
| `alertType` | `CASH_DISCREPANCY`. |
| `severity` | `WARNING` o `ERROR`. |
| `message` | Descripción del descuadre. |
| `status` | `OPEN`. |
| `traceId` | Trazabilidad. |

#### `MM_AUDIT_LOG`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `CASH_X_COUNT`. |
| `level` | `INFO`. |

### 14.5 Documento para contable

- Informe de arqueo X.
- Conteo, esperado y diferencia.
- Usuario responsable.
- Fecha/hora.
- Estado de conciliación.

---

## 15. FLUJO 10 — CIERRE Z DE CAJA

### 15.1 Descripción

El cierre Z consolida la jornada o turno. Es el cierre operativo y fiscal principal de caja. Una vez generado, es inmutable.

### 15.2 Origen

- Usuario autorizado.
- Final de jornada o turno.
- Módulo de caja.

### 15.3 Validaciones

- Caja abierta.
- Todos los movimientos del período están registrados.
- Secuencia de tickets sin huecos injustificados.
- Totales calculados en servidor.
- Cadena de hash verificada.
- Si hay descuadres, deben quedar documentados.
- Se genera `traceId`.

### 15.4 Colecciones afectadas

#### `HISTORICO_CIERRES_Z`

| Campo técnico | Contenido |
|---|---|
| `operationDate` | Fecha operativa. |
| `closingStatus` | `CERRADO`, `VERIFICADO`. |
| `consolidatedTotalAmount` | Total consolidado. |
| `grossSalesTotal` | Ventas brutas. |
| `netTaxableAmount` | Base neta imponible. |
| `netTaxAmount` | Cuota IVA neta. |
| `totalCash` | Total efectivo. |
| `totalCard` | Total tarjeta. |
| `totalBizum` | Total Bizum. |
| `totalOnline` | Total online. |
| `totalRefunds` | Total devoluciones. |
| `totalTips` | Propinas si se registran. |
| `totalAdjustments` | Ajustes. |
| `totalOperations` | Número de operaciones. |
| `startSequence` | Primera secuencia. |
| `endSequence` | Última secuencia. |
| `startTicketNumber` | Primer ticket. |
| `endTicketNumber` | Último ticket. |
| `startRecordHash` | Hash del primer movimiento. |
| `endRecordHash` | Hash del último movimiento. |
| `movementTypeBreakdown` | Desglose por tipo. |
| `taxTypeBreakdown` | Desglose por tipo impositivo. |
| `isIntegrityVerified` | Verificación de cadena. |
| `auditedRecordsCount` | Movimientos auditados. |
| `closingHash` | Hash del cierre. |
| `closingSignature` | Firma. |
| `closingSource` | `CAJA`, `CRON`, `ADMIN`. |
| `closingSchemaVersion` | Versión de esquema. |
| `timeZone` | `Europe/Madrid`. |
| `closedAt` | Fecha cierre. |
| `verifiedAt` | Fecha verificación. |
| `traceId` | Trazabilidad. |

#### `CAJA_ACTUAL`

| Campo técnico | Contenido |
|---|---|
| `cashRegisterStatus` | `CERRADA`. |
| `closedAt` | Fecha de cierre. |
| `lastActivityAt` | Última actividad. |

#### `EVENTOS_SISTEMA_FACTURACION`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `Z_CLOSING_ISSUED`. |
| `severity` | `INFO`. |
| `result` | `SUCCESS`. |
| `eventHash` | Hash. |
| `eventSignature` | Firma. |

#### `MM_AUDIT_LOG`

| Campo técnico | Contenido |
|---|---|
| `eventType` | `CASH_Z_CLOSING`. |
| `level` | `INFO`. |

### 15.5 Normativa relacionada

- Control de caja.
- Integridad de registros.
- Facturación.
- Evidencia para inspección.
- SIF / Veri*factu en lo que aplique.

### 15.6 Documento para contable

- Cierre Z diario.
- Totales por método de pago.
- Rango de tickets.
- Desglose de IVA.
- Devoluciones y ajustes.
- Hash de integridad.
- Firma digital.

---

## 16. FLUJO 11 — CONTABILIZACIÓN AUTOMÁTICA DE MOVIMIENTOS

### 16.1 Descripción

Cada movimiento económico relevante genera o propone un asiento contable en partida doble.

### 16.2 Fuentes de contabilización

- Cobros de servicios.
- Ventas de productos.
- Devoluciones.
- Gastos.
- Pagos a proveedores.
- Anticipos.
- Tarjetas regalo.
- Ajustes autorizados.
- Cierre de inventario.

### 16.3 Validaciones contables

- `totalDebe === totalCredit`.
- Cada línea tiene cuenta válida.
- Cuenta dada de alta en `PLAN_CUENTAS_CONTABLES`.
- Período fiscal abierto.
- Importe coincide con documento origen.
- Tipo impositivo correcto.
- No se contabiliza dos veces el mismo evento.

### 16.4 Colecciones afectadas

#### `ASIENTOS_CONTABLES`

Campos clave:

| Campo técnico | Uso |
|---|---|
| `journalEntryId` | ID único. |
| `entryNumber` | Número de asiento. |
| `fiscalYear` | Ejercicio. |
| `fiscalPeriod` | Período. |
| `operationDate` | Fecha. |
| `entryConcept` | Concepto. |
| `totalDebit` | Total debe. |
| `totalCredit` | Total haber. |
| `entryType` | Tipo de asiento. |
| `entryStatus` | `DRAFT`, `POSTED`, `LOCKED`. |
| `wixOrderId` | Pedido. |
| `wixRefundId` | Reembolso. |
| `wixBookingId` | Reserva. |
| `invoiceNumber` | Factura/ticket. |
| `previousHash` | Hash previo. |
| `entryHash` | Hash del asiento. |
| `entrySignature` | Firma. |

#### `LINEAS_ASIENTO_CONTABLE`

| Campo técnico | Uso |
|---|---|
| `entryLineId` | ID línea. |
| `journalEntryId` | Asiento padre. |
| `lineNumber` | Orden. |
| `accountCode` | Cuenta PGC. |
| `accountName` | Nombre cuenta. |
| `debitAmount` | Debe. |
| `creditAmount` | Haber. |
| `netAmount` | Neto. |
| `taxableAmount` | Base imponible. |
| `taxRate` | Tipo. |
| `taxAmount` | Cuota. |
| `vatOperationKey` | Clave IVA. |
| `counterpartyTaxId` | NIF contraparte. |
| `counterpartyName` | Nombre contraparte. |
| `lineHash` | Hash de línea. |

#### `LIBRO_MAYOR_CONTABLE_SALDOS`

| Campo técnico | Uso |
|---|---|
| `accountCode` | Cuenta. |
| `fiscalYear` | Ejercicio. |
| `fiscalPeriod` | Período. |
| `initialDebitBalance` | Saldo inicial debe. |
| `initialCreditBalance` | Saldo inicial haber. |
| `debitMovements` | Movimientos debe. |
| `creditMovements` | Movimientos haber. |
| `finalDebitBalance` | Saldo final debe. |
| `finalCreditBalance` | Saldo final haber. |

### 16.5 Ejemplos de cuentas configurables

El plan de cuentas real debe estar validado por gestoría. Ejemplos orientativos:

| Operación | Cuenta deudora | Cuenta acreedora |
|---|---|---|
| Cobro servicio efectivo | Caja | Servicio + IVA |
| Cobro servicio tarjeta | Banco/pasarela | Servicio + IVA |
| Venta producto | Caja/banco | Venta mercaderías + IVA |
| Devolución venta | Devoluciones / ingreso corrector | Caja/banco |
| Anticipo cliente | Caja/banco | Anticipos clientes |
| Gasto con factura | Cuenta gasto + IVA soportado | Caja/banco/proveedor |
| Pago proveedor | Proveedor | Caja/banco |
| Tarjeta regalo venta | Caja/banco | Pasivo/anticipo |
| Canje tarjeta | Anticipo | Ingreso servicio/producto |

### 16.6 Documento para contable

- Asiento contable.
- Líneas de asiento.
- Relación con factura, ticket, pedido, reserva o devolución.
- Libro Mayor por cuenta.
- Balance de comprobación por período.

---

## 17. FLUJO 12 — REGISTRO DE FACTURAS RECIBIDAS Y GASTOS

### 17.1 Descripción

El negocio recibe facturas de proveedores: productos, suministros, servicios, gestoría, marketing, comisiones bancarias, etc.

### 17.2 Origen

- Registro manual autorizado.
- Importación contable.
- Pago desde caja.
- Conciliación bancaria futura.

### 17.3 Validaciones

- Proveedor identificado.
- Número de factura recibido.
- Fecha de expedición y recepción.
- NIF proveedor.
- Base, cuota y tipo.
- Concepto de gasto.
- Deducibilidad validada por asesoría.
- No duplicar `receptionNumber`.

### 17.4 Colecciones afectadas

#### `PROVEEDORES_LISTA`

| Campo técnico | Uso |
|---|---|
| `supplierName` | Nombre proveedor. |
| `minimumOrderExTax` | Pedido mínimo. |
| `leadTime` | Plazo entrega. |
| `active` | Activo. |

#### `LIBRO_IVA_FACTURAS_RECIBIDAS`

| Campo técnico | Contenido |
|---|---|
| `receptionNumber` | Número interno de recepción. |
| `supplierInvoiceSeriesNumber` | Número factura proveedor. |
| `issueDate` | Fecha factura. |
| `receptionDate` | Fecha recepción. |
| `fiscalYear` | Ejercicio. |
| `fiscalPeriod` | Período. |
| `totalInvoiceAmount` | Total. |
| `taxableAmount` | Base. |
| `taxRate` | Tipo. |
| `inputTaxAmount` | IVA soportado. |
| `deductibleTaxAmount` | IVA deducible. |
| `expenseConcept` | Concepto. |
| `deductibleExpenseAmount` | Gasto deducible. |
| `supplierTaxId` | NIF proveedor. |
| `supplierName` | Nombre proveedor. |
| `paymentDate` | Fecha pago. |
| `paymentMethod` | Método. |
| `traceId` | Trazabilidad. |

#### `MOVIMIENTOS_CAJA`

Si se paga desde caja:

| Campo técnico | Contenido |
|---|---|
| `movementType` | `PAGO_PROVEEDOR` o `GASTO`. |
| `operationNature` | `EGRESO`. |
| `paymentMethod` | Método. |
| `taxTreatment` | `SOPORTADO`. |
| `description` | Pago factura proveedor. |
| `referenceId` | `receptionNumber`. |

#### `ASIENTOS_CONTABLES`

Ejemplo:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Gasto | Base | 0 |
| 2 | IVA soportado | Cuota | 0 |
| 3 | Caja/banco/proveedor | 0 | Total |

### 17.5 Documento para contable

- Factura recibida.
- Libro IVA recibidas.
- Movimiento de pago si aplica.
- Asiento contable.
- Justificante de pago.

---

## 18. FLUJO 13 — COMPRA DE PRODUCTOS Y ENTRADA DE INVENTARIO

### 18.1 Descripción

El salón compra productos a proveedores para su venta o uso. Si el producto es para venta, entra en inventario.

### 18.2 Origen

- Factura de proveedor.
- Albarán.
- Recepción de mercancía.
- Módulo de inventario.

### 18.3 Validaciones

- SKU o producto identificado.
- Cantidad recibida.
- Coste sin impuesto.
- Proveedor activo.
- Relación con factura recibida.
- Generación de `movementToken`.

### 18.4 Colecciones afectadas

#### `INVENTARIO_STOCK_VENTA`

| Campo técnico | Uso |
|---|---|
| `stockExpected` | Incremento de stock. |
| `costExTax` | Coste actualizado si procede. |
| `lastInventoryMovementAt` | Fecha. |
| `lastInventoryMovementId` | Movimiento. |

#### `MOVIMIENTOS_INVENTARIO`

| Campo técnico | Contenido |
|---|---|
| `movementType` | `PURCHASE`, `IN`, `SUPPLIER_DELIVERY`. |
| `quantityDelta` | Positivo. |
| `stockBefore` / `stockAfter` | Control. |
| `referenceId` | Recepción o factura. |
| `reason` | Compra proveedor. |
| `actorMemberId` | Usuario receptor. |

#### `LIBRO_IVA_FACTURAS_RECIBIDAS`

Registro de la factura del proveedor.

#### `ASIENTOS_CONTABLES`

Ejemplo configurable:

| Línea | Cuenta | Debe | Haber |
|---|---|---:|---:|
| 1 | Compra mercaderías / existencias | Base | 0 |
| 2 | IVA soportado | Cuota | 0 |
| 3 | Proveedor / banco / caja | 0 | Total |

### 18.5 Documento para contable

- Factura proveedor.
- Recepción de mercancía.
- Movimiento de inventario.
- Libro IVA recibidas.
- Asiento contable.

---

## 19. FLUJO 14 — AJUSTES Y REGULARIZACIONES DE INVENTARIO

### 19.1 Descripción

Se detecta rotura, caducidad, merma, error de conteo, consumo interno o diferencia de stock.

### 19.2 Tipos de movimiento

| Tipo | Uso |
|---|---|
| `ADJUSTMENT` | Corrección por conteo. |
| `BREAKAGE` | Rotura. |
| `EXPIRY` | Caducidad. |
| `INTERNAL_USE` | Consumo interno. |
| `LOSS` | Pérdida. |
| `PHYSICAL_COUNT` | Regularización por inventario físico. |

### 19.3 Validaciones

- Motivo obligatorio.
- Usuario autorizado.
- Cantidad no puede producir stock negativo sin autorización explícita.
- Se registra antes/después.
- Se genera `movementToken`.
- Se audita.

### 19.4 Colecciones afectadas

#### `MOVIMIENTOS_INVENTARIO`

| Campo técnico | Contenido |
|---|---|
| `movementType` | Tipo de ajuste. |
| `quantityDelta` | Positivo o negativo. |
| `reason` | Motivo. |
| `stockBefore` | Stock previo. |
| `stockAfter` | Stock posterior. |
| `actorMemberId` | Usuario. |
| `traceId` | Trazabilidad. |

#### `INVENTARIO_STOCK_VENTA`

Actualización de `stockExpected`.

#### `MM_AUDIT_LOG`

Registro de ajuste.

#### `ALERTAS_OPERATIVAS`

Si el ajuste es relevante o frecuente.

### 19.5 Documento para contable

- Informe de ajustes.
- Motivo y usuario.
- Valoración del producto si tiene impacto contable.
- Asiento de regularización si aplica.

---

## 20. FLUJO 15 — CIERRE DE INVENTARIO VALORADO

### 20.1 Descripción

Al cierre de ejercicio o período seleccionado, el sistema genera una fotografía valorada del inventario.

### 20.2 Origen

- Proceso administrativo.
- Cron autorizado.
- Módulo de inventario.
- Validación por `ADMIN`.

### 20.3 Validaciones

- Fecha de cierre.
- Ejercicio fiscal.
- Stock final por SKU.
- Coste unitario.
- Valor total.
- Hash de cierre.
- Cuenta contable asociada.

### 20.4 Colecciones afectadas

#### `INVENTARIO_STOCK_VENTA_CIERRE`

| Campo técnico | Contenido |
|---|---|
| `inventoryClosingId` | ID cierre. |
| `fiscalYear` | Ejercicio. |
| `closingDate` | Fecha. |
| `closingType` | `ANUAL`, `MENSUAL`, `EXTRAORDINARIO`. |
| `sku` | Artículo. |
| `productDescription` | Descripción. |
| `stockQuantity` | Cantidad. |
| `unitCost` | Coste unitario. |
| `stockValue` | Valor total. |
| `accountCode` | Cuenta existencias. |
| `debitBalance` | Debe si aplica. |
| `creditBalance` | Haber si aplica. |
| `closingHash` | Hash. |
| `closingSignature` | Firma. |
| `traceId` | Trazabilidad. |

#### `ASIENTOS_CONTABLES`

Asiento de regularización de existencias según criterio contable.

#### `EVENTOS_SISTEMA_FACTURACION`

Evento de cierre de inventario si tiene relevancia fiscal.

### 20.5 Documento para contable

- Inventario final valorado.
- Coste por SKU.
- Valor total.
- Cuenta contable.
- Asiento de regularización.
- Hash de integridad.

---

## 21. FLUJO 16 — REGISTRO HORARIO LABORAL DEL PERSONAL

### 21.1 Descripción

Cada profesional registra entrada, salida, pausas y ajustes. Los registros son inmutables.

### 21.2 Origen

- Widget de fichaje.
- Dashboard interno.
- Registro por administrador.
- Autenticación Wix Members.

### 21.3 Validaciones

- No se permiten modificaciones ni borrados.
- Cada evento tiene fecha/hora real.
- Se identifica recurso y trabajador.
- Se registra responsable si el fichaje es manual.
- Se calcula `dayKey` y `monthKey` en `Europe/Madrid`.
- Se firma el registro.

### 21.4 Colecciones afectadas

#### `REGISTROS_HORARIOS_STAFF`

| Campo técnico | Contenido |
|---|---|
| `resourceId` | Recurso/profesional. |
| `resourceName` | Nombre visible. |
| `recordedAt` | Fecha/hora. |
| `recordedTime` | Hora `HH:mm:ss`. |
| `dayKey` | `YYYY-MM-DD`. |
| `monthKey` | `YYYY-MM`. |
| `clockEventType` | `ENTRADA`, `SALIDA`, `PAUSA_INICIO`, `PAUSA_FIN`, `AJUSTE`. |
| `type` | Tipo de turno. |
| `employeeIdentifier` | NIF/NIE. |
| `employeeName` | Nombre trabajador. |
| `registeredBy` | `SELF` o `ADMIN`. |
| `registeredByMemberId` | Miembro que registra. |
| `adjustmentReason` | Motivo si ajuste. |
| `deviceIp` | Terminal. |
| `deviceIpAddress` | IP pública. |
| `signature` | Firma. |
| `meta` | Metadatos. |
| `traceId` | Trazabilidad. |

#### `MAPA_STAFF`

Fuente de personal:

| Campo técnico | Uso |
|---|---|
| `displayName` | Nombre visible. |
| `resourceId` | Recurso Bookings. |
| `staffMemberId` | Miembro Wix. |
| `rol` | `ADMIN`, `GESTION`, `ESTILISTA`. |
| `active` | Activo. |

#### `MM_AUDIT_LOG`

Registro de eventos laborales con datos minimizados.

#### `EVENTOS_SISTEMA_FACTURACION`

No aplica directamente salvo que un evento laboral impacte facturación o nómina.

### 21.5 Normativa relacionada

- Registro horario obligatorio.
- Art. 34.9 Estatuto de los Trabajadores.
- RD-ley 8/2019.
- Conservación de registros.
- Minimización RGPD.

### 21.6 Documento para gestoría laboral

- Fichajes por trabajador.
- Entradas y salidas.
- Pausas.
- Ajustes con motivo.
- Total horas por día/mes.
- Firma digital.
- Usuario que registró cada evento.

---

## 22. FLUJO 17 — EVENTOS DEL SISTEMA DE FACTURACIÓN SIF / VERI*FACTU

### 22.1 Descripción

Cada evento relevante de facturación se registra en `EVENTOS_SISTEMA_FACTURACION` con hash, firma y traza.

### 22.2 Eventos recomendados

| Evento | Descripción |
|---|---|
| `INVOICE_ISSUED` | Factura emitida. |
| `SIMPLIFIED_INVOICE_ISSUED` | Ticket simplificado emitido. |
| `RECTIFIED_INVOICE_ISSUED` | Factura rectificativa. |
| `PAYMENT_CONFIRMED` | Pago confirmado. |
| `REFUND_PROCESSED` | Reembolso procesado. |
| `Z_CLOSING_ISSUED` | Cierre Z emitido. |
| `CASH_SESSION_OPEN` | Apertura de caja. |
| `CASH_SESSION_CLOSED` | Cierre de caja. |
| `HASH_CHAIN_VALIDATED` | Cadena validada. |
| `HASH_CHAIN_ERROR` | Error de integridad. |
| `SYSTEM_ERROR` | Error relevante. |

### 22.3 Campos clave

| Campo técnico | Uso |
|---|---|
| `systemEventId` | ID único. |
| `eventDateTime` | Fecha/hora. |
| `eventType` | Tipo evento. |
| `severity` | `INFO`, `WARNING`, `ERROR`. |
| `result` | `SUCCESS`, `FAILED`. |
| `eventSource` | Origen. |
| `responsibleUserId` | Usuario. |
| `journalEntryId` | Asiento relacionado. |
| `transactionId` | Transacción. |
| `referenceId` | Referencia externa. |
| `secureDetail` | Detalle seguro sin PII. |
| `previousEventHash` | Hash previo. |
| `eventHash` | Hash evento. |
| `eventSignature` | Firma. |
| `systemVersion` | Versión sistema. |
| `schemaVersion` | Versión esquema. |
| `traceId` | Trazabilidad. |

### 22.4 Normativa relacionada

- SIF / Veri*factu.
- Integridad.
- Trazabilidad.
- Conservación.
- Evidencia ante AEAT.

### 22.5 Documento para contable

- Extracto de eventos por período.
- Eventos de facturación.
- Errores y validaciones.
- Hashes y firmas.
- Relación con facturas, asientos y cierres.

---

## 23. MATRIZ GENERAL DE REGISTRO POR FLUJO

| Flujo | Origen Wix | Colecciones principales | Campos críticos | Normativa |
|---|---|---|---|---|
| Apertura caja | Wix Members / módulo interno | `CAJA_ACTUAL`, `MM_AUDIT_LOG` | `operationDate`, `cashRegisterStatus`, `openedAt` | Control interno |
| Cobro reserva presencial | Wix Bookings | `CITAS_F2`, `MOVIMIENTOS_CAJA`, `LIBRO_IVA_FACTURAS_EXPEDIDAS`, `ASIENTOS_CONTABLES` | `reservaIdVinculada`, `resourceId`, `totalAmount`, `taxAmount`, `invoiceNumber` | IVA, facturación, contabilidad |
| Cobro reserva online | Wix Bookings + Payments | `BOOKING_TRANSACTIONS`, `CITAS_F2`, `MOVIMIENTOS_CAJA`, `LIBRO_IVA_FACTURAS_EXPEDIDAS` | `transactionId`, `paymentStatus`, `currentRecordHash` | Pagos, IVA, SIF |
| Venta producto física | TPV / Stores V1 | `INVENTARIO_STOCK_VENTA`, `MOVIMIENTOS_INVENTARIO`, `MOVIMIENTOS_CAJA` | `sku`, `stockAfter`, `movementToken`, `lineItems` | IVA, existencias |
| Venta producto online | Wix Stores / eCommerce | `MOVIMIENTOS_INVENTARIO`, `MOVIMIENTOS_CAJA`, `LIBRO_IVA_FACTURAS_EXPEDIDAS` | `orderId`, `transactionId`, `sku` | IVA, ecommerce |
| Devolución servicio | Bookings / Payments / caja | `MOVIMIENTOS_CAJA`, `LIBRO_IVA_FACTURAS_EXPEDIDAS`, `ASIENTOS_CONTABLES` | `refundId`, `rectifiedInvoiceReference`, `accountingSign` | Rectificación IVA |
| Devolución producto | Stores / caja | `MOVIMIENTOS_INVENTARIO`, `MOVIMIENTOS_CAJA`, `ASIENTOS_CONTABLES` | `refundId`, `stockAfter`, `movementType` | IVA, inventario |
| Tarjeta regalo venta | Gift Cards / caja | `MOVIMIENTOS_CAJA`, `ASIENTOS_CONTABLES` | `referenceId`, `taxTreatment` | Anticipos, IVA validado |
| Tarjeta regalo canje | Gift Cards / caja | `MOVIMIENTOS_CAJA`, `LIBRO_IVA_FACTURAS_EXPEDIDAS` | `referenceId`, `movementType` | Ingreso, IVA |
| Gasto con factura | Manual / proveedor | `LIBRO_IVA_FACTURAS_RECIBIDAS`, `MOVIMIENTOS_CAJA`, `ASIENTOS_CONTABLES` | `receptionNumber`, `inputTaxAmount` | IVA soportado |
| Pago proveedor | Caja / banco | `MOVIMIENTOS_CAJA`, `LIBRO_IVA_FACTURAS_RECIBIDAS` | `supplierTaxId`, `paymentMethod` | Contabilidad |
| Ajuste caja | Manual autorizado | `MOVIMIENTOS_CAJA`, `MM_AUDIT_LOG`, `ALERTAS_OPERATIVAS` | `description`, `accountingSign`, `traceId` | Control interno |
| Arqueo X | Caja | `CONTROL_PARCIAL_X`, `ALERTAS_OPERATIVAS` | `countedCash`, `expectedCash`, `discrepancyAmount` | Control interno |
| Cierre Z | Caja | `HISTORICO_CIERRES_Z`, `EVENTOS_SISTEMA_FACTURACION` | `closingHash`, `startSequence`, `endSequence` | Facturación, SIF |
| Inventario ajuste | Inventario | `MOVIMIENTOS_INVENTARIO`, `MM_AUDIT_LOG` | `movementToken`, `reason`, `stockAfter` | Existencias |
| Cierre inventario | Inventario | `INVENTARIO_STOCK_VENTA_CIERRE`, `ASIENTOS_CONTABLES` | `stockValue`, `closingHash` | Contabilidad |
| Fichaje staff | Members / widget | `REGISTROS_HORARIOS_STAFF`, `MM_AUDIT_LOG` | `clockEventType`, `signature`, `dayKey` | Laboral |
| Evento SIF | Sistema | `EVENTOS_SISTEMA_FACTURACION` | `eventHash`, `eventSignature`, `systemEventId` | SIF / Veri*factu |

---

## 24. REGLAS DE INMUTABILIDAD EN `data.js`

Las siguientes colecciones deben estar protegidas contra actualización o borrado directo cuando su naturaleza sea fiscal, contable o laboral.

| Colección | Hook | Acción |
|---|---|---|
| `MOVIMIENTOS_CAJA` | `beforeUpdate` | Lanzar `FISCAL_VIOLATION`. |
| `MOVIMIENTOS_CAJA` | `beforeRemove` | Lanzar `FISCAL_VIOLATION`. |
| `HISTORICO_CIERRES_Z` | `beforeUpdate` | Lanzar `FISCAL_VIOLATION`. |
| `HISTORICO_CIERRES_Z` | `beforeRemove` | Lanzar `FISCAL_VIOLATION`. |
| `EVENTOS_SISTEMA_FACTURACION` | `beforeUpdate` | Lanzar `SIF_VIOLATION`. |
| `EVENTOS_SISTEMA_FACTURACION` | `beforeRemove` | Lanzar `SIF_VIOLATION`. |
| `REGISTROS_HORARIOS_STAFF` | `beforeUpdate` | Lanzar `LABOR_LOG_VIOLATION`. |
| `REGISTROS_HORARIOS_STAFF` | `beforeRemove` | Lanzar `LABOR_LOG_VIOLATION`. |
| `ASIENTOS_CONTABLES` | `beforeUpdate` | Bloquear si estado `POSTED` o `LOCKED`. |
| `ASIENTOS_CONTABLES` | `beforeRemove` | Bloquear si estado `POSTED` o `LOCKED`. |
| `LINEAS_ASIENTO_CONTABLE` | `beforeUpdate` | Bloquear si asiento padre está posteado. |
| `LINEAS_ASIENTO_CONTABLE` | `beforeRemove` | Bloquear si asiento padre está posteado. |
| `CAJA_ACTUAL` | `beforeRemove` | Bloquear singleton protegido. |
| `SECUENCIA_TICKETS` | `beforeUpdate` | Validar que no exista salto regresivo no autorizado. |
| `INVENTARIO_STOCK_VENTA_CIERRE` | `beforeUpdate` | Bloquear cierre firmado. |
| `INVENTARIO_STOCK_VENTA_CIERRE` | `beforeRemove` | Bloquear cierre firmado. |

---

## 25. CADENA DE INTEGRIDAD Y FIRMA

### 25.1 Secuencia de movimientos de caja

Cada movimiento en `MOVIMIENTOS_CAJA` debe incluir:

- `sequenceNumber` creciente.
- `invoiceNumber` único por serie.
- `previousRecordHash`.
- `currentRecordHash`.
- `digitalSignature`.
- `schemaIntegrityVersion`.
- `businessTaxId`.

### 25.2 Cálculo recomendado

```text
canonicalPayload = JSON normalizado de campos fiscales del movimiento

currentRecordHash = SHA256(canonicalPayload + previousRecordHash)

digitalSignature = HMAC_SHA256(currentRecordHash, FISCAL_KEY)
```

### 25.3 Recuperación de clave fiscal

```text
FISCAL_KEY se obtiene exclusivamente desde Wix Secrets Manager.
```

### 25.4 Validación

Un verificador debe recorrer la secuencia y comprobar:

1. Que `sequenceNumber` no tenga huecos injustificados.
2. Que `previousRecordHash` coincida con `currentRecordHash` del movimiento anterior.
3. Que `digitalSignature` sea válida.
4. Que el total del cierre Z coincida con la suma de movimientos.
5. Que los rangos de tickets coincidan con `SECUENCIA_TICKETS`.

---

## 26. TRAZABILIDAD TRANSVERSAL

Todo evento relevante debe poder reconstruirse mediante:

| Colección | Aporta |
|---|---|
| `MM_AUDIT_LOG` | Quién, cuándo, qué módulo y resultado. |
| `MOVIMIENTOS_CAJA` | Movimiento económico. |
| `CITAS_F2` | Reserva relacionada. |
| `BOOKING_TRANSACTIONS` | Idempotencia de reserva. |
| `COMPENSACIONES_PENDIENTES` | Reintentos y fallos. |
| `MOVIMIENTOS_INVENTARIO` | Stock afectado. |
| `LIBRO_IVA_FACTURAS_EXPEDIDAS` | IVA repercutido. |
| `LIBRO_IVA_FACTURAS_RECIBIDAS` | IVA soportado. |
| `ASIENTOS_CONTABLES` | Contabilidad. |
| `EVENTOS_SISTEMA_FACTURACION` | Eventos SIF. |
| `REGISTROS_HORARIOS_STAFF` | Jornada laboral. |

El campo común de correlación es:

```text
traceId
```

Generado por `makeTraceId()` o helper equivalente.

---

## 27. ROLES Y PERMISOS OPERATIVOS

### 27.1 Roles canónicos

| Rol | Alcance |
|---|---|
| `ADMIN` | Configuración fiscal, plan de cuentas, cierres Z, devoluciones sensibles, ajustes, inventario, lectura total. |
| `GESTION` | Operación diaria, cobros, gastos, arqueos X, movimientos manuales autorizados, inventario operativo. |
| `ESTILISTA` | Consulta de agenda propia, fichajes, servicios asignados, sin acceso a cierre fiscal ni devoluciones sensibles. |

### 27.2 Matriz recomendada

| Acción | ADMIN | GESTION | ESTILISTA |
|---|---:|---:|---:|
| Abrir caja | Sí | Sí | No |
| Cobro servicio presencial | Sí | Sí | No |
| Venta producto presencial | Sí | Sí | No |
| Ajuste de caja | Sí | Limitado | No |
| Devolución | Sí | Limitado | No |
| Arqueo X | Sí | Sí | No |
| Cierre Z | Sí | No | No |
| Registrar gasto | Sí | Sí | No |
| Registrar factura recibida | Sí | Sí | No |
| Ajuste inventario | Sí | Sí | No |
| Cierre inventario | Sí | No | No |
| Fichaje laboral | Sí | Sí | Sí, propio |
| Ver libros IVA | Sí | Limitado | No |
| Ver asientos contables | Sí | Limitado | No |
| Exportar documentación contable | Sí | Limitado | No |

---

## 28. CONCILIACIÓN CON WIX

### 28.1 Pagos online

Cada movimiento online debe conciliarse con:

- `transactionId`.
- `orderId`.
- `paymentId` si existe.
- Estado nativo Wix.
- Importe nativo Wix.
- Moneda.
- Método de pago.
- Fecha.

### 28.2 Pedidos Stores

Cada venta online debe conciliarse con:

- `orderId`.
- Líneas de pedido.
- Impuestos.
- Descuentos.
- Envío.
- Estado de fulfillment.
- Devoluciones.

### 28.3 Reservas Bookings

Cada cobro de reserva debe conciliarse con:

- `bookingId`.
- `serviceId`.
- `resourceId`.
- Estado de reserva.
- Estado de pago.
- Importe del servicio.
- Complementos.

### 28.4 Inventario Wix Stores

Si Wix Stores gestiona stock nativo:

- Comparar `stockExpected` propio con stock nativo.
- Marcar `needsWixReconciliation` cuando haya diferencias.
- Registrar discrepancia en `ALERTAS_OPERATIVAS`.

---

## 29. DOCUMENTACIÓN PARA ENTREGA AL CONTABLE

### 29.1 Dossier mensual recomendado

1. Resumen ejecutivo.
2. Cierres Z del período.
3. Arqueos X.
4. Movimientos de caja.
5. Facturas y tickets emitidos.
6. Libro de IVA expedidas.
7. Facturas recibidas.
8. Libro de IVA recibidas.
9. Asientos contables.
10. Líneas de asiento.
11. Libro Mayor.
12. Movimientos de inventario.
13. Stock final.
14. Cierre de inventario si aplica.
15. Registro horario laboral.
16. Devoluciones y rectificativas.
17. Tarjetas regalo.
18. Conciliación Wix Payments / Stores / Bookings.
19. Alertas e incidencias.
20. Eventos SIF / Veri*factu.
21. Certificado interno de integridad de hash.

### 29.2 Formato recomendado

| Documento | Formato | Frecuencia |
|---|---|---|
| Cierres Z | PDF + CSV | Diario/mensual |
| Movimientos caja | CSV + JSON firmado | Diario/mensual |
| Libro IVA expedidas | CSV + PDF | Mensual/trimestral |
| Libro IVA recibidas | CSV + PDF | Mensual/trimestral |
| Asientos | CSV + PDF | Mensual |
| Mayor | CSV + PDF | Mensual/trimestral |
| Inventario movimientos | CSV | Mensual |
| Stock cierre | CSV + PDF | Ejercicio |
| Horarios staff | CSV + PDF | Mensual |
| Eventos SIF | JSON + PDF | Mensual |
| Conciliación Wix | CSV | Mensual |

### 29.3 Columnas mínimas para exportación de caja

```text
operationDate
sequenceNumber
invoiceNumber
movementType
operationNature
paymentMethod
totalAmount
taxableAmount
taxAmount
taxRate
accountingSign
description
reservaIdVinculada
transactionId
resourceId
traceId
currentRecordHash
digitalSignature
```

### 29.4 Columnas mínimas para libro IVA expedidas

```text
invoiceNumber
invoiceSeries
issueDate
operationDate
fiscalYear
fiscalPeriod
invoiceType
totalInvoiceAmount
taxableAmount
taxRate
outputTaxAmount
recipientTaxId
recipientName
operationKey
collectionMethod
traceId
```

### 29.5 Columnas mínimas para libro IVA recibidas

```text
receptionNumber
supplierInvoiceSeriesNumber
issueDate
receptionDate
fiscalYear
fiscalPeriod
supplierTaxId
supplierName
totalInvoiceAmount
taxableAmount
taxRate
inputTaxAmount
deductibleTaxAmount
expenseConcept
paymentMethod
traceId
```

### 29.6 Columnas mínimas para asientos

```text
entryNumber
journalEntryId
operationDate
fiscalYear
fiscalPeriod
entryConcept
entryType
entryStatus
totalDebit
totalCredit
invoiceNumber
wixBookingId
wixOrderId
wixRefundId
entryHash
entrySignature
traceId
```

### 29.7 Columnas mínimas para inventario

```text
movementToken
sku
productName
movementType
quantityDelta
stockBefore
stockAfter
reason
referenceId
orderId
refundId
actorMemberId
traceId
```

### 29.8 Columnas mínimas para horario laboral

```text
dayKey
monthKey
resourceId
resourceName
employeeIdentifier
employeeName
clockEventType
recordedAt
recordedTime
registeredBy
registeredByMemberId
adjustmentReason
signature
traceId
```

---

## 30. INFORMES CONTABLES CLAVE

### 30.1 Informe de caja diaria

Contiene:

- Fecha.
- Saldo inicial.
- Ingresos por método.
- Egresos.
- Devoluciones.
- Ajustes.
- Total efectivo contado.
- Descuadre.
- Tickets emitidos.
- Rango de secuencias.
- Hash de cierre.

### 30.2 Informe de ventas por servicio

Contiene:

- Servicio.
- Categoría.
- Profesional.
- Número de operaciones.
- Base imponible.
- IVA.
- Total.
- Método de pago.

### 30.3 Informe de ventas por producto

Contiene:

- SKU.
- Producto.
- Unidades vendidas.
- Base.
- IVA.
- Total.
- Canal: salón u online.
- Stock final.

### 30.4 Informe de devoluciones

Contiene:

- Fecha.
- Motivo.
- Factura original.
- Importe.
- IVA rectificado.
- Método reembolso.
- Usuario responsable.
- Estado Wix si online.

### 30.5 Informe de gastos

Contiene:

- Proveedor.
- Concepto.
- Fecha factura.
- Base.
- IVA soportado.
- Total.
- Método pago.
- Deducibilidad validada.

### 30.6 Informe de horas laborales

Contiene:

- Trabajador.
- Fecha.
- Primera entrada.
- Última salida.
- Pausas.
- Horas efectivas.
- Ajustes.
- Firma.

---

## 31. VALIDACIONES DE INTEGRIDAD ANTES DE ENTREGAR AL CONTABLE

Antes de cerrar un período, el sistema debe validar:

1. La suma de movimientos coincide con el cierre Z.
2. Los totales por método de pago coinciden con `CAJA_ACTUAL`.
3. La cadena de hash de `MOVIMIENTOS_CAJA` es válida.
4. La secuencia de tickets no tiene huecos no justificados.
5. Las facturas rectificativas referencian documentos originales válidos.
6. Los asientos están cuadrados.
7. Las líneas de asiento suman igual al asiento.
8. El libro de IVA expedidas coincide con movimientos de venta.
9. El libro de IVA recibidas coincide con gastos registrados.
10. El inventario final coincide con `INVENTARIO_STOCK_VENTA`.
11. Los reembolsos no están duplicados.
12. Los pagos online están confirmados por eventos nativos.
13. Las reservas pagadas tienen `paymentStatus` coherente.
14. Los fichajes laborales no presentan modificaciones.
15. No existen eventos `FISCAL_VIOLATION`, `SIF_VIOLATION` o `LABOR_LOG_VIOLATION` sin resolver.

Si alguna validación falla:

- Se registra en `ALERTAS_OPERATIVAS`.
- Se registra en `EVENTOS_SISTEMA_FACTURACION`.
- No se entrega cierre definitivo hasta resolución o excepción documentada.

---

## 32. MAPA NORMATIVO DETALLADO

| Área | Requisito | Control técnico |
|---|---|---|
| Facturación | Facturas/tickets secuenciales | `SECUENCIA_TICKETS`, `invoiceNumber`, `invoiceSeries` |
| Facturación | Contenido mínimo de factura | Campos de `LIBRO_IVA_FACTURAS_EXPEDIDAS` |
| Facturación | Rectificaciones | `rectifiedInvoiceReference`, `invoiceType` |
| IVA | Base, cuota y tipo | `taxableAmount`, `taxAmount`, `taxRate` |
| IVA | Libro expedidas | `LIBRO_IVA_FACTURAS_EXPEDIDAS` |
| IVA | Libro recibidas | `LIBRO_IVA_FACTURAS_RECIBIDAS` |
| SIF / Veri*factu | Integridad y traza | `EVENTOS_SISTEMA_FACTURACION`, hash, firma |
| Contabilidad | Partida doble | `ASIENTOS_CONTABLES`, `LINEAS_ASIENTO_CONTABLE` |
| Contabilidad | Mayor | `LIBRO_MAYOR_CONTABLE_SALDOS` |
| Contabilidad | Existencias | `INVENTARIO_STOCK_VENTA_CIERRE` |
| Caja | Control diario | `CAJA_ACTUAL`, `CONTROL_PARCIAL_X`, `HISTORICO_CIERRES_Z` |
| Pagos | Evidencia de cobro | Evento nativo Wix + `transactionId` |
| Devoluciones | Evidencia de reembolso | `refundId`, `COMPENSACIONES_PENDIENTES` |
| Laboral | Registro horario | `REGISTROS_HORARIOS_STAFF` |
| Laboral | Inmutabilidad | Hooks `beforeUpdate` / `beforeRemove` |
| RGPD | Minimización | Enmascarado de PII, roles, consentimientos |
| RGPD | Responsabilidad proactiva | Auditoría, traza, políticas, validación externa |

---

## 33. ESTADO DE INTEGRACIÓN CON WIX NATIVO

| Área | Estado canónico | Observación |
|---|---|---|
| Bookings V2 | Diseñado e integrado en reservas | Cada cobro debe vincularse a `bookingId`. |
| Stores Catalog V1 | Diseñado para catálogo V1 | No usar Catalog V3 sin migración formal. |
| eCommerce Checkout | Diseñado | Pago online debe confirmarse por evento nativo. |
| Payments / Cashier | Diseñado | Webhook de pago recomendado para estado/método. |
| Invoices | Delegado | No escritura directa arbitraria. |
| Gift Cards | Requiere conciliación | Venta/canje debe reflejarse en caja/contabilidad. |
| Members | Diseñado | Roles, sesión y personal. |
| Forms | Diseñado | Consentimiento y contactos. |
| Secrets | Diseñado | Claves fuera del código. |
| Auth elevate | Diseñado | Para procesos backend asíncronos. |
| Crypto | Diseñado | Hash y HMAC fiscal. |

---

## 34. RIESGOS Y CONTROLES

| Riesgo | Control |
|---|---|
| Doble cobro | Idempotencia por `transactionId`, `pairToken`, estado nativo. |
| Doble reembolso | Unicidad de `refundId`, validación de estado. |
| Stock negativo | Validación de stock antes de venta, alertas. |
| Descuadre de caja | Arqueo X, cierre Z, `discrepancyAmount`. |
| Manipulación fiscal | Hash chain, firma, inmutabilidad, hooks. |
| Pérdida de traza | `traceId` transversal. |
| Exposición de PII | Enmascarado, roles, minimización. |
| Uso incorrecto de secrets | Secrets Manager, backend only. |
| Webhook duplicado | Idempotencia por evento y entidad nativa. |
| Catálogo V1/V3 mezclado | Restricción explícita Catalog V1. |
| Asiento descuadrado | Validación `totalDebe === totalCredit`. |
| Fichaje modificado | Inmutabilidad laboral. |
| Cierre Z incorrecto | Validación de suma, secuencia y hash. |

---

## 35. CRITERIOS DE ACEPTACIÓN DEL SISTEMA

El sistema se considerará técnicamente preparado para esta área cuando:

1. Una venta presencial genere ticket, movimiento de caja, asiento y libro IVA.
2. Una venta online genere pedido, pago confirmado, movimiento, asiento y libro IVA.
3. Una devolución genere rectificación, movimiento negativo, asiento y actualización de inventario si aplica.
4. Un cierre Z consolide correctamente todos los movimientos.
5. La cadena de hash sea verificable.
6. Los asientos estén cuadrados.
7. El inventario quede trazado por movimiento.
8. Los fichajes laborales sean inmutables.
9. No existan secretos expuestos.
10. Los logs no contengan PII innecesaria.
11. Los webhooks de pago sean idempotentes.
12. Las devoluciones dobles sean rechazadas.
13. La documentación contable pueda exportarse de forma completa.
14. Las validaciones de integridad no presenten errores abiertos.
15. La asesoría fiscal, contable, laboral y de datos valide la configuración final.

---

## 36. DICTAMEN TÉCNICO

El ecosistema v5002.4 está diseñado para registrar de forma íntegra, trazable e inmutable:

- Cobros de servicios.
- Ventas de productos.
- Pagos online.
- Devoluciones.
- Tarjetas regalo.
- Gastos.
- Compras.
- Movimientos de caja.
- Arqueos.
- Cierres Z.
- Inventario.
- Contabilidad.
- Libros de IVA.
- Eventos SIF / Veri*factu.
- Registro horario laboral.
- Auditoría operativa.

La arquitectura separa correctamente:

- Wix como fuente nativa de reservas, pedidos, pagos, miembros y catálogo.
- El CMS como ledger fiscal, contable, laboral y de auditoría.
- El backend como única capa capaz de validar, recalcular y consolidar.
- Los hooks como mecanismo de inmutabilidad.
- Secrets y crypto como base de integridad.

Para alcanzar una certificación plena de cumplimiento normativo, el sistema debe superar una validación externa documentada por parte de:

- Asesoría fiscal.
- Contable responsable.
- Asesoría laboral.
- Responsable de protección de datos.
- Validación técnica del despliegue real.

El código puede demostrar controles técnicos, pero no puede autocertificar por sí solo el cumplimiento legal completo.

---

## 37. ANEXO — ENTREGA MÍNIMA AL CONTABLE RESPONSABLE

El contable responsable debería recibir, como mínimo:

### 37.1 Documentación mensual

- Cierres Z del mes.
- Movimientos de caja firmados.
- Libro de facturas expedidas.
- Libro de facturas recibidas.
- Asientos contables.
- Libro Mayor.
- Informe de devoluciones.
- Informe de tarjetas regalo.
- Conciliación Wix Payments.
- Conciliación Wix Stores.
- Conciliación Wix Bookings.
- Informe de inventario.
- Registro horario del personal.
- Incidencias y alertas.

### 37.2 Documentación trimestral

- Resumen de IVA repercutido.
- Resumen de IVA soportado.
- Resumen de ventas por tipo impositivo.
- Resumen de gastos por categoría.
- Balance de comprobación.
- Existencias valoradas si procede.
- Cierres Z consolidados.

### 37.3 Documentación anual

- Cierre de ejercicio.
- Inventario final valorado.
- Libro Mayor anual.
- Resumen de facturación anual.
- Resumen de devoluciones.
- Resumen de horas laborales.
- Evidencias de integridad y hash.
- Eventos SIF relevantes.

---

## 38. CONCLUSIÓN EJECUTIVA

El sitio debe tratar cada operación económica como un evento auditable, inmutable y reconciliable con Wix. Ningún estado local puede servir como prueba definitiva de cobro, reembolso, pedido o reserva si no está respaldado por la entidad o evento nativo correspondiente.

La ruta correcta es:

```text
Evento Wix o acción autorizada
        ↓
Validación de permisos e idempotencia
        ↓
Recálculo servidor
        ↓
Registro en ledger fiscal
        ↓
Registro contable
        ↓
Registro de auditoría
        ↓
Exportación documental al contable
```

Con este modelo, el ecosistema Marian Madrid puede soportar la operación diaria del salón, la venta online, la gestión de inventario, la contabilidad, el registro laboral y la entrega de evidencia documental para cumplimiento normativo en España.