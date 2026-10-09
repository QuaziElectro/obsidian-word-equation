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
console.log('CHALLENGER M2-2: LIVE OBSIDIAN DESKTOP E2E RUNNER (SCENARIO 41)');
console.log('Testing live Obsidian desktop behavior via Playwright CDP');
console.log('================================================================\n');

// Pre-flight cleanup
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM Obsidian.exe', { stdio: 'ignore' });
  } catch (e) {}
}

if (!fs.existsSync(PROFILE_DIR)) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

const obsidianJson = {
  vaults: {
    'test-vault': {
      path: VAULT_PATH,
      open: true,
    },
  },
};
fs.writeFileSync(path.join(PROFILE_DIR, 'obsidian.json'), JSON.stringify(obsidianJson, null, 2));

console.log('[Setup] Launching live Obsidian desktop application...');
const proc = spawn(
  OBSIDIAN_EXE,
  [`--user-data-dir=${PROFILE_DIR}`, `--remote-debugging-port=${CDP_PORT}`],
  {
    stdio: 'ignore',
    detached: false,
  }
);

proc.on('error', (err) => {
  console.error('[Process Error] Failed to launch Obsidian:', err);
  process.exit(1);
});

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

async function runLiveScenario41() {
  // 1. Connect CDP
  console.log('[Setup] Connecting to CDP on port', CDP_PORT);
  let connected = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        connected = true;
        console.log(`[Setup] CDP endpoint bound successfully on attempt ${i + 1}`);
        break;
      }
    } catch (e) {
      process.stdout.write('.');
    }
  }

  if (!connected) {
    throw new Error('Timed out waiting for Obsidian CDP endpoint on port ' + CDP_PORT);
  }

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => p.url().includes('obsidian.md'));
  if (!page) {
    page = await context.waitForEvent('page', { timeout: 15000 });
  }

  console.log('[Playwright] Attached to window:', await page.title());
  await page.waitForFunction(() => typeof window.app !== 'undefined', { timeout: 20000 });

  // Handle trust modal
  const trustBtn = page.locator('button:has-text("Trust author and enable plugins")');
  try {
    await trustBtn.waitFor({ state: 'visible', timeout: 3000 });
    console.log('[Obsidian] Trust modal detected, clicking...');
    await trustBtn.click();
    await page.waitForTimeout(1000);
  } catch (e) {}

  // Dismiss any modal
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

  console.log('\n================================================================');
  console.log('PHYSICALLY EXECUTING SCENARIO 41 ON LIVE OBSIDIAN DESKTOP APP');
  console.log('================================================================\n');

  const S41_NOTE_CONTENT = `# Gen48 Boundary Navigation Acceptance Note

## 1. Inline Equation Boundary Target
Prefix123/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi></mrow></math> /weq_inlineSuffix456
`;

  // Step 1: Open/reset note with adjacent inline equation
  console.log('[Scenario 41] Resetting note content with adjacent inline equation...');
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
  await page.waitForTimeout(800);

  // Wait for inline equation widget to render in CodeMirror DOM
  await page.waitForFunction(() => {
    const mathWidgets = document.querySelectorAll('.cm-content .word-equation-math');
    return mathWidgets.length > 0;
  }, { timeout: 10000 });

  // Step 2: Resolve precise document boundary positions (fromPos and toPos)
  const s41Coords = await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    const docText = cmView?.state?.doc?.toString() || '';
    const slashRegex = /\/weq_inline\s*([\s\S]*?)\s*\/weq_inline/g;
    const m = slashRegex.exec(docText);
    if (!m) return null;
    const fromPos = m.index;
    const toPos = m.index + m[0].length;
    const textBefore = docText.slice(Math.max(0, fromPos - 9), fromPos);
    const textAfter = docText.slice(toPos, toPos + 9);
    return { fromPos, toPos, textBefore, textAfter };
  });

  console.log('[Scenario 41] Equation boundary coordinates resolved:', JSON.stringify(s41Coords));
  if (!s41Coords || s41Coords.fromPos < 0) {
    throw new Error('[Scenario 41] Assertion Failed: Unable to locate inline equation in document!');
  }

  // -------------------------------------------------------------------------
  // PHASE A: Left-to-Right Non-Premature Entry (Consuming TEXT1 Prevention)
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 41] --- Phase A: Left-to-Right Boundary Navigation ---');

  // Position cursor in TEXT1 before the last character ('3' in 'Prefix123')
  const posBeforeLastChar = s41Coords.fromPos - 1;
  console.log(`[Scenario 41] Positioning cursor before last character of TEXT1 at index ${posBeforeLastChar}...`);
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
  await page.waitForTimeout(300);

  // Verify initial cursor state before first ArrowRight
  const s41PreStepA = await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    const eq = document.querySelector('.cm-content .word-equation-math');
    const caret = eq?.querySelector('.eq-caret');
    const active = window.__eqActiveState;
    return {
      head: cmView?.state?.selection?.main?.head,
      hasFocus: cmView?.hasFocus,
      isActive: eq?.classList.contains('eq-active') || false,
      hasCaret: Boolean(caret),
      isFocused: Boolean(active?.isFocused),
      activeTag: document.activeElement?.tagName,
      isBody: document.activeElement === document.body,
    };
  });
  console.log('[Scenario 41] Initial cursor state before Step A1:', JSON.stringify(s41PreStepA));
  if (s41PreStepA.isBody || !s41PreStepA.hasFocus || s41PreStepA.head !== posBeforeLastChar) {
    throw new Error(`[Scenario 41] Assertion Failed: Cursor not properly set at pos ${posBeforeLastChar}!`);
  }

  // Step A1: Press ArrowRight once -> Must advance cursor to after last char, equation NOT entered!
  console.log('[Scenario 41] Pressing ArrowRight (Step A1): Expect stepping over "3" to boundary without entering equation...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);

  const s41StepA1 = await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    const eq = document.querySelector('.cm-content .word-equation-math');
    const caret = eq?.querySelector('.eq-caret');
    const active = window.__eqActiveState;
    return {
      head: cmView?.state?.selection?.main?.head,
      hasFocus: cmView?.hasFocus,
      isActive: eq?.classList.contains('eq-active') || false,
      hasCaret: Boolean(caret),
      isFocused: Boolean(active?.isFocused),
      activeTag: document.activeElement?.tagName,
      isBody: document.activeElement === document.body,
    };
  });
  console.log('[Scenario 41] State after Step A1 (ArrowRight 1):', JSON.stringify(s41StepA1));

  if (s41StepA1.isActive || s41StepA1.hasCaret || s41StepA1.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed (Defect Reproduction): ArrowRight prematurely entered equation from pos ${posBeforeLastChar}! Adjacent char "3" was consumed!`);
  }
  if (s41StepA1.head !== s41Coords.fromPos) {
    throw new Error(`[Scenario 41] Assertion Failed: Cursor did not step to equation boundary! Expected head=${s41Coords.fromPos}, found ${s41StepA1.head}`);
  }
  if (!s41StepA1.hasFocus || s41StepA1.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus lost during cursor step to boundary!');
  }
  console.log('[Scenario 41] SUCCESS (Criterion 1): ArrowRight stepped over "3" to boundary pos without prematurely entering equation!');

  // Step A2: Press ArrowRight second time -> Now at boundary pos === fromPos, must ENTER equation!
  console.log('[Scenario 41] Pressing ArrowRight (Step A2): Cursor at boundary, expecting equation entry...');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);

  const s41StepA2 = await page.evaluate(() => {
    const eq = document.querySelector('.cm-content .word-equation-math');
    const caret = eq?.querySelector('.eq-caret');
    const active = window.__eqActiveState;
    return {
      isActive: eq?.classList.contains('eq-active') || false,
      hasCaret: Boolean(caret),
      isFocused: Boolean(active?.isFocused),
      caretSlot: active?.caret?.slotId,
      caretOffset: active?.caret?.offset,
      activeTag: document.activeElement?.tagName,
      isBody: document.activeElement === document.body,
    };
  });
  console.log('[Scenario 41] State after Step A2 (ArrowRight 2):', JSON.stringify(s41StepA2));

  if (!s41StepA2.isActive || !s41StepA2.hasCaret || !s41StepA2.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed: ArrowRight at boundary failed to enter equation! State: ${JSON.stringify(s41StepA2)}`);
  }
  if (s41StepA2.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus dropped to document.body upon equation entry!');
  }
  console.log('[Scenario 41] SUCCESS (Criterion 2): ArrowRight at boundary successfully entered equation with active visual caret!');

  // -------------------------------------------------------------------------
  // PHASE B: Right-to-Left Non-Premature Entry (Consuming TEXT2 Prevention)
  // -------------------------------------------------------------------------
  console.log('\n[Scenario 41] --- Phase B: Right-to-Left Boundary Navigation ---');

  // Position cursor in TEXT2 after the first character ('S' in 'Suffix456')
  const posAfterFirstChar = s41Coords.toPos + 1;
  console.log(`[Scenario 41] Positioning cursor after first character of TEXT2 at index ${posAfterFirstChar}...`);
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
  await page.waitForTimeout(300);

  // Verify initial cursor state before first ArrowLeft
  const s41PreStepB = await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    const eq = document.querySelector('.cm-content .word-equation-math');
    const caret = eq?.querySelector('.eq-caret');
    const active = window.__eqActiveState;
    return {
      head: cmView?.state?.selection?.main?.head,
      hasFocus: cmView?.hasFocus,
      isActive: eq?.classList.contains('eq-active') || false,
      hasCaret: Boolean(caret),
      isFocused: Boolean(active?.isFocused),
      isBody: document.activeElement === document.body,
    };
  });
  console.log('[Scenario 41] Initial cursor state before Step B1:', JSON.stringify(s41PreStepB));
  if (s41PreStepB.isBody || !s41PreStepB.hasFocus || s41PreStepB.head !== posAfterFirstChar) {
    throw new Error(`[Scenario 41] Assertion Failed: Cursor not properly set at pos ${posAfterFirstChar}!`);
  }

  // Step B1: Press ArrowLeft once -> Must retreat cursor to before first char, equation NOT entered!
  console.log('[Scenario 41] Pressing ArrowLeft (Step B1): Expect stepping backward over "S" to boundary without entering equation...');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);

  const s41StepB1 = await page.evaluate(() => {
    const leaf = window.app.workspace.getMostRecentLeaf();
    const cmView = leaf?.view?.editor?.cm;
    const eq = document.querySelector('.cm-content .word-equation-math');
    const caret = eq?.querySelector('.eq-caret');
    const active = window.__eqActiveState;
    return {
      head: cmView?.state?.selection?.main?.head,
      hasFocus: cmView?.hasFocus,
      isActive: eq?.classList.contains('eq-active') || false,
      hasCaret: Boolean(caret),
      isFocused: Boolean(active?.isFocused),
      isBody: document.activeElement === document.body,
    };
  });
  console.log('[Scenario 41] State after Step B1 (ArrowLeft 1):', JSON.stringify(s41StepB1));

  if (s41StepB1.isActive || s41StepB1.hasCaret || s41StepB1.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed (Defect Reproduction): ArrowLeft prematurely entered equation from pos ${posAfterFirstChar}! Adjacent char "S" was consumed!`);
  }
  if (s41StepB1.head !== s41Coords.toPos) {
    throw new Error(`[Scenario 41] Assertion Failed: Cursor did not retreat to equation boundary! Expected head=${s41Coords.toPos}, found ${s41StepB1.head}`);
  }
  if (!s41StepB1.hasFocus || s41StepB1.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus lost during cursor retreat to boundary!');
  }
  console.log('[Scenario 41] SUCCESS (Criterion 3): ArrowLeft stepped backward over "S" to boundary pos without prematurely entering equation!');

  // Step B2: Press ArrowLeft second time -> Now at boundary pos === toPos, must ENTER equation from end!
  console.log('[Scenario 41] Pressing ArrowLeft (Step B2): Cursor at boundary, expecting equation entry from end...');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);

  const s41StepB2 = await page.evaluate(() => {
    const eq = document.querySelector('.cm-content .word-equation-math');
    const caret = eq?.querySelector('.eq-caret');
    const active = window.__eqActiveState;
    const block = document.querySelector('.cm-content [data-equation-from]');
    const widget = block?.__widget || eq?.__widget;
    return {
      isActive: eq?.classList.contains('eq-active') || false,
      hasCaret: Boolean(caret),
      isFocused: Boolean(active?.isFocused),
      enteredFromEnd: widget?.enteredFromEnd || false,
      caretSlot: active?.caret?.slotId,
      caretOffset: active?.caret?.offset,
      activeTag: document.activeElement?.tagName,
      isBody: document.activeElement === document.body,
    };
  });
  console.log('[Scenario 41] State after Step B2 (ArrowLeft 2):', JSON.stringify(s41StepB2));

  if (!s41StepB2.isActive || !s41StepB2.hasCaret || !s41StepB2.isFocused) {
    throw new Error(`[Scenario 41] Assertion Failed: ArrowLeft at boundary failed to enter equation from end! State: ${JSON.stringify(s41StepB2)}`);
  }
  if (s41StepB2.isBody) {
    throw new Error('[Scenario 41] Assertion Failed: Focus dropped to document.body upon equation entry from end!');
  }
  console.log('[Scenario 41] SUCCESS (Criterion 4): ArrowLeft at boundary successfully entered equation from end with active visual caret!');

  console.log('\n================================================================');
  console.log('LIVE OBSIDIAN DESKTOP VERIFICATION COMPLETED WITH 100% SUCCESS!');
  console.log('All 4 criteria objectively verified on real Obsidian desktop binary.');
  console.log('================================================================\n');
}

try {
  await runLiveScenario41();
  await cleanup();
  process.exit(0);
} catch (err) {
  console.error('\n[FATAL ERROR IN LIVE OBSIDIAN E2E TEST]:', err);
  await cleanup();
  process.exit(1);
}
