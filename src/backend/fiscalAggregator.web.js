/*
=============================================================================
MODULE: backend/fiscalAggregator.web.js
RESPONSIBILITY: Memory-efficient tax review summaries and internal ledger extracts.
STANDARDS: G10 ASCII Strict, Stream Accumulator Pattern, Velo Native.
=============================================================================
*/

import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { COLLECTIONS, SDK_CONFIG, TIPO_MOVIMIENTO } from "backend/internalConfig";
import { makeTraceId, _safeTrim, _roundMoney } from "public/mmUtils";
import { requireAdmin, requireCajero, rateLimiter } from "backend/security";
import { logger } from "backend/booking/bookingCore";
import { _toPublicError } from "backend/responseUtils";

const log = logger;
const CHUNK_PAGE_SIZE = 100;
const MAX_PAGES = SDK_CONFIG?.JOBS?.FISCAL_DAILY_MAX_PAGES || 50;

function _rateLimitOrThrow(surface, key, traceId) {
    const rl = rateLimiter({ surface, key });
    if (!rl.allowed) {
        const e = new Error(`RATE_LIMITED: retryAfter=${rl.retryAfter}`);
        e.code = "RATE_LIMITED";
        e.meta = { retryAfter: rl.retryAfter, surface, traceId };
        throw e;
    }
}

function _getQuarterMonths(year, quarter) {
    const y = Number(year);
    const q = Number(quarter);
    if (!Number.isFinite(y) || !Number.isFinite(q) || q < 1 || q > 4) return [];

    const monthMap = {
        1: ["01", "02", "03"],
        2: ["04", "05", "06"],
        3: ["07", "08", "09"],
        4: ["10", "11", "12"],
    };

    return monthMap[q].map((m) => `${y}-${m}`);
}

function _initTaxAccumulator(months) {
    const breakdownByMonth = {};
    months.forEach((m) => {
        breakdownByMonth[m] = { baseImponible: 0, cuotaIva: 0, total: 0, count: 0 };
    });

    return {
        totalBaseImponible: 0,
        totalCuotaIva: 0,
        totalFacturado: 0,
        totalVentas: 0,
        totalReembolsos: 0,
        totalPropinas: 0,
        totalAjustes: 0,
        countVentas: 0,
        countReembolsos: 0,
        countPropinas: 0,
        countAjustes: 0,
        countFiscal: 0,
        totalOperaciones: 0,
        breakdownByPaymentMethod: { efectivo: 0, tarjeta: 0, bizum: 0, online: 0 },
        breakdownByMonth,
        breakdownByVatRate: {},
    };
}

function _accumulatePage(items, state) {
    for (const m of items) {
        state.totalOperaciones++;
        const importeContable = Number(m.importeContable) || 0;
        const base = Number(m.baseImponible) || 0;
        const cuota = Number(m.cuotaIva) || 0;
        const mes = _safeTrim(m.mesKey);
        const formaPago = _safeTrim(m.formaPago).toLowerCase();
        const tasaIva = Number(m.tasaIva) || 0;
        const tasaIvaKey = String(tasaIva);
        const tipoMovimiento = _safeTrim(m.tipoMovimiento).toUpperCase();
        
        const naturaleza = _safeTrim(m.naturalezaOperacion).toUpperCase() || (
            tipoMovimiento === TIPO_MOVIMIENTO.PROPINA ? "PROPINA" :
            tipoMovimiento === TIPO_MOVIMIENTO.REEMBOLSO || importeContable < 0 ? "DEVOLUCION" :
            tipoMovimiento === TIPO_MOVIMIENTO.AJUSTE ? "AJUSTE" : "VENTA"
        );

        if (state.breakdownByPaymentMethod[formaPago] !== undefined) {
            state.breakdownByPaymentMethod[formaPago] += importeContable;
        }

        if (naturaleza === "PROPINA") {
            state.totalPropinas += importeContable;
            state.countPropinas++;
            continue;
        }
        if (naturaleza === "AJUSTE") {
            state.totalAjustes += importeContable;
            state.countAjustes++;
            continue;
        }

        state.countFiscal++;
        state.totalBaseImponible += base;
        state.totalCuotaIva += cuota;
        state.totalFacturado += importeContable;

        if (naturaleza === "VENTA") {
            state.totalVentas += importeContable;
            state.countVentas++;
        } else {
            state.totalReembolsos += importeContable;
            state.countReembolsos++;
        }

        if (state.breakdownByMonth[mes]) {
            state.breakdownByMonth[mes].baseImponible += base;
            state.breakdownByMonth[mes].cuotaIva += cuota;
            state.breakdownByMonth[mes].total += importeContable;
            state.breakdownByMonth[mes].count++;
        }

        if (!state.breakdownByVatRate[tasaIvaKey]) {
            state.breakdownByVatRate[tasaIvaKey] = { tasaIva, baseImponible: 0, cuotaIva: 0, total: 0, operaciones: 0 };
        }
        state.breakdownByVatRate[tasaIvaKey].baseImponible += base;
        state.breakdownByVatRate[tasaIvaKey].cuotaIva += cuota;
        state.breakdownByVatRate[tasaIvaKey].total += importeContable;
        state.breakdownByVatRate[tasaIvaKey].operaciones++;
    }
}

