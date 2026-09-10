/*
SCRIPT: scripts/generate-cms-fixtures.mjs
RESPONSIBILITY: Genera tests/cms-contract.json y tests/cms-schema-canonical.json
                a partir de .wix/CMS ARQUITECTURA FINAL.txt (fuente canonica)
                y de src/backend/internalConfig.js (SSOT de claves).
USAGE: node scripts/generate-cms-fixtures.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doc = fs.readFileSync(path.join(root, ".wix", "CMS ARQUITECTURA FINAL.txt"), "utf8");

// ---------------------------------------------------------------------------
// 1. Parsear las secciones MISION (esquema final corregido por coleccion)
// ---------------------------------------------------------------------------
const start = doc.indexOf("## MISI\u00d3N 1:");
const end = doc.indexOf("## 2. Correspondencia de Colecciones Eliminadas");
if (start < 0 || end < 0) throw new Error("No se hallaron las secciones MISION en el doc");

const body = doc.slice(start, end);
// Cabeceras con nombre CMS divergente: normalizar al canonico de la Biblia v5002.4
const CMS_NAME_FIXES = {
  MovimientoInventario: "MovimientosInventario",
  PendingCompensations: "CompensacionesPendientes",
};
const headingRe = /^###\s+\d+\.\s+`([A-Z_0-9]+)\s+\u2014\s+([^`]+)`/gm;
const rowRe = /^\|\s*`([^`]+)`\s*\|\s*>\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`?([A-Z_]+)`?\s*\|/gm;

const collections = [];
let heading;
const headings = [];
while ((heading = headingRe.exec(body)) !== null) {
  headings.push({ key: heading[1], cmsName: heading[2].trim(), index: heading.index, text: heading[0] });
}
for (let i = 0; i < headings.length; i++) {
  const sliceStart = headings[i].index + headings[i].text.length;
  const sliceEnd = i + 1 < headings.length ? headings[i + 1].index : body.length;
  const section = body.slice(sliceStart, sliceEnd);
  const fields = [];
  let row;
  rowRe.lastIndex = 0;
  while ((row = rowRe.exec(section)) !== null) {
    fields.push([row[2], row[4]]);
  }
  collections.push({ id: CMS_NAME_FIXES[headings[i].cmsName] || headings[i].cmsName, key: headings[i].key, fields });
}

// ---------------------------------------------------------------------------
// 2. Derivar el contrato SSOT desde internalConfig.js (garantiza coherencia)
// ---------------------------------------------------------------------------
const config = fs.readFileSync(path.join(root, "src", "backend", "internalConfig.js"), "utf8");
const block = config.slice(config.indexOf("export const COLLECTIONS"), config.indexOf("export const APP_IDS"));
const contract = {};
for (const m of block.matchAll(/([A-Z_0-9]+):\s*"([^"]+)"/g)) {
  contract[m[1]] = m[2];
}

// Colecciones operativas/infra sin esquema detallado en el doc
const cmsNamesInDoc = new Set(collections.map((c) => c.id));
const schemaExempt = Object.values(contract).filter((name) => !cmsNamesInDoc.has(name));

const contractJson = { collections: contract, schemaExempt };
const schemaJson = {
  source: ".wix/CMS ARQUITECTURA FINAL.txt (secciones MISION 1-7)",
  generatedAt: new Date().toISOString(),
  collections,
};

fs.writeFileSync(path.join(root, "tests", "cms-contract.json"), JSON.stringify(contractJson, null, 2) + "\n");
fs.writeFileSync(path.join(root, "tests", "cms-schema-canonical.json"), JSON.stringify(schemaJson, null, 2) + "\n");

console.log(`contract: ${Object.keys(contract).length} claves SSOT`);
console.log(`schema: ${collections.length} colecciones parseadas del doc`);
console.log(`schemaExempt (sin esquema en doc): ${schemaExempt.join(", ") || "ninguna"}`);
const empty = collections.filter((c) => c.fields.length === 0);
console.log(empty.length ? `SIN CAMPOS (revisar): ${empty.map((c) => c.id).join(", ")}` : "todas las colecciones tienen campos parseados");
