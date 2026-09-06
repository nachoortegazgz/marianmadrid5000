// Almacenamiento cifrado de tokens OAuth en disco.
// Se cifra con AES-256-GCM usando una clave derivada de MCP_TOKEN_PASSPHRASE.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = process.env.MCP_TOKEN_FILE || join(__dirname, '.tokens.enc');

const ALGO = 'aes-256-gcm';

function deriveKey() {
  const pass = process.env.MCP_TOKEN_PASSPHRASE;
  if (!pass) {
    throw new Error('MCP_TOKEN_PASSPHRASE no configurada. Definela como variable de entorno.');
  }
  return scryptSync(pass, 'marian-madrid-mcp-salt', 32);
}

export function saveTokens(tokens) {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(tokens);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Formato: iv:authTag:ciphertext (todo base64 en un solo archivo)
  const payload = Buffer.concat([iv, authTag, enc]).toString('base64');
  const dir = dirname(TOKEN_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TOKEN_FILE, payload, { mode: 0o600 });
}

export function loadTokens() {
  if (!existsSync(TOKEN_FILE)) return null;
  const key = deriveKey();
  const raw = Buffer.from(readFileSync(TOKEN_FILE, 'utf8').trim(), 'base64');
  const iv = raw.subarray(0, 16);
  const authTag = raw.subarray(16, 32);
  const enc = raw.subarray(32);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  return JSON.parse(json);
}

export function clearTokens() {
  if (existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, '', { mode: 0o600 });
}
