# v9.7 Capital Engine

## What changed
- Added `capital-engine.js` as a post-gate edge layer.
- Dynamic risk budget now scales by:
  - market regime
  - confidence / score
  - RR quality
  - entry timing quality
  - chart entry quality
- Added capital guards:
  - daily trade limit
  - regime cooldown
  - 2-loss streak stop
  - hard exposure cap
- Execution engine now writes:
  - `sizeBucket`
  - `riskBudgetPct`
  - `baseRiskPctPerTrade`
  - `allocCapMultiplier`
  - `guardReasons`
- Dashboard risk panel now shows:
  - F/M/S bucket counts
  - capital-guard blocked count
- Fixed duplicated dashboard badge counting bug.

## Design intent
This does **not** change scanner authority.
Execution Engine remains the only authority for approval.
Capital Engine only sizes or vetoes already-authorized signals.

## Expected behavior
- Fewer low-quality trades in sideway/chop.
- Higher size only on stronger/timed setups.
- Better anti-overtrade protection.
