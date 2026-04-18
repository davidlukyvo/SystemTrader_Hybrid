# GEMINI.md (SystemTrader v10.6.9 Hot Cache)

This file serves as the high-speed memory for the **@system-architect** and **@security-specialist** hubs during the v10.6.9 hardening and stabilization phase. Current runtime branch is hardened through the post-`v10.6.9.56` fail-closed pass for learning, alerts, Top3 semantics, and scanner/UI wording parity.

> [!IMPORTANT]
> For the full system architecture, engine logic, and integration history, refer to:
> `MASTER_HANDOVER.md`

## 👥 Stakeholders (People)

| Name | Role | Notes |
| :--- | :--- | :--- |
| **Sang VT** | CEO & Founder | Strategic decision maker; owner of the SystemTrader project. |
| **Antigravity (AI)**| Audit Lead | Primary agent executing the v10.6.9 hardening using Persona Hubs. |

## 🏗️ Active Projects

| Project | Status | Description |
| :--- | :--- | :--- |
| **SystemTrader v10.6.9** | SOAK-TEST / OBSERVATION | Core hardening is complete. Current focus is runtime observation, audit validation, and low-risk documentation sync. |
| **Telegram Alert Trace** | COMPLETED | Diagnostics for silent alert suppression. |
| **Alpha Guard Trace** | COMPLETED | Diagnostics for execution gate rejections. |
| **Historical Signal Repair** | COMPLETED | One-time IndexedDB repair to recompute dirty legacy `signals.learningEligible` records fail-closed. |
| **Top3 Semantics Split** | COMPLETED | `technicalTop3` and `deployableTop3` separated so UI no longer confuses technical ranking with execution approval. |

## 📖 Glossary (Internal Terms)

| Term | Definition |
| :--- | :--- |
| **Alpha Guard** | The strict, multi-tier execution gate logic in `alpha-guard-core-v51-auth.js`. This is the single source of capital authority. |
| **READY** | Highest-conviction signal tier requiring explicit technical triggers. |
| **PLAYABLE** | Intermediate signal tier with broader entry path options. |
| **PROBE** | Low-visibility entry tier for early-phase setups. |
| **technicalTop3** | Purely technical shortlist from scanner ranking. It may include setups that are later rejected by authority. |
| **deployableTop3** | Authority-approved shortlist for the current scan only. Only `READY` / `PLAYABLE` / `PROBE` signals that still pass final authority may appear here. |
| **authoritativeTop3** | Legacy backward-compatible mirror of `deployableTop3`. Keep for compatibility only; do not prefer this term in new UI/docs. |
| **Fail-Closed Learning** | Learning samples are eligible only when `authorityDecision != REJECT`, `executionGatePassed === true`, `executionActionable === true`, and the authority reason is not blocked. |
| **Fail-Closed Alerts** | Telegram alerts may only surface authority-valid candidates. `dedup`, `capital_guard`, `pre_gate_blocked`, and `all_tiers_rejected` must never leak into alert candidates. |
| **Clean Universe Split** | `clean-universe.js` now distinguishes hard excludes from soft excludes. Majors may re-enter when regime is compatible; meme assets are tighter and should stay blocked in `sideway + CHOP`. |
| **Historical Dataset Snapshot** | Learning logs may refer to the all-time persisted historical dataset, not current-scan-only samples. Runtime wording: `Historical dataset snapshot rebuilt (all-time persisted samples, not current scan)`. |
| **System 2** | Reflective, slow, and analytical thinking (Stop & Think). |

## Runtime Notes

- Active authority engine: `alpha-guard-core-v51-auth.js`
- Active UI truth resolver: `state-v51-auth.js`
- Active alert gate: `alert-engine.js`
- Active DB repair path: `db.js` -> `repairHistoricalSignalsLearning()`
- Scanner architecture is modularized:
  - `scanner-universe.js` -> universe discovery / hygiene
  - `scanner-analysis.js` -> deep scan / scoring / structure analysis
  - `scanner-refinement.js` -> authority merge, Top3 derivation, final shortlist shaping
  - `scanner-persistence.js` -> finalized scan persistence / cache sync
  - `live-scanner.js` -> orchestration shell only
- Scanner UI now prefers `deployableTop3`; if empty, it explicitly renders `No authority-approved setup`
- `technicalTop3` = technical shortlist only
- `deployableTop3` = authority-approved shortlist for the current scan
- `authoritativeTop3` = legacy mirror only, not preferred terminology
- Existing paper positions may still be `ARMED` / `PENDING` / `ACTIVE` / activated / promoted even when the current scan has `0 gate-passed`; lifecycle truth is separate from new scan authority-approved truth
- Learning/runtime logs may say `Historical dataset snapshot rebuilt (all-time persisted samples, not current scan)`; this refers to the persisted historical dataset, not the current scan batch
- Current `sideway + CHOP` soft pre-gate floors: `rr >= 0.65`, `score >= 12`, `conf >= 0.46`
- Current sideway capital profile: `cooldownMs = 90m`, `maxTradesPerDay = 3`, `hardExposureCapPct = 5%`
- `clean-universe.js` uses hard excludes for stable / leveraged / wrapped / commodity-backed assets, and soft excludes for majors; memes are not intended to soft-enter `sideway + CHOP`

---

> [!TIP]
> This file is a living document. Update it with new key terms or project milestones as they occur.
