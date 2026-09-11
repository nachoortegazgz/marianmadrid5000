// Cliente OAuth2 para Wix + llamadas a las APIs de sitio.
// Endpoints OAuth de Wix: https://dev.wix.com/docs/go-headless/headless-setup/get-access-tokens
import { loadTokens, saveTokens } from './tokens.js';

const WIX_AUTH_URL = 'https://www.wix.com/oauth/authorize';
const WIX_TOKEN_URL = 'https://www.wixapis.com/oauth/access';
const WIX_REFRESH_URL = 'https://www.wixapis.com/oauth/refresh';
const WIX_API_BASE = 'https://www.wixapis.com';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variable de entorno requerida: ${name}`);
  return v;
}

export function getOAuthConfig() {
  return {
    clientId: required('WIX_CLIENT_ID'),
    clientSecret: required('WIX_CLIENT_SECRET'),
    redirectUri: required('WIX_REDIRECT_URI'),
    scopes: (process.env.WIX_SCOPES ||
      'WIX_DATA.READ_BOOKINGS WIX_DATA.READ_CONTACTS WIX_DATA.READ_STORE '
      + 'WIX_DATA.WRITE_BOOKINGS WIX_DATA.WRITE_STORE').split(/\s+/).filter(Boolean),
  };
}

// Construye la URL a la que el usuario debe abrir en su navegador para autorizar.
export function buildAuthorizeUrl(state) {
  const cfg = getOAuthConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes.join(' '),
    state,
  });
  return `${WIX_AUTH_URL}?${params.toString()}`;
}

// Intercambia el "code" devuelto por Wix por tokens de acceso.
export async function exchangeCode(code) {
  const cfg = getOAuthConfig();
  const res = await fetch(WIX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
    }),
  });
  if (!res.ok) throw new Error(`Fallo intercambio token: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 0) * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

export async function refreshTokens() {
  const cfg = getOAuthConfig();
  const current = loadTokens();
  if (!current?.refreshToken) throw new Error('No hay refresh_token. Es necesario autorizar de nuevo.');
  const res = await fetch(WIX_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: current.refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Fallo refresh token: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || current.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 0) * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

// Devuelve un accessToken valido, refrescando si hizo falta.
export async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens) throw new Error('No hay tokens. Ejecuta la herramienta wix_authorize primero.');
  if (Date.now() >= tokens.expiresAt - 60000) {
    const fresh = await refreshTokens();
    return fresh.accessToken;
  }
  return tokens.accessToken;
}

// Llamada generica a una API de Wix con bearer <REDACTED> auto-gestionado.
export async function wixRequest(path, options = {}) {
  const token = await getValidAccessToken();
  const res = await fetch(`${WIX_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wix API ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}
