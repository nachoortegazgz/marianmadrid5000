/*
=============================================================================
SCRIPT: scripts/align-wix-collections.mjs
RESPONSIBILITY: Refactoriza código Velo según la matriz canónica de Wix V2:
                1. Data Hooks en data.js (${Collection}_${event})
                2. Nombres de colecciones y constantes COLLECTIONS.*
                3. Funciones con identificadores compuestos
                4. Claves en consultas Wix Data (.eq, .hasSome, .ascending, etc.)
                5. Acceso a propiedades de objetos (item.*, { key: value })
PRECONDICION CRITICA (NO eludible):
  Wix Data resuelve los hooks por reflexion sobre el nombre: la coleccion CMS
  DEBE haberse renombrado primero en el editor (p. ej. SERVICIOS_RESERVA ->
  ServiciosCatalogo) y sus datos migrados/backfilled. Aplicar este script sin
  el renombrado previo en el CMS desactiva silenciosamente los hooks de
  validacion/inmutabilidad fiscal y rompe todas las consultas.
USO:
  Modo simulación (sin modificar disco):
    node scripts/align-wix-collections.mjs --dry-run
  Modo ejecución real con backup:
    node scripts/align-wix-collections.mjs --backup
  Modo ejecución directa:
    node scripts/align-wix-collections.mjs
=============================================================================
*/

import fs from "node:fs";
import path from "node:path";

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run");
const CREATE_BACKUP = ARGS.includes("--backup");

const TARGET_DIRECTORIES = ["src/backend", "src/pages", "src/public", "tests"];
const SUPPORTED_EXTENSIONS = new Set([".js", ".ts", ".json"]);

// ============================================================================
// MATRIZ 1: DATA HOOKS CON NOMBRE COMPUESTO (${CollectionName}_${hookEvent})
// Wix Data exige que el prefijo de la función coincida con la colección CMS.
// ============================================================================
const DATA_HOOKS_MATRIX = [
  {
    desc: "Hook ServiciosCatalogo (antes SERVICIOS_RESERVA)",
    from: /\bSERVICIOS_RESERVA_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "ServiciosCatalogo_$1$2"
  },
  {
    desc: "Hook MapaStaff (antes MAPA_STAFF)",
    from: /\bMAPA_STAFF_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "MapaStaff_$1$2"
  },
  {
    desc: "Hook MovimientosCaja (antes movimientoCaja)",
    from: /\bmovimientoCaja_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "MovimientosCaja_$1$2"
  },
  {
    desc: "Hook CajaActual (antes cajaActual)",
    from: /\bcajaActual_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "CajaActual_$1$2"
  },
  {
    desc: "Hook HistoricoCierresZ (antes HISTORICOCIERRESZ)",
    from: /\bHISTORICOCIERRESZ_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "HistoricoCierresZ_$1$2"
  },
  {
    desc: "Hook RegistrosHorariosStaff (antes REGISTROHORARIO)",
    from: /\bREGISTROHORARIO_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "RegistrosHorariosStaff_$1$2"
  },
  {
    desc: "Hook InventarioStockVenta (antes INVENTARIO_PRODUCTO)",
    from: /\bINVENTARIO_PRODUCTO_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "InventarioStockVenta_$1$2"
  },
  {
    desc: "Hook MovimientosInventario (antes MOVIMIENTO_INVENTARIO / movimientoInventario)",
    from: /\b(?:MOVIMIENTO_INVENTARIO|movimientoInventario)_(before|after)(Insert|Update|Remove|Query|Count|Get)\b/g,
    to: "MovimientosInventario_$1$2"
  }
];
// ============================================================================
// MATRIZ 2: FUNCIONES Y HELPERS CON NOMBRES COMPUESTOS DE ENTIDADES EDITADAS
// ============================================================================
const COMPOSITE_FUNCTIONS_MATRIX = [
  {
    desc: "Función de actualización de estado de cita",
    from: /\b_updateCitaEstado\b/g,
    to: "_updateCitaStatus"
  },
  {
    desc: "Validación de servicio en data hooks",
    from: /\b_validateServiceCatalog\b/g,
    to: "_validateServiciosCatalogo"
  },
  {
    desc: "Constante ID singleton de CajaActual",
    from: /\bCAJA_ACTUAL_ID\b/g,
    to: "CAJA_ACTUAL_SINGLETON_ID"
  },
  {
    desc: "Función de bloqueo mutex obsoleta (ahora nativa)",
    from: /\b_buildLockKeys\b/g,
    to: "_buildLockKeys_DEPRECATED"
  }
];

