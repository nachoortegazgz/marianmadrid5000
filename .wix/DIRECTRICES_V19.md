# DIRECTRICES Y OBJETIVOS V19 - INDICE

No existe un archivo directrices_V19 autonomo en el repositorio; las
directrices se referencian desde la documentacion SSOT:

- `.agents/skills/wix/BIBLIA DEFINITIVA.md` (directrices y notas de alcance).
- `.agents/skills/wix/DOSSIER CAJA FISICA, CONTABILIDAD, INVENTARIO Y
  CUMPLIMIENTO NORMATIVO.md` (marco normativo: SIF/Verifactu, IVA,
  facturacion, contabilidad espanola, registro horario laboral,
  RGPD/LOPDGDD).
- `REFACTOR_BIBLE_v5002.4.md` (matrices legacy -> canonico).

Objetivos principales (resumen operativo):
1. Mantener el sitio en Wix Editor Clasico (no migrar a Wix Studio).
2. Usar exclusivamente APIs Wix V2.
3. Mantener inmutabilidad fiscal (FISCAL_VIOLATION) y laboral
   (LABOR_LOG_VIOLATION) en los hooks de src/backend/data.js.
4. Cero codigo deprecated: no Cart V1, no Checkout V1, no IFrame SDK,
   no REST desde frontend.
5. Idempotencia en toda operacion transaccional: pairToken (reservas),
   movementToken (inventario), transactionId (pagos).
6. Trazabilidad con traceId y masking de PII en logs.
7. Nomenclatura canonica v5002.4 (ver .clinerules/coding-standards.md).

Para el detalle completo, consultar los documentos SSOT listados arriba.