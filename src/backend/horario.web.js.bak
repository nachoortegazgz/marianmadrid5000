/*
=============================================================================
MODULE: backend/horario.web.js
VERSION: v5001-optimized (base v19.5.1-historical-hours-bounded)
RESPONSIBILITY: Employee time tracking and work hours calculation.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
import { webMethod, Permissions } from "wix-web-module";
import wixData from "wix-data";
import { COLLECTIONS, TIPO_FICHAJE, SDK_CONFIG } from "backend/internalConfig";
import { makeTraceId, _safeTrim, _safeEmail, _roundMoney } from "public/mmUtils";
import { requireCajero, isStaffCollaborator, rateLimiter } from "backend/security";
import { _toPublicError } from "backend/responseUtils";
import { logger, ERROR_CODES, createBookingError } from "backend/booking/bookingCore";
import { findStaff } from "backend/staff";
const log = logger;
const REGISTRO_COL = COLLECTIONS.REGISTRO_HORARIO;
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
export const registrarFichaje = webMethod(Permissions.SiteMember, async (payload = {}) => {
const traceId = payload.traceId || makeTraceId("fichaje");
try {
_rateLimitOrThrow("horario.registrarFichaje", "staff", traceId);
const isCollab = await isStaffCollaborator(traceId);
if (!isCollab) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.ACCESS_DENIED, message: "Staff access required" } };
}
const resourceId = _safeTrim(payload.resourceId);
const tipoFichaje = _safeTrim(payload.tipoFichaje).toUpperCase();
if (!resourceId) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.INVALID_PAYLOAD, message: "resourceId required" } };
}
const staff = await findStaff(resourceId);
if (!staff) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.INVALID_EMPLOYEE, message: "Employee not found" } };
}
if (!Object.values(TIPO_FICHAJE).includes(tipoFichaje)) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.INVALID_CLOCK_TYPE, message: `Invalid clock type: ${tipoFichaje}` } };
}
if (tipoFichaje === TIPO_FICHAJE.AJUSTE && !payload.motivoAjuste) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.INVALID_PAYLOAD, message: "motivoAjuste required for AJUSTE" } };
}
const now = new Date();
const tz = SDK_CONFIG?.TZ || "Europe/Madrid";
const madridStr = now.toLocaleString("sv-SE", { timeZone: tz });
const registro = {
resourceId: staff.resourceId,
resourceName: staff.displayName || staff.nombreVisible || "",
tipoFichaje,
fechaHora: now,
diaKey: madridStr.slice(0, 10),
mesKey: madridStr.slice(0, 7),
hora: madridStr.slice(11, 19),
motivoAjuste: tipoFichaje === TIPO_FICHAJE.AJUSTE ? _safeTrim(payload.motivoAjuste) : null,
traceId,
fechaCreacion: now,
};
const result = await wixData.insert(REGISTRO_COL, registro, { suppressAuth: true });
return { status: "SUCCESS", data: result, error: null };
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "FICHAJE_FAIL") };
}
});
export const getEstadoJornada = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("estado-jornada");
try {
_rateLimitOrThrow("horario.getEstadoJornada", "staff", traceId);
const isCollab = await isStaffCollaborator(traceId);
if (!isCollab) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.ACCESS_DENIED, message: "Staff access required" } };
}
const resourceId = _safeTrim(options.resourceId);
const staff = await findStaff(resourceId);
if (!staff) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.INVALID_EMPLOYEE, message: "Employee not found" } };
}
const tz = SDK_CONFIG?.TZ || "Europe/Madrid";
const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
const res = await wixData
.query(REGISTRO_COL)
.eq("resourceId", staff.resourceId)
.eq("diaKey", todayStr)
.ascending("fechaHora")
.limit(100)
.find({ suppressAuth: true });
const fichajes = res?.items || [];
const ultimoFichaje = fichajes.length > 0 ? fichajes[fichajes.length - 1] : null;
const enJornada = ultimoFichaje &&
ultimoFichaje.tipoFichaje !== TIPO_FICHAJE.SALIDA &&
ultimoFichaje.tipoFichaje !== TIPO_FICHAJE.PAUSA_FIN;
return {
status: "SUCCESS",
data: {
enJornada,
ultimoFichaje: ultimoFichaje ? {
tipoFichaje: ultimoFichaje.tipoFichaje,
fechaHora: ultimoFichaje.fechaHora,
hora: ultimoFichaje.hora,
} : null,
totalFichajesHoy: fichajes.length,
},
error: null,
};
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "ESTADO_JORNADA_FAIL") };
}
});
export const getMyStaffContext = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("staff-context");
try {
_rateLimitOrThrow("horario.getMyStaffContext", "staff", traceId);
const isCollab = await isStaffCollaborator(traceId);
if (!isCollab) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.ACCESS_DENIED, message: "Staff access required" } };
}
const { currentMember } = await import("wix-members-backend");
const member = await currentMember.getMember({ fieldsets: ["FULL"] }).catch(() => null);
if (!member) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.AUTH_REQUIRED, message: "Could not identify logged-in user" } };
}
const memberId = _safeTrim(member._id || member.id || "");
const memberEmail = member?.loginEmail ? _safeEmail(member.loginEmail) : "";
let staff = memberId ? await findStaff(memberId) : null;
if (!staff && memberEmail) staff = await findStaff(memberEmail);
if (!staff) {
return { status: "ERROR", data: null, error: { code: "STAFF_CONTEXT_NOT_FOUND", message: "No staff profile found for this member" } };
}
return {
status: "SUCCESS",
data: {
resourceId: staff.resourceId,
displayName: staff.displayName || staff.nombreVisible || staff.name || "",
scheduleId: staff.scheduleId || "",
email: memberEmail || staff.email || "",
},
error: null,
};
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "STAFF_CONTEXT_FAIL") };
}
});
export const calcularHorasTrabajadas = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("calcular-horas");
try {
_rateLimitOrThrow("horario.calcularHorasTrabajadas", "staff", traceId);
await requireCajero(traceId);
const resourceId = _safeTrim(options.resourceId);
const desde = _safeTrim(options.desde);
const hasta = _safeTrim(options.hasta);
if (!resourceId || !desde || !hasta) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.INVALID_PAYLOAD, message: "resourceId, desde, hasta required" } };
}
const staff = await findStaff(resourceId);
if (!staff) {
return { status: "ERROR", data: null, error: { code: ERROR_CODES.INVALID_EMPLOYEE, message: "Employee not found" } };
}
const res = await wixData
.query(REGISTRO_COL)
.eq("resourceId", staff.resourceId)
.ge("diaKey", desde)
.le("diaKey", hasta)
.ascending("fechaHora")
.limit(1000)
.find({ suppressAuth: true });
const fichajes = res?.items || [];
let totalMinutos = 0;
let entrada = null;
for (const f of fichajes) {
if (f.tipoFichaje === TIPO_FICHAJE.ENTRADA || f.tipoFichaje === TIPO_FICHAJE.PAUSA_FIN) {
entrada = new Date(f.fechaHora);
} else if ((f.tipoFichaje === TIPO_FICHAJE.SALIDA || f.tipoFichaje === TIPO_FICHAJE.PAUSA_INICIO) && entrada) {
const salida = new Date(f.fechaHora);
const diffMin = Math.round((salida - entrada) / 60000);
if (diffMin > 0) totalMinutos += diffMin;
entrada = null;
}
}
const horas = _roundMoney(totalMinutos / 60);
return {
status: "SUCCESS",
data: {
resourceId: staff.resourceId,
resourceName: staff.displayName || staff.nombreVisible || "",
desde,
hasta,
totalMinutos,
totalHoras: horas,
totalFichajes: fichajes.length,
},
error: null,
};
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "CALCULAR_HORAS_FAIL") };
}
});