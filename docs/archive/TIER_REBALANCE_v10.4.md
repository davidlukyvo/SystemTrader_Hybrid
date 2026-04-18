# v10.4 – Tier Rebalance + Playable Restore

Patched `execution-engine-v9.js` to restore tradable PLAYABLE flow for swing 3–7 day Option B.

## Main changes
- Rebalanced PLAYABLE gate to stop over-downgrading good setups into PROBE
- New soft PLAYABLE floor: `rr >= 1.3`, `score >= 20`, `conf >= 0.50`
- Strong RR path: `rr >= 2.0` now only needs `conf >= 0.56`
- PROBE floor tightened slightly from noise while still open: `rr >= 1.0`, `score >= 16`, `conf >= 0.48`
- Sideway high-quality override relaxed so chop does not suppress all PLAYABLE candidates
- PROBE→PLAYABLE promotion in sideway unlock now triggers earlier for valid swing setups

## Intent
Keep Option B risk model intact while shifting system from `all PROBE` toward a healthier mix of `PLAYABLE + PROBE`.