export const getQuarterlyTaxSummary = webMethod(Permissions.SiteMember, async (year, quarter, options = {}) => {
    const traceId = options.traceId || makeTraceId("tax-303");
    try {
        _rateLimitOrThrow("fiscal.getQuarterlyTaxSummary", "staff", traceId);
        await requireCajero(traceId);

        const y = Number(year);
        const q = Number(quarter);
        if (!Number.isFinite(y) || !Number.isFinite(q) || q < 1 || q > 4) {
            return { status: "ERROR", data: null, error: { code: "INVALID_PARAMS", message: "year and quarter (1-4) are required." } };
        }

        const months = _getQuarterMonths(y, q);
        const state = _initTaxAccumulator(months);

        let query = wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
            .hasSome("mesKey", months)
            .ascending("seqGlobal")
            .limit(CHUNK_PAGE_SIZE);

        let res = await query.find({ suppressAuth: true, consistentRead: false });
        if (res?.items) _accumulatePage(res.items, state);

        let page = 2;
        while (res && res.hasNext() && page <= MAX_PAGES) {
            res = await res.next({ suppressAuth: true, consistentRead: false });
            if (res?.items) _accumulatePage(res.items, state);
            page++;
        }

        return {
            status: "SUCCESS",
            data: {
                ejercicio: y,
                trimestre: q,
                periodoMeses: months,
                totalOperaciones: state.totalOperaciones,
                totalOperacionesFiscales: state.countFiscal,
                conteo: {
                    ventas: state.countVentas,
                    reembolsos: state.countReembolsos,
                    propinas: state.countPropinas,
                    ajustes: state.countAjustes,
                },
                borradorIva: {
                    estado: "REVISION_PROFESIONAL_REQUERIDA",
                    baseImponibleRegistrada: _roundMoney(state.totalBaseImponible),
                    cuotaIvaRegistrada: _roundMoney(state.totalCuotaIva),
                    nota: "No es un Modelo 303 oficial. Requiere validacion previa por gestoria.",
                },
                borradorIngresos: {
                    estado: "REVISION_PROFESIONAL_REQUERIDA",
                    ingresosRegistrados: _roundMoney(state.totalBaseImponible),
                    nota: "No es un Modelo 130 oficial. Requiere validacion previa por gestoria.",
                },
                totales: {
                    totalVentasBrutas: _roundMoney(state.totalVentas),
                    totalReembolsos: _roundMoney(state.totalReembolsos),
                    totalFacturadoNeto: _roundMoney(state.totalFacturado),
                    totalPropinasSeparadas: _roundMoney(state.totalPropinas),
                    totalAjustesSeparados: _roundMoney(state.totalAjustes),
                },
                desgloseFormaPago: {
                    efectivo: _roundMoney(state.breakdownByPaymentMethod.efectivo),
                    tarjeta: _roundMoney(state.breakdownByPaymentMethod.tarjeta),
                    bizum: _roundMoney(state.breakdownByPaymentMethod.bizum),
                    online: _roundMoney(state.breakdownByPaymentMethod.online),
                },
                desgloseMensual: Object.keys(state.breakdownByMonth).map((mesKey) => ({
                    mesKey,
                    baseImponible: _roundMoney(state.breakdownByMonth[mesKey].baseImponible),
                    cuotaIva: _roundMoney(state.breakdownByMonth[mesKey].cuotaIva),
                    total: _roundMoney(state.breakdownByMonth[mesKey].total),
                    operaciones: state.breakdownByMonth[mesKey].count,
                })),
                desgloseTipoIva: Object.values(state.breakdownByVatRate).map((item) => ({
                    tasaIva: item.tasaIva,
                    baseImponible: _roundMoney(item.baseImponible),
                    cuotaIva: _roundMoney(item.cuotaIva),
                    total: _roundMoney(item.total),
                    operaciones: item.operaciones,
                })),
            },
            error: null,
        };
    } catch (err) {
        log.error("getQuarterlyTaxSummary failed", { error: err?.message, traceId });
        return { status: "ERROR", data: null, error: _toPublicError(err, "TAX_SUMMARY_FAIL") };
    }
});