// ============================================================================
// MATRIZ 3: NOMBRES LITERALES DE COLECCIÓN (wixData.query("..."), etc.)
// ============================================================================
const COLLECTION_LITERALS_MATRIX = [
  { from: /["']SERVICIOS_RESERVA["']/g, to: '"ServiciosCatalogo"' },
  { from: /["']SERVICIOS_CITA["']/g, to: '"ServiciosCatalogo"' },
  { from: /["']movimientoCaja["']/g, to: '"MovimientosCaja"' },
  { from: /["']cajaActual["']/g, to: '"CajaActual"' },
  { from: /["']HISTORICOCIERRESZ["']/g, to: '"HistoricoCierresZ"' },
  { from: /["']RESUMENCONTEO_X["']/g, to: '"ControlParcialX"' },
  { from: /["']REGISTROHORARIO["']/g, to: '"RegistrosHorariosStaff"' },
  { from: /["']INVENTARIO_PRODUCTO["']/g, to: '"InventarioStockVenta"' },
  { from: /["']movimientoInventario["']/g, to: '"MovimientosInventario"' },
  { from: /["']ConciliacionStockWix["']/g, to: '"MovimientosInventario"' },
  { from: /["']ProveedoresInventario["']/g, to: '"ProveedoresLista"' },
  { from: /["']m365SyncLog["']/g, to: '"M365GraphSyncQueue"' },
  { from: /["']AvailabilitySlotsCache["']/g, to: '"DualSlotCache"' },
  { from: /["']BookingsServiceSyncQueue["']/g, to: '"BookingTransactions"' },
  { from: /["']CONFIGURACIONFISCAL["']/g, to: '"ConfiguracionFiscal"' },
  { from: /["']LIBROIVAFACTURASEXPEDIDAS["']/g, to: '"LibroIvaFacturasExpedidas"' },
  { from: /["']LIBROIVAFACTURASRECIBIDAS["']/g, to: '"LibroIvaFacturasRecibidas"' },
  { from: /["']PLANCUENTASCONTABLES["']/g, to: '"PlanCuentasContables"' },
  { from: /["']ASIENTOSCONTABLES["']/g, to: '"AsientosContables"' },
  { from: /["']LINEASASIENTOCONTABLE["']/g, to: '"LineasAsientoContable"' },
  { from: /["']MAYORCONTABLESALDOS["']/g, to: '"MayorContableSaldos"' },
  { from: /["']EVENTOSSISTEMAFACTURACION["']/g, to: '"EventosSistemaFacturacion"' },
  { from: /["']MMAUDIT_LOG["']/g, to: '"MmAuditLog"' },
  { from: /["']MM_LOCKS["']/g, to: '"SlotLocks"' }
];
// ============================================================================
// MATRIZ 4: CLAVES EN CONSULTAS WIX DATA (.eq, .ne, .hasSome, .ascending, etc.)
// ============================================================================
const QUERY_KEYS_MATRIX = [
  // Citas / Reservas
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']statusPago["']/g, to: '.$1("paymentStatus"' },
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']fechaYmdMadrid["']/g, to: '.$1("dateYmd"' },
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']primaryServiceGuid["']/g, to: '.$1("serviceId"' },
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']idServicio["']/g, to: '.$1("serviceId"' },
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']tituloServicio["']/g, to: '.$1("title"' },
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']tipoServicio["']/g, to: '.$1("serviceType"' },
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']slugUrl["']/g, to: '.$1("slug"' },
  { from: /\.(eq|ne|hasSome|contains|startsWith)\s*\(\s*["']tipo["']\s*,\s*(["']simple["']|["']dual_)/g, to: '.$1("bookingType", $2' },

  // Personal / Staff
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']activo["']/g, to: '.$1("active"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']idMiembroStaff["']/g, to: '.$1("staffMemberId"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']telefono["']/g, to: '.$1("phone"' },

  // Inventario
  { from: /\.(eq|ne|le|lt|ge|gt)\s*\(\s*["']stockMinimo["']/g, to: '.$1("minStock"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']movementTipo["']/g, to: '.$1("movementType"' },

  // Caja y Fiscal
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']secuenciaGlobal["']/g, to: '.$1("sequenceNumber"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']numeroTicketFactura["']/g, to: '.$1("invoiceNumber"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']fechaOperacion["']/g, to: '.$1("operationDate"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']periodoFiscal["']/g, to: '.$1("fiscalPeriod"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']formaPago["']/g, to: '.$1("paymentMethod"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']medioPago["']/g, to: '.$1("paymentMethod"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']tipoMovimiento["']/g, to: '.$1("movementType"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']diaKey["']/g, to: '.$1("operationDate"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']mesKey["']/g, to: '.$1("fiscalPeriod"' },

  // Contabilidad
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']idAsiento["']/g, to: '.$1("journalEntryId"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']numeroAsiento["']/g, to: '.$1("entryNumber"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']ejercicioFiscal["']/g, to: '.$1("fiscalYear"' },
  { from: /\.(eq|ne|hasSome)\s*\(\s*["']codigoCuentaContable["']/g, to: '.$1("accountCode"' },

  // Ordenación
  { from: /\.(ascending|descending)\s*\(\s*["']secuenciaGlobal["']/g, to: '.$1("sequenceNumber"' },
  { from: /\.(ascending|descending)\s*\(\s*["']seqGlobal["']/g, to: '.$1("sequenceNumber"' },
  { from: /\.(ascending|descending)\s*\(\s*["']fechaOperacion["']/g, to: '.$1("operationDate"' },
  { from: /\.(ascending|descending)\s*\(\s*["']fechaCreacion["']/g, to: '.$1("_createdDate"' },
  { from: /\.(ascending|descending)\s*\(\s*["']fechaActualizacion["']/g, to: '.$1("_updatedDate"' }
];

// ============================================================================
// MATRIZ 5: ACCESOS A PROPIEDADES DE OBJETOS (item.* y { key: val })
// ============================================================================
const OBJECT_PROPERTIES_MATRIX = [
  // Citas
  { from: /(\b[\w$]+)\.statusPago\b/g, to: "$1.paymentStatus" },
  { from: /(\b[\w$]+)\.fechaYmdMadrid\b/g, to: "$1.dateYmd" },
  { from: /(\b[\w$]+)\.primaryServiceGuid\b/g, to: "$1.serviceId" },
  { from: /(\b[\w$]+)\.idServicio\b/g, to: "$1.serviceId" },
  { from: /(\b[\w$]+)\.tituloServicio\b/g, to: "$1.title" },
  { from: /(\b[\w$]+)\.duracionTotal\b/g, to: "$1.totalDuration" },
  { from: /(\b[\w$]+)\.tiempoFase1\b/g, to: "$1.phase1Duration" },
  { from: /(\b[\w$]+)\.tiempoExposicion\b/g, to: "$1.exposureDuration" },
  { from: /(\b[\w$]+)\.tiempoFase2\b/g, to: "$1.phase2Duration" },
  { from: /(\b[\w$]+)\.linkFases\b/g, to: "$1.linkedPhases" },
  { from: /(\b[\w$]+)\.permitirCombinar\b/g, to: "$1.allowCombine" },
  { from: /(\b[\w$]+)\.depositoValor\b/g, to: "$1.depositAmount" },
  { from: /(\b[\w$]+)\.depositoTipo\b/g, to: "$1.depositType" },
  { from: /(\b[\w$]+)\.pagoOnline\b/g, to: "$1.onlinePayment" },
  { from: /(\b[\w$]+)\.pagoPresencial\b/g, to: "$1.inPersonPayment" },
  { from: /(\b[\w$]+)\.impuestoIncluido\b/g, to: "$1.taxIncluded" },
  { from: /(\b[\w$]+)\.impuestoIva\b/g, to: "$1.taxRate" },
  { from: /(\b[\w$]+)\.codigoSku\b/g, to: "$1.sku" },
  { from: /(\b[\w$]+)\.localizacionId\b/g, to: "$1.locationId" },
  { from: /(\b[\w$]+)\.localizacion\b/g, to: "$1.location" },
  { from: /(\b[\w$]+)\.resumenCorto\b/g, to: "$1.tagLine" },
  { from: /(\b[\w$]+)\.descripcionLarga\b/g, to: "$1.description" },
  { from: /(\b[\w$]+)\.imagenPrincipal\b/g, to: "$1.mainMedia" },
  { from: /(\b[\w$]+)\.oculto\b/g, to: "$1.hidden" },
  { from: /(\b[\w$]+)\.notasInternas\b/g, to: "$1.internalNotes" },

  // Personal
  { from: /(\b[\w$]+)\.telefono\b/g, to: "$1.phone" },
  { from: /(\b[\w$]+)\.idMiembroStaff\b/g, to: "$1.staffMemberId" },
  { from: /(\b[\w$]+)\.activo\b/g, to: "$1.active" },
  { from: /(\b[\w$]+)\.notas\b/g, to: "$1.notes" },

  // Inventario
  { from: /(\b[\w$]+)\.stockMinimo\b/g, to: "$1.minStock" },
  { from: /(\b[\w$]+)\.productNombre\b/g, to: "$1.productName" },
  { from: /(\b[\w$]+)\.productoWixId\b/g, to: "$1.wixProductId" },
  { from: /(\b[\w$]+)\.varianteWixId\b/g, to: "$1.wixVariantId" },
  { from: /(\b[\w$]+)\.movementTipo\b/g, to: "$1.movementType" },

  // Caja y Cierres
  { from: /(\b[\w$]+)\.secuenciaGlobal\b/g, to: "$1.sequenceNumber" },
  { from: /(\b[\w$]+)\.numeroTicketFactura\b/g, to: "$1.invoiceNumber" },
  { from: /(\b[\w$]+)\.numTicketFactura\b/g, to: "$1.invoiceNumber" },
  { from: /(\b[\w$]+)\.fechaOperacion\b/g, to: "$1.operationDate" },
  { from: /(\b[\w$]+)\.periodoFiscal\b/g, to: "$1.fiscalPeriod" },
  { from: /(\b[\w$]+)\.formaPago\b/g, to: "$1.paymentMethod" },
  { from: /(\b[\w$]+)\.medioPago\b/g, to: "$1.paymentMethod" },
  { from: /(\b[\w$]+)\.tipoMovimiento\b/g, to: "$1.movementType" },
  { from: /(\b[\w$]+)\.importeTotal\b/g, to: "$1.totalAmount" },
  { from: /(\b[\w$]+)\.baseImponible\b/g, to: "$1.taxableAmount" },
  { from: /(\b[\w$]+)\.cuotaIva\b/g, to: "$1.taxAmount" },
  { from: /(\b[\w$]+)\.tasaIva\b/g, to: "$1.taxRate" },
  { from: /(\b[\w$]+)\.signoContable\b/g, to: "$1.accountingSign" },
  { from: /(\b[\w$]+)\.importeContable\b/g, to: "$1.accountingAmount" },
  { from: /(\b[\w$]+)\.detalleLineas\b/g, to: "$1.lineItems" },
  { from: /(\b[\w$]+)\.prevHash\b/g, to: "$1.previousRecordHash" },
  { from: /(\b[\w$]+)\.hashCadena\b/g, to: "$1.currentRecordHash" },
  { from: /(\b[\w$]+)\.firmaDigital\b/g, to: "$1.digitalSignature" },
  { from: /(\b[\w$]+)\.nifEmisor\b/g, to: "$1.businessTaxId" },
  { from: /(\b[\w$]+)\.saldoTotal\b/g, to: "$1.totalBalance" },
  { from: /(\b[\w$]+)\.saldoEfectivo\b/g, to: "$1.cashBalance" },
  { from: /(\b[\w$]+)\.saldoTarjeta\b/g, to: "$1.cardBalance" },
  { from: /(\b[\w$]+)\.saldoBizum\b/g, to: "$1.bizumBalance" },
  { from: /(\b[\w$]+)\.saldoOnline\b/g, to: "$1.onlineBalance" },
  { from: /(\b[\w$]+)\.totalOperaciones\b/g, to: "$1.totalOperations" },
  { from: /(\b[\w$]+)\.fechaApertura\b/g, to: "$1.openedAt" },
  { from: /(\b[\w$]+)\.fechaCierre\b/g, to: "$1.closedAt" },
  { from: /(\b[\w$]+)\.totalGeneral\b/g, to: "$1.consolidatedTotalAmount" },
  { from: /(\b[\w$]+)\.totalVentas\b/g, to: "$1.grossSalesTotal" },
  { from: /(\b[\w$]+)\.totalReembolsos\b/g, to: "$1.totalRefunds" },
  { from: /(\b[\w$]+)\.seqInicio\b/g, to: "$1.startSequence" },
  { from: /(\b[\w$]+)\.seqFin\b/g, to: "$1.endSequence" },
  { from: /(\b[\w$]+)\.ticketInicio\b/g, to: "$1.startTicketNumber" },
  { from: /(\b[\w$]+)\.ticketFin\b/g, to: "$1.endTicketNumber" },

  // Contabilidad
  { from: /(\b[\w$]+)\.idAsiento\b/g, to: "$1.journalEntryId" },
  { from: /(\b[\w$]+)\.numeroAsiento\b/g, to: "$1.entryNumber" },
  { from: /(\b[\w$]+)\.ejercicioFiscal\b/g, to: "$1.fiscalYear" },
  { from: /(\b[\w$]+)\.codigoCuentaContable\b/g, to: "$1.accountCode" },
  { from: /(\b[\w$]+)\.nombreCuentaContable\b/g, to: "$1.accountName" },
  { from: /(\b[\w$]+)\.totalDebe\b/g, to: "$1.totalDebit" },
  { from: /(\b[\w$]+)\.totalHaber\b/g, to: "$1.totalCredit" },
  { from: /(\b[\w$]+)\.importeDebe\b/g, to: "$1.debitAmount" },
  { from: /(\b[\w$]+)\.importeHaber\b/g, to: "$1.creditAmount" },
  { from: /(\b[\w$]+)\.idLineaAsiento\b/g, to: "$1.entryLineId" },
  { from: /(\b[\w$]+)\.idMayor\b/g, to: "$1.generalLedgerId" },

  // Fichajes
  { from: /(\b[\w$]+)\.tipoFichaje\b/g, to: "$1.clockEventType" },
  { from: /(\b[\w$]+)\.motivoAjuste\b/g, to: "$1.adjustmentReason" },
  { from: /(\b[\w$]+)\.ipDispositivo\b/g, to: "$1.deviceIpAddress" }
];
// Unificación de todas las transformaciones en orden de precedencia estricto
const ALL_PIPELINES = [
  ...DATA_HOOKS_MATRIX,
  ...COMPOSITE_FUNCTIONS_MATRIX,
  ...COLLECTION_LITERALS_MATRIX,
  ...QUERY_KEYS_MATRIX,
  ...OBJECT_PROPERTIES_MATRIX
];

let filesScanned = 0;
let filesModified = 0;
let totalReplacements = 0;

function processFile(filePath) {
  filesScanned++;
  const original = fs.readFileSync(filePath, "utf8");
  let updated = original;
  let fileChanges = 0;

  for (const rule of ALL_PIPELINES) {
    const matches = updated.match(rule.from);
    if (matches) {
      fileChanges += matches.length;
      updated = updated.replace(rule.from, rule.to);
    }
  }

  if (fileChanges > 0) {
    filesModified++;
    totalReplacements += fileChanges;
    const relPath = path.relative(process.cwd(), filePath);
    console.log(`[ALINEADO] ${relPath} (${fileChanges} reemplazos)`);

    if (!DRY_RUN) {
      if (CREATE_BACKUP) {
        fs.writeFileSync(`${filePath}.bak`, original, "utf8");
      }
      fs.writeFileSync(filePath, updated, "utf8");
    }
  }
}

function traverseDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git", ".wix", "dist", "___config___"].includes(entry.name)) {
        traverseDirectory(fullPath);
      }
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
      processFile(fullPath);
    }
  }
}

console.log("=================================================================");
console.log("  INICIANDO ALINEACIÓN DE CÓDIGO CON COLECCIONES WIX V2 CANÓNICAS");
console.log(`  Modo: ${DRY_RUN ? "SIMULACIÓN (--dry-run)" : "MODIFICACIÓN EN DISCO"}`);
console.log(`  Backup activo: ${CREATE_BACKUP ? "SÍ (--backup)" : "NO"}`);
console.log("=================================================================\n");

for (const dir of TARGET_DIRECTORIES) {
  traverseDirectory(path.resolve(process.cwd(), dir));
}

console.log("\n=================================================================");
console.log("  RESUMEN DE EJECUCIÓN");
console.log(`  Archivos analizados:  ${filesScanned}`);
console.log(`  Archivos modificados: ${filesModified}`);
console.log(`  Reemplazos totales:   ${totalReplacements}`);
console.log("=================================================================");