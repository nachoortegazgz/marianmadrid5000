// Firma HMAC para los endpoints E2E (post_booking, post_e2e_cancel).
// Reutiliza el mismo esquema que el webhook M365: x-mm-signature = HMAC-SHA256(secret, "${timestamp}.${body}").
import { createHmac } from 'node:crypto';

const SECRET = process.env.E2E_HMAC_SECRET || '';

export function sign(bodyString) {
  if (!SECRET) throw new Error('E2E_HMAC_SECRET no configurada');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', SECRET).update(`${timestamp}.${bodyString}`).digest('hex');
  return { signature, timestamp };
}

export function signedHeaders(bodyString) {
  const { signature, timestamp } = sign(bodyString);
  return {
    'Content-Type': 'application/json',
    'x-mm-signature': signature,
    'x-mm-timestamp': timestamp,
  };
}