export const getLibroRegistroFacturasExpedidas = webMethod(Permissions.Admin, async (year, quarter, options = {}) => {
    const traceId = options.traceId || makeTraceId("libro-registro");
    try {
        _rateLimitOrThrow("fiscal.getLibroRegistroFacturasExpedidas", "admin", traceId);
        await requireAdmin(traceId);

        const y = Number(year);
        const q = Number(quarter);
        if (!Number.isFinite(y) || !Number.isFinite(q) || q < 1 || q > 4) {
            return { status: "ERROR", data: null, error: { code: "INVALID_PARAMS", message: "year and quarter (1-4) are required." } };
        }

        const months = _getQuarterMonths(y, q);
        let libroFilas = [];
        let orderIndex = 1;

        let query = wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA)
            .hasSome("mesKey", months)
            .ascending("seqGlobal")
            .limit(CHUNK_PAGE_SIZE);

        let res = await query.find({ suppressAuth: true, consistentRead: false });
        
        const mapItems = (items) => {
            for (const m of items) {
                libroFilas.push({
                    orden: orderIndex++,
                    numTicketFactura: _safeTrim(m.numTicketFactura || m.numeroTicket),
                    fechaExpedicion: _safeTrim(m.diaKey),
                    tipoFactura: m.tipoMovimiento === "REEMBOLSO" || Number(m.importeContable) < 0 ? "R1" : "BORRADOR_INTERNO",
                    tipoMovimiento: _safeTrim(m.tipoMovimiento),
                    naturalezaOperacion: _safeTrim(m.naturalezaOperacion) || "VENTA",
                    tratamientoIva: _safeTrim(m.tratamientoIva) || "PENDIENTE_VALIDACION",
                    incluidoEnBorradorIva: _safeTrim(m.naturalezaOperacion).toUpperCase() !== "PROPINA" && _safeTrim(m.naturalezaOperacion).toUpperCase() !== "AJUSTE",
                    referenciaRectificativa: _safeTrim(m.referenciaRectificativa) || null,
                    formaPago: _safeTrim(m.formaPago),
                    baseImponible: _roundMoney(m.baseImponible),
                    tipoIva: `${Math.round((Number(m.tasaIva) || 0) * 100)}%`,
                    cuotaIva: _roundMoney(m.cuotaIva),
                    importeTotal: _roundMoney(m.importeContable),
                    concepto: _safeTrim(m.concepto),
                    origen: _safeTrim(m.origen),
                    orderId: _safeTrim(m.orderId) || null,
                    refundId: _safeTrim(m.refundId) || null,
                    fechaHoraRegistro: m.fechaCreacion || null,
                    huellaSha256: _safeTrim(m.hashCadena).slice(0, 8).toUpperCase(),
                    hashCompleto: _safeTrim(m.hashCadena),
                    reservaVinculada: _safeTrim(m.reservaIdVinculada) || null,
                    transactionId: _safeTrim(m.transactionId),
                });
            }
        };

        if (res?.items) mapItems(res.items);

        let page = 2;
        while (res && res.hasNext() && page <= MAX_PAGES) {
            res = await res.next({ suppressAuth: true, consistentRead: false });
            if (res?.items) mapItems(res.items);
            page++;
        }

        return {
            status: "SUCCESS",
            data: {
                ejercicio: y,
                trimestre: q,
                totalRegistros: libroFilas.length,
                filas: libroFilas,
            },
            error: null,
        };
    } catch (err) {
        log.error("getLibroRegistroFacturasExpedidas failed", { error: err?.message, traceId });
        return { status: "ERROR", data: null, error: _toPublicError(err, "LIBRO_REGISTRO_FAIL") };
    }
});