/*
=============================================================================
MODULE: backend/inventario.web.js
RESPONSIBILITY: Internal inventory management with native optimistic concurrency.
STANDARDS: G10 ASCII Strict, Velo Native Optimized.
=============================================================================
*/

import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { currentMember } from "wix-members-backend";
import { makeTraceId, _safeTrim, _executeWithRetry, _generateUUID } from "public/mmUtils";
import { COLLECTIONS } from "backend/internalConfig";
import { BookingError, ERROR_CODES } from "backend/booking/bookingCore";
import { requireCajero, isStaffCollaborator } from "backend/security";

const PRODUCTOS_COL = COLLECTIONS.INVENTARIO_PRODUCTO;
const MOVIMIENTO_COL = COLLECTIONS.MOVIMIENTO_INVENTARIO;
const CONCILIACION_COL = COLLECTIONS.CONCILIACION_STOCK_WIX;

export const registerInternalInventoryUse = webMethod(Permissions.SiteMember, async (payload = {}) => {
    const traceId = makeTraceId("inv-use");
    try {
        const isCollab = await isStaffCollaborator(traceId);
        if (!isCollab) throw new BookingError(ERROR_CODES.ACCESS_DENIED, "Requiere permisos de personal.");

        const member = await currentMember.getMember({ fieldsets: ["FULL"] }).catch(() => null);
        const lines = Array.isArray(payload.lines) ? payload.lines : [];
        const results = [];
        const now = new Date();

        for (const line of lines) {
            const sku = _safeTrim(line.sku);
            const quantity = Math.abs(Number(line.quantity) || 0);
            if (!sku || quantity <= 0) continue;

            const updateResult = await _executeWithRetry(async () => {
                const productRes = await wixData.query(PRODUCTOS_COL).eq("sku", sku).limit(1).find({ suppressAuth: true });
                const product = productRes?.items?.[0];
                if (!product) return null;

                const currentStock = Number(product.stockDisponible ?? product.stockExpected ?? 0);
                const newStock = Math.max(0, currentStock - quantity);
                const movementToken = `USE_${sku}_${Date.now()}_${_generateUUID().slice(0, 6)}`;

                // Actualizacion atomica. Si falla por concurrencia, el bucle reintenta.
                await wixData.update(PRODUCTOS_COL, {
                    ...product,
                    stockDisponible: newStock,
                    stockExpected: newStock,
                    idUltimoMovimientoInventario: movementToken,
                    updatedAt: now,
                }, { suppressAuth: true });

                const mov = {
                    _id: movementToken, movementToken, sku,
                    nombreProducto: product.nombreProducto || sku,
                    quantity: -quantity, quantityDelta: -quantity,
                    stockBefore: currentStock, stockAfter: newStock,
                    movementType: "CONSUMO_PROFESIONAL",
                    reason: _safeTrim(line.note) || "Consumo en salon",
                    actorEmail: member?.loginEmail || "system",
                    requiresWixReconciliation: true,
                    traceId, createdAt: now,
                };
                await wixData.insert(MOVIMIENTO_COL, mov, { suppressAuth: true });

                await wixData.insert(CONCILIACION_COL, {
                    _id: `RECON_${movementToken}`, movementToken, sku,
                    quantityDelta: -quantity, status: "PENDING",
                    reason: _safeTrim(line.note) || "Consumo en salon",
                    source: "ONLY_STAFF_USE", traceId, createdAt: now,
                }, { suppressAuth: true });

                return { sku, quantityDelta: -quantity, newStockDisponible: newStock };
            }, 5, 200);

            if (updateResult) results.push(updateResult);
        }
        return { status: "SUCCESS", data: { results }, error: null };
    } catch (error) {
        return { status: "ERROR", data: null, error: { code: "INVENTORY_USE_FAIL", message: error?.message } };
    }
});