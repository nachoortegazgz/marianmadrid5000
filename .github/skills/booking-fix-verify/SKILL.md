---
name: booking-fix-verify
description: "Use when: debugging a Wix/Velo booking issue, tracing a root cause, adding a regression test, or validating a minimal fix with Vitest in this repository."
---

# Booking fix and verification workflow

Use this skill when a bug, regression, or logic issue appears in the booking flow or related Wix runtime code.

## Goal

Fix the root cause with the smallest safe change, keep compatibility with Wix runtime assumptions, and confirm the result with the most focused relevant validation.

## Workflow

### 1. Reproduce and localize

- Identify the exact failing behavior or symptom.
- Narrow the issue to the relevant file or flow before editing.
- Check whether the bug sits in booking logic, scheduler logic, data access, or a page-level integration.
- Prefer the smallest reproduction or failing test that captures the real behavior.

### 2. Trace the root cause

- Follow the data flow from the entry point to the failing branch.
- Look for assumptions that do not hold in Wix/Velo runtime, especially around mocked data, async behavior, and date or slot calculations.
- Avoid guessing. Confirm the actual cause before patching.
- Keep the fix targeted; do not broaden the scope unless the same root cause affects multiple call sites.

### 3. Add or update a regression check

- Write a failing test when the behavior is covered by the test suite.
- Keep the test focused on the real behavior instead of mock-only assertions.
- When the bug is not already covered, add the smallest meaningful test that reproduces it.
- Match the repo's existing Vitest patterns and mock setup.

### 4. Implement the minimal fix

- Change only the logic required to resolve the root cause.
- Preserve the existing naming patterns and ASCII-only coding style.
- Keep compatibility with Wix runtime conventions and imported mocks.
- Avoid unnecessary refactors or broad rewrites.

### 5. Validate with the smallest relevant command

Run the narrowest relevant command that exercises the bug or touched area, such as:

- `npx vitest run`
- `npx vitest run tests/bookingCore.test.js`
- another focused Vitest target that matches the changed behavior

If the change affects a broader area, expand validation only as needed.

## Completion checks

Before claiming the fix is complete, confirm all of the following:

- The root cause has been identified and explained.
- The change is minimal and aligned with repo conventions.
- A regression test was added or updated when appropriate.
- The relevant Vitest command passes with fresh output.
- The summary clearly states the fix, the validation evidence, and any follow-up considerations.

## Guardrails

- Prefer targeted fixes over broad refactors.
- Maintain Wix/Editor runtime compatibility.
- Keep code style consistent with the repo's ASCII-only conventions.
- Do not add test-only hooks or production-only debug seams unless they are genuinely part of the fix.
- If the issue is not yet understood, stop and investigate further rather than patching blindly.

## Example prompts

- "Investigate the booking regression and add a focused failing test."
- "Trace the root cause in the reservation flow and apply the smallest safe fix."
- "Validate this booking change with the narrowest relevant Vitest target."
- "Review the scheduler logic for a date/slot bug and keep the fix compatible with Wix runtime assumptions."
