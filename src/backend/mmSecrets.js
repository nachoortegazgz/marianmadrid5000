/*
MODULE: backend/mmSecrets.js
VERSION: v19.6.17-corrections-applied
RESPONSIBILITY: Catalog of Wix Secrets Manager key names.
STANDARDS: G10 ASCII Strict (0 non-ASCII characters).
CORRECTIONS APPLIED:
  [FIX-1] Removed trailing space from FISCAL_KEY value
  [FIX-2] Removed trailing space from FISCAL_NIF_EMISOR value
  [FIX-3] Removed trailing space from AUTH_JWT_KEY value
  [FIX-4] Removed trailing space from ADMIN_EMAILS value
  [FIX-5] Removed trailing space from CAJERO_EMAILS value
  [FIX-6] Removed trailing space from POWER_AUTOMATE value
  [FIX-7] Removed trailing space from SENDGRID_API_KEY value
  [FIX-8] Removed trailing space from SENDGRID_FROM_EMAIL value
  [FIX-9] Removed trailing space from RESEND_API_KEY value
  [FIX-10] Removed trailing space from RESEND_FROM_EMAIL value
  [FIX-11] Removed trailing space from MAPA_STAFF value
  [FIX-12] Removed trailing space from APP_KEY value
  [FIX-13] Removed trailing space from BOOKINGS_API_TOKEN value
  [FIX-14] Removed trailing space from MARIAN_ASSISTANT_OPENAI_KEY value
  [FIX-15] Removed trailing space from M365_GRAPH_CLIENT_ID value
  [FIX-16] Removed trailing space from M365_GRAPH_CLIENT_SECRET value
  [FIX-17] Removed trailing space from M365_GRAPH_TENANT_ID value
  [FIX-18] Removed trailing space from M365_GRAPH_SITE_ID value
  [FIX-19] Removed trailing space from M365_GRAPH_LIST_ID value
*/
export const SECRETS = Object.freeze({
FISCAL_KEY: "SECRET_FISCAL_KEY",                    // [FIX-1] was "SECRET_FISCAL_KEY "
FISCAL_NIF_EMISOR: "FISCAL_NIF_EMISOR",             // [FIX-2] was "FISCAL_NIF_EMISOR "
AUTH_JWT_KEY: "SECRET_AUTH_JWT_KEY",                // [FIX-3] was "SECRET_AUTH_JWT_KEY "
ADMIN_EMAILS: "ADMIN_EMAILS",                       // [FIX-4] was "ADMIN_EMAILS "
CAJERO_EMAILS: "CAJERO_EMAILS",                     // [FIX-5] was "CAJERO_EMAILS "
POWER_AUTOMATE: "POWER_AUTOMATE_TOKEN",             // [FIX-6] was "POWER_AUTOMATE_TOKEN "
SENDGRID_API_KEY: "SENDGRID_API_KEY",               // [FIX-7] was "SENDGRID_API_KEY "
SENDGRID_FROM_EMAIL: "SENDGRID_FROM_EMAIL",         // [FIX-8] was "SENDGRID_FROM_EMAIL "
RESEND_API_KEY: "RESEND_API_KEY",                   // [FIX-9] was "RESEND_API_KEY "
RESEND_FROM_EMAIL: "RESEND_FROM_EMAIL",             // [FIX-10] was "RESEND_FROM_EMAIL "
MAPA_STAFF: "MAPA_STAFF",                           // [FIX-11] was "MAPA_STAFF "
APP_KEY: "APP_KEY",                                 // [FIX-12] was "APP_KEY "
BOOKINGS_API_TOKEN: "BOOKINGS_API_TOKEN",           // [FIX-13] was "BOOKINGS_API_TOKEN "
MARIAN_ASSISTANT_OPENAI_KEY: "MARIAN_ASSISTANT_OPENAI_KEY", // [FIX-14] was "MARIAN_ASSISTANT_OPENAI_KEY "
M365_GRAPH_CLIENT_ID: "M365_CLIENT_ID",             // [FIX-15] was "M365_CLIENT_ID "
M365_GRAPH_CLIENT_SECRET: "M365_CLIENT_SECRET",     // [FIX-16] was "M365_CLIENT_SECRET "
M365_GRAPH_TENANT_ID: "M365_TENANT_ID",             // [FIX-17] was "M365_TENANT_ID "
M365_GRAPH_SITE_ID: "M365_SITE_ID",                 // [FIX-18] was "M365_SITE_ID "
M365_GRAPH_LIST_ID: "M365_LIST_ID",                 // [FIX-19] was "M365_LIST_ID "
});