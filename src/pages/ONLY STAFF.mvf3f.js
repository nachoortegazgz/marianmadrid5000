/*
=============================================================================
MODULE: pages/ONLY STAFF.mvf3f.js
RESPONSIBILITY: Canonical Velo page controller for staff operations (#htmlOnlyStaff).
STANDARDS: G10 ASCII Strict, Declarative Command Dispatch, Velo Native.
=============================================================================
*/

import wixMembersFrontend from "wix-members-frontend";
import wixLocation from "wix-location";
import { checkStaffCollaboratorAccess } from "backend/security.web";
import { getMyStaffContext, getStaffOptionsForAdmin, registrarFichaje, getEstadoJornada, getHistorialFichajes, calcularHorasTrabajadas, registrarAjusteHorario } from "backend/horario.web";
import { registerManualTransaction, getCashierState, registerZClosing, registerXCount } from "backend/cajas.web";
import { getInventoryDashboard, registerInternalInventoryUse, registerInventoryReceipt, getInventoryReconciliationQueue, markInventoryReconciliationApplied } from "backend/inventario.web";
import { makeTraceId, _safeTrim } from "public/mmUtils";
import { createWidgetBridge } from "public/widgetBridge";

$w.onReady(async function () {
    const traceId = makeTraceId("only-staff");
    const widget = $w("#htmlOnlyStaff");
    if (!widget || typeof widget.postMessage !== "function") return;

    const member = await wixMembersFrontend.currentMember.getMember().catch(() => null);
    if (!member) {
        await wixMembersFrontend.authentication.promptLogin();
        return;
    }

    const [accessRes, staffContextRes] = await Promise.all([
        checkStaffCollaboratorAccess(traceId).catch(() => null),
        getMyStaffContext({ traceId }).catch(() => null),
    ]);
    const access = accessRes?.status === "SUCCESS" ? accessRes.data : null;
    const staffContext = staffContextRes?.status === "SUCCESS" ? staffContextRes.data : null;

    if (!access || !staffContext?.resourceId) {
        wixLocation.to("/reserva-online");
        return;
    }

    const employeeResourceId = staffContext.resourceId;
    const staffOptions = access.isAdmin ? (await getStaffOptionsForAdmin({ traceId }).catch(() => ({})))?.data || [] : [];

    const ACTIONS = {
        CLOCK: ({ payload }) => registrarFichaje({ resourceId: employeeResourceId, tipoFichaje: _safeTrim(payload?.tipoFichaje).toUpperCase(), traceId }),
        GET_STATE: () => getEstadoJornada(employeeResourceId, { traceId }),
        GET_HISTORY: ({ payload }) => getHistorialFichajes(employeeResourceId, payload?.startDateYMD, payload?.endDateYMD, { traceId }),
        HOURS_CALC: ({ payload }) => calcularHorasTrabajadas(employeeResourceId, payload?.startDateYMD, payload?.endDateYMD, { traceId }),
        ADJUSTMENT: ({ payload }) => access.isAdmin ? registrarAjusteHorario({ resourceId: _safeTrim(payload?.employeeId), motivoAjuste: _safeTrim(payload?.motivoAjuste), traceId }) : { status: "ERROR", error: { code: "ADMIN_REQUIRED", message: "Permisos de admin requeridos" } },
        TPV_TX: ({ payload }) => (access.isAdmin || access.isCajero) ? registerManualTransaction({ amount: Number(payload?.amount), paymentMethod: _safeTrim(payload?.paymentMethod).toUpperCase(), tipoMovimiento: _safeTrim(payload?.transactionKind).toUpperCase() === "PROPINA" ? "PROPINA" : "", concept: _safeTrim(payload?.concept), resourceId: employeeResourceId, traceId }) : { status: "ERROR", error: { code: "CASHIER_REQUIRED", message: "Permisos de caja requeridos" } },
        CASHIER_STATE: ({ payload }) => (access.isAdmin || access.isCajero) ? getCashierState({ traceId, diaKey: payload?.diaKey || null }) : { status: "ERROR", error: { code: "CASHIER_REQUIRED", message: "Permisos de caja requeridos" } },
        X_COUNT: ({ payload }) => (access.isAdmin || access.isCajero) ? registerXCount(payload?.diaKey, { metalicoCaja: Number(payload?.metalicoCaja), traceId }) : { status: "ERROR", error: { code: "CASHIER_REQUIRED", message: "Permisos de caja requeridos" } },
        Z_CLOSING: ({ payload }) => access.isAdmin ? registerZClosing(payload?.diaKey, { traceId }) : { status: "ERROR", error: { code: "ADMIN_REQUIRED", message: "Permisos de admin requeridos" } },
        INVENTORY_DASH: () => getInventoryDashboard(),
        INVENTORY_USE: ({ payload }) => registerInternalInventoryUse({ lines: [{ sku: _safeTrim(payload?.sku), quantity: Number(payload?.quantity), note: _safeTrim(payload?.note) }] }),
        INVENTORY_RECEIPT: ({ payload }) => (access.isAdmin || access.isCajero) ? registerInventoryReceipt({ lines: [{ sku: _safeTrim(payload?.sku), quantity: Number(payload?.quantity), note: _safeTrim(payload?.note) }] }) : { status: "ERROR", error: { code: "CASHIER_REQUIRED", message: "Permisos de caja requeridos" } },
        INVENTORY_QUEUE: () => (access.isAdmin || access.isCajero) ? getInventoryReconciliationQueue() : { status: "ERROR", error: { code: "CASHIER_REQUIRED", message: "Permisos de caja requeridos" } },
        INVENTORY_APPLY: ({ payload }) => (access.isAdmin || access.isCajero) ? markInventoryReconciliationApplied(_safeTrim(payload?.reconciliationId), _safeTrim(payload?.note)) : { status: "ERROR", error: { code: "CASHIER_REQUIRED", message: "Permisos de caja requeridos" } },
        NAV: ({ payload }) => {
            const target = _safeTrim(payload?.target).toUpperCase();
            if (target === "SERVICIOS" || target === "BACK") wixLocation.to("/reserva-online");
        },
        MM_NAV: ({ payload }) => {
            const target = _safeTrim(payload?.target).toUpperCase();
            if (target === "SERVICIOS" || target === "BACK") wixLocation.to("/reserva-online");
        }
    };

    createWidgetBridge(widget, {
        slug: "only-staff",
        traceId,
        onContextReady: async () => {
            const [stateRes, cashierRes, inventoryRes, inventoryQueueRes] = await Promise.all([
                getEstadoJornada(employeeResourceId, { traceId }).catch(() => null),
                access.isAdmin || access.isCajero ? getCashierState({ traceId }).catch(() => null) : Promise.resolve(null),
                getInventoryDashboard().catch(() => null),
                access.isAdmin || access.isCajero ? getInventoryReconciliationQueue().catch(() => null) : Promise.resolve(null),
            ]);

            return {
                employeeResourceId,
                employeeName: staffContext.displayName || "EMPLEADO",
                memberName: staffContext.displayName || "EMPLEADO",
                isAdmin: access.isAdmin === true,
                isCajero: access.isCajero === true,
                isMarianManager: access.isMarianManager === true,
                roleLabel: access.isAdmin ? "ADMINISTRACION" : (access.isCajero ? "CAJA" : "EQUIPO"),
                timeZone: "Europe/Madrid",
                currencyCode: "EUR",
                access,
                staffOptions,
                estadoInicial: stateRes?.status === "SUCCESS" ? stateRes.data : null,
                cashierState: cashierRes?.status === "SUCCESS" ? cashierRes.data : null,
                inventory: inventoryRes?.status === "SUCCESS" ? inventoryRes.data : null,
                inventoryQueue: inventoryQueueRes?.status === "SUCCESS" ? (inventoryQueueRes.data?.items || []) : [],
                today: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }),
            };
        },
        onWidgetMessage: async (msg, reply) => {
            const type = String(msg?.type || "").trim().toUpperCase();
            const handler = ACTIONS[type];
            if (!handler) {
                reply(`${type}_RES`, { status: "ERROR", error: { code: "UNKNOWN_ACTION", message: "Accion no reconocida" } });
                return;
            }
            try {
                const result = await handler({ payload: msg?.payload, traceId });
                if (result !== undefined) reply(`${type}_RES`, result);
            } catch (err) {
                reply(`${type}_RES`, { status: "ERROR", error: { code: "ACTION_FAILED", message: err?.message || String(err) } });
            }
        }
    });
});