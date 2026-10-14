import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const { chromium } = require('playwright-core');

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');
const VAULT_PATH = path.join(WORKSPACE_ROOT, 'test-vault');
const PROFILE_DIR = path.join(WORKSPACE_ROOT, '.test-profile');
const OBSIDIAN_EXE = 'C:\\Program Files\\Obsidian\\Obsidian.exe';
const CDP_PORT = 9222;
const DEBUG_LOG_PATH = path.join(VAULT_PATH, '.obsidian', 'plugins', 'obsidian-word-equation', 'debug-log.json');

console.log('================================================================');
console.log('CHALLENGER TELEMETRY EMPIRICAL VERIFICATION HARNESS');
console.log('Target debug-log.json:', DEBUG_LOG_PATH);
console.log('================================================================\n');

// 1. Pre-flight cleanup
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM Obsidian.exe', { stdio: 'ignore' });
  } catch (e) {}
}

if (fs.existsSync(DEBUG_LOG_PATH)) {
  fs.unlinkSync(DEBUG_LOG_PATH);
}

// 2. Launch Obsidian
console.log('[Setup] Launching Obsidian desktop app...');
const proc = spawn(
  OBSIDIAN_EXE,
  [`--user-data-dir=${PROFILE_DIR}`, `--remote-debugging-port=${CDP_PORT}`],
  { stdio: 'ignore', detached: false }
);

proc.on('error', (err) => {
  console.error('[Error] Failed to spawn Obsidian:', err);
  process.exit(1);
});

let browser = null;

