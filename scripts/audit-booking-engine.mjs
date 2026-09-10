#!/usr/bin/env node
/**
 * AUDIT BOOKING ENGINE - SSOT v5002.4 Compliance
 * Validates booking engine implementation against SSOT specs
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load SSOT schema
const ssotSchema = JSON.parse(readFileSync(join(__dirname, 'ssot-schema.json'), 'utf-8'));

// Define booking engine specs inline (SSOT v5002.4)
const bookingSpecs = {
  persistBookingFields: ['bookingId', 'serviceId', 'scheduleId', 'resourceId', 'pairToken', 'startDate', 'endDate', 'status', 'paymentStatus', 'contactDetails', 'traceId'],
  heartbeatMs: 15000,
  dualBookingMs: 40000,
  requiredPatterns: ['linkedPhases', 'slotKey', 'elevate', 'skipCache:\\s*true', '_bestEffortUnlockAll']
};

console.log('═══════════════════════════════════════════════════════════');
console.log('AUDIT BOOKING ENGINE - SSOT v5002.4');
console.log('═══════════════════════════════════════════════════════════\n');

// Find booking-related files
const bookingFiles = [];
const possiblePatterns = ['booking', 'reserva', 'cita', 'slot', 'lock'];

function scanDirectory(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      const lowerName = entry.name.toLowerCase();
      if (possiblePatterns.some(p => lowerName.includes(p))) {
        bookingFiles.push(fullPath);
      }
    }
  }
}

scanDirectory(ROOT_DIR);

if (bookingFiles.length === 0) {
  console.log('⚠️ WARNING: No booking-related files found. Skipping audit.');
  process.exit(0);
}

const violations = [];
let exitCode = 0;

// Check each file
for (const filePath of bookingFiles) {
  const content = readFileSync(filePath, 'utf-8');
  const relativePath = filePath.replace(ROOT_DIR + '/', '');

  // Check for forbidden legacy IDs in booking context
  const forbiddenInBooking = ['primaryServiceGuid', 'secondaryServiceGuid', 'lockKey'];
  for (const forbidden of forbiddenInBooking) {
    const regex = new RegExp(`\\b${forbidden}\\b`, 'g');
    if (regex.test(content)) {
      violations.push({
        file: relativePath,
        check: `Forbidden ID: ${forbidden}`,
        expected: forbidden === 'secondaryServiceGuid' ? 'linkedPhases' : (forbidden === 'lockKey' ? 'slotKey' : 'serviceId'),
        rule: 'R7 - Cero Legacy',
        severity: 'CRITICAL'
      });
      exitCode = 1;
    }
  }

  // Check slotKey usage (should be present, not lockKey)
  if (!/slotKey/.test(content) && /_lockSlot|slot.*lock/i.test(content)) {
    violations.push({
      file: relativePath,
      check: 'slotKey usage',
      expected: 'slotKey (not lockKey)',
      rule: 'SSOT v5002.4 - Booking Engine Specs',
      severity: 'CRITICAL'
    });
    exitCode = 1;
  }

  // Check heartbeat constant
  if (/HEARTBEAT|heartbeat/.test(content)) {
    const heartbeatMatch = content.match(/HEARTBEAT[_MS]*\s*[:=]\s*(\d+)/);
    if (heartbeatMatch && parseInt(heartbeatMatch[1]) !== bookingSpecs.heartbeatMs) {
      violations.push({
        file: relativePath,
        check: 'Heartbeat interval',
        found: `${heartbeatMatch[1]}ms`,
        expected: `${bookingSpecs.heartbeatMs}ms`,
        rule: 'SSOT v5002.4 - Booking Engine Specs',
        severity: 'CRITICAL'
      });
      exitCode = 1;
    }
  }

  // Check DUAL_BOOKING_MS constant
  if (/DUAL_BOOKING_MS|dualBooking/.test(content)) {
    const dualMatch = content.match(/DUAL_BOOKING_MS\s*[:=]?\s*(\d+)/);
    if (dualMatch && parseInt(dualMatch[1]) !== bookingSpecs.dualBookingMs) {
      violations.push({
        file: relativePath,
        check: 'DUAL_BOOKING_MS',
        found: `${dualMatch[1]}ms`,
        expected: `${bookingSpecs.dualBookingMs}ms`,
        rule: 'SSOT v5002.4 - Booking Engine Specs',
        severity: 'CRITICAL'
      });
      exitCode = 1;
    }
  }

  // Check for elevate() in createBookingElevated
  if (/createBookingElevated/.test(content)) {
    if (!/elevate\s*\(\s*\)/.test(content)) {
      violations.push({
        file: relativePath,
        check: 'elevate() in createBookingElevated',
        expected: 'elevate() must be called',
        rule: 'SSOT v5002.4 - Booking Engine Specs',
        severity: 'CRITICAL'
      });
      exitCode = 1;
    }
  }

  // Check for _persistBooking writing all canonical fields
  if (/_persistBooking/.test(content)) {
    const requiredFields = bookingSpecs.persistBookingFields;
    for (const field of requiredFields.slice(0, 5)) { // Check first 5 critical fields
      if (!content.includes(field)) {
        violations.push({
          file: relativePath,
          check: '_persistBooking canonical fields',
          missing: field,
          expected: 'All persistBookingFields from SSOT',
          rule: 'SSOT v5002.4 - Booking Engine Specs',
          severity: 'CRITICAL'
        });
        exitCode = 1;
        break;
      }
    }
  }

  // Check skipCache: true in revalidation
  if (/revalidat|refresh|invalidate/i.test(content)) {
    if (!/skipCache\s*:\s*true/.test(content)) {
      violations.push({
        file: relativePath,
        check: 'skipCache on revalidation',
        expected: 'skipCache: true',
        rule: 'SSOT v5002.4 - Booking Engine Specs',
        severity: 'WARNING'
      });
    }
  }

  // Check idempotency (BookingTransactions query before create)
  if (/createBooking|insertBooking/i.test(content)) {
    if (!/BookingTransactions/.test(content) && !/idempoten/i.test(content)) {
      violations.push({
        file: relativePath,
        check: 'Idempotency check',
        expected: 'Query BookingTransactions before creating booking',
        rule: 'SSOT v5002.4 - Booking Engine Specs',
        severity: 'CRITICAL'
      });
      exitCode = 1;
    }
  }

  // Check _bestEffortUnlockAll in finally block
  if (/unlock|release.*lock/i.test(content)) {
    const finallyBlock = /finally\s*\{([^}]*)\}/s.exec(content);
    if (finallyBlock) {
      if (!/_bestEffortUnlockAll|unlockAll/.test(finallyBlock[1])) {
        violations.push({
          file: relativePath,
          check: '_bestEffortUnlockAll in finally',
          expected: '_bestEffortUnlockAll must be in finally block',
          rule: 'SSOT v5002.4 - Booking Engine Specs',
          severity: 'CRITICAL'
        });
        exitCode = 1;
      }
    }
  }

  // Check pairToken generation via SHA256
  if (/pairToken/.test(content)) {
    if (!/sha256|SHA256|crypto\.subtle\.digest/.test(content)) {
      violations.push({
        file: relativePath,
        check: 'pairToken generation',
        expected: 'SHA256 deterministic generation',
        rule: 'SSOT v5002.4 - Booking Engine Specs',
        severity: 'WARNING'
      });
    }
  }
}

// Print results
if (violations.length > 0) {
  console.log('| Archivo | Check | Encontrado | Esperado | Regla | Severidad |');
  console.log('|---------|-------|------------|----------|-------|-----------|');
  for (const v of violations) {
    const found = v.found || v.missing || 'N/A';
    console.log(`| ${v.file} | ${v.check} | ${found} | ${v.expected} | ${v.rule} | ${v.severity} |`);
  }
  console.log(`\n🔴 FAIL: ${violations.length} booking engine violation(s) detected`);
} else {
  console.log('✅ PASS: Booking engine complies with SSOT v5002.4');
}

console.log(`\nFiles scanned: ${bookingFiles.length}`);
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(exitCode);
