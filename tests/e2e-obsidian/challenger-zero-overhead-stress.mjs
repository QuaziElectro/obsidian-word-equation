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
const PLUGIN_DIR = path.join(VAULT_PATH, '.obsidian', 'plugins', 'obsidian-word-equation');
const DEBUG_LOG_PATH = path.join(PLUGIN_DIR, 'debug-log.json');
const DATA_JSON_PATH = path.join(PLUGIN_DIR, 'data.json');

console.log('================================================================');
console.log('CHALLENGER ZERO-OVERHEAD ADVERSARIAL STRESS TEST');
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
  console.log('[Cleanup] Removed existing debug-log.json');
}

// Ensure data.json explicitly has debugMode: false before launching
if (fs.existsSync(DATA_JSON_PATH)) {
  const currentSettings = JSON.parse(fs.readFileSync(DATA_JSON_PATH, 'utf8'));
  currentSettings.debugMode = false;
  fs.writeFileSync(DATA_JSON_PATH, JSON.stringify(currentSettings, null, 2), 'utf8');
  console.log('[Setup] Set data.json debugMode: false prior to launch');
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
  console.log('[Obsidian] Workspace layout ready');

  // Open test note
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

  // -------------------------------------------------------------
  // PHASE 1: Cold start zero-overhead verification
  // -------------------------------------------------------------
  console.log('\n--- PHASE 1: Cold start with debugMode: false ---');
  if (fs.existsSync(DEBUG_LOG_PATH)) {
    throw new Error(`FAIL: debug-log.json was created on cold start with debugMode: false!`);
  }

  // Perform navigation with debug disabled
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);

  // Attempt flush
  await page.evaluate(async () => {
    const logger = window.__wordEquationDebugLogger;
    if (logger?.flush) await logger.flush();
  });
  await page.waitForTimeout(400);

  if (fs.existsSync(DEBUG_LOG_PATH)) {
    throw new Error('FAIL: debug-log.json was created after interactions in Phase 1!');
  }
  const memCountPhase1 = await page.evaluate(() => window.__wordEquationDebugLogger?.events?.length ?? 0);
  if (memCountPhase1 > 0) {
    throw new Error(`FAIL: In-memory events buffered in Phase 1 (${memCountPhase1})!`);
  }
  console.log('[Phase 1] SUCCESS: Zero events written to disk or memory on cold start.');

  // -------------------------------------------------------------
  // PHASE 2: Dynamic Toggle OFF Zero-Overhead Stress Test
  // -------------------------------------------------------------
  console.log('\n--- PHASE 2: Dynamic Toggle ON -> OFF Stress Test ---');

  // Turn debug ON
  console.log('[Phase 2] Enabling Debug Mode dynamically...');
  await page.evaluate(async () => {
    const plugin = window.app.plugins?.plugins?.['obsidian-word-equation'];
    if (plugin) {
      plugin.settings.debugMode = true;
      await plugin.saveSettings();
    }
    if (window.__wordEquationDebugLogger) {
      window.__wordEquationDebugLogger.setEnabled(true);
      window.__wordEquationDebugLogger.setDebugMode(true);
    }
    window.__wordEquationDebugEnabled = true;
  });
  await page.waitForTimeout(300);

  // Trigger an interaction to produce some events
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.evaluate(async () => {
    const logger = window.__wordEquationDebugLogger;
    if (logger?.flush) await logger.flush();
  });
  await page.waitForTimeout(500);

  if (!fs.existsSync(DEBUG_LOG_PATH)) {
    throw new Error('FAIL: debug-log.json was NOT created when Debug Mode was enabled in Phase 2!');
  }
  const onEventsCount = JSON.parse(fs.readFileSync(DEBUG_LOG_PATH, 'utf8')).length;
  console.log(`[Phase 2] Confirmed Debug Mode ON produced ${onEventsCount} events.`);

  // Now turn debug OFF dynamically
  console.log('[Phase 2] Disabling Debug Mode dynamically and unlinking log file...');
  await page.evaluate(async () => {
    const plugin = window.app.plugins?.plugins?.['obsidian-word-equation'];
    if (plugin) {
      plugin.settings.debugMode = false;
      await plugin.saveSettings();
    }
    if (window.__wordEquationDebugLogger) {
      window.__wordEquationDebugLogger.setEnabled(false);
      window.__wordEquationDebugLogger.setDebugMode(false);
      window.__wordEquationDebugLogger.events = [];
    }
    window.__wordEquationDebugEnabled = false;
  });
  await page.waitForTimeout(300);

  fs.unlinkSync(DEBUG_LOG_PATH);
  console.log('[Phase 2] debug-log.json removed.');

  // High-stress interactions:
  console.log('[Phase 2] Executing high-stress interactions with Debug Mode OFF...');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(80);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(80);
  }

  // Dispatch CM selections
  await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    if (cmView) {
      cmView.dispatch({ selection: { anchor: 10 } });
      cmView.dispatch({ selection: { anchor: 50 } });
      cmView.dispatch({ selection: { anchor: 100 } });
    }
  });
  await page.waitForTimeout(200);

  // Attempt explicit flush
  console.log('[Phase 2] Attempting explicit flush...');
  await page.evaluate(async () => {
    const logger = window.__wordEquationDebugLogger;
    if (logger?.flush) await logger.flush();
  });
  await page.waitForTimeout(800);

  // Check disk
  const diskExists = fs.existsSync(DEBUG_LOG_PATH);
  console.log(`[Phase 2 Result] debug-log.json exists on disk: ${diskExists}`);
  if (diskExists) {
    const content = fs.readFileSync(DEBUG_LOG_PATH, 'utf8').trim();
    if (content && content !== '[]') {
      const parsed = JSON.parse(content);
      throw new Error(`FAIL: debug-log.json was written with ${parsed.length} events when Debug Mode was OFF!`);
    }
  }

  const memCountPhase2 = await page.evaluate(() => window.__wordEquationDebugLogger?.events?.length ?? 0);
  console.log(`[Phase 2 Result] In-memory event count: ${memCountPhase2}`);
  if (memCountPhase2 > 0) {
    throw new Error(`FAIL: In-memory events retained in Phase 2 (${memCountPhase2})!`);
  }

  console.log('\n>>> ZERO-OVERHEAD EMPIRICAL VERIFICATION COMPLETE AND CONFIRMED (PHASE 1 & PHASE 2 PASS)! <<<');
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
