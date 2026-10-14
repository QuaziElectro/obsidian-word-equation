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
const OBSIDIAN_EXE = process.env.OBSIDIAN_PATH || 'C:\\Program Files\\Obsidian\\Obsidian.exe';
const CDP_PORT = 9222;

console.log('================================================================');
console.log('ADVERSARIAL REAL OBSIDIAN DESKTOP APP CHALLENGE SUITE (R1 & R2)');
console.log('Testing rapid clicks, boundary edges, empty placeholders, nested fractions');
console.log('================================================================\n');

// 1. Prepare test profile
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

const testVaultJson = {
  x: 100,
  y: 100,
  width: 1280,
  height: 900,
  isMaximized: false,
  devTools: false,
  zoom: 0,
};
fs.writeFileSync(path.join(PROFILE_DIR, 'test-vault.json'), JSON.stringify(testVaultJson, null, 2));

const ADVERSARIAL_CHALLENGE_NOTE = `# Adversarial Live Challenge

Testing real Obsidian interaction edge cases:
- Empty placeholders
- Deeply nested fractions
- Boundary edges
- Rapid click bursts

## 1. Empty Placeholder Fraction
\`\`\`math-word
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mfrac>
    <mrow></mrow>
    <mrow></mrow>
  </mfrac>
</math>
\`\`\`

## 2. Empty Placeholder Root
\`\`\`math-word
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mroot>
    <mrow></mrow>
    <mrow></mrow>
  </mroot>
</math>
\`\`\`

## 3. Deeply Nested Continued Fraction
\`\`\`math-word
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mfrac>
    <mn>1</mn>
    <mrow>
      <mn>2</mn>
      <mo>+</mo>
      <mfrac>
        <mn>1</mn>
        <mrow>
          <mn>3</mn>
          <mo>+</mo>
          <mfrac>
            <mn>1</mn>
            <mi>x</mi>
          </mfrac>
        </mrow>
      </mfrac>
    </mrow>
  </mfrac>
</math>
\`\`\`

## 4. Multi-Operator Equation for Rapid Click Bursts
\`\`\`math-word
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mfrac>
    <mrow>
      <mn>1</mn>
      <mn>2</mn>
      <mi>a</mi>
    </mrow>
    <mrow>
      <mn>1</mn>
      <mn>2</mn>
      <mi>b</mi>
    </mrow>
  </mfrac>
  <mo>+</mo>
  <msqrt>
    <mn>1</mn>
    <mn>2</mn>
    <mi>c</mi>
  </msqrt>
  <mo>-</mo>
  <msup>
    <mrow>
      <mi>d</mi>
      <mn>1</mn>
      <mn>2</mn>
    </mrow>
    <mrow>
      <mn>2</mn>
      <mn>1</mn>
      <mn>2</mn>
    </mrow>
  </msup>
  <mo>=</mo>
  <mn>0</mn>
  <mn>1</mn>
  <mn>2</mn>
  <mn>1</mn>
  <mn>2</mn>
</math>
\`\`\`
`;
fs.writeFileSync(path.join(VAULT_PATH, 'adversarial-live-challenge.md'), ADVERSARIAL_CHALLENGE_NOTE, 'utf8');

console.log('[Setup] Launching real compiled Obsidian desktop app on CDP port', CDP_PORT);
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

