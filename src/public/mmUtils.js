/**
MODULE: public/mmUtils.js
VERSION: v5005-3
RESPONSIBILITY: SSOT constants, timezones, validators, PII masking,
and retry logic (PUBLIC SAFE).
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================*/
export const VERSION = Object.freeze({
CORE: "v5005-3",
API_V2: true,
COMPLIANCE_ES: "2026",
});
export const SDK_CONFIG = Object.freeze({
TZ: "Europe/Madrid",
});
export const MONEY = Object.freeze({
DISPLAY_CURRENCY: "EUR",
DECIMAL_PLACES: 2,
});
export const BOOKINGS_ADDON_CONFIG = Object.freeze({
MAX_PER_BOOKING: 21,
});
export const MESSAGE_TYPES = Object.freeze({
READY: "MM_READY",
CONTEXT: "MM_CONTEXT",
AVAIL: "MM_AVAIL",
SELECT: "MM_SELECT",
BOOK: "MM_BOOK",
NAV: "MM_NAV",
});
export const URLS = Object.freeze({
SERVICIOS: "/reserva-online",
CALENDARIO_2: "/booking-calendar/calendario-2",
DETALLE_SERVICIO: "/servicio-2",
PRIVACY_POLICY: "/politica-de-privacidad",
TPV_PANEL: "/onlystaff",
});
export const UI = Object.freeze({
HANDSHAKE_MAX_ATTEMPTS: 7,
HANDSHAKE_BASE_BACKOFF_MS: 750,
HANDSHAKE_TIMEOUT_MS: 120000,
CONTEXT_TIMEOUT_MS: 120000,
FRONTEND_API_TIMEOUT_MS: 30000,
FRONTEND_RETRY_ATTEMPTS: 5,
FRONTEND_RETRY_BASE_BACKOFF_MS: 500,
TPV_POLLING_MS: 60 * 1000,
MAX_VISIBLE_SLOTS: 100,
SLOT_BUTTON_CLASS: "slot-btn",
DEFAULT_SERVICE_IMAGE_URL: "https://static.wixstatic.com/media/ab7708_374e5f7adb2f47f3944f3355da129b80~mv2.jpg",
SALON_LOCATION_LABEL: "C/ Maurice Ravel 35, Zaragoza",
});
export const STAFF_DEFAULT_NAME = "PROFESIONAL SEGUN HORARIO";
export function makeTraceId(prefix = "mm") {
const timestamp = Date.now().toString(36);
const random = Math.random().toString(36).slice(2, 10);
return `${prefix}_${timestamp}_${random}`;
}
export function _safeTrim(v) {
return v === null || v === undefined ? "" : String(v).trim();
}
export function _cloneDeep(value) {
if (value == null || typeof value !== "object") return value;
if (value instanceof Date) return new Date(value.getTime());
if (Array.isArray(value)) return value.map((entry) => _cloneDeep(entry));
const output = {};
Object.keys(value).forEach((key) => {
output[key] = _cloneDeep(value[key]);
});
return output;
}
export function _safeEmail(email) {
return String(email || "").trim().toLowerCase();
}
export function _safePhone(phone) {
const raw = String(phone || "").trim();
if (!raw) return "";
const hasPlus = raw.startsWith("+");
const digitsOnly = raw.replace(/[^0-9]/g, "");
if (!digitsOnly) return "";
return hasPlus ? `+${digitsOnly}` : digitsOnly;
}
export function normalizeIdPart(v, maxLen = 80) {
const s = String(v || "").trim();
const safe = s.replace(/[^A-Za-z0-9_-]/g, "");
return safe.length > maxLen ? safe.slice(0, maxLen) : safe;
}
export function _looksLikeGuid(v) {
return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
String(v || "").trim()
);
}
export function _safeSlugOrId(raw) {
let s = String(raw || "").trim();
if (!s) return "";
s = s.split("?")[0].split("#")[0].trim();
if (s.startsWith("/")) s = s.substring(1);
if (s.endsWith("/")) s = s.slice(0, -1);
const parts = s.split("/").filter(Boolean);
s = parts.length ? parts[parts.length - 1] : s;
if (_looksLikeGuid(s)) return s.trim();
s = s.trim().toLowerCase();
s = s.replace(/\s+/g, "-");
s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
s = s.replace(/[^a-z0-9-]/g, "");
s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
return s;
}
export function _normalizeLocalIsoStr(rawStr) {
if (!rawStr || rawStr instanceof Date) return "";
const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(rawStr).trim());
if (!match) return "";
const year = Number(match[1]);
const month = Number(match[2]);
const day = Number(match[3]);
const hour = match[4] === undefined ? 0 : Number(match[4]);
const minute = match[5] === undefined ? 0 : Number(match[5]);
const second = match[6] === undefined ? 0 : Number(match[6]);
const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
if (
date.getUTCFullYear() !== year ||
date.getUTCMonth() !== month - 1 ||
date.getUTCDate() !== day ||
hour > 23 ||
minute > 59 ||
second > 59
) return "";
return `${match[1]}-${match[2]}-${match[3]}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}
export function getUtcDateFromMadridLocal(localStr) {
if (localStr instanceof Date) return isNaN(localStr.getTime()) ? null : localStr;
if (!localStr) return null;
const norm = _normalizeLocalIsoStr(localStr);
const partsIso = norm.split("T");
const datePart = partsIso[0] || "";
const timePart = partsIso[1] || "00:00:00";
const dateParts = datePart.split("-").map(Number);
const timeParts = timePart.split(":").map(Number);
const y = Number(dateParts[0]);
const m = Number(dateParts[1]);
const d = Number(dateParts[2]);
const hh = Number(timeParts[0] || 0);
const mm = Number(timeParts[1] || 0);
const ss = Number(timeParts[2] || 0);
if (!y || !m || !d) return null;
const guessUtcMs = Date.UTC(y, m - 1, d, hh, mm, ss);
const guessDate = new Date(guessUtcMs);
const dtf = new Intl.DateTimeFormat("sv-SE", {
timeZone: SDK_CONFIG.TZ,
year: "numeric",
month: "2-digit",
day: "2-digit",
hour: "2-digit",
minute: "2-digit",
second: "2-digit",
hour12: false,
});
const parts = dtf.formatToParts(guessDate);
const get = (type) => {
const found = parts.find((p) => p.type === type);
return found ? found.value : null;
};
const asIfUtc = Date.UTC(
Number(get("year")),
Number(get("month")) - 1,
Number(get("day")),
Number(get("hour")),
Number(get("minute")),
Number(get("second"))
);
const offsetMs = asIfUtc - guessDate.getTime();
const utcMs = guessUtcMs - offsetMs;
const out = new Date(utcMs);
if (isNaN(out.getTime())) return null;
const roundTripParts = dtf.formatToParts(out);           // [FIX-1]
const roundTrip = (type) => {                            // [FIX-2]
const found = roundTripParts.find((p) => p.type === type); // [FIX-3]
return found ? Number(found.value) : NaN;
};
if (
roundTrip("year") !== y ||                              // [FIX-4]
roundTrip("month") !== m ||                             // [FIX-5]
roundTrip("day") !== d ||                               // [FIX-6]
roundTrip("hour") !== hh ||                             // [FIX-7]
roundTrip("minute") !== mm ||                           // [FIX-8]
roundTrip("second") !== ss                              // [FIX-9]
) {
return null;
}
return out;
}
export function getMadridLocalStringNoZ(utcDate) {
if (!utcDate || !(utcDate instanceof Date) || isNaN(utcDate.getTime())) return "";
return utcDate.toLocaleString("sv-SE", { timeZone: SDK_CONFIG.TZ }).replace(" ", "T");
}
export function _toDateSafe(val) {
if (!val) return null;
if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
if (typeof val === "object" && val !== null && val.$date) return _toDateSafe(val.$date); // [FIX-15] was toDateSafe (infinite recursion)
const d = new Date(val);
return isNaN(d.getTime()) ? null : d;
}
export function withTimeout(promise, timeoutMs, label = "operation") {
const ms = Number.isFinite(timeoutMs) ? timeoutMs : (SDK_CONFIG?.TIMEOUTS?.API_MS || 15000); // [FIX-16]
let timer;
const timeoutPromise = new Promise((_, reject) => {
timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`)), ms);
});
return Promise.race([promise, timeoutPromise]).finally(() => {
if (timer) clearTimeout(timer);
});
}
function _extractStatusCode(err) {
if (!err) return null;
if (typeof err.statusCode === "number") return err.statusCode;
if (typeof err.status === "number") return err.status;
if (err.details && typeof err.details.statusCode === "number") return err.details.statusCode;
return null;
}
export async function _executeWithRetry(fn, retries = 3, delay = 500) {
let lastError;
for (let i = 0; i < retries; i++) {
try {
return await fn();
} catch (error) {
lastError = error;
const msg = String(error && error.message ? error.message : "").toUpperCase();
const code = _extractStatusCode(error);
const retryable =
msg.includes("TIMEOUT") ||
msg.includes("ETIMEDOUT") ||
msg.includes("ECONNRESET") ||
msg.includes("429") ||
msg.includes("502") ||
msg.includes("503") ||
msg.includes("504") ||
code === 429 ||
code === 502 ||
code === 503 ||
code === 504;
if (!retryable) throw error;
const waitMs = Math.random() * delay * Math.pow(2, i);
await new Promise((resolve) => setTimeout(resolve, waitMs));
}
}
throw lastError;
}
export function _maskEmail(email) {
const raw = String(email || "").trim();                   // [FIX-10]
if (!raw || !raw.includes("@")) return "***@***";        // [FIX-11]
const split = raw.split("@");
const localRaw = split[0] || "";
const domainRaw = split[1] || "";
const local = String(localRaw);
const domain = String(domainRaw);
if (!domain) return "***@**";
const keep = Math.min(2, local.length);
const prefix = keep > 0 ? local.slice(0, keep) : "";
return `${prefix}***@${domain}`;
}
export function _maskIp(ip) {
if (!ip || typeof ip !== "string") return "***";         // [FIX-12]
const trimmed = ip.trim();
if (!trimmed) return "***";
const parts = trimmed.split(".");                         // [FIX-13]
if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) return `${parts[0]}.${parts[1]}.***.***`;
if (trimmed.length > 6) return trimmed.slice(0, 6) + ":***";
return "***";
}
export function _hashKey(input) {
const str = String(input || "");
let hash1 = 5381;
let hash2 = 52711;
for (let i = 0; i < str.length; i++) {
const char = str.charCodeAt(i);
hash1 = ((hash1 << 5) + hash1) ^ char;
hash2 = ((hash2 << 5) + hash2) ^ char;
}
const combined = Math.abs(hash1 * 31 + hash2);
return combined.toString(16).padStart(16, "0").slice(0, 16);
}
export function _generateUUID() {
return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
const r = (Math.random() * 16) | 0;
const v = c === "x" ? r : (r & 0x3) | 0x8;
return v.toString(16);
});
}
export function _isValidEmail(email) {
const raw = String(email || "").trim();
if (!raw || !raw.includes("@")) return false;
const parts = raw.split("@");
if (parts.length !== 2) return false;
const local = parts[0];
const domain = parts[1];
if (!local || !domain) return false;
if (!domain.includes(".")) return false;
return /^[^\s@]+$/.test(local) && /^[^\s@]+\.[^\s@]+$/.test(domain);
}
export function _normType(type) {
if (!type) return "";
return String(type).trim().toUpperCase();
}
export function _maskPhone(phone) {
const raw = String(phone || "").trim();
if (!raw) return "***";
const clean = _safePhone(raw);
if (clean.length <= 4) return "***";
return clean.slice(0, 3) + "**" + clean.slice(-2);
}
export function _cleanText(value, maxLength) {
  const text = String(value ?? "").trim();
  if (Number.isFinite(maxLength) && text.length > maxLength) {
    throw new Error("TEXT_TOO_LONG");
  }
  return text;
}

