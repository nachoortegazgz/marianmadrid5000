/*
=============================================================================
MODULE: backend/security.web.js
VERSION: v5001-optimized (base v18.8.16-strict)
RESPONSIBILITY: Web module facade for RBAC authorization checks.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
=============================================================================
*/
import { webMethod, Permissions } from "wix-web-module";
import { makeTraceId } from "public/mmUtils";
import { isAdmin, isCajero, isStaffCollaborator } from "backend/security";
import { _toPublicError } from "backend/responseUtils";
import { logger } from "backend/booking/bookingCore";
const log = logger;
export const checkAdminAccess = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("wm-admin");
try {
const admin = await isAdmin(traceId);
return { status: "SUCCESS", data: { isAdmin: admin }, error: null };
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "ADMIN_CHECK_FAIL") };
}
});
export const checkCajeroAccess = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("wm-cajero");
try {
const cajero = await isCajero(traceId);
return { status: "SUCCESS", data: { isCajero: cajero }, error: null };
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "CAJERO_CHECK_FAIL") };
}
});
export const checkStaffCollaboratorAccess = webMethod(Permissions.SiteMember, async (options = {}) => {
const traceId = options.traceId || makeTraceId("wm-staff-collab");
try {
const isCollab = await isStaffCollaborator(traceId);
const isMarianManager = await isCajero(traceId);
return {
status: "SUCCESS",
data: { isStaffCollaborator: isCollab, isMarianManager },
error: null,
};
} catch (err) {
return { status: "ERROR", data: null, error: _toPublicError(err, "STAFF_COLLAB_CHECK_FAIL") };
}
});