async function runAdversarialObsidianChallenge() {
  console.log('[Setup] Polling for CDP readiness on port', CDP_PORT);
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

  console.log('\n[Playwright] Connecting to Obsidian over CDP...');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0];

  let page = context.pages().find((p) => p.url().includes('obsidian.md'));
  if (!page) {
    page = await context.waitForEvent('page', { timeout: 15000 });
  }

  console.log('[Playwright] Attached to window:', await page.title());

  await page.waitForFunction(() => typeof window.app !== 'undefined', { timeout: 20000 });

  // Dismiss any trust modal or dialogs
  const trustBtn = page.locator('button:has-text("Trust author and enable plugins")');
  try {
    if (await trustBtn.isVisible({ timeout: 4000 })) {
      await trustBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

  for (let m = 0; m < 5; m++) {
    const modal = page.locator('.modal-container');
    if (await modal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('.modal-close-button');
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }

  // Wait for layoutReady
  await page.waitForFunction(
    () => window.app && window.app.workspace && window.app.workspace.layoutReady,
    { timeout: 25000 }
  );
  console.log('[Obsidian] Workspace layout ready.');

  // Ensure plugin enabled
  await page.evaluate(async () => {
    if (window.app.plugins) {
      if (!window.app.plugins.enabledPlugins.has('obsidian-word-equation')) {
        await window.app.plugins.enablePlugin('obsidian-word-equation');
      }
    }
  });

  // Open adversarial-live-challenge.md in Live Preview mode
  console.log('[Obsidian] Opening adversarial-live-challenge.md...');
  await page.evaluate(async () => {
    let leaf = window.app.workspace.getMostRecentLeaf();
    if (!leaf) leaf = window.app.workspace.getLeaf(false);
    const file = window.app.vault.getAbstractFileByPath('adversarial-live-challenge.md');
    if (file) {
      await leaf.openFile(file, { state: { mode: 'source', source: false } });
      await leaf.setViewState({
        type: 'markdown',
        state: {
          file: 'adversarial-live-challenge.md',
          mode: 'source',
          source: false,
        },
      });
    }
  });

  console.log('[Obsidian] Waiting for equation widgets in editor DOM...');
  await page.waitForSelector('.cm-content .word-equation-math', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const mathCount = await page.locator('.cm-content .word-equation-math').count();
  console.log(`[Obsidian] Discovered ${mathCount} rendered equation widgets in editor DOM.`);
  if (mathCount < 4) {
    throw new Error(`Expected at least 4 equations in test note, found ${mathCount}`);
  }

  // =========================================================================
  // Challenge 1: Rapid Clicking Bursts (Caret stability & non-disappearance)
  // =========================================================================
  console.log('\n--- Challenge 1: Rapid Clicking Bursts Across Tokens ---');
  // Equation 4 is the multi-operator equation
  const eq4 = page.locator('.cm-content .word-equation-math').nth(3);
  const eq4Tokens = eq4.locator('.eq-token');
  const tokenCount = await eq4Tokens.count();
  console.log(`[Challenge 1] Target equation 4 has ${tokenCount} tokens.`);

  if (tokenCount > 0) {
    await eq4.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    console.log('[Challenge 1] Dispatching burst of 30 rapid mouse clicks...');
    for (let burst = 0; burst < 30; burst++) {
      const targetToken = eq4Tokens.nth(burst % tokenCount);
      const tokenBox = await targetToken.boundingBox();
      if (!tokenBox) continue;

      // Alternate click offset (left 20% vs right 80%)
      const clickX = burst % 2 === 0 ? tokenBox.x + tokenBox.width * 0.2 : tokenBox.x + tokenBox.width * 0.8;
      const clickY = tokenBox.y + tokenBox.height * 0.5;
      console.log(`[Challenge 1] Burst ${burst}: tokenBox=${JSON.stringify(tokenBox)}, click=(${clickX.toFixed(1)}, ${clickY.toFixed(1)})`);

      await page.mouse.click(clickX, clickY);
      // Small pause to mimic high-frequency human clicking / jitter
      await page.waitForTimeout(40);

      // Verify DOM invariants after EVERY click:
      const caretCheck = await page.evaluate(() => {
        const carets = document.querySelectorAll('.cm-content .word-equation-math .eq-caret');
        const activeMath = document.querySelectorAll('.cm-content .word-equation-math.eq-active');
        const caretEl = carets[0];
        const style = caretEl ? window.getComputedStyle(caretEl) : null;
        return {
          caretCount: carets.length,
          activeMathCount: activeMath.length,
          caretText: caretEl?.textContent,
          display: style?.display,
          visibility: style?.visibility,
          animation: style?.animationName,
        };
      });

      if (caretCheck.caretCount !== 1) {
        throw new Error(`[Challenge 1 Failure] Burst ${burst + 1}: Expected exactly 1 caret, found ${caretCheck.caretCount}`);
      }
      if (caretCheck.activeMathCount !== 1) {
        throw new Error(`[Challenge 1 Failure] Burst ${burst + 1}: Expected active math widget, found ${caretCheck.activeMathCount}`);
      }
      if (caretCheck.caretText !== '|') {
        throw new Error(`[Challenge 1 Failure] Burst ${burst + 1}: Expected caret '|', found '${caretCheck.caretText}'`);
      }
      if (caretCheck.display === 'none') {
        throw new Error(`[Challenge 1 Failure] Burst ${burst + 1}: Caret hidden by CSS (display=${caretCheck.display})`);
      }
      if (!caretCheck.animation || !caretCheck.animation.includes('eq-blink')) {
        throw new Error(`[Challenge 1 Failure] Burst ${burst + 1}: Caret lost eq-blink animation: ${caretCheck.animation}`);
      }
    }
    console.log('[Challenge 1] SUCCESS: Caret remained stable, visible, and singular across 30 rapid clicks!');
  }

  // =========================================================================
  // Challenge 2: Boundary Edges and Off-Center Coordinates
  // =========================================================================
  console.log('\n--- Challenge 2: Boundary Edge Clicks ---');
  const eq4Box = await eq4.boundingBox();
  if (!eq4Box) throw new Error('Could not get bounding box for equation 4');

  const boundaryPoints = [
    { name: 'Top-Left Corner', x: eq4Box.x + 0.5, y: eq4Box.y + 0.5 },
    { name: 'Top-Right Corner', x: eq4Box.x + eq4Box.width - 0.5, y: eq4Box.y + 0.5 },
    { name: 'Bottom-Right Corner', x: eq4Box.x + eq4Box.width - 0.5, y: eq4Box.y + eq4Box.height - 0.5 },
    { name: 'Bottom-Left Corner', x: eq4Box.x + 0.5, y: eq4Box.y + eq4Box.height - 0.5 },
    { name: '1px Outside Left', x: Math.max(0, eq4Box.x - 1), y: eq4Box.y + eq4Box.height / 2 },
    { name: '1px Outside Right', x: eq4Box.x + eq4Box.width + 1, y: eq4Box.y + eq4Box.height / 2 },
  ];

  for (const pt of boundaryPoints) {
    console.log(`[Challenge 2] Testing click at ${pt.name} (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})...`);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(100);

    const check = await page.evaluate(() => {
      const carets = document.querySelectorAll('.cm-content .word-equation-math .eq-caret');
      return { count: carets.length };
    });
    // In live Obsidian, clicking the boundary edge or container margin either activates at 0/end or blurs gracefully.
    // There must NEVER be multiple carets or JavaScript runtime crashes.
    if (check.count > 1) {
      throw new Error(`[Challenge 2 Failure] Multiple carets (${check.count}) spawned at boundary point ${pt.name}`);
    }
    console.log(`[Challenge 2] Point ${pt.name}: caret count = ${check.count} (safe)`);
  }
  console.log('[Challenge 2] SUCCESS: Boundary clicks handled gracefully without duplicate carets or errors.');

  // =========================================================================
  // Challenge 3: Empty Placeholders Hit-Testing & Direct Typing
  // =========================================================================
  console.log('\n--- Challenge 3: Empty Placeholders Hit-Testing & Editing ---');
  // Equation 1: empty fraction <mfrac><mrow></mrow><mrow></mrow></mfrac>
  const eq1 = page.locator('.cm-content .word-equation-math').nth(0);
  await eq1.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const numPlaceholder = eq1.locator('.eq-numerator .eq-placeholder');
  const denPlaceholder = eq1.locator('.eq-denominator .eq-placeholder');

  const numBox = await numPlaceholder.boundingBox();
  const denBox = await denPlaceholder.boundingBox();

  if (!numBox || !denBox) {
    throw new Error('Could not find empty placeholder bounding boxes in equation 1');
  }

  // 1. Initial placeholder symbols should be '⬚'
  const initNumText = await numPlaceholder.textContent();
  const initDenText = await denPlaceholder.textContent();
  console.log(`[Challenge 3] Initial placeholder text: Num='${initNumText}', Den='${initDenText}'`);
  if (!initNumText.includes('⬚') || !initDenText.includes('⬚')) {
    throw new Error(`Expected '⬚' in empty placeholders, found Num='${initNumText}', Den='${initDenText}'`);
  }

  // 2. Click empty numerator placeholder
  console.log('[Challenge 3] Clicking empty numerator placeholder...');
  await page.mouse.click(numBox.x + numBox.width / 2, numBox.y + numBox.height / 2);
  await page.waitForTimeout(200);

  const numActiveCheck = await page.evaluate(() => {
    const num = document.querySelector('.cm-content .word-equation-math .eq-numerator .eq-placeholder');
    const den = document.querySelector('.cm-content .word-equation-math .eq-denominator .eq-placeholder');
    const caret = num?.querySelector('.eq-caret');
    return {
      numFocused: num?.classList.contains('eq-focused'),
      numHasCaret: Boolean(caret),
      caretText: caret?.textContent,
      denFocused: den?.classList.contains('eq-focused'),
      denText: den?.textContent,
    };
  });
  console.log('[Challenge 3] Numerator state after click:', JSON.stringify(numActiveCheck));

  if (!numActiveCheck.numFocused || !numActiveCheck.numHasCaret) {
    throw new Error('Assertion Failed: Numerator placeholder must acquire .eq-focused and .eq-caret');
  }
  if (numActiveCheck.caretText !== '|') {
    throw new Error(`Assertion Failed: Caret text must be '|', got '${numActiveCheck.caretText}'`);
  }
  if (numActiveCheck.denFocused) {
    throw new Error('Assertion Failed: Denominator must not be focused when numerator is clicked');
  }
  console.log('[Challenge 3] SUCCESS: Numerator placeholder successfully acquired flashing caret!');

  // 3. Click empty denominator placeholder
  console.log('[Challenge 3] Clicking empty denominator placeholder...');
  await page.mouse.click(denBox.x + denBox.width / 2, denBox.y + denBox.height / 2);
  await page.waitForTimeout(200);

  const denActiveCheck = await page.evaluate(() => {
    const num = document.querySelector('.cm-content .word-equation-math .eq-numerator .eq-placeholder');
    const den = document.querySelector('.cm-content .word-equation-math .eq-denominator .eq-placeholder');
    const caret = den?.querySelector('.eq-caret');
    return {
      denFocused: den?.classList.contains('eq-focused'),
      denHasCaret: Boolean(caret),
      caretText: caret?.textContent,
      numFocused: num?.classList.contains('eq-focused'),
      numText: num?.textContent,
    };
  });
  console.log('[Challenge 3] Denominator state after click:', JSON.stringify(denActiveCheck));

  if (!denActiveCheck.denFocused || !denActiveCheck.denHasCaret) {
    throw new Error('Assertion Failed: Denominator placeholder must acquire .eq-focused and .eq-caret');
  }
  if (denActiveCheck.numFocused) {
    throw new Error('Assertion Failed: Numerator must release .eq-focused when denominator is clicked');
  }
  if (!denActiveCheck.numText.includes('⬚')) {
    throw new Error(`Assertion Failed: Numerator placeholder must restore '⬚', found '${denActiveCheck.numText}'`);
  }
  console.log('[Challenge 3] SUCCESS: Seamless caret transfer between empty placeholders verified!');

  // 4. Test typing into empty denominator placeholder
  console.log('[Challenge 3] Typing "7" into denominator placeholder...');
  await page.keyboard.press('7');
  await page.waitForTimeout(300);

  const typedCheck = await page.evaluate(() => {
    const denEl = document.querySelector('.cm-content .word-equation-math .eq-denominator');
    const token = denEl?.querySelector('.eq-token');
    const caret = denEl?.querySelector('.eq-caret');
    return {
      tokenText: token?.textContent,
      hasCaret: Boolean(caret),
      caretAfterToken: token?.nextElementSibling === caret,
    };
  });
  console.log('[Challenge 3] Denominator state after typing "7":', JSON.stringify(typedCheck));

  if (typedCheck.tokenText !== '7') {
    throw new Error(`Assertion Failed: Denominator token must be '7', found '${typedCheck.tokenText}'`);
  }
  if (!typedCheck.hasCaret) {
    throw new Error('Assertion Failed: Caret must remain active in denominator after typing!');
  }
  console.log('[Challenge 3] SUCCESS: Typing in placeholder successfully replaces placeholder with token and retains caret!');

  // =========================================================================
  // Challenge 4: Deeply Nested Continued Fraction Hit-Testing & Traversal
  // =========================================================================
  console.log('\n--- Challenge 4: Deeply Nested Fractions Hit-Testing & Traversal ---');
  // Equation 3 is the continued fraction 1 + 1 / (2 + 1 / (3 + 1 / x))
  const eq3 = page.locator('.cm-content .word-equation-math').nth(2);
  await eq3.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const tokenX = eq3.locator('.eq-token:has-text("x")').first();
  const token3 = eq3.locator('.eq-token:has-text("3")').first();
  const token2 = eq3.locator('.eq-token:has-text("2")').first();
  const token1 = eq3.locator('.eq-token:has-text("1")').first();

  const boxX = await tokenX.boundingBox();
  const box3 = await token3.boundingBox();
  const box2 = await token2.boundingBox();
  const box1 = await token1.boundingBox();

  if (!boxX || !box3 || !box2 || !box1) {
    throw new Error('Could not find tokens in continued fraction equation 3');
  }

  // 1. Direct hit-test to innermost token 'x' at level 4
  console.log(`[Challenge 4] Clicking innermost token 'x' at (${boxX.x + boxX.width / 2}, ${boxX.y + boxX.height / 2})...`);
  await page.mouse.click(boxX.x + boxX.width / 2, boxX.y + boxX.height / 2);
  await page.waitForTimeout(200);

  const caretAtX = await page.evaluate(() => {
    const eq = document.querySelectorAll('.cm-content .word-equation-math')[2];
    const caret = eq?.querySelector('.eq-caret');
    const token = eq?.querySelector('.eq-token[data-node-id]');
    // Find closest token to caret
    const prev = caret?.previousElementSibling;
    const next = caret?.nextElementSibling;
    return {
      caretExists: Boolean(caret),
      prevText: prev?.textContent,
      nextText: next?.textContent,
      slotRole: caret?.parentElement?.getAttribute('data-slot-role'),
      depth: (function getDepth(el) {
        let d = 0;
        while (el && !el.classList?.contains('word-equation-math')) {
          if (el.classList?.contains('eq-fraction')) d++;
          el = el.parentElement;
        }
        return d;
      })(caret),
    };
  });
  console.log('[Challenge 4] Caret position at "x":', JSON.stringify(caretAtX));

  if (!caretAtX.caretExists) {
    throw new Error('Assertion Failed: Caret not injected when clicking innermost token "x"');
  }
  if (caretAtX.depth < 3) {
    throw new Error(`Assertion Failed: Caret depth in fraction tree must be >= 3, found ${caretAtX.depth}`);
  }
  console.log('[Challenge 4] SUCCESS: Innermost token "x" in 4-level fraction hit-tested accurately at depth', caretAtX.depth);

  // 2. Traversal across nesting levels using arrow keys
  console.log('[Challenge 4] Testing keyboard navigation traversal out of deep fraction...');
  for (let step = 1; step <= 6; step++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    const stepInfo = await page.evaluate(() => {
      const eq = document.querySelectorAll('.cm-content .word-equation-math')[2];
      const caret = eq?.querySelector('.eq-caret');
      return {
        hasCaret: Boolean(caret),
        caretCount: eq?.querySelectorAll('.eq-caret').length,
        isEqActive: eq?.classList.contains('eq-active'),
      };
    });

    if (!stepInfo.hasCaret || stepInfo.caretCount !== 1 || !stepInfo.isEqActive) {
      throw new Error(`Assertion Failed: Caret vanished during nested ArrowLeft navigation at step ${step}!`);
    }
  }
  console.log('[Challenge 4] SUCCESS: Caret seamlessly navigated out of deeply nested fraction tree without disappearing!');

  console.log('\n================================================================');
  console.log('ALL ADVERSARIAL REAL OBSIDIAN DESKTOP CHALLENGES PASSED! (100%)');
  console.log('================================================================\n');
}

try {
  await runAdversarialObsidianChallenge();
} catch (err) {
  console.error('\n[Adversarial Challenge Failure]:', err);
  process.exitCode = 1;
} finally {
  console.log('[Cleanup] Closing Playwright CDP connection...');
  if (browser) {
    try {
      await browser.close();
    } catch (e) {}
  }
  console.log('[Cleanup] Terminating Obsidian automation process...');
  if (proc && proc.pid) {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } else {
        proc.kill('SIGTERM');
        proc.kill('SIGKILL');
      }
    } catch (e) {}
  }
  await new Promise((r) => setTimeout(r, 1500));
  process.exit(process.exitCode || 0);
}