export function _readPositiveAmount(str) {
  if (str === null || str === undefined || str === "") return null;
  const n = Number(str);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function _readNonNegativeAmount(str) {
  if (str === null || str === undefined || str === "") return null;
  const n = Number(str);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function _readDate(str) {
  if (!str || typeof str !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(str + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (`${y}-${m}-${day}` !== str) return null;
  return str;
}

export function _stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(_stableSerialize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + _stableSerialize(value[k])).join(",") + "}";
}
export function _maskName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (raw.length <= 2) return raw[0] + "";
  return raw[0] + "*" + raw.slice(-1);
}

export function _sanitizeForLog(obj, sensitiveKeys = ["email", "phone", "nombre", "apellidos", "address", "token", "password"]) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(item => _sanitizeForLog(item, sensitiveKeys));
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = "***REDACTED***";
    } else if (typeof value === "object") {
      sanitized[key] = _sanitizeForLog(value, sensitiveKeys);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
export function _roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const str = abs.toFixed(3);
  const roundedAbs = Number(Number(str).toFixed(2));
  return roundedAbs * sign;
}
export function _extractRelationalId(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(value._id || value.id || value.serviceId || "").trim();
  }
  return String(value).trim();
}
export function _normalizeIdPart(value, maxLen) {
  let str = String(value == null ? "" : value).trim();
  str = str.replace(/[\s/]/g, "");
  if (Number.isFinite(maxLen) && str.length > maxLen) {
    return str.slice(0, maxLen);
  }
  return str;
}

