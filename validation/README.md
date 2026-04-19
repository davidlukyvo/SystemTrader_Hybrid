# Validation Harness

Run the lightweight regression harness with:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\validation\run-regression-harness.js
```

Run the intentionally bad fixture to prove the harness catches regressions:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\validation\run-regression-harness.js --with-bad-fixture --expect-failure
```

These commands assume your terminal is already opened in the project root:

```text
SystemTrader_Hybrid\
```

What it protects:

- authority truth contract
- setup vs trigger separation
- persistence truth normalization
- analytics population separation
- alert action truth
- maintained / position-bound semantics
- sideway/CHOP loss-streak relax remains narrow
- capital-first behavior remains preserved
- soft PROBE bridge behavior remains narrow and regression-checked

Current expected healthy result:

- normal run passes all scenarios
- bad fixture fails with `setup_pollution_regression`

Recent audit conclusion after Tasks 8-11:

- harness is green
- semantic drift has not reappeared
- current runtime starvation is no longer treated as a semantic bug
- the latest recommendation is to **keep the engine unchanged** unless future runtime audits show a repeated clean almost-PROBE subgroup
