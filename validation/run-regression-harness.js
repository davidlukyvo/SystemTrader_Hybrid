const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const withBadFixture = args.includes('--with-bad-fixture');
const expectFailure = args.includes('--expect-failure');

function makeStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
    clear() { store.clear(); },
    key(index) { return Array.from(store.keys())[index] || null; },
    get length() { return store.size; }
  };
}

function makeDocument() {
  return {
    body: { appendChild() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() {
      return {
        style: {},
        appendChild() {},
        className: '',
        innerHTML: '',
        textContent: '',
      };
    },
  };
}

function loadScript(context, relPath) {
  const absPath = path.join(rootDir, relPath);
  const source = fs.readFileSync(absPath, 'utf8');
  vm.runInContext(source, context, { filename: absPath });
}

async function main() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    Promise,
    JSON,
    String,
    Number,
    Boolean,
    RegExp,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    URL,
    URLSearchParams,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    document: makeDocument(),
    navigator: { userAgent: 'node-validation-harness' },
    indexedDB: {
      open() { throw new Error('indexedDB is not available in the validation harness'); }
    },
    IDBKeyRange: {
      bound(lower, upper) { return { lower, upper }; }
    },
    fetch: async function() {
      throw new Error('fetch is not available in the validation harness');
    },
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = function() {};
  sandbox.removeEventListener = function() {};

  const context = vm.createContext(sandbox);

  loadScript(context, 'state-v51-auth.js');
  loadScript(context, 'analytics-engine.js');
  loadScript(context, 'alert-engine.js');
  loadScript(context, 'capital-engine.js');
  loadScript(context, 'db.js');
  loadScript(context, 'outcome-evaluator.js');
  loadScript(context, 'alpha-guard-core-v51-auth.js');
  loadScript(context, 'runtime-audit.js');
  loadScript(context, path.join('validation', 'validation-harness.js'));

  const harness = context.VALIDATION_HARNESS;
  if (!harness || typeof harness.runRegressionSuite !== 'function') {
    throw new Error('Validation harness failed to initialize');
  }

  try {
    const result = await harness.runRegressionSuite({ withBadFixture });
    console.log(JSON.stringify({
      mode: withBadFixture ? 'bad-fixture' : 'normal',
      result,
    }, null, 2));

    if (expectFailure) {
      console.error('Expected the bad fixture to fail, but the harness passed.');
      process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({
      mode: withBadFixture ? 'bad-fixture' : 'normal',
      ok: false,
      error: err.message,
      code: err.code || 'validation_error',
      details: err.details || null,
    }, null, 2));

    if (expectFailure) {
      process.exit(0);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