// ============================================================================
// ACCESSIBILITY HELPERS
// ============================================================================

export const ARIA = Object.freeze({
  ROLE: {
    BUTTON: "button",
    DIALOG: "dialog",
    ALERT: "alert",
    STATUS: "status",
    NAVIGATION: "navigation",
    MAIN: "main",
    FORM: "form",
    LIST: "list",
    LISTITEM: "listitem",
  },
  LIVE: {
    POLITE: "polite",
    ASSERTIVE: "assertive",
  },
});

export function _createAriaLabel(text, context) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return context ? `${clean}, ${context}` : clean;
}

export function _announceToScreenReader(message, priority) {
  const livePriority = priority || "polite";
  let announcer = document.getElementById("sr-announcer");
  if (!announcer) {
    announcer = document.createElement("div");
    announcer.id = "sr-announcer";
    announcer.setAttribute("aria-atomic", "true");
    announcer.style.cssText = "position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;";
    document.body.appendChild(announcer);
  }
  announcer.setAttribute("aria-live", livePriority);
  announcer.textContent = "";
  setTimeout(function() {
    announcer.textContent = String(message || "");
  }, 100);
}

// ============================================================================
// LOADING STATE HELPERS
// ============================================================================

export const LOADING_STATES = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
});

export function _createLoadingState(container, options) {
  var opts = options || {};
  var state = {
    container: container,
    current: LOADING_STATES.IDLE,
  };

  state.showLoading = function(message) {
    var msg = message || "Cargando...";
    state.current = LOADING_STATES.LOADING;
    container.innerHTML = "";
    var spinner = document.createElement("div");
    spinner.className = "loading-spinner";
    spinner.setAttribute("role", "status");
    spinner.setAttribute("aria-label", msg);
    var msgEl = document.createElement("span");
    msgEl.className = "loading-message";
    msgEl.textContent = msg;
    container.appendChild(spinner);
    container.appendChild(msgEl);
    _announceToScreenReader(msg, "polite");
  };

  state.showSuccess = function(message) {
    var msg = message || "Completado";
    state.current = LOADING_STATES.SUCCESS;
    container.innerHTML = "";
    var successEl = document.createElement("div");
    successEl.className = "loading-success";
    successEl.setAttribute("role", "status");
    successEl.textContent = msg;
    container.appendChild(successEl);
    _announceToScreenReader(msg, "polite");
  };

  state.showError = function(message) {
    var msg = message || "Error";
    state.current = LOADING_STATES.ERROR;
    container.innerHTML = "";
    var errorEl = document.createElement("div");
    errorEl.className = "loading-error";
    errorEl.setAttribute("role", "alert");
    errorEl.textContent = msg;
    container.appendChild(errorEl);
    _announceToScreenReader(msg, "assertive");
  };

  state.reset = function() {
    state.current = LOADING_STATES.IDLE;
    container.innerHTML = "";
  };

  return state;
}

