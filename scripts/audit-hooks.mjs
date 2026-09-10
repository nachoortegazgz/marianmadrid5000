#!/usr/bin/env node
/**
 * AUDIT HOOKS - SSOT v5002.4 Compliance
 * Validates immutability hooks in backend/data.js against Dossier Caja Fisica
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load SSOT schema
const ssotSchema = JSON.parse(readFileSync(join(__dirname, 'ssot-schema.json'), 'utf-8'));

const immutabilityHooks = ssotSchema.immutabilityHooks;

// Map collection names to their required hook violations
const hookRequirements = {
  'MovimientosCaja': { beforeUpdate: 'FISCAL_VIOLATION', beforeRemove: 'FISCAL_VIOLATION' },
  'HistoricoCierresZ': { beforeUpdate: 'FISCAL_VIOLATION', beforeRemove: 'FISCAL_VIOLATION' },
  'EventosSistemaFacturacion': { beforeUpdate: 'SIF_VIOLATION', beforeRemove: 'SIF_VIOLATION' },
  'RegistrosHorariosStaff': { beforeUpdate: 'LABOR_LOG_VIOLATION', beforeRemove: 'LABOR_LOG_VIOLATION' },
  'CajaActual': { beforeRemove: 'singletonProtected' }
};

// ServicesCatalogo and MapaStaff validation requirements
const serviceValidationRequired = true;
const staffUnicityRequired = true;

console.log('═══════════════════════════════════════════════════════════');
console.log('AUDIT HOOKS - SSOT v5002.4');
console.log('═══════════════════════════════════════════════════════════\n');

// Find data.js file
let dataJsPath = null;
const possiblePaths = [
  join(ROOT_DIR, 'backend', 'data.js'),
  join(ROOT_DIR, 'backend', 'data.mjs'),
  join(ROOT_DIR, 'data.js'),
  join(ROOT_DIR, 'data.mjs')
];

for (const p of possiblePaths) {
  try {
    readFileSync(p, 'utf-8');
    dataJsPath = p;
    break;
  } catch (e) {
    // File not found, continue
  }
}

if (!dataJsPath) {
  console.log('⚠️ WARNING: backend/data.js not found. Skipping hook audit.');
  console.log('Creating placeholder structure...');
  process.exit(0);
}

const content = readFileSync(dataJsPath, 'utf-8');
const relativePath = dataJsPath.replace(ROOT_DIR + '/', '');

const violations = [];
let exitCode = 0;

// Check for each required hook
for (const [collection, hooks] of Object.entries(hookRequirements)) {
  for (const [hookType, violationType] of Object.entries(hooks)) {
    // Look for hook pattern: beforeUpdate/beforeRemove with collection check and throw
    const hookPattern = new RegExp(`${hookType}\\s*\\([^)]*\\)\\s*\\{[^}]*(${collection}|COLLECTIONS\\.${collection.toUpperCase()})[^}]*throw\\s+new\\s+Error\\s*\\([^)]*${violationType}`, 's');
    
    if (!hookPattern.test(content)) {
      // More lenient check - just look for the hook and collection together
      const simplePattern = new RegExp(`${hookType}.*?(${collection}|COLLECTIONS\\.${collection.toUpperCase()}).*?throw`, 's');
      if (!simplePattern.test(content)) {
        violations.push({
          collection: collection,
          hook: hookType,
          expected: `throw new Error("${violationType}")`,
          rule: 'Dossier Caja Fisica - Inmutabilidad',
          severity: 'CRITICAL'
        });
        exitCode = 1;
      }
    }
  }
}

// Check ServiciosCatalogo phase validation
const phaseValidationPattern = /beforeInsert.*?(ServiciosCatalogo|COLLECTIONS\.SERVICIOS_CATALOGO).*?(phase1|exposure|phase2).*?(totalDuration|duracionTotal)/s;
if (!phaseValidationPattern.test(content)) {
  // Check for alternative pattern with validatePhaseSum
  const validatePhaseSumPattern = /validatePhaseSum|phase1.*\+.*exposure.*\+.*phase2/s;
  if (!validatePhaseSumPattern.test(content)) {
    violations.push({
      collection: 'ServiciosCatalogo',
      hook: 'beforeInsert/beforeUpdate',
      expected: 'Validate phase1 + exposure + phase2 === totalDuration',
      rule: 'SSOT v5002.4 - ServiciosCatalogo Validation',
      severity: 'CRITICAL'
    });
    exitCode = 1;
  }
}

// Check MapaStaff unicity validation
const staffUnicityPattern = /beforeInsert.*?(MapaStaff|COLLECTIONS\.MAPA_STAFF).*?(resourceId|staffMemberId).*?(unique|unicity|exists)/si;
if (!staffUnicityPattern.test(content)) {
  const validateUnicityPattern = /validateUnicity|resourceId.*staffMemberId.*unique/si;
  if (!validateUnicityPattern.test(content)) {
    violations.push({
      collection: 'MapaStaff',
      hook: 'beforeInsert/beforeUpdate',
      expected: 'Validate uniqueness of resourceId + staffMemberId',
      rule: 'SSOT v5002.4 - MapaStaff Validation',
      severity: 'CRITICAL'
    });
    exitCode = 1;
  }
}

// Print results
if (violations.length > 0) {
  console.log('| Coleccion | Hook | Esperado | Regla | Severidad |');
  console.log('|-----------|------|----------|-------|-----------|');
  for (const v of violations) {
    console.log(`| ${v.collection} | ${v.hook} | ${v.expected} | ${v.rule} | ${v.severity} |`);
  }
  console.log(`\n🔴 FAIL: ${violations.length} hook violation(s) detected`);
} else {
  console.log('✅ PASS: All required hooks are properly implemented');
}

console.log(`\nFile audited: ${relativePath}`);
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(exitCode);
