# SystemTrader v10.6.3 – Integration Fix Notes

## What was patched

- Raised `DB_VERSION` from 2 to 3 in `db.js` to align with the browser schema already seen in runtime.
- Added a safe IndexedDB fallback path: if the browser rejects `indexedDB.open(name, version)` with a downgrade/version mismatch error, the app now retries with `indexedDB.open(name)` to attach to the existing schema instead of crashing the render pipeline.
- Added `onversionchange` handling so stale DB handles are closed cleanly and can be reopened.

## Why

The runtime screenshots showed:

> The requested version (2) is less than the existing version (3).

That error breaks Scan History / Signals / Settings metrics because the render path depends on IndexedDB reads.

## Expected outcome

After this patch, pages that depend on IndexedDB should render again instead of failing on a version downgrade mismatch.

## Recommended next steps

1. Replace the app files with this build.
2. Hard refresh the browser.
3. If the browser still carries corrupted old schema state, use **Settings → Wipe Database** once, then rescan.
4. Re-check:
   - Dashboard authority chips
   - Scan History
   - Trade History
   - Analytics
