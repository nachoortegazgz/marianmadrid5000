# Copilot instructions

This is a Wix Velo JavaScript repository. For full repository rules, use [AGENTS.md](../AGENTS.md).

When debugging backend or frontend behavior, trace the concrete caller-to-Wix path and identify the layer that decides the result. Treat `webMethod` as the V3 exposure layer, but verify native APIs separately: this project uses Bookings v2 (`wix-bookings.v2`) with Ecom, Auth, and Data.

Before changing a Wix contract, verify imports, argument and response shapes, `elevate`, `suppressAuth`, `permissions.json`, and the local mock. For bookings, inspect `bookingSaga.js`, `bookingCore.js`, `citasManager.web.js`, `reservas.web.js`, `internalConfig.js`, and `public/mmUtils.js`; preserve transaction, lock, retry, timeout, idempotency, and Madrid-time behavior.

This repository is a Wix Velo site with code organized under `src/backend`, `src/public`, and `src/pages`.

Follow these instructions while editing code:

- Prefer targeted, minimal fixes over broad refactors.
- Keep compatibility with Wix/Editor runtime assumptions.
- Maintain the existing ASCII-only coding style.
- Validate with `npx vitest run` or the most focused relevant Vitest target.
- When fixing a bug, identify the root cause and add or update a regression test if appropriate.
- Respect the project structure and existing naming patterns used throughout the repo.

Typical commands:
- `npx vitest run`
- `npx vitest run tests/bookingCore.test.js`

This repository is not a plain frontend app; many modules rely on Wix runtime patterns and imported mocks in tests.
