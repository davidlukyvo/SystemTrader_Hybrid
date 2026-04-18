# v9.8.2 – Unlock Edge

## What changed
- Soft-unlock path added in `execution-engine-v9.js`:
  - `NO_TRADE` no longer hard-blocks evaluation when regime allows probes or PRO EDGE is in `REDUCED` / `PROBE` mode.
  - PRO EDGE hard veto now only activates when there is no probe-capital / reduced-mode unlock.
  - Regime-engine hard veto now only activates when the regime has no `allowProbe` / `allowReady` escape hatch.
- CHOP / sideway playable downgrade:
  - sideway `PLAYABLE` setups that would previously be killed are now downgraded to `PROBE` when they are breakout / trend-continuation / early-phase-d style and still meet minimum RR/conf.
- Scanner Top-Gate fallback unlocked:
  - Scanner top-gate can now show strong `PLAYABLE` / `PROBE` fallbacks when no `READY` exists.
  - Floors used:
    - PLAYABLE: RR >= 2.5 and conf >= 0.55
    - PROBE: RR >= 2.0 and conf >= 0.55
- Scanner UI text updated to reflect unlock behavior.

## Files changed
- `execution-engine-v9.js`
- `live-scanner.js`
- `pages/scanner.js`

## Intent
This patch unlocks edge without breaking authority:
- `READY` still remains the only true best-entry authority.
- CHOP no longer means frozen system.
- Probe/playable setups can survive in reduced-risk mode instead of being fully vetoed upstream.
