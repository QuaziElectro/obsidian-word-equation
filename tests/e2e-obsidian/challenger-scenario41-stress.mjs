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

console.log('================================================================');
console.log('CHALLENGER M2-2: MULTI-CYCLE STRESS HARNESS FOR SCENARIO 41');
console.log('Verifying zero flakiness across 5 consecutive live Obsidian runs');
console.log('================================================================\n');

// Pre-flight cleanup
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM Obsidian.exe', { stdio: 'ignore' });
  } catch (e) {}
}

const proc = spawn(
  OBSIDIAN_EXE,
  [`--user-data-dir=${PROFILE_DIR}`, `--remote-debugging-port=${CDP_PORT}`],
  { stdio: 'ignore', detached: false }
);

let browser = null;

async function cleanup() {
  if (browser) {
    try { await browser.close(); } catch (e) {}
  }
  if (proc) {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try { execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch (e) {}
        try { execSync(`taskkill /F /IM Obsidian.exe`, { stdio: 'ignore' }); } catch (e) {}
      } else {
        proc.kill('SIGTERM');
      }
    } catch (e) {}
  }
}

process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(1); });

async function runStress() {
  let connected = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        connected = true;
        break;
      }
    } catch (e) {}
  }
  if (!connected) throw new Error('CDP connect timeout');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => p.url().includes('obsidian.md'));
  if (!page) {
    page = await context.waitForEvent('page', { timeout: 15000 });
  }

  await page.waitForFunction(
    () => window.app && window.app.workspace && window.app.workspace.layoutReady,
    { timeout: 25000 }
  );

  // Dismiss modals
  for (let m = 0; m < 3; m++) {
    const modal = page.locator('.modal-container');
    if (await modal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('.modal-close-button');
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    }
  }

  const S41_NOTE_CONTENT = `# Gen48 Boundary Navigation Acceptance Note

## 1. Inline Equation Boundary Target
Prefix123/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi></mrow></math> /weq_inlineSuffix456
`;

  const NUM_CYCLES = 5;
  for (let cycle = 1; cycle <= NUM_CYCLES; cycle++) {
    console.log(`\n--- Cycle ${cycle}/${NUM_CYCLES}: Testing Scenario 41 Navigation Invariants ---`);

    // Reset note
    await page.evaluate(async (initialContent) => {
      let leaf = window.app.workspace.getMostRecentLeaf();
      if (!leaf) leaf = window.app.workspace.getLeaf(false);
      let file = window.app.vault.getAbstractFileByPath('gen48-boundary-acceptance.md');
      if (!file) {
        file = await window.app.vault.create('gen48-boundary-acceptance.md', initialContent);
      }
      await leaf.openFile(file, { state: { mode: 'source', source: false } });
      const editor = leaf.view?.editor;
      if (editor) {
        editor.setValue(initialContent);
      }
      document.querySelectorAll('.word-equation-math.eq-active').forEach((el) => el.classList.remove('eq-active'));
      document.querySelectorAll('.eq-caret').forEach((el) => el.remove());
      window.__eqActiveState = null;
    }, S41_NOTE_CONTENT);
    await page.waitForTimeout(500);

    await page.waitForFunction(() => {
      return document.querySelectorAll('.cm-content .word-equation-math').length > 0;
    }, { timeout: 10000 });

    const coords = await page.evaluate(() => {
      const leaf = window.app.workspace.getMostRecentLeaf();
      const cmView = leaf?.view?.editor?.cm;
      const docText = cmView?.state?.doc?.toString() || '';
      const slashRegex = /\/weq_inline\s*([\s\S]*?)\s*\/weq_inline/g;
      const m = slashRegex.exec(docText);
      if (!m) return null;
      return { fromPos: m.index, toPos: m.index + m[0].length };
    });

    if (!coords) throw new Error(`[Cycle ${cycle}] Could not resolve coordinates!`);

    // Phase A: Left to Right
    const posBeforeLastChar = coords.fromPos - 1;
    await page.evaluate((targetPos) => {
      const leaf = window.app.workspace.getMostRecentLeaf();
      const cmView = leaf?.view?.editor?.cm;
      document.querySelectorAll('.word-equation-math.eq-active').forEach((el) => el.classList.remove('eq-active'));
      document.querySelectorAll('.eq-caret').forEach((el) => el.remove());
      window.__eqActiveState = null;
      if (cmView) {
        cmView.dispatch({ selection: { anchor: targetPos } });
        cmView.focus();
      }
    }, posBeforeLastChar);
    await page.waitForTimeout(250);

    // Step A1: ArrowRight 1 (step over '3' to fromPos, equation NOT entered)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);

    const stepA1 = await page.evaluate(() => {
      const leaf = window.app.workspace.getMostRecentLeaf();
      const cmView = leaf?.view?.editor?.cm;
      const eq = document.querySelector('.cm-content .word-equation-math');
      const caret = eq?.querySelector('.eq-caret');
      const active = window.__eqActiveState;
      return {
        head: cmView?.state?.selection?.main?.head,
        isActive: eq?.classList.contains('eq-active') || false,
        hasCaret: Boolean(caret),
        isFocused: Boolean(active?.isFocused),
        isBody: document.activeElement === document.body,
      };
    });

    if (stepA1.isActive || stepA1.hasCaret || stepA1.isFocused) {
      throw new Error(`[Cycle ${cycle}] Step A1 failed: Premature equation entry!`);
    }
    if (stepA1.head !== coords.fromPos) {
      throw new Error(`[Cycle ${cycle}] Step A1 failed: Cursor did not step to boundary! head=${stepA1.head}, expected=${coords.fromPos}`);
    }
    if (stepA1.isBody) {
      throw new Error(`[Cycle ${cycle}] Step A1 failed: Focus lost to body!`);
    }

    // Step A2: ArrowRight 2 (at boundary fromPos, enters equation)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);

    const stepA2 = await page.evaluate(() => {
      const eq = document.querySelector('.cm-content .word-equation-math');
      const caret = eq?.querySelector('.eq-caret');
      const active = window.__eqActiveState;
      return {
        isActive: eq?.classList.contains('eq-active') || false,
        hasCaret: Boolean(caret),
        isFocused: Boolean(active?.isFocused),
        isBody: document.activeElement === document.body,
      };
    });

    if (!stepA2.isActive || !stepA2.hasCaret || !stepA2.isFocused) {
      throw new Error(`[Cycle ${cycle}] Step A2 failed: ArrowRight did not enter equation!`);
    }
    if (stepA2.isBody) {
      throw new Error(`[Cycle ${cycle}] Step A2 failed: Focus dropped to body!`);
    }

    // Phase B: Right to Left
    const posAfterFirstChar = coords.toPos + 1;
    await page.evaluate((targetPos) => {
      const leaf = window.app.workspace.getMostRecentLeaf();
      const cmView = leaf?.view?.editor?.cm;
      document.querySelectorAll('.word-equation-math.eq-active').forEach((el) => el.classList.remove('eq-active'));
      document.querySelectorAll('.eq-caret').forEach((el) => el.remove());
      window.__eqActiveState = null;
      if (cmView) {
        cmView.dispatch({ selection: { anchor: targetPos } });
        cmView.focus();
      }
    }, posAfterFirstChar);
    await page.waitForTimeout(250);

    // Step B1: ArrowLeft 1 (step back over 'S' to toPos, equation NOT entered)
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(250);

    const stepB1 = await page.evaluate(() => {
      const leaf = window.app.workspace.getMostRecentLeaf();
      const cmView = leaf?.view?.editor?.cm;
      const eq = document.querySelector('.cm-content .word-equation-math');
      const caret = eq?.querySelector('.eq-caret');
      const active = window.__eqActiveState;
      return {
        head: cmView?.state?.selection?.main?.head,
        isActive: eq?.classList.contains('eq-active') || false,
        hasCaret: Boolean(caret),
        isFocused: Boolean(active?.isFocused),
        isBody: document.activeElement === document.body,
      };
    });

    if (stepB1.isActive || stepB1.hasCaret || stepB1.isFocused) {
      throw new Error(`[Cycle ${cycle}] Step B1 failed: Premature equation entry from right!`);
    }
    if (stepB1.head !== coords.toPos) {
      throw new Error(`[Cycle ${cycle}] Step B1 failed: Cursor did not retreat to boundary! head=${stepB1.head}, expected=${coords.toPos}`);
    }
    if (stepB1.isBody) {
      throw new Error(`[Cycle ${cycle}] Step B1 failed: Focus lost to body!`);
    }

    // Step B2: ArrowLeft 2 (at boundary toPos, enters equation from end)
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(250);

    const stepB2 = await page.evaluate(() => {
      const eq = document.querySelector('.cm-content .word-equation-math');
      const caret = eq?.querySelector('.eq-caret');
      const active = window.__eqActiveState;
      return {
        isActive: eq?.classList.contains('eq-active') || false,
        hasCaret: Boolean(caret),
        isFocused: Boolean(active?.isFocused),
        isBody: document.activeElement === document.body,
      };
    });

    if (!stepB2.isActive || !stepB2.hasCaret || !stepB2.isFocused) {
      throw new Error(`[Cycle ${cycle}] Step B2 failed: ArrowLeft did not enter equation from end!`);
    }
    if (stepB2.isBody) {
      throw new Error(`[Cycle ${cycle}] Step B2 failed: Focus dropped to body!`);
    }

    console.log(`[Cycle ${cycle}/${NUM_CYCLES}] PASSED: Criteria 1, 2, 3, 4 strictly verified without any flakiness.`);
  }

  console.log('\n================================================================');
  console.log(`ALL ${NUM_CYCLES}/${NUM_CYCLES} STRESS CYCLES COMPLETED WITH 100% SUCCESS! (0 failures, 0 flakiness)`);
  console.log('================================================================\n');
}

try {
  await runStress();
  await cleanup();
  process.exit(0);
} catch (err) {
  console.error('\n[FATAL STRESS ERROR]:', err);
  await cleanup();
  process.exit(1);
}
