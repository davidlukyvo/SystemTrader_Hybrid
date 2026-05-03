# Phase 1.5 Verification Checklist

Observe-only verification after:

- MBE kline pass-through fix
- Agentic Review Layer
- state legacy cleanup
- freshness UI
- stablecoin hygiene

Do not start Phase 2 from this checklist. Do not change Alpha Guard, thresholds, capital, portfolio, or Telegram policy.

## Automated Fixture Check

From the project root:

```powershell
node .\validation\run-regression-harness.js
node .\validation\run-phase15-verification.js
```

Expected:

- regression harness passes all scenarios
- Phase 1.5 checklist returns `"ok": true`
- `behaviorInputQuality` includes `full_ohlcv` when kline data is available
- `partial` remains allowed for symbols with missing candles
- `deployableTop3Before` and `deployableTop3After` match exactly
- `telegramTraceHasAgentReview` is `false`
- stablecoin hygiene check excludes `USD1`
- old-scan rendering check passes without `agentReview` or behavior fields

## Fresh Scan / Export Check

After hard-refreshing the browser app and running one new manual scan, run this in DevTools:

```js
const backup = await DB.exportAll();
const scans = (backup.scans || []).slice().sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
const latest = scans[0];
const signals = (backup.signals || []).filter(s => s.scanId === latest.id);
const deployableSymbols = (latest.deployableTop3 || []).map(s => s.symbol);
const stableSymbols = ['USD1','USDT','USDC','FDUSD','TUSD','DAI','USDE','USDD','BUSD','PYUSD','USDP','USDJ','EURC','EURI'];
const recentScans = scans.slice(0, 3).map(scan => {
  const rows = (backup.signals || []).filter(s => s.scanId === scan.id);
  const counts = rows.reduce((acc, s) => {
    const key = s.behaviorInputQuality || 'missing';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    scanId: scan.id,
    signalCount: rows.length,
    behaviorInputQualityCounts: counts,
    is100PercentPartial: rows.length > 0 && counts.partial === rows.length,
  };
});
const telegramTraceText = JSON.stringify(window.__LAST_ALERT_TRACE__ || {});

({
  latestScanId: latest.id,
  signalCount: signals.length,
  behaviorInputQualityCounts: signals.reduce((acc, s) => {
    const key = s.behaviorInputQuality || 'missing';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}),
  agentReviewCount: signals.filter(s => s.agentReview).length,
  badDecisionImpact: signals.filter(s => s.agentReview && s.agentReview.decisionImpact !== 'none').map(s => s.symbol),
  badLlmFlags: signals.filter(s => s.agentReview && (s.agentReview.llmUsed !== false || s.agentReview.externalCalls !== false)).map(s => s.symbol),
  deployableSymbols,
  telegramTrace: window.__LAST_ALERT_TRACE__?.result || null,
  telegramTraceHasAgentReview: /agentReview/i.test(telegramTraceText),
  recentScans,
  allRecentScans100PercentPartial: recentScans.length >= 3 && recentScans.every(s => s.is100PercentPartial),
  stablecoinLeaks: signals.filter(s => stableSymbols.includes(String(s.symbol || '').toUpperCase())).map(s => s.symbol),
});
```

Expected:

- `full_ohlcv` appears when kline data is available
- `partial` may still exist for symbols with missing candles
- fail only if `allRecentScans100PercentPartial === true` after hard refresh and several fresh scans
- `agentReviewCount === signalCount` for the new scan
- `badDecisionImpact` is empty
- `badLlmFlags` is empty
- `deployableSymbols` matches the UI deployable shortlist and ordering
- `telegramTrace` remains governed by existing alert policy; Agentic Review fields must not be referenced
- `telegramTraceHasAgentReview === false`
- `stablecoinLeaks` is empty

Note: `agentReview` is guaranteed on persisted signals in `DB.exportAll()` after a fresh scan. It is not guaranteed on frozen `deployableTop3` snapshots because those snapshots are intentionally derived before MBE/Agentic Review observe-only enrichment.

## Legacy Scan Check

Open Scan History and expand older records created before Agentic Review. Expected:

- old scans render normally
- missing `agentReview` shows no review panel button rather than throwing
- missing `behaviorEvidence` shows no behavior panel button rather than throwing
- freshness badges remain display-only context
