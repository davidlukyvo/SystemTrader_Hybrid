# v9.8.3 – Real Unlock

Patch focus:
- soften execution RR/conf floors so sideway market can produce PROBE/PLAYABLE instead of universal AVOID
- normalize setup names between scanner and execution engine
- remove over-harsh `structure_risk` hard block at candidate classification stage
- allow PRO_EDGE soft bypass when regime engine permits probe/ready behavior
- soften sideway playable block fallback into probe/playable path
- lower Top-Gate fallback thresholds so scanner can surface strong PLAYABLE/PROBE coins in unlock mode

Files changed:
- execution-engine-v9.js
- live-scanner.js

Key behavior after patch:
- PROBE can pass from RR ~0.9+, conf ~0.55+, score ~20+
- PLAYABLE can pass from RR ~1.2+, conf ~0.58+, score ~24+
- READY remains stricter
- CHOP/sideway can still trade small when evidence is decent instead of full hard standby
