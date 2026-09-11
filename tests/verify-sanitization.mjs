import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "src");
const failures = [];

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(absolute) : [absolute];
    });
}

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(name, test) {
    try {
        test();
        console.log(`PASS\t${name}`);
    } catch (error) {
        failures.push({ name, detail: error.message });
        console.log(`FAIL\t${name}`);
        console.log(error.message);
    }
}

const jsFiles = walk(sourceRoot).filter((file) => file.endsWith(".js"));
const sources = jsFiles.map((file) => ({
    file: path.relative(root, file),
    content: fs.readFileSync(file, "utf8"),
}));

check("No hay secretos ni credenciales con formato real en el codigo", () => {
    const forbidden = [
        /sk-[A-Za-z0-9_-]{20,}/,
        /AIza[0-9A-Za-z_-]{30,}/,
        /(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/,
        /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
    ];
    for (const entry of sources) {
        for (const pattern of forbidden) {
            assert.equal(pattern.test(entry.content), false, `${entry.file} matches ${pattern}`);
        }
    }
});

check("No se permite ejecucion dinamica de codigo", () => {
    for (const entry of sources) {
        assert.equal(/\beval\s*\(/.test(entry.content), false, `${entry.file} uses eval`);
        assert.equal(/\bnew\s+Function\s*\(/.test(entry.content), false, `${entry.file} uses Function constructor`);
    }
});

check("Las respuestas publicas no reenvian detalles internos de errores", () => {
    const forbidden = /error\s*:\s*[^,}\n]*\.(?:stack|cause|config)\b/;
    for (const entry of sources) {
        assert.equal(forbidden.test(entry.content), false, `${entry.file} exposes internal error details`);
    }
});

check("El catalogo de servicios valida y limita entradas de CMS", () => {
    const dataHooks = source("src/backend/data.js");
    for (const token of [
        "_validateServiceCatalog",
        "_normalizeBoundedText",
        "SERVICE_CATALOG.MAX_TITLE_LENGTH",
        "SERVICE_CATALOG.MAX_SUMMARY_LENGTH",
        "SERVICE_CATALOG.MAX_DESCRIPTION_LENGTH",
        "SERVICE_VALIDATION: only EUR is supported",
        "Import2_beforeInsert",
        "Import2_beforeUpdate",
    ]) {
        assert.ok(dataHooks.includes(token), token);
    }
});

check("El catalogo publico evita servicios no activos y campos internos", () => {
    const reservations = source("src/backend/reservas.web.js");
    assert.ok(reservations.includes("Service is not available for public booking."));
    assert.ok(reservations.includes("_readCatalogReferenceId"));
    assert.equal(/return\s+service\s*;/.test(reservations), false);
});

check("EXTRAS_CATALOGO es el alias canonico del catalogo de complementos", () => {
    const config = source("src/backend/internalConfig.js");
    const contract = JSON.parse(source("tests/cms-contract.json"));
    assert.ok(config.includes('EXTRAS_CATALOGO: "AddonsCatalogo"'));
    assert.equal(contract.collections.EXTRAS_CATALOGO, "AddonsCatalogo");
});

check("La proyeccion M365 usa cola, datos minimos y errores saneados", () => {
    const graphSync = source("src/backend/m365GraphSync.js");
    for (const token of [
        "M365_GRAPH_SYNC_QUEUE",
        "M365_GRAPH_CLIENT_SECRET",
        "enqueueM365LedgerRecord",
        "processM365GraphSyncQueue",
        "M365_GRAPH_NOT_CONFIGURED",
        "M365_GRAPH_PERMISSION_DENIED",
        "IntegrityHash",
        "/lists/",
    ]) {
        assert.ok(graphSync.includes(token), token);
    }
    assert.equal(graphSync.includes("response.text("), false);
    assert.equal(graphSync.includes("customerEmail"), false);
    assert.equal(graphSync.includes("customerPhone"), false);
});

const totalChecks = 7;
console.log(`TOTAL=${failures.length + totalChecks} PASS=${totalChecks - failures.length} FAIL=${failures.length}`);
process.exitCode = failures.length ? 1 : 0;
