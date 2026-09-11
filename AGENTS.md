# Agent Instructions for this repository

## Wix Velo debugging focus
- Trace the decision path before editing: page or public caller -> `webMethod` facade -> backend orchestrator -> domain module -> Wix API or Data write.
- Treat `webMethod` from `wix-web-module` as the V3 exposure layer. Verify native API versions separately; this project uses Bookings v2 (`wix-bookings.v2`) alongside Ecom, Auth, and Data.
- Before changing a Wix contract, verify imports, method and argument shapes, response shapes, `elevate`, `suppressAuth`, `src/backend/permissions.json`, and the local mock behavior.
- For booking bugs, inspect `src/backend/booking/bookingSaga.js`, `src/backend/booking/bookingCore.js`, `src/backend/citasManager.web.js`, and `src/backend/reservas.web.js`. Preserve transaction, lock, compensation, idempotency, and revalidation behavior unless the bug requires a contract change.
- Use `src/backend/internalConfig.js` for collection names, `Europe/Madrid`, timeouts, rate limits, cache TTLs, and concurrency settings. Reuse date and retry helpers from `src/public/mmUtils.js`.
- For frontend failures, inspect `$w.onReady`, `wixLocation.query`, widget `postMessage` handshakes, message IDs, timeouts, and the backend response envelope. Use `src/public/widgetBridge.js` when applicable.
- Never rename Wix-managed page files or create page files from the IDE.

## Project overview
This repository is a Wix Velo site that contains:
- `src/backend/` for backend code and server-side logic
- `src/public/` for client-side public utilities
- `src/pages/` for page code
- `tests/` for Vitest coverage and regression checks

The codebase is mostly JavaScript, with some TypeScript test scaffolding and Wix-specific modules.

## Working rules
- Keep changes small and targeted.
- Prefer the existing project patterns and naming conventions.
- Preserve compatibility with Wix Velo runtime conventions.
- Do not introduce non-ASCII characters into source files when the code already follows ASCII-only style.
- Avoid unnecessary refactors or broad rewrites.

## Validation
Before claiming a fix or implementation is complete, run the smallest relevant verification command. In this repo, the usual validation path is:

- `npx vitest run`
- or a targeted test file such as `npx vitest run tests/bookingCore.test.js`

If a feature is not covered by tests, add or update a focused regression test when feasible.

## Repo-specific guidance
- This project uses `vitest` and `jsdom` for tests.
- The app is not a standard Node app; many modules expect Wix runtime globals and mocked dependencies.
- Keep production changes aligned with the Git Integration & Wix CLI setup described in the root README.
- Favor logic and utility fixes over UI-only changes unless the task explicitly targets a page script.

## General behavior for agents
- Explain the root cause before patching.
- Make the minimal fix that addresses it.
- Verify with a focused test run after the patch.
- Summarize the change, tests run, and any follow-up considerations clearly.
