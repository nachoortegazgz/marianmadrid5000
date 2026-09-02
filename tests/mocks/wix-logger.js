// Mock de wix-logger para testing
export const log = {
  info: (...args) => console.log('[MOCK LOG INFO]', ...args),
  error: (...args) => console.error('[MOCK LOG ERROR]', ...args),
  warn: (...args) => console.warn('[MOCK LOG WARN]', ...args)
};

export default log;
