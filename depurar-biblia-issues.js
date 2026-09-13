const fs = require('fs');
const path = require('path');

// Leer archivo
const filePath = path.join(__dirname, '.agents/skills/wix/BIBLIA DEFINITIVA.md');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

// Extraer headers de sección (formato: número. TÍTULO)
const sectionHeaders = [];
lines.forEach((line, idx) => {
  const trimmed = line.trim();
  const sectionMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (sectionMatch && trimmed.length < 100) {
    sectionHeaders.push({
      line: idx + 1,
      number: parseInt(sectionMatch[1]),
      title: sectionMatch[2],
      text: trimmed
    });
  }
});

// Extraer esquemas de colección
const collectionSchemas = [];
lines.forEach((line, idx) => {
  const trimmed = line.trim();
  const schemaMatch = trimmed.match(/^(\d+)\.\s+([A-Z_]+)\s+\(([^)]+)\)/);
  if (schemaMatch) {
    collectionSchemas.push({
      line: idx + 1,
      number: parseInt(schemaMatch[1]),
      collection: schemaMatch[2],
      cmsName: schemaMatch[3]
    });
  }
});

// Análisis
console.log('=== BIBLIA DEFINITIVA.md - Análisis de Depuración ===\n');

console.log('SECCIONES ENCONTRADAS:');
sectionHeaders.forEach(s => {
  console.log(`  Línea ${s.line}: ${s.number}. ${s.title}`);
});

console.log('\nESQUEMAS DE COLECCIÓN ENCONTRADOS:');
collectionSchemas.forEach(s => {
  console.log(`  Línea ${s.line}: ${s.number}. ${s.collection} (${s.cmsName})`);
});

// Detectar duplicados
console.log('\n=== DETECCIÓN DE DUPLICADOS ===');
const collectionNames = collectionSchemas.map(s => s.collection);
const duplicates = [];
const seen = new Set();
collectionNames.forEach((name, idx) => {
  if (seen.has(name)) {
    duplicates.push({ name, line: collectionSchemas[idx].line });
  }
  seen.add(name);
});

if (duplicates.length > 0) {
  console.log('DUPLICADOS ENCONTRADOS:');
  duplicates.forEach(d => {
    console.log(`  ✗ ${d.name} en línea ${d.line}`);
  });
} else {
  console.log('  ✓ No hay duplicados');
}

// Verificar numeración esperada en Bloque 2
console.log('\n=== VERIFICACIÓN BLOQUE 2 ===');
const bloque2Schemas = collectionSchemas.filter(s => s.line >= 108 && s.line <= 300);
console.log(`Esquemas en Bloque 2 (líneas 108-300): ${bloque2Schemas.length}`);
bloque2Schemas.forEach((s, i) => {
  const expectedNum = i + 2; // Empieza en 2
  const status = s.number === expectedNum ? '✓' : '✗';
  console.log(`  ${status} Línea ${s.line}: número ${s.number} (esperado ${expectedNum}) - ${s.collection}`);
});

console.log('\n=== ANÁLISIS TABLA MAESTRA ===');
// Extraer filas de la tabla maestra
const tableRows = [];
let inTable = false;
for (let i = 70; i < 110; i++) {
  const line = lines[i];
  if (line.includes('| \\# |')) {
    inTable = true;
    continue;
  }
  if (inTable && line.includes('| ---')) {
    continue;
  }
  if (inTable && line.match(/^\|\s+\d+\s+\|/)) {
    const match = line.match(/^\|\s*(\d+)\s+\|/);
    if (match) {
      tableRows.push({ id: parseInt(match[1]), line: i + 1, content: line.trim() });
    }
  }
  if (inTable && line.trim() === '') {
    inTable = false;
  }
}

console.log(`Filas en tabla maestra: ${tableRows.length}`);
tableRows.forEach(r => {
  console.log(`  Nº ${r.id} (línea ${r.line})`);
});

if (tableRows.length !== 32) {
  console.log(`\n⚠️  SE ESPERABAN 32 FILAS, ENCONTRADAS ${tableRows.length}`);
}

console.log('\n=== RESUMEN ===');
console.log(`Total secciones: ${sectionHeaders.length}`);
console.log(`Total esquemas de colección: ${collectionSchemas.length}`);
console.log(`Total filas tabla maestra: ${tableRows.length}`);
console.log(`Duplicados: ${duplicates.length}`);

// Guardar resultados
const report = {
  timestamp: new Date().toISOString(),
  file: filePath,
  totalSections: sectionHeaders.length,
  totalCollectionSchemas: collectionSchemas.length,
  totalTableRows: tableRows.length,
  duplicates: duplicates.length,
  sections: sectionHeaders,
  collectionSchemas: collectionSchemas,
  tableRows: tableRows,
  issues: duplicates.map(d => ({ type: 'DUPLICADO', collection: d.name, line: d.line }))
};

fs.writeFileSync(
  path.join(__dirname, '.agents/skills/wix/depuracion-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('\n✓ Reporte guardado en depuracion-report.json');