// ============================================================================
// FORM VALIDATION HELPERS
// ============================================================================

export const VALIDATION_RULES = Object.freeze({
  REQUIRED: "required",
  EMAIL: "email",
  PHONE: "phone",
  MIN_LENGTH: "minLength",
  MAX_LENGTH: "maxLength",
  PATTERN: "pattern",
});

export function _validateField(value, rules) {
  var ruleList = rules || [];
  var errors = [];
  var str = String(value || "").trim();
  var i;
  var rule;

  for (i = 0; i < ruleList.length; i++) {
    rule = ruleList[i];
    switch (rule.type) {
      case VALIDATION_RULES.REQUIRED:
        if (!str) errors.push(rule.message || "Este campo es obligatorio");
        break;
      case VALIDATION_RULES.EMAIL:
        if (str && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
          errors.push(rule.message || "Email invalido");
        }
        break;
      case VALIDATION_RULES.PHONE:
        if (str && !/^[+]?[\d\s()-]{9,15}$/.test(str)) {
          errors.push(rule.message || "Telefono invalido");
        }
        break;
      case VALIDATION_RULES.MIN_LENGTH:
        if (str && str.length < rule.value) {
          errors.push(rule.message || "Minimo " + rule.value + " caracteres");
        }
        break;
      case VALIDATION_RULES.MAX_LENGTH:
        if (str && str.length > rule.value) {
          errors.push(rule.message || "Maximo " + rule.value + " caracteres");
        }
        break;
      case VALIDATION_RULES.PATTERN:
        if (str && rule.value && !rule.value.test(str)) {
          errors.push(rule.message || "Formato invalido");
        }
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

export function _serializeForm(formElement) {
  if (!formElement || !formElement.elements) return {};
  var data = {};
  var elements = formElement.elements;
  var el;
  var i;

  for (i = 0; i < elements.length; i++) {
    el = elements[i];
    if (el.name && !el.disabled) {
      if (el.type === "checkbox") {
        data[el.name] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
      } else {
        data[el.name] = el.value;
      }
    }
  }
  return data;
}