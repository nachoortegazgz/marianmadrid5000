/*
=============================================================================
MODULE: backend/inventario.web.js
VERSION: v5001-optimized (base v19.6.16-canonical-ssot)
RESPONSIBILITY: Inventory management for products and stock tracking.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { COLLECTIONS, SDK_CONFIG } from "backend/internalConfig";
import { makeTraceId, _safeTrim, _roundMoney, _cleanText } from "public/mmUtils";
import { requireCajero, rateLimiter } from "backend/security";
import { _toPublicError } from "backend/responseUtils";
import { logger } from "backend/booking/bookingCore";
const log = logger;
const INVENTARIO_COL = COLLECTIONS.INVENTARIO_PRODUCTO;
const MOVIMIENTO_COL = COLLECTIONS.MOVIMIENTO_INVENTARIO;
const CONCILIACION_COL = COLLECTIONS.CONCILIACION_STOCK_WIX;
const API_TIMEOUT_MS = SDK_CONFIG?.TIMEOUTS?.API_MS || 15000;
function _rateLimitOrThrow(surface, key, traceId) {
const rl = rateLimiter({ surface, key });
if (!rl.allowed) {
const e = new Error(`RATE_LIMITED: retryAfter=${rl.retryAfter}`);
e.code = "RATE_LIMITED";
e.meta = { retryAfter: rl.retryAfter, surface, traceId };
throw e;
}
}
export const getInventoryDashboard = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("inv-dash");
try {
_rateLimitOrThrow("inventario.getInventoryDashboard", "staff", traceId);
await requireCajero(traceId);
const res = await wixData
.query(INVENTARIO_COL)
.eq("active", true)
.limit(100)
.find({ suppressAuth: true });
const items = res?.items || [];
const lowStock = items.filter((i) => Number(i.stockExpected ?? i.stockActual ?? 0) <= Number(i.minStock || 0));
return {
status: "SUCCESS",
data: {
totalProducts: items.length,
lowStockCount: lowStock.length,
products: items.map((i) => ({
_id: i._id,
sku: i.sku || "",
nombre: i.productName || i.nombre || i.nombreProducto || "",
stockActual: Number(i.stockExpected ?? i.stockActual ?? 0),
stockMinimo: Number(i.minStock || 0),
categoria: i.categoria || "",
})),
lowStockItems: lowStock.map((i) => ({
sku: i.sku || "",
nombre: i.productName || i.nombre || i.nombreProducto || "",
stockActual: Number(i.stockExpected ?? i.stockActual ?? 0),
stockMinimo: Number(i.minStock || 0),
})),
},
error: null,
};
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "INVENTORY_DASH_FAIL") };
}
});
export const getInventoryReconciliationQueue = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("inv-conciliation");
try {
_rateLimitOrThrow("inventario.getInventoryReconciliationQueue", "staff", traceId);
await requireCajero(traceId);
const res = await wixData
.query(CONCILIACION_COL)
.descending("createdAt")
.limit(100)
.find({ suppressAuth: true });
const items = res?.items || [];
return {
status: "SUCCESS",
data: { items, total: items.length },
error: null,
};
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "INVENTORY_QUEUE_FAIL") };
}
});
export async function recordOnlineInventoryOrderInternal(order, traceId) {
const orderId = _safeTrim(order?._id || order?.id || "");
if (!orderId) return { status: "SKIPPED", reason: "NO_ORDER_ID" };
const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
if (lineItems.length === 0) return { status: "SKIPPED", reason: "NO_LINE_ITEMS" };
let recorded = 0;
for (const item of lineItems) {
const sku = _safeTrim(item.sku || "");
const quantity = Number(item.quantity || 1);
if (!sku || quantity <= 0) continue;
const productRes = await wixData
.query(INVENTARIO_COL)
.eq("sku", sku)
.limit(1)
.find({ suppressAuth: true })
.catch(() => null);
const product = productRes?.items?.[0];
if (!product) continue;
const currentStock = Number(product.stockExpected ?? product.stockActual ?? 0);
const newStock = Math.max(0, currentStock - quantity);
const movement = {
sku,
orderId,
quantityDelta: -quantity,
stockBefore: currentStock,
stockAfter: newStock,
movementType: "VENTA_ONLINE",
source: "WIX_ECOM_ORDER",
traceId,
createdAt: new Date(),
};
await wixData.insert(MOVIMIENTO_COL, movement, { suppressAuth: true });
const { _createdDate, _updatedDate, _owner, ...safeProduct } = product;
await wixData.update(INVENTARIO_COL, {
...safeProduct,
stockExpected: newStock,
stockActual: newStock,
updatedAt: new Date(),
}, { suppressAuth: true });
recorded++;
}
return { status: "SUCCESS", data: { recorded }, error: null };
}
export async function recordOnlineInventoryRefundInternal(order, refundObj, restockInfo, traceId) {
const orderId = _safeTrim(order?._id || order?.id || "");
const refundId = _safeTrim(refundObj?._id || refundObj?.id || "");
if (!orderId || !refundId) return { status: "SKIPPED", reason: "NO_ORDER_OR_REFUND_ID" };
const hasRestock = restockInfo && Object.keys(restockInfo).length > 0;
if (!hasRestock) return { status: "SKIPPED", reason: "NO_CONFIRMED_RESTOCK" };
let recorded = 0;
const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
for (const item of lineItems) {
const sku = _safeTrim(item.sku || "");
const quantity = Number(item.quantity || 1);
if (!sku || quantity <= 0) continue;
const restockQty = Number(restockInfo?.[sku] || 0);
if (restockQty <= 0) continue;
const productRes = await wixData
.query(INVENTARIO_COL)
.eq("sku", sku)
.limit(1)
.find({ suppressAuth: true })
.catch(() => null);
const product = productRes?.items?.[0];
if (!product) continue;
const currentStock = Number(product.stockExpected ?? product.stockActual ?? 0);
const newStock = currentStock + restockQty;
const movement = {
sku,
orderId,
refundId,
quantityDelta: restockQty,
stockBefore: currentStock,
stockAfter: newStock,
movementType: "REEMBOLSO_RESTOCK",
source: "WIX_ECOM_REFUND",
traceId,
createdAt: new Date(),
};
await wixData.insert(MOVIMIENTO_COL, movement, { suppressAuth: true });
const { _createdDate, _updatedDate, _owner, ...safeProduct } = product;
await wixData.update(INVENTARIO_COL, {
...safeProduct,
stockExpected: newStock,
stockActual: newStock,
updatedAt: new Date(),
}, { suppressAuth: true });
recorded++;
}
return { status: "SUCCESS", data: { recorded }, error: null };
}