---
name: wix
description: Debug and modify Wix Velo code in this repo (backend webMethods, booking saga, public utils, page scripts) following project conventions.
---

# wix

Guidance for working on this Wix Velo site (booking, ecom, fiscal, and
administration features) located under `src/`.

## Repo layout

- `src/backend/` - backend/server-side modules exposed to pages via `webMethod`
  from `wix-web-module` (e.g. `citasManager.web.js`, `reservas.web.js`).
- `src/backend/booking/` - booking logic (`bookingSaga.js`, `bookingCore.js`).
- `src/backend/internalConfig.js` - collection names, `Europe/Madrid` timezone,
  timeouts, rate limits, cache TTLs, concurrency settings.
- `src/public/` - client-side utilities (`mmUtils.js`, `widgetBridge.js`,
  `qrHelper.js`).
- `src/pages/` - Wix-managed page code files (never rename or create these
  from the IDE).
- `tests/` - Vitest coverage with `jsdom`, Wix runtime mocks under
  `tests/mocks/`.

## Decision path

Trace before editing: page or public caller -> `webMethod` facade ->
backend orchestrator -> domain module -> Wix API or Data write.

## Contracts

- Verify imports, method/argument shapes, response shapes, `elevate`,
  `suppressAuth`, and `src/backend/permissions.json` before changing any
  contract.
- Bookings use `wix-bookings.v2`; other integrations use Ecom, Auth, and Data.
- Check `tests/mocks/` behavior when a mocked Wix API is involved.

## Booking bugs

Inspect `bookingSaga.js`, `bookingCore.js`, `citasManager.web.js`, and
`reservas.web.js`. Preserve transaction, lock, compensation, idempotency, and
revalidation behavior unless the bug requires a contract change.

## Frontend bugs

Inspect `$w.onReady`, `wixLocation.query`, widget `postMessage` handshakes,
message IDs, timeouts, and the backend response envelope. Use
`src/public/widgetBridge.js` when applicable.

## Conventions

- Reuse date and retry helpers from `src/public/mmUtils.js`.
- Keep changes small and targeted; avoid renames and broad rewrites.
- Keep source files ASCII-only.

## Validation

Run the smallest relevant check:

```bash
npx vitest run
# or a targeted file:
npx vitest run tests/bookingCore.test.js
```

Add or update a focused regression test when a fix is not already covered.

