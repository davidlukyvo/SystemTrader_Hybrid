# v9.8.1 – Fix CHOP + Stabilize UI

Changes:
- Fixed Dashboard render crash by passing `regimeChip` into `renderDashboardHero` instead of relying on an out-of-scope variable.
- Hardened regime chip rendering so undefined values do not break the page.
- Tuned `regime-engine.js` CHOP behavior: CHOP no longer hard-blocks trading by itself. It now allows probe-only behavior when minimal RR/conf conditions exist, while READY stays disabled until expansion/breakout confirms.
- Version bumped to `v9.8.1`.

Files changed:
- `pages/dashboard.js`
- `regime-engine.js`
