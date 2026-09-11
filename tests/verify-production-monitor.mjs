import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/production-smoke.yml", "utf8");

function check(label, fn) {
  try {
    fn();
    console.log(`PASS\t${label}`);
  } catch (error) {
    console.error(`FAIL\t${label}: ${error.message}`);
    process.exitCode = 1;
  }
}

check("el monitor se ejecuta tras un despliegue correcto o bajo ejecucion manual", () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /- Deploy Wix Production/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
});

check("el monitor comprueba las rutas esenciales con limites de red", () => {
  for (const token of [
    "https://www.marianmadrid.es/",
    "https://www.marianmadrid.es/reserva-online",
    "https://www.marianmadrid.es/politica-privacidad-texto",
    "--connect-timeout 10",
    "--max-time 20",
    "--max-redirs 3",
    "content-type: text/html",
  ]) {
    assert.ok(workflow.includes(token), token);
  }
});

check("el monitor conserva minimo privilegio y no publica ni envia datos", () => {
  assert.match(workflow, /permissions:\n\s+contents: read/);
  for (const forbidden of [
    "contents: write",
    "deployments: write",
    "id-token: write",
    "gh api",
    "gh issue",
    "curl -X POST",
    "webhook",
    "RESEND_",
    "M365_",
  ]) {
    assert.equal(workflow.includes(forbidden), false, forbidden);
  }
});

if (process.exitCode) process.exit(process.exitCode);
console.log("TOTAL=3 PASS=3 FAIL=0");
