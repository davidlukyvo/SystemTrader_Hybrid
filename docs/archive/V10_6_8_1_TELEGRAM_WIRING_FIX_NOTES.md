# v10.6.8.1 TELEGRAM WIRING FIX

- scanner runtime now passes finalAuthorityStatus and authorityDecision into AlertEngine.processSignals()
- playable telegram threshold relaxed to rr >= 1.6 and conf >= 0.60
- preserves sideway probe suppression
