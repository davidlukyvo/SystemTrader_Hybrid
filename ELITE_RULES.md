# Elite Branch: Operational Rules & Hardening Policy

These rules govern all modifications to the SystemTrader v10.6 Elite branch.

## 🟢 Allowed Without Approval (Safe/Audit Logic)
- **Bug Fixes**: Critical stability or logical errors.
- **Persistence Fixes**: DB/Cache integrity.
- **UI Consistency**: Layout, coloring, and pointer affordance.
- **Visibility**: New analytics tables, audit trails, and trace explainability.
- **Logging**: Enhancing console/trace diagnostics.
- **Refactoring**: Moving hardcoded values to `ST.config`.
- **Sample Guards**: Enhancing validation logic for data integrity.

## 🔴 Approval Mandatory (Policy/Execution Logic)
- **Authority Logic**: Changes to how signals are promoted.
- **Tier Thresholds**: Modifying floors for READY, PLAYABLE, or PROBE.
- **Momentum Influence**: Changing how telemetry affects decision quality.
- **Capital Logic**: Position sizing or portfolio risk limits.
- **Alert Policy**: Telegram/Notification logic.
- **Feature Expansion**: Adding new scanner modules or UI pages.
- **Loosening Gates**: Any change that makes execution easier/less restrictive.

## ⚖️ Decision Quality Decision Protocol (Controlled Mode)
If a change affects **score floors, confidence floors, expectancy penalties, setup demotion, or symbol penalties**, Antigravity MUST provide:
1. **Before/After Counts**: READY/PROBE signal distribution.
2. **Affected Artifacts**: List of symbols or setups impacted by the change.
3. **Config Context**: Exact values used in `ST.config`.
4. **Impact Source**: Clarification on whether the impact is from threshold tightening or expectancy penalties.

## 🛡️ Sample Safety Rule
- **Hard Penalties**: Only allowed when sample size is statistically significant (e.g., ≥ 8 trades).
- **Soft Flags (Cautions)**: Applied to lower samples (e.g., 3-7 trades). These should trigger "Watch" or "Caution" flags in the UI/Trace without reducing capital authority.

## 🎯 Current Priority
**Stability → Evidence Collection → Expectancy Hardening → False-Positive Reduction.**
*(Feature expansion is frozen).*
