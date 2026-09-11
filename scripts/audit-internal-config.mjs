#!/usr/bin/env node
/**
 * AUDIT INTERNAL CONFIG - SSOT v5002.4 Compliance
 * Validates internalConfig.js against SSOT specs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load SSOT schema
const ssotSchema = JSON.parse(readFileSync(join(__dirname, 'ssot-schema.json'), 'utf-8'));

const configSpecs = ssotSchema.internalConfigSpecs;

console.log('═══════════════════════════════════════════════════════════');
console.log('AUDIT INTERNAL CONFIG - SSOT v5002.4');
console.log('═══════════════════════════════════════════════════════════\n');

// Find internalConfig file
let configPath = null;
const possiblePaths = [
  join(ROOT_DIR, 'backend', 'internalConfig.js'),
  join(ROOT_DIR, 'backend', 'internalConfig.mjs'),
  join(ROOT_DIR, 'internalConfig.js'),
  join(ROOT_DIR, 'internalConfig.mjs')
];

for (const p of possiblePaths) {
  try {
    readFileSync(p, 'utf-8');
    configPath = p;
    break;
  } catch (e) {
    // File not found, continue
  }
}

if (!configPath) {
  console.log('⚠️ WARNING: backend/internalConfig.js not found.');
  console.log('Creating expected structure...');
  process.exit(1);
}

const content = readFileSync(configPath, 'utf-8');
const relativePath = configPath.replace(ROOT_DIR + '/', '');

const violations = [];
let exitCode = 0;

// Check COLLECTIONS has 32 keys
const collectionsMatch = /COLLECTIONS\s*=\s*\{([^}]+)\}/s.exec(content);
if (collectionsMatch) {
  const collectionsContent = collectionsMatch[1];
  const collectionKeys = collectionsContent.match(/(\w+)\s*:/g);
  if (collectionKeys && collectionKeys.length !== configSpecs.collectionCount) {
    violations.push({
      check: 'COLLECTIONS count',
      found: `${collectionKeys.length} collections`,
      expected: `${configSpecs.collectionCount} collections`,
      rule: 'SSOT v5002.4 - 32 Colecciones',
      severity: 'CRITICAL'
    });
    exitCode = 1;
  }
} else {
  violations.push({
    check: 'COLLECTIONS object',
    found: 'Not found',
    expected: 'COLLECTIONS with 32 keys',
    rule: 'SSOT v5002.4 - 32 Colecciones',
    severity: 'CRITICAL'
  });
  exitCode = 1;
}

// Check SDK_CONFIG.TZ === "Europe/Madrid"
const tzMatch = /TZ\s*[:=]\s*["']([^"']+)["']/i.exec(content);
if (tzMatch) {
  if (tzMatch[1] !== configSpecs.tz) {
    violations.push({
      check: 'SDK_CONFIG.TZ',
      found: `"${tzMatch[1]}"`,
      expected: `"${configSpecs.tz}"`,
      rule: 'SSOT v5002.4 - Internal Config Specs',
      severity: 'CRITICAL'
    });
    exitCode = 1;
  }
} else {
  violations.push({
    check: 'SDK_CONFIG.TZ',
    found: 'Not defined',
    expected: `"${configSpecs.tz}"`,
    rule: 'SSOT v5002.4 - Internal Config Specs',
    severity: 'CRITICAL'
  });
  exitCode = 1;
}

// Check LOCATION_ID
const locationMatch = /LOCATION_ID\s*[:=]\s*["']([^"']+)["']/i.exec(content);
if (locationMatch) {
  if (locationMatch[1] !== configSpecs.locationId) {
    violations.push({
      check: 'LOCATION_ID',
      found: `"${locationMatch[1]}"`,
      expected: `"${configSpecs.locationId}"`,
      rule: 'SSOT v5002.4 - Internal Config Specs',
      severity: 'CRITICAL'
    });
    exitCode = 1;
  }
} else {
  violations.push({
    check: 'LOCATION_ID',
    found: 'Not defined',
    expected: `"${configSpecs.locationId}"`,
    rule: 'SSOT v5002.4 - Internal Config Specs',
    severity: 'CRITICAL'
  });
  exitCode = 1;
}

// Check IVA_RATES.GENERAL === 0.21
const ivaMatch = /IVA_GENERAL|GENERAL\s*[:=]\s*(0\.\d+|\d+)/i.exec(content);
if (ivaMatch) {
  const ivaValue = parseFloat(ivaMatch[1]);
  if (ivaValue !== configSpecs.ivaRates.GENERAL) {
    violations.push({
      check: 'IVA_RATES.GENERAL',
      found: `${ivaValue}`,
      expected: `${configSpecs.ivaRates.GENERAL}`,
      rule: 'SSOT v5002.4 - Internal Config Specs',
      severity: 'CRITICAL'
    });
    exitCode = 1;
  }
} else {
  violations.push({
    check: 'IVA_RATES.GENERAL',
    found: 'Not defined',
    expected: `${configSpecs.ivaRates.GENERAL}`,
    rule: 'SSOT v5002.4 - Internal Config Specs',
    severity: 'CRITICAL'
  });
  exitCode = 1;
}

// Check staff resourceIds
const staffResources = configSpecs.staffResourceIds;
for (const [name, resourceId] of Object.entries(staffResources)) {
  const namePattern = new RegExp(name, 'i');
  if (namePattern.test(content)) {
    if (!content.includes(resourceId)) {
      violations.push({
        check: `Staff resourceId for ${name}`,
        found: 'Different or missing',
        expected: `"${resourceId}"`,
        rule: 'SSOT v5002.4 - Internal Config Specs',
        severity: 'CRITICAL'
      });
      exitCode = 1;
    }
  }
}

// Check critical timeouts match BIBLIA
const timeoutPatterns = [
  { name: 'HEARTBEAT_MS', expected: 15000 },
  { name: 'DUAL_BOOKING_MS', expected: 40000 },
  { name: 'LOCK_TIMEOUT', expected: 30000 }
];

for (const timeout of timeoutPatterns) {
  const timeoutMatch = new RegExp(`${timeout.name}\\s*[:=]\\s*(\\d+)`).exec(content);
  if (timeoutMatch) {
    const value = parseInt(timeoutMatch[1]);
    if (value !== timeout.expected) {
      violations.push({
        check: `${timeout.name}`,
        found: `${value}ms`,
        expected: `${timeout.expected}ms`,
        rule: 'SSOT v5002.4 - Timeouts criticos',
        severity: 'CRITICAL'
      });
      exitCode = 1;
    }
  }
}

// Check all enums are exported
const exportPattern = /export\s+(const|let|var)\s+(\w+)/g;
const exports = [];
let match;
while ((match = exportPattern.exec(content)) !== null) {
  exports.push(match[2]);
}

const requiredEnums = ['COLLECTIONS', 'SDK_CONFIG', 'IVA_RATES'];
for (const enumName of requiredEnums) {
  if (!exports.includes(enumName) && !content.includes(`export { ${enumName}`)) {
    violations.push({
      check: `Export ${enumName}`,
      found: 'Not exported',
      expected: 'Must be exported',
      rule: 'SSOT v5002.4 - ES Modules',
      severity: 'WARNING'
    });
  }
}

// Print results
if (violations.length > 0) {
  console.log('| Check | Encontrado | Esperado | Regla | Severidad |');
  console.log('|-------|------------|----------|-------|-----------|');
  for (const v of violations) {
    console.log(`| ${v.check} | ${v.found} | ${v.expected} | ${v.rule} | ${v.severity} |`);
  }
  console.log(`\n🔴 FAIL: ${violations.length} config violation(s) detected`);
} else {
  console.log('✅ PASS: Internal config complies with SSOT v5002.4');
}

console.log(`\nFile audited: ${relativePath}`);
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(exitCode);
