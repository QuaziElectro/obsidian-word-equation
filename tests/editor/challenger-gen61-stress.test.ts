import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { clearActiveEquationState } from '../../src/editor/active-session';
import { DebugLogger, getDebugLogger } from '../../src/debug/debug-logger';

describe('Challenger Gen 61 Adversarial Stress Suite: Bug 1 (Shift+Arrow Boundaries) & Bug 2 (Cross-Boundary Copy/Paste)', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;
  let logger: DebugLogger;

  // Fallback keymap simulating standard CodeMirror / browser fallback character navigation when unhandled
  const fallbackKeymap: Extension = EditorView.domEventHandlers({
    keydown: (evt, v) => {
      if (evt.shiftKey && evt.key === 'ArrowRight' && !evt.defaultPrevented) {
        v.dispatch({
          selection: {
            anchor: v.state.selection.main.anchor,
            head: Math.min(v.state.doc.length, v.state.selection.main.head + 1),
          },
        });
        return true;
      }
      if (evt.shiftKey && evt.key === 'ArrowLeft' && !evt.defaultPrevented) {
        v.dispatch({
          selection: {
            anchor: v.state.selection.main.anchor,
            head: Math.max(0, v.state.selection.main.head - 1),
          },
        });
        return true;
      }
      return false;
    },
    copy: (evt, v) => {
      if (!evt.defaultPrevented) {
        const sel = v.state.selection.main;
        if (!sel.empty) {
          const slice = v.state.sliceDoc(sel.from, sel.to);
          evt.clipboardData?.setData('text/plain', slice);
        }
      }
      return false;
    },
  });

  function createMockClipboardEvent(
    type: 'copy' | 'cut' | 'paste',
    data: Record<string, string> = {}
  ): ClipboardEvent {
    const store: Record<string, string> = { ...data };
    const event = new Event(type, { bubbles: true, cancelable: true }) as any;

    const clipboardData = {
      getData: (format: string) => store[format] || '',
      setData: (format: string, val: string) => {
        store[format] = val;
        return true;
      },
      clearData: (format?: string) => {
        if (format) delete store[format];
        else {
          for (const k of Object.keys(store)) delete store[k];
        }
      },
      types: Object.keys(store),
    };

    Object.defineProperty(event, 'clipboardData', {
      value: clipboardData,
      writable: true,
    });

    return event as ClipboardEvent;
  }

  function dispatchKey(view: EditorView, key: 'ArrowRight' | 'ArrowLeft', shiftKey: boolean = true) {
    const keyEvt = new KeyboardEvent('keydown', {
      key,
      code: key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(keyEvt);
  }

  beforeEach(() => {
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    logger = getDebugLogger();
    logger.resetForTesting();

    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = function () {
        return [] as any;
      };
    }

    const cssPath = path.resolve(__dirname, '../../styles.css');
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      styleEl = document.createElement('style');
      styleEl.textContent = cssContent;
      document.head.appendChild(styleEl);
    }
  });

  afterEach(() => {
    clearActiveEquationState();
    logger.resetForTesting();
    container.remove();
    if (styleEl) styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // SUITE 1: BUG 1 — RAPID KEYSTROKE SEQUENCES & OSCILLATIONS IN aaa$Math$bbb
  // =========================================================================
  describe('Suite 1: Bug 1 — Rapid Keystroke Sequences & Oscillating Shift+Arrow in aaa$Math$bbb', () => {
    it('Scenario 1.1: Multi-character prefix step-by-step navigation and boundary jump in aaa$Math$bbb', () => {
      const doc = 'aaa/weq_inline <math><mi>x</mi></math> /weq_inlinebbb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('bbb');
      expect(eqStart).toBe(3); // 'a' at 0, 1, 2. eqStart is 3.

      // Start at position 0 (before all 'a' characters)
      view.dispatch({ selection: { anchor: 0, head: 0 } });

      // Step 1: select 1st 'a'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(1);

      // Step 2: select 2nd 'a'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(2);

      // Step 3: select 3rd 'a' (head reaches eqStart = 3, MUST NOT jump yet)
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(eqStart);

      // Step 4: from boundary eqStart, leaps across equation atomically to eqEnd
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // Step 5: extends into 1st 'b'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(eqEnd + 1);

      // Step 6: extends into 2nd 'b'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(eqEnd + 2);

      // Step 7: extends into 3rd 'b'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(eqEnd + 3);

      view.destroy();
      c.remove();
    });

    it('Scenario 1.2: Boundary oscillation stress (50 alternating Shift+Right / Shift+Left keystrokes at eqStart)', () => {
      const doc = 'aaa/weq_inline <math><mi>x</mi></math> /weq_inlinebbb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = 3;

      // Start with anchor at 1, head at 2 (one character before eqStart)
      view.dispatch({ selection: { anchor: 1, head: 2 } });

      // Dispatch 50 alternating oscillations right and left right before the equation boundary
      for (let i = 0; i < 25; i++) {
        // Shift+ArrowRight advances to boundary eqStart (3)
        dispatchKey(view, 'ArrowRight');
        expect(view.state.selection.main.anchor).toBe(1);
        expect(view.state.selection.main.head).toBe(eqStart);

        // Shift+ArrowLeft retreats back to 2
        dispatchKey(view, 'ArrowLeft');
        expect(view.state.selection.main.anchor).toBe(1);
        expect(view.state.selection.main.head).toBe(2);
      }

      // Now advance to boundary and jump across
      dispatchKey(view, 'ArrowRight'); // head = 3
      expect(view.state.selection.main.head).toBe(eqStart);

      dispatchKey(view, 'ArrowRight'); // jumps across to eqEnd
      const eqEnd = doc.indexOf('bbb');
      expect(view.state.selection.main.head).toBe(eqEnd);
      expect(view.state.selection.main.anchor).toBe(1);

      view.destroy();
      c.remove();
    });

    it('Scenario 1.3: Suffix multi-character backward step-by-step and oscillation at eqEnd in aaa$Math$bbb', () => {
      const doc = 'aaa/weq_inline <math><mi>x</mi></math> /weq_inlinebbb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = 3;
      const eqEnd = doc.indexOf('bbb');
      const docEnd = eqEnd + 3;

      // Start at end of document (offset docEnd)
      view.dispatch({ selection: { anchor: docEnd, head: docEnd } });

      // Step 1: select 3rd 'b' backward
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(docEnd);
      expect(view.state.selection.main.head).toBe(eqEnd + 2);

      // Step 2: select 2nd 'b' backward
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(docEnd);
      expect(view.state.selection.main.head).toBe(eqEnd + 1);

      // Step 3: select 1st 'b' backward (head reaches eqEnd, MUST NOT jump yet)
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(docEnd);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // Oscillate 20 times between eqEnd and eqEnd + 1
      for (let i = 0; i < 10; i++) {
        dispatchKey(view, 'ArrowRight');
        expect(view.state.selection.main.head).toBe(eqEnd + 1);

        dispatchKey(view, 'ArrowLeft');
        expect(view.state.selection.main.head).toBe(eqEnd);
      }

      // Now jump backward across the equation to eqStart
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(docEnd);
      expect(view.state.selection.main.head).toBe(eqStart);

      // Continue stepping backward into 'aaa'
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(2);

      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(1);

      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 1.4: Block equation boundary stepping and reversals in aaa```math-word...```bbb', () => {
      const doc = 'aaa```math-word\n<math display="block"><mi>y</mi></math>\n```bbb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = 3;
      const eqEnd = doc.indexOf('bbb');

      // Forward traversal from pos 1
      view.dispatch({ selection: { anchor: 1, head: 1 } });

      // Advance to 2
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(2);

      // Advance to 3 (eqStart, boundary)
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(eqStart);

      // Reversal: retreat to 2
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(2);

      // Forward to 3
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(eqStart);

      // Jump across block equation
      dispatchKey(view, 'ArrowRight');
      const headAfterBlock = view.state.selection.main.head;
      expect(headAfterBlock).toBeGreaterThanOrEqual(eqEnd);

      // Extend past into 'bbb'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(headAfterBlock + 1);

      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(headAfterBlock + 2);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 2: BUG 1 — CONSECUTIVE INLINE EQUATIONS a$M1$b$M2$c
  // =========================================================================
  describe('Suite 2: Bug 1 — Consecutive Inline Equations a$M1$b$M2$c', () => {
    it('Scenario 2.1: Forward traversal across a$M1$b$M2$c selects single "b" character without premature leap across M2', () => {
      const doc = 'a/weq_inline <math><mi>x</mi></math> /weq_inlineb/weq_inline <math><mi>y</mi></math> /weq_inlinec';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const m1Start = 1;
      const m1End = doc.indexOf('b');
      const bPos = m1End;
      const m2Start = bPos + 1;
      const m2End = doc.indexOf('c');
      const cPos = m2End;

      // Start at 0 (before 'a')
      view.dispatch({ selection: { anchor: 0, head: 0 } });

      // 1. Shift+Right selects 'a', reaching m1Start
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(m1Start);

      // 2. Shift+Right at m1Start leaps across M1 to m1End
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(m1End);

      // 3. CRITICAL TEST: head is at m1End (before 'b'). M2 starts at m1End + 1.
      // Pressing Shift+Right MUST select ONLY 'b' (head advances to m1End + 1 = m2Start),
      // and MUST NOT prematurely leap across M2!
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(m2Start);

      // 4. Now head is AT m2Start. Next Shift+Right cleanly leaps across M2 to m2End!
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(m2End);

      // 5. Shift+Right extends into 'c'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(cPos + 1);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: Backward traversal across a$M1$b$M2$c selects single "b" character without premature leap across M1', () => {
      const doc = 'a/weq_inline <math><mi>x</mi></math> /weq_inlineb/weq_inline <math><mi>y</mi></math> /weq_inlinec';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const m1Start = 1;
      const m1End = doc.indexOf('b');
      const bPos = m1End;
      const m2Start = bPos + 1;
      const m2End = doc.indexOf('c');
      const afterC = m2End + 1;

      // Start at end of document (after 'c')
      view.dispatch({ selection: { anchor: afterC, head: afterC } });

      // 1. Shift+Left selects 'c', reaching m2End
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(afterC);
      expect(view.state.selection.main.head).toBe(m2End);

      // 2. Shift+Left at m2End leaps backward across M2 to m2Start
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(afterC);
      expect(view.state.selection.main.head).toBe(m2Start);

      // 3. CRITICAL TEST: head is at m2Start (after 'b'). M1 ends at m2Start - 1.
      // Pressing Shift+Left MUST select ONLY 'b' (head retreats to m1End),
      // and MUST NOT prematurely leap across M1!
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(afterC);
      expect(view.state.selection.main.head).toBe(m1End);

      // 4. Now head is AT m1End. Next Shift+Left cleanly leaps backward across M1 to m1Start!
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(afterC);
      expect(view.state.selection.main.head).toBe(m1Start);

      // 5. Shift+Left extends into 'a' (head = 0)
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(afterC);
      expect(view.state.selection.main.head).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.3: Zero-gap consecutive inline equations a$M1$$M2$c atomic leaps', () => {
      // No intervening character between M1 and M2
      const doc = 'a/weq_inline <math><mi>x</mi></math> /weq_inline/weq_inline <math><mi>y</mi></math> /weq_inlinec';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const m1Start = 1;
      const midBoundary = doc.indexOf('/weq_inline/weq_inline') + '/weq_inline'.length;
      const m2End = doc.indexOf('c');

      // Forward traversal
      view.dispatch({ selection: { anchor: 0, head: 0 } });

      dispatchKey(view, 'ArrowRight'); // selects 'a', head = 1
      expect(view.state.selection.main.head).toBe(m1Start);

      dispatchKey(view, 'ArrowRight'); // leaps M1, head = midBoundary
      expect(view.state.selection.main.head).toBe(midBoundary);

      dispatchKey(view, 'ArrowRight'); // leaps M2 immediately from boundary, head = m2End
      expect(view.state.selection.main.head).toBe(m2End);

      dispatchKey(view, 'ArrowRight'); // extends into 'c'
      expect(view.state.selection.main.head).toBe(m2End + 1);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.4: Triple inline equation chain a$M1$b$M2$c$M3$d end-to-end traversal', () => {
      const doc = 'a/weq_inline <math><mi>1</mi></math> /weq_inlineb/weq_inline <math><mi>2</mi></math> /weq_inlinec/weq_inline <math><mi>3</mi></math> /weq_inlined';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      view.dispatch({ selection: { anchor: 0, head: 0 } });

      // Step through all 3 equations with single intervening characters
      // 1: 'a'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(doc.indexOf('/weq_inline <math><mi>1</mi>'));

      // 2: leap M1
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(doc.indexOf('b'));

      // 3: select 'b'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(doc.indexOf('/weq_inline <math><mi>2</mi>'));

      // 4: leap M2
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(doc.indexOf('c'));

      // 5: select 'c'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(doc.indexOf('/weq_inline <math><mi>3</mi>'));

      // 6: leap M3
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(doc.indexOf('d'));

      // 7: select 'd'
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(doc.length);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.5: Triple inline equation chain a$M1$b$M2$c$M3$d backward traversal', () => {
      const doc = 'a/weq_inline <math><mi>1</mi></math> /weq_inlineb/weq_inline <math><mi>2</mi></math> /weq_inlinec/weq_inline <math><mi>3</mi></math> /weq_inlined';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const m1Start = 1;
      const m1End = doc.indexOf('b');
      const m2Start = doc.indexOf('/weq_inline <math><mi>2</mi>');
      const m2End = doc.indexOf('c');
      const m3Start = doc.indexOf('/weq_inline <math><mi>3</mi>');
      const m3End = doc.indexOf('d');

      view.dispatch({ selection: { anchor: doc.length, head: doc.length } });

      // 1. Select 'd' backward to m3End
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(m3End);

      // 2. Leap backward across M3 to m3Start
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(m3Start);

      // 3. Select 'c' backward to m2End
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(m2End);

      // 4. Leap backward across M2 to m2Start
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(m2Start);

      // 5. Select 'b' backward to m1End
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(m1End);

      // 6. Leap backward across M1 to m1Start
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(m1Start);

      // 7. Select 'a' backward to 0
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(0);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 3: BUG 2 — RAPID COPY/PASTE BURSTS & MIXED MARKDOWN INTEGRITY
  // =========================================================================
  describe('Suite 3: Bug 2 — Rapid Copy/Paste Bursts & Cross-Boundary Mixed Markdown Integrity', () => {
    it('Scenario 3.1: Complex document with inline equation, block equation, and Python code block pasted in rapid burst', () => {
      const complexDoc = [
        '# Document Header',
        'Here is inline math: /weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi></math> /weq_inline embedded in text.',
        '',
        '```python',
        'def calculate():',
        '    return 42',
        '```',
        '',
        'And a block equation:',
        '```math-word',
        '<math display="block"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>',
        '```',
        '',
        'Footer line.',
      ].join('\n');

      const { view, container: c } = createMockEditor(complexDoc, [fallbackKeymap], true);

      // Select the entire complex document
      view.dispatch({ selection: { anchor: 0, head: complexDoc.length } });

      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);
      const clipboardText = copyEvt.clipboardData?.getData('text/plain') || complexDoc;

      // Paste 5 times consecutively at the end of the document
      for (let i = 1; i <= 5; i++) {
        const destPos = view.state.doc.length;
        view.dispatch({ selection: { anchor: destPos, head: destPos } });

        const pasteEvt = createMockClipboardEvent('paste', {
          'text/plain': '\n\n' + clipboardText,
        });
        view.contentDOM.dispatchEvent(pasteEvt);
      }

      const finalDoc = view.state.doc.toString();

      // Integrity checks:
      // 1. No corrupted double delimiters
      expect(finalDoc).not.toContain('/weq_inline /weq_inline');
      expect(finalDoc).not.toContain('```math-word\n```math-word');
      expect(finalDoc).not.toContain('/weq_inline #');

      // 2. Exactly 6 instances of block equations (1 original + 5 pasted)
      const blockCount = (finalDoc.match(/```math-word/g) || []).length;
      expect(blockCount).toBe(6);

      // 3. Exactly 12 instances of /weq_inline (6 pairs: 1 original + 5 pasted)
      const inlineCount = (finalDoc.match(/\/weq_inline/g) || []).length;
      expect(inlineCount).toBe(12);

      // 4. Python code blocks preserved intact
      const pythonBlockCount = (finalDoc.match(/```python/g) || []).length;
      expect(pythonBlockCount).toBe(6);

      view.destroy();
      c.remove();
    });

    it('Scenario 3.2: Partial cross-boundary selection (text -> equation -> code block) copy and paste', () => {
      const doc = [
        'Prefix characters /weq_inline <math><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math> /weq_inline middle text',
        '```javascript',
        'console.log("hello");',
        '```',
        'End line',
      ].join('\n');

      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Select from "characters" through "console.log"
      const selFrom = doc.indexOf('characters');
      const selTo = doc.indexOf('console.log') + 'console.log'.length;
      view.dispatch({ selection: { anchor: selFrom, head: selTo } });

      const copiedSlice = view.state.sliceDoc(selFrom, selTo);
      expect(copiedSlice).toContain('/weq_inline');
      expect(copiedSlice).toContain('```javascript');

      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);
      const clipboardText = copyEvt.clipboardData?.getData('text/plain') || copiedSlice;

      // Paste at end of doc
      const destPos = view.state.doc.length;
      view.dispatch({ selection: { anchor: destPos, head: destPos } });

      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': '\n' + clipboardText,
      });
      view.contentDOM.dispatchEvent(pasteEvt);

      const finalDoc = view.state.doc.toString();
      expect(finalDoc).not.toContain('/weq_inline /weq_inline');
      expect(finalDoc).not.toContain('/weq_inline characters');

      view.destroy();
      c.remove();
    });

    it('Scenario 3.3: Pure MathML XML variations expand correctly into equation templates', () => {
      const doc = 'Equation testing: ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Case A: Pure MathML with whitespace and newlines
      const mathmlWithWhitespace = '  \n\t <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>alpha</mi></math> \n\t  ';
      view.dispatch({ selection: { anchor: view.state.doc.length, head: view.state.doc.length } });
      const pasteEvtA = createMockClipboardEvent('paste', {
        'text/plain': mathmlWithWhitespace,
      });
      view.contentDOM.dispatchEvent(pasteEvtA);
      expect(pasteEvtA.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toContain('/weq_inline <math');
      expect(view.state.doc.toString()).toContain('<mi>alpha</mi>');

      // Case B: Pure block MathML display="block"
      const mathmlBlock = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>X</mi></mrow></math>';
      view.dispatch({ selection: { anchor: view.state.doc.length, head: view.state.doc.length } });
      const pasteEvtB = createMockClipboardEvent('paste', {
        'text/plain': mathmlBlock,
      });
      view.contentDOM.dispatchEvent(pasteEvtB);
      expect(pasteEvtB.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toContain('```math-word');
      expect(view.state.doc.toString()).toContain('<mi>X</mi>');

      // Case C: Nested MathML with radical and fraction
      const mathmlNested = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><msqrt><mi>x</mi></msqrt><mn>2</mn></mfrac></math>';
      view.dispatch({ selection: { anchor: view.state.doc.length, head: view.state.doc.length } });
      const pasteEvtC = createMockClipboardEvent('paste', {
        'text/plain': mathmlNested,
      });
      view.contentDOM.dispatchEvent(pasteEvtC);
      expect(pasteEvtC.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toContain('<msqrt><mi>x</mi></msqrt>');

      view.destroy();
      c.remove();
    });

    it('Scenario 3.4: Impure MathML snippets with surrounding text never trigger false-positive MathML expansion', () => {
      const doc = 'Start: ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // 1. Text followed by MathML
      const snippet1 = 'The formula is <math><mi>x</mi></math> in the text.';
      view.dispatch({ selection: { anchor: view.state.doc.length, head: view.state.doc.length } });
      const pasteEvt1 = createMockClipboardEvent('paste', { 'text/plain': snippet1 });
      view.contentDOM.dispatchEvent(pasteEvt1);

      // 2. HTML text with embedded MathML tags
      const snippet2 = '<p>Check <math><mn>123</mn></math></p>';
      view.dispatch({ selection: { anchor: view.state.doc.length, head: view.state.doc.length } });
      const pasteEvt2 = createMockClipboardEvent('paste', { 'text/plain': snippet2 });
      view.contentDOM.dispatchEvent(pasteEvt2);

      // Verify no equation paste telemetry events were logged
      const pasteEvents = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details?.action === 'paste');
      expect(pasteEvents.length).toBe(0);

      const finalDoc = view.state.doc.toString();
      expect(finalDoc).not.toContain('/weq_inline The formula');
      expect(finalDoc).not.toContain('/weq_inline <p>');

      view.destroy();
      c.remove();
    });

    it('Scenario 3.5: Rapid copy/paste burst under active debug telemetry verifies 100% event capture without desync', () => {
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);

      const doc = 'a /weq_inline <math><mi>k</mi></math> /weq_inline b /weq_inline <math><mi>m</mi></math> /weq_inline c';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Perform 10 rapid copy operations across different spans
      const testRanges = [
        [0, 5],
        [2, doc.indexOf('b') + 1],
        [doc.indexOf('b'), doc.length],
        [0, doc.length],
        [doc.indexOf('/weq_inline <math><mi>m'), doc.length],
      ];

      for (const [from, to] of testRanges) {
        view.dispatch({ selection: { anchor: from, head: to } });
        const copyEvt = createMockClipboardEvent('copy');
        view.contentDOM.dispatchEvent(copyEvt);
      }

      const copyEvents = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details?.action === 'copy');
      expect(copyEvents.length).toBe(testRanges.length);

      for (let i = 0; i < testRanges.length; i++) {
        const [from, to] = testRanges[i];
        const evt = copyEvents[i];
        expect(evt.details.action).toBe('copy');
        expect(evt.details.characterCount).toBe(to - from);
        expect(evt.details.snippet).toBe(doc.slice(from, to).slice(0, 100));
      }

      view.destroy();
      c.remove();
    });
  });
});
