/* ── MAIN APP ROUTER ─────────────────────────────────────── */

const PAGES = {
  dashboard:      { render: renderDashboard },
  scanner:        { render: renderScanner  },
  scorer:         { render: renderScorer   },
  watchlist:      { render: renderWatchlist},
  models:         { render: renderModels   },
  plan:           { render: renderPlan     },
  risk:           { render: renderRisk     },
  checklist:      { render: renderChecklist},
  journal:        { render: renderJournal  },
  signals:        { render: renderSignals  },
  analytics:      { render: renderAnalytics },
  'scan-history': { render: renderScanHistory },
};

let currentPage = '';

function navigate(page) {
  if (!PAGES[page]) page = 'dashboard';
  if (currentPage === page) return;
  currentPage = page;

  // Update page visibility
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $(`page-${page}`);
  if (target) target.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  // Update hash
  history.replaceState(null, '', '#' + page);

  // Render the page
  PAGES[page].render();
}

// Intercept nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

// BTC badge click – cycle through states
$('btcBadgeSidebar').addEventListener('click', () => {
  const states = ['bull','sideway','bear'];
  const next   = states[(states.indexOf(ST.btc) + 1) % 3];
  ST.setBtc(next);
  // Re-render current page to update warnings
  if (PAGES[currentPage]) PAGES[currentPage].render();
});

// Init — async for IndexedDB
async function init() {
  // Initialize IndexedDB and load state
  try {
    await ST.init();
  } catch (err) {
    console.warn('[INIT] ST.init() error, continuing with defaults:', err);
  }

  seedData();
  syncWatchlistFromCoins();
  try {
    if (window.PRO_EDGE?.buildSnapshot && !ST.scanMeta?.proEdge) {
      ST.scanMeta.proEdge = await window.PRO_EDGE.buildSnapshot();
    }
  } catch (err) {
    console.warn('[INIT] PRO_EDGE build failed:', err);
  }
  ST.save();
  ST.setBtc(ST.btc);

  // Route based on hash or default to dashboard
  const hash = location.hash.replace('#','') || 'dashboard';
  navigate(PAGES[hash] ? hash : 'dashboard');

  // Post-init: run outcome evaluation (non-blocking)
  setTimeout(async () => {
    try {
      if (window.OUTCOME_EVAL) {
        const result = await OUTCOME_EVAL.runEvaluation();
        if (result.evaluated > 0) {
          console.log(`[INIT] Outcome evaluation: ${result.evaluated} checkpoints evaluated`);
          if (window.PRO_EDGE?.rebuildAfterScan) {
            try {
              await window.PRO_EDGE.rebuildAfterScan();
            } catch (edgeErr) {
              console.warn('[INIT] PRO_EDGE rebuild after outcome eval failed:', edgeErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[INIT] Outcome evaluation error:', err);
    }
  }, 3000); // Delay 3s to let UI settle first

  // Post-init: data retention cleanup (once per session, non-blocking)
  setTimeout(async () => {
    try {
      if (window.DB) {
        const lastCleanup = await DB.getSetting('lastCleanup');
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (!lastCleanup?.timestamp || (Date.now() - lastCleanup.timestamp) > oneDayMs) {
          await DB.cleanupOldData();
        }
      }
    } catch (err) {
      console.warn('[INIT] Cleanup error:', err);
    }
  }, 8000); // Delay 8s
}

window.addEventListener('DOMContentLoaded', init);
