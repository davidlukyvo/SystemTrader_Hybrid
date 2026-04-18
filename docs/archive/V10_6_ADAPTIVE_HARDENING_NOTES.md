# SystemTrader v10.6 Adaptive Hardening

This patch is a hardening build on top of v10.5.1.

## Included changes
- READY promote now requires trigger whitelist again.
- READY / PLAYABLE / PROBE thresholds rebalanced to reduce soft inflation.
- Adaptive soft-tier unlock tightened in sideway conditions.
- Scanner now passes richer payload into Telegram alert filtering.
- Telegram anti-spam now favors one summary message only on material change.
- PROBE alerts are suppressed in sideway summary flow unless materially improved.

## Goal
Protect capital first while keeping strong sideway opportunities alive.
