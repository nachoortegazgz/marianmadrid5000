import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const dependabot = readFileSync(resolve(root, '.github/dependabot.yml'), 'utf8');
const workflow = readFileSync(resolve(root, '.github/workflows/validate.yml'), 'utf8');

const tests = [];
function test(name, fn) {
  try {
    fn();
    tests.push({ name, status: 'PASS' });
  } catch (error) {
    tests.push({ name, status: 'FAIL', detail: error.message });
  }
}

test('Dependabot revisa npm y acciones de GitHub semanalmente', () => {
  assert.match(dependabot, /package-ecosystem: "npm"/);
  assert.match(dependabot, /package-ecosystem: "github-actions"/);
  assert.equal((dependabot.match(/interval: "weekly"/g) || []).length, 2);
  assert.match(dependabot, /timezone: "Europe\/Madrid"/);
});

test('Dependabot limita las actualizaciones de versión a parches y menores', () => {
  assert.equal((dependabot.match(/version-update:semver-major/g) || []).length, 2);
  assert.equal((dependabot.match(/version-update:semver-minor/g) || []).length, 2);
  assert.equal((dependabot.match(/version-update:semver-patch/g) || []).length, 2);
  assert.match(dependabot, /update-types:\n\s+- "minor"\n\s+- "patch"/);
});

test('la validación continua tiene solo lectura y no publica ni fusiona', () => {
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /git diff --check/);
  for (const forbidden of [/auto-merge/i, /gh\s+pr\s+merge/i, /wix[^\n]*publish/i, /wix[^\n]*deploy/i, /npm\s+publish/i]) {
    assert.doesNotMatch(`${dependabot}\n${workflow}`, forbidden);
  }
});

for (const result of tests) {
  console.log(`${result.status}\t${result.name}`);
  if (result.detail) console.log(result.detail);
}
const failed = tests.filter((result) => result.status === 'FAIL');
console.log(`TOTAL=${tests.length} PASS=${tests.length - failed.length} FAIL=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
