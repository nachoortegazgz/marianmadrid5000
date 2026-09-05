/*
=============================================================================
FILE: public/qrHelper.js
VERSION: v19.6.16-verifactu-qr-generator
RESPONSIBILITY: Generates Veri*Factu QR verification URLs for fiscal receipts.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
export function generateVerifactuQrUrl(params = {}) {
const nifEmisor = String(params.nifEmisor || "").trim();
const numFactura = String(params.numTicketFactura || params.numFactura || "").trim();
const fechaEmision = String(params.fechaEmision || "").trim();
const importeTotal = String(params.importeTotal || "0").trim();
const hashCadena = String(params.hashCadena || "").trim();
if (!nifEmisor || !numFactura || !fechaEmision) {
return null;
}
const baseUrl = "https://www.agenciatributaria.gob.es/verifactu/verify";
const queryParams = [
`nif=${encodeURIComponent(nifEmisor)}`,
`numFactura=${encodeURIComponent(numFactura)}`,
`fecha=${encodeURIComponent(fechaEmision)}`,
`importe=${encodeURIComponent(importeTotal)}`,
`hash=${encodeURIComponent(hashCadena)}`,
].join("&");
return `${baseUrl}?${queryParams}`;
}
export function extractVerifactuData(movimiento = {}) {
return {
nifEmisor: String(movimiento.nifEmisor || "").trim(),
numTicketFactura: String(movimiento.numTicketFactura || "").trim(),
fechaEmision: String(movimiento.fechaCreacion || "").slice(0, 10),
importeTotal: String(movimiento.importeTotal || 0),
hashCadena: String(movimiento.hashCadena || "").trim(),
firmaDigital: String(movimiento.firmaDigital || "").trim(),
qrUrl: generateVerifactuQrUrl(movimiento),
};
}
export function buildVerifactuReceiptHtml(movimiento = {}) {
const data = extractVerifactuData(movimiento);
if (!data.qrUrl) return "";
return `
<div style="font-family: Arial, sans-serif; padding: 16px; border: 1px solid #ccc; border-radius: 8px;">
<h3 style="margin: 0 0 12px;">Factura Simplificada</h3>
<p><strong>NIF Emisor:</strong> ${data.nifEmisor}</p>
<p><strong>Numero:</strong> ${data.numTicketFactura}</p>
<p><strong>Fecha:</strong> ${data.fechaEmision}</p>
<p><strong>Importe:</strong> ${data.importeTotal} EUR</p>
<p><strong>Verificacion:</strong> <a href="${data.qrUrl}" target="_blank">Verificar factura</a></p>
<p style="font-size: 10px; color: #666;">Hash: ${data.hashCadena.substring(0, 16)}...</p>
</div>
`;
}