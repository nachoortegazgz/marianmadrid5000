/*
=============================================================================
MODULE: backend/crons.js
RESPONSIBILITY: Scheduled background jobs with lightweight atomic locks,
                safe purging, and health monitoring.
STANDARDS: G10 ASCII Strict, Velo Native Optimized.
=============================================================================
*/

import wixData from "wix-data";
import { elevate } from "wix-auth";
import { extendedBookings } from "@wix/bookings";
import { makeTraceId, _addDaysYMD, _normalizeIdPart } from "public/mmUtils";
import { COLLECTIONS, SDK_CONFIG } from "backend/internalConfig";
import { cancelBookingElevated, logger } from "backend/booking/bookingCore";
import { _cleanExpiredDualSlotsInternal, purgeExpiredRamCaches } from "backend/reservas.web";
import { _verifyIntegrityInternal, _registerZClosingInternal, processPendingFiscalRecoveries } from "backend/cajas.web";
import { processBookingsServiceSyncQueue } from "backend/bookingsServiceSync";
import { prepareScheduledManagerPackages } from "backend/fiscalDocuments.web";

const log = logger;
const DELETE_BATCH_SIZE = SDK_CONFIG.JOBS.DELETE_BATCH_SIZE || 100;
const FISCAL_RECOVERY_BATCH_SIZE = SDK_CONFIG.JOBS.FISCAL_RECOVERY_BATCH_SIZE || 25;
const COMPENSATION_BATCH_SIZE = Math.max(1, Math.min(FISCAL_RECOVERY_BATCH_SIZE, 100));
const COMPLETED_COMPENSATION_RETENTION_DAYS = 30;
const queryExtendedBookingsElevated = elevate(extendedBookings.queryExtendedBookings);

// Bloqueo atómico ultra-ligero para evitar ejecuciones dobles del mismo Cron
async function _withJobMutex(jobName, traceId, executeFn) {
    const safeJobName = _normalizeIdPart(jobName, 40);
    const lockId = `cron_lock_${safeJobName}`;
    
    try {
        // Inserción atómica. Falla nativamente si ya existe (WDE0123)
        await wixData.insert(COLLECTIONS.LOCKS, {
            _id: lockId,
            traceId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 55000) // 55s TTL (Crons corren cada minuto max)
        }, { suppressAuth: true });
        
        const result = await executeFn();
        
        // Liberar bloqueo al terminar
        await wixData.remove(COLLECTIONS.LOCKS, lockId, { suppressAuth: true }).catch(() => null);
        return result;
    } catch (error) {
        if (String(error?.message).includes("WDE0123") || String(error?.message).includes("WD_ITEM_ALREADY_EXISTS")) {
            log.info(`[CRON] Job ${safeJobName} skipped: already running`, { traceId });
            return { status: "SKIPPED", data: { reason: "CONCURRENT_JOB_RUNNING" }, error: null };
        }
        await wixData.remove(COLLECTIONS.LOCKS, lockId, { suppressAuth: true }).catch(() => null);
        throw error;
    }
}

async function _removeByQuery(collectionName, queryBuilder, traceId, label) {
    try {
        const res = await queryBuilder.limit(DELETE_BATCH_SIZE).find({ suppressAuth: true });
        const items = res?.items || [];
        if (!items.length) return { status: "SUCCESS", data: { removed: 0 }, error: null };

        const itemIds = items.map(item => item._id);
        await wixData.bulkRemove(collectionName, itemIds, { suppressAuth: true });
        
        return { status: "SUCCESS", data: { removed: itemIds.length }, error: null };
    } catch (error) {
        log.error(`[CRON] ${label} failed`, { error: error?.message, traceId });
        return { status: "ERROR", data: null, error: { code: "CRON_FAIL", message: error?.message } };
    }
}

export async function runPendingCompensationsJob() {
    const traceId = makeTraceId("cron-compensations");
    return await _withJobMutex("runPendingCompensationsJob", traceId, async () => {
        const fiscalResult = await processPendingFiscalRecoveries({ traceId, limit: FISCAL_RECOVERY_BATCH_SIZE });
        return { status: "SUCCESS", data: { fiscalRecoveries: fiscalResult?.data || null }, error: null };
    });
}

export async function cleanExpiredLocks() {
    const traceId = makeTraceId("cron-locks");
    const now = new Date();
    return await _removeByQuery(COLLECTIONS.LOCKS, wixData.query(COLLECTIONS.LOCKS).lt("expiresAt", now), traceId, "cleanLocks");
}

export async function cleanupExpiredDualCache() {
    const traceId = makeTraceId("cron-dual");
    return await _cleanExpiredDualSlotsInternal({ limit: SDK_CONFIG.JOBS.DUAL_CACHE_CLEANUP_LIMIT, traceId });
}

export async function cleanExpiredBookingTransactions() {
    const traceId = makeTraceId("cron-clean-transactions");
    const now = new Date();
    return await _removeByQuery(COLLECTIONS.TRANSACTIONS, wixData.query(COLLECTIONS.TRANSACTIONS).lt("updatedAt", new Date(now.getTime() - 86400000)), traceId, "cleanTransactions");
}

export async function cleanOldCompletedCompensations() {
    const traceId = makeTraceId("cron-clean-compensations");
    const cutoff = new Date(Date.now() - COMPLETED_COMPENSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return await _removeByQuery(COLLECTIONS.COMPENSATIONS, wixData.query(COLLECTIONS.COMPENSATIONS).eq("status", "COMPLETED").lt("updatedAt", cutoff), traceId, "cleanOldCompletedCompensations");
}

export async function processFiscalRecoveryQueue() {
    const traceId = makeTraceId("cron-fiscal-recovery");
    return await _withJobMutex("processFiscalRecoveryQueue", traceId, async () => {
        return await processPendingFiscalRecoveries({ traceId, limit: FISCAL_RECOVERY_BATCH_SIZE });
    });
}

export async function processBookingsServiceSyncJob() {
    const traceId = makeTraceId("cron-bookings-service-sync");
    return await _withJobMutex("processBookingsServiceSyncJob", traceId, async () => {
        return await processBookingsServiceSyncQueue({ traceId });
    });
}

export async function prepareManagerPackagesJob() {
    const traceId = makeTraceId("cron-packages");
    return await _withJobMutex("prepareManagerPackagesJob", traceId, async () => {
        return await prepareScheduledManagerPackages({ traceId });
    });
}

export async function verifyNightlyZClosing() {
    const traceId = makeTraceId("cron-zclosing");
    return await _withJobMutex("verifyNightlyZClosing", traceId, async () => {
        const tz = SDK_CONFIG?.TZ || "Europe/Madrid";
        const nowMadridYmd = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
        const diaKey = _addDaysYMD(nowMadridYmd, -1);

        const existing = await wixData.query(COLLECTIONS.HISTORICO_CIERRES_Z).eq("diaKey", diaKey).limit(1).find({ suppressAuth: true });
        if (existing.items?.length > 0) return { status: "SUCCESS", data: { idempotent: true, diaKey }, error: null };

        const integrity = await _verifyIntegrityInternal(diaKey, { traceId });
        if (!integrity || !integrity.integrityOk) {
            log.error("[CRON] Integrity violation, Z-Closing aborted", { diaKey, traceId });
            return { status: "ERROR", data: null, error: { code: "INTEGRITY_VIOLATION", message: "Integrity violation" } };
        }

        return await _registerZClosingInternal(diaKey, { traceId, autoCron: true });
    });
}