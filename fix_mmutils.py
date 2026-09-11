#!/usr/bin/env python3
"""Script to fix mmUtils.js header and add PII masking utilities."""

import re

filepath = '/workspaces/marianmadrid5000/src/public/mmUtils.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Remove duplicate VERSION line and clean up header
old_version_lines = 'VERSION: v5005-2\nVERSION: v5002.4-corrections-applied'
new_version_line = 'VERSION: v5005-3'

if old_version_lines in content:
    content = content.replace(old_version_lines, new_version_line)
    print('VERSION line replaced')

# Fix 2: Remove CORRECTIONS APPLIED section (obsolete)
corrections_section = '''CORRECTIONS APPLIED:
[FIX-1]  getUtcDateFromMadridLocal: removed double space in "const roundTripParts = dtf"
[FIX-2]  getUtcDateFromMadridLocal: fixed "const roundTrip = (type) =>"
[FIX-3]  getUtcDateFromMadridLocal: fixed "roundTripParts.find((p) =>"
[FIX-4]  getUtcDateFromMadridLocal: fixed roundTrip("year")
[FIX-5]  getUtcDateFromMadridLocal: fixed roundTrip("month")
[FIX-6]  getUtcDateFromMadridLocal: fixed roundTrip("day")
[FIX-7]  getUtcDateFromMadridLocal: fixed roundTrip("hour")
[FIX-8]  getUtcDateFromMadridLocal: fixed roundTrip("minute")
[FIX-9]  getUtcDateFromMadridLocal: fixed roundTrip("second")
[FIX-10] _maskEmail: fixed String(email || "")
[FIX-11] _maskEmail: fixed !raw.includes("@")
[FIX-12] _maskIp: fixed typeof ip !== "string"
[FIX-13] _maskIp: fixed parts = trimmed.split(".")
[FIX-14] _isValidEmail: fixed regex "." -> "\\\\."
[FIX-15] _toDateSafe: fixed infinite recursion toDateSafe -> _toDateSafe
[FIX-16] withTimeout: added optional chaining SDK_CONFIG?.TIMEOUTS?.API_MS
============================================================================'''

new_footer = '============================================================================'

if corrections_section in content:
    content = content.replace(corrections_section, new_footer)
    print('CORRECTIONS section removed')

# Fix 3: Update VERSION object
content = content.replace('CORE: "v5005-2"', 'CORE: "v5005-3"')

# Fix 4: Add PII masking utility after _maskName function
pii_mask_function = '''
export function _sanitizeForLog(obj, sensitiveKeys = ["email", "phone", "nombre", "apellidos", "address", "token", "password"]) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(item => _sanitizeForLog(item, sensitiveKeys));
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = "***REDACTED***";
    } else if (typeof value === "object") {
      sanitized[key] = _sanitizeForLog(value, sensitiveKeys);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}'''

# Find the end of _maskName function and add PII utility after it
if '_sanitizeForLog' not in content:
    # Find position after _maskName function
    mask_name_end = content.find('export function _roundMoney')
    if mask_name_end > 0:
        content = content[:mask_name_end] + pii_mask_function + '\n' + content[mask_name_end:]
        print('_sanitizeForLog function added')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('File updated successfully')
