# v10.6.8 SMART TELEGRAM B

- Telegram now prioritizes `finalAuthorityStatus` over legacy `status`.
- `READY` always sends.
- `PLAYABLE` sends when RR >= 1.6 and confidence >= 65%.
- `PROBE` remains suppressed in sideway, unless stronger thresholds are met outside that regime.
- Added debug reasons for `no_meaningful_alert`.
