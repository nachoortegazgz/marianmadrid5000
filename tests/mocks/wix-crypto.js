// Mock de wix-crypto para testing (usando crypto nativo de Node)
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export { createHash, createHmac, timingSafeEqual };

export default { createHash, createHmac, timingSafeEqual };