async function run() {
  // Poll CDP
  let connected = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        connected = true;
        console.log(`[Setup] CDP endpoint bound on attempt ${i + 1}`);
        break;
      }
    } catch (e) {}
  }
  if (!connected) throw new Error('Timed out waiting for Obsidian CDP endpoint');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => p.url().includes('obsidian.md'));
  if (!page) {
    page = await context.waitForEvent('page', { timeout: 15000 });
  }

  await page.waitForFunction(() => typeof window.app !== 'undefined', { timeout: 20000 });
  await page.waitForFunction(() => window.app?.workspace?.layoutReady, { timeout: 25000 });
  console.log('[Obsidian] Workspace layout is fully ready!');

  // Enable plugin if needed
  await page.evaluate(async () => {
    if (window.app.plugins && !window.app.plugins.enabledPlugins.has('obsidian-word-equation')) {
      await window.app.plugins.enablePlugin('obsidian-word-equation');
    }
  });

  // Enable Debug Mode
  console.log('[Telemetry] Enabling Debug Mode in plugin settings and logger...');
  await page.evaluate(async () => {
    const plugin = window.app.plugins?.plugins?.['obsidian-word-equation'];
    if (plugin) {
      plugin.settings.debugMode = true;
      await plugin.saveSettings();
    }
    if (window.__wordEquationDebugLogger) {
      window.__wordEquationDebugLogger.setEnabled(true);
      window.__wordEquationDebugLogger.setDebugMode(true);
      window.__wordEquationDebugLogger.events = [];
    }
    window.__wordEquationDebugEnabled = true;
  });
  await page.waitForTimeout(400);

  // Open gen30-nav-acceptance.md
  console.log('[Obsidian] Opening gen30-nav-acceptance.md...');
  await page.evaluate(async () => {
    let leaf = window.app.workspace.getMostRecentLeaf() || window.app.workspace.getLeaf(false);
    const file = window.app.vault.getAbstractFileByPath('gen30-nav-acceptance.md');
    if (file) {
      await leaf.openFile(file, { state: { mode: 'source', source: false } });
    }
  });
  await page.waitForTimeout(800);
  await page.waitForSelector('.cm-content .word-equation-math', { timeout: 15000 });

  // Navigation sequence
  console.log('[Interaction] Executing navigation sequence across boundaries and placeholders...');

  // Set selection before Equation 0
  await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    const docText = cmView?.state?.doc?.toString() || '';
    const m = /```(math-word|weq)(?:[ \t]*\r?\n)([\s\S]*?)(?:\r?\n```|$)/g.exec(docText);
    const fromPos = m ? m.index : 0;
    if (cmView) {
      cmView.dispatch({ selection: { anchor: fromPos } });
      cmView.focus();
    }
  });
  await page.waitForTimeout(200);

  // Enter equation from start
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);

  // Focus equation and navigate down into numerator / denominator
  await page.evaluate(() => {
    const mathEl = document.querySelector('.word-equation-math.eq-active') || document.querySelector('.word-equation-math');
    if (mathEl && typeof mathEl.focus === 'function') mathEl.focus();
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const mathEl = document.querySelector('.word-equation-math.eq-active') || document.querySelector('.word-equation-math');
    if (mathEl && typeof mathEl.focus === 'function') mathEl.focus();
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);

  // Exit equation forward
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);

  // Focus CodeMirror content to create focus shift
  await page.evaluate(() => {
    const cm = document.querySelector('.cm-content');
    if (cm) cm.focus();
  });
  await page.waitForTimeout(200);

  // Enter Equation 2 from behind
  await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    const docText = cmView?.state?.doc?.toString() || '';
    const blockRegex = /```(math-word|weq)(?:[ \t]*\r?\n)([\s\S]*?)(?:\r?\n```|$)/g;
    let m;
    let matchIdx = 0;
    let toPos = 0;
    while ((m = blockRegex.exec(docText)) !== null) {
      if (matchIdx === 2) {
        toPos = m.index + m[0].length;
        break;
      }
      matchIdx++;
    }
    if (cmView) {
      cmView.dispatch({ selection: { anchor: toPos } });
      cmView.focus();
    }
  });
  await page.waitForTimeout(200);

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);

  // Flush to disk
  console.log('[Telemetry] Flushing telemetry logger to disk...');
  await page.evaluate(async () => {
    const logger = window.__wordEquationDebugLogger;
    if (logger?.flush) {
      await logger.flush();
    }
  });
  await page.waitForTimeout(800);

  // Verify debug-log.json exists and parse
  if (!fs.existsSync(DEBUG_LOG_PATH)) {
    throw new Error(`CRITICAL: debug-log.json not created at ${DEBUG_LOG_PATH}!`);
  }

  const raw = fs.readFileSync(DEBUG_LOG_PATH, 'utf8');
  const events = JSON.parse(raw);
  console.log(`\n================================================================`);
  console.log(`EMPIRICAL TELEMETRY REPORT: debug-log.json`);
  console.log(`Total Events Recorded: ${events.length}`);
  console.log(`File Size: ${raw.length} bytes`);
  console.log(`================================================================\n`);

  // 1. Capture-phase keydown verification
  const captureKeys = events.filter((e) => e.type === 'keydown' && (e.details?.phase === 'capture' || e.data?.phase === 'capture'));
  console.log(`[Category 1] Capture-phase keydown events: count = ${captureKeys.length}`);
  if (captureKeys.length === 0) {
    throw new Error('FAIL: No capture-phase keydown events found!');
  }
  const sampleKey = captureKeys[0];
  console.log('Sample Capture Keydown:', JSON.stringify(sampleKey, null, 2));
  if (!sampleKey.details.key || !sampleKey.details.phase || sampleKey.details.phase !== 'capture') {
    throw new Error('FAIL: Capture keydown missing key or phase=capture!');
  }
  if (typeof sampleKey.details.targetTag !== 'string' || typeof sampleKey.details.activeElementTag !== 'string') {
    throw new Error('FAIL: Capture keydown missing targetTag or activeElementTag!');
  }

  // 2. CodeMirror selection tracking
  const cmSelEvents = events.filter(
    (e) => (e.details?.cmSelectionBefore || e.data?.cmSelectionBefore) ||
           (e.details?.cmSelectionAfter || e.data?.cmSelectionAfter) ||
           (e.details?.codeMirrorSelection || e.data?.codeMirrorSelection)
  );
  console.log(`\n[Category 2] CodeMirror selection tracking events: count = ${cmSelEvents.length}`);
  if (cmSelEvents.length === 0) {
    throw new Error('FAIL: No CodeMirror selection tracking events found!');
  }
  const sampleCmSel = cmSelEvents[0];
  console.log('Sample CM Selection Event:', JSON.stringify(sampleCmSel, null, 2));

  // 3. Focus shift tracking
  const focusEvents = events.filter((e) => e.type === 'focus');
  console.log(`\n[Category 3] DOM focus transition events: count = ${focusEvents.length}`);
  if (focusEvents.length === 0) {
    throw new Error('FAIL: No DOM focus transition events found!');
  }
  const sampleFocus = focusEvents[0];
  console.log('Sample Focus Transition Event:', JSON.stringify(sampleFocus, null, 2));
  const hasFocusShiftType = focusEvents.some((e) => e.details?.focusShiftType || e.data?.focusShiftType);
  if (!hasFocusShiftType) {
    throw new Error('FAIL: Focus events lack focusShiftType!');
  }

  // 4. Candidate evaluations
  const placeholderEvents = events.filter(
    (e) => (e.type === 'placeholder' && (e.details?.action === 'candidate_evaluation_summary' || e.data?.action === 'candidate_evaluation_summary')) ||
           (e.type === 'placeholder' && (e.details?.action === 'candidate_evaluation' || e.data?.action === 'candidate_evaluation'))
  );
  console.log(`\n[Category 4] Candidate evaluation placeholder events: count = ${placeholderEvents.length}`);
  if (placeholderEvents.length === 0) {
    throw new Error('FAIL: No candidate evaluation placeholder events found!');
  }
  const samplePlaceholder = placeholderEvents[0];
  console.log('Sample Candidate Evaluation Event:', JSON.stringify(samplePlaceholder, null, 2));

  // 5. CodeMirror Transaction Filters (Requirement R3 Branch B)
  const cmTrEvents = events.filter(
    (e) => e.details?.eventCategory === 'cm_transaction' || e.data?.eventCategory === 'cm_transaction'
  );
  console.log(`\n[Category 5] CodeMirror transaction filter events: count = ${cmTrEvents.length}`);
  if (cmTrEvents.length === 0) {
    throw new Error('FAIL: No cm_transaction events found in debug-log.json!');
  }
  const sampleTr = cmTrEvents[0];
  console.log('Sample CM Transaction Event:', JSON.stringify(sampleTr, null, 2));

  // 6. DOM MutationObserver (Requirement R3 Branch B)
  const mutationEvents = events.filter(
    (e) => e.details?.eventCategory === 'dom_mutation' || e.data?.eventCategory === 'dom_mutation'
  );
  console.log(`\n[Category 6] DOM MutationObserver events: count = ${mutationEvents.length}`);
  if (mutationEvents.length === 0) {
    throw new Error('FAIL: No dom_mutation events found in debug-log.json!');
  }
  const sampleMutation = mutationEvents[0];
  console.log('Sample DOM Mutation Event:', JSON.stringify(sampleMutation, null, 2));

  // 7. Full-Spectrum Keyboard Event Propagation
  const bubbleKeys = events.filter(
    (e) => e.type === 'keydown' && (e.details?.phase === 'bubble' || e.data?.phase === 'bubble')
  );
  console.log(`\n[Category 7] Bubble-phase keydown events: count = ${bubbleKeys.length}`);
  if (bubbleKeys.length === 0) {
    throw new Error('FAIL: No bubble-phase keydown events found in debug-log.json!');
  }
  const sampleBubble = bubbleKeys[0];
  console.log('Sample Bubble Keydown Event:', JSON.stringify(sampleBubble, null, 2));

  console.log(`\n>>> ALL 7 TELEMETRY DATA POINT CATEGORIES EMPIRICALLY CONFIRMED IN REAL OBSIDIAN DESKTOP! <<<`);
}

try {
  await run();
} catch (err) {
  console.error('\n[Harness Error]:', err);
  process.exitCode = 1;
} finally {
  console.log('[Cleanup] Closing CDP and process...');
  if (browser) {
    try { await browser.close(); } catch (e) {}
  }
  if (proc && proc.pid) {
    try {
      const { execSync } = require('child_process');
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      execSync(`taskkill /F /IM Obsidian.exe`, { stdio: 'ignore' });
    } catch (e) {}
  }
  await new Promise((r) => setTimeout(r, 1000));
  process.exit(process.exitCode || 0);
}
