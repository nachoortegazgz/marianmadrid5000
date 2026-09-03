/*
=============================================================================
MODULE: backend/bookingsServiceSync.js
RESPONSIBILITY: Queue-driven one-way projection from SERVICIOS_RESERVA to Wix
                Bookings Services V2.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/

import wixData from "wix-data";
import { elevate } from "wix-auth";
import { services } from "wix-bookings.v2";
import { makeTraceId, _looksLikeGuid, _safeTrim, _extractRelationalId } from "public/mmUtils";
import { hashSHA256 } from "backend/securityEngine";
import { logger } from "backend/booking/bookingCore";
import { COLLECTIONS, SDK_CONFIG, SERVICE_CATALOG } from "backend/internalConfig";

const log = logger;
const QUEUE_COL = COLLECTIONS.BOOKINGS_SERVICE_SYNC_QUEUE || "BookingsServiceSyncQueue";
const MAX_ATTEMPTS = SDK_CONFIG?.JOBS?.BOOKINGS_SERVICE_SYNC_MAX_ATTEMPTS || 5;
const BATCH_SIZE = SDK_CONFIG?.JOBS?.BOOKINGS_SERVICE_SYNC_BATCH_SIZE || 20;
const BACKOFF_MS = SDK_CONFIG?.JOBS?.BOOKINGS_SERVICE_SYNC_BACKOFF_MS || 300000;
const VALID_STATUS = ["PENDING", "RETRY"];

const getServiceElevated = elevate(services.getService);
const updateServiceElevated = elevate(services.updateService);

function _cleanText(value, maxLength) {
    const text = String(value ?? "").trim();
    if (text.length > maxLength) throw new Error("SYNC_TEXT_TOO_LONG");
    return text;
}

function _cleanGuid(value, errorCode) {
    const guid = _extractRelationalId(value);
    if (!_looksLikeGuid(guid)) throw new Error(errorCode);
    return guid;
}

function _cleanGuidList(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((entry) => _extractRelationalId(entry)).filter((id) => _looksLikeGuid(id))));
}

function _buildDesiredProjection(item) {
    const title = _cleanText(item.tituloServicio || item.title, 160);
    const duration = Number(item.duracionTotal || item.duration) || 0;
    const price = Number(item.precio || item.price) || 0;
    const currency = _safeTrim(item.moneda || item.currency) || SERVICE_CATALOG.CURRENCY;
    const isHidden = item.oculto === true;
    const isActive = _safeTrim(item.estado || item.status) === "ACTIVO";

    const staffIds = [];
    try {
        const parsed = typeof item.personalDisponible === "string" ? JSON.parse(item.personalDisponible) : item.personalDisponible;
        if (parsed && Array.isArray(parsed.staffIds)) {
            staffIds.push(...parsed.staffIds);
        } else if (Array.isArray(item.personalDisponible)) {
            staffIds.push(...item.personalDisponible);
        }
    } catch (_) {}

    return {
        service: {
            name: title,
            description: _cleanText(item.descripcionLarga || item.description, 6000),
            tagLine: _cleanText(item.resumenCorto || item.tagLine, 120),
            categoryId: _cleanGuid(item.idCategoria || item.categoryId || "c97726db-84aa-4a08-b34e-7fda9e17702e", "SYNC_CATEGORY_INVALID"),
            status: isActive ? "CREATED" : "DRAFT",
            hidden: isHidden,
            paymentOptions: {
                wixPayOnline: item.pagoOnline !== false,
                wixPayInPerson: item.pagoPresencial !== false,
            },
            schedule: {
                durationInMinutes: duration,
                bufferTimeInMinutes: Number(item.margenTiempo || item.bufferTime) || 0,
            },
            rate: {
                labeledPriceOptions: {
                    general: { amount: String(price), currency },
                },
            },
        },
        staffIds: _cleanGuidList(staffIds),
    };
}

export async function enqueueBookingsServiceSync(serviceItem) {
    if (!serviceItem || typeof serviceItem !== "object") return null;
    const serviceId = _extractRelationalId(serviceItem.idServicio || serviceItem.serviceId);
    if (!_looksLikeGuid(serviceId)) return null;

    const desired = _buildDesiredProjection(serviceItem);
    const payloadHash = hashSHA256(JSON.stringify(desired));

    const queueRecord = {
        _id: `SYNC_${serviceId}`,
        serviceId,
        desiredPayload: desired,
        payloadHash,
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        updatedAt: new Date(),
    };

    try {
        return await wixData.save(QUEUE_COL, queueRecord, { suppressAuth: true });
    } catch (err) {
        // Fallback por si la coleccion fue creada con ID en mayusculas
        if (String(err?.message || "").includes("WDE0025")) {
            return await wixData.save(COLLECTIONS.BOOKINGS_SERVICE_SYNC_QUEUE_UPPER || "BOOKINGS_SERVICE_SYNC_QUEUE", queueRecord, { suppressAuth: true });
        }
        throw err;
    }
}

export async function processBookingsServiceSyncQueue(options = {}) {
    const traceId = options.traceId || makeTraceId("cron-bookings-sync");
    const now = new Date();

    let pending;
    let queueCollection = QUEUE_COL;
    try {
        pending = await wixData.query(QUEUE_COL)
            .hasSome("status", VALID_STATUS)
            .le("nextAttemptAt", now)
            .limit(BATCH_SIZE)
            .find({ suppressAuth: true, consistentRead: true });
    } catch (err) {
        if (String(err?.message || "").includes("WDE0025")) {
            queueCollection = COLLECTIONS.BOOKINGS_SERVICE_SYNC_QUEUE_UPPER || "BOOKINGS_SERVICE_SYNC_QUEUE";
            pending = await wixData.query(queueCollection)
                .hasSome("status", VALID_STATUS)
                .le("nextAttemptAt", now)
                .limit(BATCH_SIZE)
                .find({ suppressAuth: true, consistentRead: true });
        } else {
            throw err;
        }
    }

    let completed = 0;
    let failed = 0;

    for (const item of pending?.items || []) {
        try {
            const currentService = await getServiceElevated(item.serviceId);
            if (currentService?.service) {
                const patch = {
                    name: item.desiredPayload.service.name,
                    description: item.desiredPayload.service.description,
                    tagLine: item.desiredPayload.service.tagLine,
                    hidden: item.desiredPayload.service.hidden,
                    schedule: item.desiredPayload.service.schedule,
                    rate: item.desiredPayload.service.rate,
                };
                await updateServiceElevated(item.serviceId, patch);
            }

            const { _createdDate, _updatedDate, _owner, ...safeItem } = item;
            await wixData.update(queueCollection, {
                ...safeItem,
                status: "COMPLETED",
                completedAt: new Date(),
                updatedAt: new Date(),
            }, { suppressAuth: true }).catch(() => {
                return wixData.update(COLLECTIONS.BOOKINGS_SERVICE_SYNC_QUEUE_UPPER || "BOOKINGS_SERVICE_SYNC_QUEUE", {
                    ...safeItem,
                    status: "COMPLETED",
                    completedAt: new Date(),
                    updatedAt: new Date(),
                }, { suppressAuth: true });
            });
            completed++;
        } catch (err) {
            const attempts = Number(item.attempts || 0) + 1;
            const isTerminal = attempts >= MAX_ATTEMPTS;
            const { _createdDate, _updatedDate, _owner, ...safeItem } = item;
            await wixData.update(QUEUE_COL, {
                ...safeItem,
                status: isTerminal ? "FAILED" : "RETRY",
                attempts,
                lastError: err?.message || "SYNC_ERROR",
                nextAttemptAt: new Date(Date.now() + BACKOFF_MS * Math.pow(2, attempts - 1)),
                updatedAt: new Date(),
            }, { suppressAuth: true }).catch(() => null);
            failed++;
        }
    }
    return { status: "SUCCESS", data: { scanned: pending?.items?.length || 0, completed, failed }, error: null };
}
