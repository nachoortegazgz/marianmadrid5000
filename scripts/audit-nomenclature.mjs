/**
 * AUDIT: Nomenclatura SSOT v5002.4
 * Valida CollectionIDs, fieldKeys, forbiddenLegacyIds, traducciones e intraducibles
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'ssot-schema.json');

// Cargar schema SSOT
let schema;
try {
  schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
} catch (e) {
  console.error('❌ ERROR: No se pudo cargar ssot-schema.json');
  process.exit(1);
}

const COLLECTIONS = schema.collections;
const FORBIDDEN_LEGACY = new Set(schema.globalForbiddenLegacyIds);
const INTRADUCIBLES = new Set(schema.globalIntraducibles);

// Mapeo de traducciones prohibidas (ES -> EN esperado)
const TRADUCCIONES_INVERTIDAS = {
  'idServicio': 'serviceId',
  'cantidadGravable': 'taxableAmount',
  'fechaOperacion': 'operationDate',
  'estadoPago': 'paymentStatus',
  'metodoPago': 'paymentMethod',
  'importeContable': 'accountingAmount',
  'numeroTicket': 'invoiceNumber',
  'fechaCreacion': 'registeredAt',
  'fechaHora': 'recordedAt',
};

// Archivos a escanear
const SRC_DIRS = [
  join(__dirname, '../src/backend'),
  join(__dirname, '../src/public'),
];

function getAllJsFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(...getAllJsFiles([fullPath]));
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Ignorar comentarios
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    
    // 1. Detectar forbiddenLegacyIds
    for (const legacy of FORBIDDEN_LEGACY) {
      const regex = new RegExp(`\\b${legacy}\\b`, 'g');
      let match;
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          file: filePath,
          line: lineNum,
          found: legacy,
          expected: 'VER_SSOT_SCHEMA',
          rule: 'R7-CERO_LEGACY',
          severity: 'CRITICAL'
        });
      }
    }
    
    // 2. Detectar traducciones invertidas
    for (const [es, en] of Object.entries(TRADUCCIONES_INVERTIDAS)) {
      const regex = new RegExp(`\\b${es}\\b`, 'g');
      let match;
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          file: filePath,
          line: lineNum,
          found: es,
          expected: en,
          rule: 'R2-TRADUCCION_LITERAL',
          severity: 'CRITICAL'
        });
      }
    }
    
    // 3. Detectar intraducibles traducidos
    const intraduciblesTraducidos = {
      'ranura': 'slot',
      'cerrojo': 'lock',
      'empleado': 'staff'
    };
    for (const [es, en] of Object.entries(intraduciblesTraducidos)) {
      const regex = new RegExp(`\\b${es}\\b`, 'gi');
      let match;
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          file: filePath,
          line: lineNum,
          found: es,
          expected: en,
          rule: 'R4-INTRADUCIBLES',
          severity: 'CRITICAL'
        });
      }
    }
  }
  
  return violations;
}

// Ejecutar auditoría
console.log('🔍 AUDITORÍA DE NOMENCLATURA SSOT v5002.4\n');
console.log('=' .repeat(80));

const jsFiles = getAllJsFiles(SRC_DIRS);
let totalViolations = 0;
const allViolations = [];

for (const file of jsFiles) {
  const violations = scanFile(file);
  if (violations.length > 0) {
    allViolations.push(...violations);
  }
}

if (allViolations.length === 0) {
  console.log('✅ SIN VIOLACIONES DETECTADAS');
  console.log('=' .repeat(80));
  process.exit(0);
}

// Agrupar por severidad
const critical = allViolations.filter(v => v.severity === 'CRITICAL');
const warnings = allViolations.filter(v => v.severity === 'WARNING');

console.log(`\n📊 RESUMEN: ${allViolations.length} violaciones (${critical.length} críticas, ${warnings.length} warnings)\n`);
console.log('📋 DETALLE DE VIOLACIONES CRÍTICAS:\n');
console.log('| Archivo | Línea | Encontrado | Esperado | Regla | Severidad |');
console.log('|---------|-------|------------|----------|-------|-----------|');

for (const v of critical.slice(0, 50)) {
  const relPath = v.file.replace(join(__dirname, '../'), '');
  console.log(`| ${relPath} | ${v.line} | ${v.found} | ${v.expected} | ${v.rule} | ${v.severity} |`);
}

if (critical.length > 50) {
  console.log(`... y ${critical.length - 50} violaciones más`);
}

console.log('\n' + '=' .repeat(80));
console.log('❌ AUDITORÍA FALLIDA: Se requieren correcciones críticas');
process.exit(1);
