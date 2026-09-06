---
name: wix-booking-engine-reliability
description: Audit, debug, refactor, and validate Wix Velo V3 booking engines using Wix Bookings V2, eCommerce/Payments, CMS, Sagas, idempotency, and fiscal traces. Use when a Wix site has booking failures, concurrency issues, dual-phase reservations with a gap, payment/webhook drift, technical debt, or needs production-readiness verification.
---

# Wix Booking Engine Reliability

Use this skill to lead an end-to-end reliability pass for a Wix Velo booking engine. Treat Wix Bookings as the final availability authority. Use CMS for application state, audit trails, idempotency records, caches, and durable compensations.

## Operating rules

- Read project instructions, any existing project skill, and relevant official Wix documentation before editing.
- Deliver full changed files, never partial snippets. Keep production JavaScript G10 ASCII if the project requires it.
- Prefer current Wix APIs and verify each uncertain API signature against official documentation. Do not infer undocumented SDK calls.
- Keep identifiers, collection IDs, timeouts, rate limits, state names, and app IDs in a public SSOT module. Keep secrets only in a backend secrets module.
- Preserve the layer direction: frontend/page -> web method -> saga/service -> Wix SDK/CMS.
- Mask email and phone values in logs. Use `Europe/Madrid` for business-local calendar logic.
- Do not claim a real Wix integration test unless the code ran against a configured staging or production Wix site.

## Required inputs

Identify the following before work. Ask only for missing information that blocks a safe change.

| Item | Why it matters |
|---|---|
| Source tree and project instructions | Defines actual contracts and standards |
| SSOT and secrets modules | Prevents identifiers and credentials from leaking or diverging |
| Wix app inventory | Identifies Bookings, eCommerce, Payments, Members, CMS, and Jobs surfaces |
| CMS collections and field schema | Defines persistence, locking, ledger, cache, and compensation contracts |
| Existing tests and reports | Separates real coverage from isolated mocks |
| Booking variants | Distinguishes simple from two-phase reservations with exposure gap |

## Reliability workflow

### 1. Establish a baseline

1. Inventory production modules, web methods, pages, widgets, collections, and imports.
2. Run syntax, local import/export, G10, historical API, and existing contract checks.
3. Classify each test as production-backed, source-backed, model-based, or mock-only.
4. Map each public web method to authorization, rate limits, inputs, external effects, persistence, compensations, and response contract.
5. Record the baseline before changing code.

Use `references/regression-checklist.md` as the minimum evidence matrix.

### 2. Audit booking and concurrency

Audit every booking flow, especially dual-phase flows.

- Resolve canonical service IDs, resource IDs, location IDs, and business timezone from SSOT.
- Revalidate availability in Bookings immediately before external booking creation.
- Use a stable idempotency token. Store it at the root of every linked CMS booking record and in a transaction record.
- Bind the token to a canonical payload hash. Reject the same token with a different hash.
- Do not use `get() -> save()` as lock acquisition. Wix Data is eventually consistent and `save()` updates an existing `_id`. Prefer exclusive `insert()` for a new deterministic lease, consistent reads for inspection, bounded heartbeat renewal, and conservative cleanup.
- Do not reclaim an expired CMS lease inline unless a documented atomic conditional update is available and validated in the real Wix environment. Prefer a cleanup job with a grace window.
- Treat a failed lock heartbeat as a lost lease and stop creating external effects.

### 3. Design sagas around effects, not labels

Every external effect must have local compensation even if its parent step fails before the orchestrator records that step.

1. Acquire locks one at a time; release the already-acquired subset on a later lock failure.
2. Create F1 and F2 sequentially; after F1 succeeds, register it immediately for cancellation if F2 fails.
3. If checkout, confirmation, or CMS persistence fails, cancel created bookings or enqueue a durable compensation.
4. Persist linked CMS records inside a compensated saga step. On partial persistence, remove only records created by that attempt.
5. Store compensation attempts, last error, trace ID, and deterministic identity in a protected collection.
6. Make cleanup/retry jobs idempotent.

For a dual service, preserve this invariant:

```
F1 end + configured exposure gap == F2 start (within explicit tolerance)
F1.resourceId == F2.resourceId when same-staff policy applies
F1.pairToken == F2.pairToken
```

### 4. Normalize payment and state flows

Define one canonical top-level booking state and one canonical payment state. All writers must use them: saga, admin payment confirmation, webhook payment updates, cancellation, refund, and reschedule.

- Do not maintain parallel state fields unless an explicit migration mirror is necessary.
- Give fiscal ledger failure a durable recovery state. Do not report an unqualified success when payment state changed but fiscal registration failed.
- Use a deterministic fiscal transaction ID so recovery retries cannot duplicate a ledger record.
- Add a scheduled processor for fiscal and booking compensations. Configure the Wix Job separately and document its cadence.

### 5. Reschedule safely

- A simple booking may use a single-booking reschedule flow after ownership, revision, slot, resource, and availability validation.
- A dual booking must not use that single flow. Require a pair token and both new slots.
- Lock both target slots, preserve the configured gap, reprogram F1 then F2, and roll F1 back if F2 fails.
- Update both CMS records only after both Bookings operations succeed. Invalidate old and new availability cache keys.

### 6. Remove debt without hiding defects

- Delete obsolete mocks that claim integration coverage but do not import production modules.
- Replace them with source-backed static checks and controlled runtime models that use actual algorithm structures.
- Remove aliases, compatibility shims, duplicated IDs, unused imports, empty catches, and historical terminology only after checking consumers.
- Keep source control reports and regressions aligned with the current architecture; delete stale detectors that flag already-correct code.

## Required validation gates

Run every relevant gate after an edit and before delivery.

| Gate | Minimum pass condition |
|---|---|
| JavaScript/widgets syntax | Zero failures |
| Local contracts | Zero unresolved imports/exports |
| Bookings/eCommerce payload contract | Zero signature/payload failures |
| Critical invariants | Lock exclusivity, token hash mismatch, partial lock cleanup, F1/F2 compensation, persistence compensation, payment queue, dual reschedule |
| State model | All writers use canonical state fields |
| G10 and SSOT | Zero non-ASCII production code when required; no duplicated IDs outside SSOT |
| API inventory | Zero deprecated/legacy API markers required by the project |
| ZIP integrity | `unzip -tq` succeeds |

Use `scripts/check_wix_engine_invariants.py` as a portable baseline. Add project-specific checks instead of weakening it.

## Delivery

Deliver a ZIP, a consolidated text file for Velo copy/paste when requested, a validation report, and raw regression output. State clearly:

1. What changed and why.
2. Which tests ran and their exact counts.
3. Which checks are static/model-based.
4. Which real Wix staging steps remain, including Jobs, secrets, permissions, collections, and front-end contract changes.

Do not certify production readiness if real Wix Bookings, payments, events, and CMS have not been exercised in a configured site.
