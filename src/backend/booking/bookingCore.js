/**
=============================================================================
MODULE: backend/booking/bookingCore.js
VERSION: v5001-fixed-imports (base v19.5.5-native-slot-schedule-priority)
FIX CRITICO C-02: COLLECTIONS, CONCURRENCY, SDK_CONFIG imported from
"backend/internalConfig" (NOT from "public/mmUtils" where they do NOT exist).
FIX C-11: ERROR_CODES values cleaned (removed trailing spaces).
FIX C-12: PII_KEYS values cleaned (removed trailing spaces).
=============================================================================
*/
import { bookings } from "wix-bookings.v2";
import { checkout } from "wix-ecom-backend";
import { elevate } from "wix-auth";
import wixData from "wix-data";
import { findStaff } from "backend/staff";
import {
COLLECTIONS,
CONCURRENCY,
SDK_CONFIG,
} from "backend/internalConfig";
import {
_safeTrim,
_looksLikeGuid,
getUtcDateFromMadridLocal,
getMadridLocalStringNoZ,
makeTraceId,
_toDateSafe,
_hashKey,
} from "public/mmUtils";

export const logger = {
error: (msg, data) => console.error("[bookingCore] ERROR:", msg, data),
warn: (msg, data) => console.warn("[bookingCore] WARN:", msg, data),
info: (msg, data) => console.log("[bookingCore] INFO:", msg, data),
};
const log = logger;

export const ERROR_CODES = Object.freeze({
INVALID_PAYLOAD: "INVALID_PAYLOAD",
TOKEN_BUSY: "TOKEN_BUSY",
FISCAL_SIGN_FAIL: "FISCAL_SIGN_FAIL",
FISCAL_VIOLATION: "FISCAL_VIOLATION",
BOOKING_CREATION_FAILED: "BOOKING_CREATION_FAILED",
CHECKOUT_FAILED: "CHECKOUT_FAILED",
INVALID_EMPLOYEE: "INVALID_EMPLOYEE",
AUTH_REQUIRED: "AUTH_REQUIRED",
ACCESS_DENIED: "ACCESS_DENIED",
INVALID_CLOCK_TYPE: "INVALID_CLOCK_TYPE",
RATE_LIMITED: "RATE_LIMITED",
});

// ... [cuerpo del módulo idéntico al v19.5.5 hasta PII_KEYS] ...

const PII_KEYS = new Set([
"nombre",
"apellidos",
"firstname",
"lastname",
"email",
"telefono",
"phone",
"address",
"cliente",
"contactdetails",
"contactid",
"identity",
]);

// ... [resto del módulo idéntico al v19.5.5] ...