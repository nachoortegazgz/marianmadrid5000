import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const widgetPath = path.join(root, 'docs', 'WIDGET_PANEL_GESTION_MARIAN.html');
const widget = fs.readFileSync(widgetPath, 'utf8');
const scriptMatch = widget.match(/<script>([\s\S]*)<\/script>/i);
assert.ok(scriptMatch?.[1], 'El widget debe contener un bloque script');

for (const token of [
  'data-tab="documents"',
  'id="managerEmail"',
  'gestion@marianmadrid.es',
  'DOCUMENT_PREVIEW',
  'DOCUMENT_CREATE',
  'DOCUMENT_HISTORY',
  'DOCUMENT_DOWNLOAD',
  'DOCUMENT_EMAIL',
  'confirmed: true',
  'currentDocument?.documentId',
  'downloadBase64File',
]) {
  assert.ok(widget.includes(token), token);
}

const temporaryScript = path.join(os.tmpdir(), `marian-admin-widget-${process.pid}.js`);
try {
  fs.writeFileSync(temporaryScript, scriptMatch[1], 'utf8');
  execFileSync(process.execPath, ['--check', temporaryScript], { stdio: 'pipe' });
} finally {
  fs.rmSync(temporaryScript, { force: true });
}

console.log('PASS\tWidget de ADMINISTRACION: sintaxis y contratos documentales validados');
