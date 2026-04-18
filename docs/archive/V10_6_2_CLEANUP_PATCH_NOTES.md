# V10.6.2 Cleanup Patch

Patched by ChatGPT.

Included fixes:
- Normalize trigger checks across execution engine
- Capital engine injects totalEquity into capitalPlan
- Execution sizing prefers capitalPlan.totalEquity
- Portfolio engine fatal errors propagate fail-loud
- Live scanner shows blocking fatal banner and uses Telegram.sendCritical with cooldown
- Pro-edge cold-start uses learnedSamples/samples before mature rejection
