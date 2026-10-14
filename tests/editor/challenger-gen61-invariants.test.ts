import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { wordEquationStateField } from '../../src/editor/state-field';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { DebugLogger, getDebugLogger } from '../../src/debug/debug-logger';

describe('Challenger Gen 61 Invariant Property Verification: Bug 1 & Bug 2', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;
  let logger: DebugLogger;

  // Fallback keymap simulating native CodeMirror / browser behavior when plugin returns false
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
    paste: (evt, v) => {
      if (!evt.defaultPrevented) {
        const text = evt.clipboardData?.getData('text/plain');
        if (text) {
          const sel = v.state.selection.main;
          v.dispatch({
            changes: { from: sel.from, to: sel.to, insert: text },
            selection: { anchor: sel.from + text.length },
          });
          return true;
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

  function pressShiftArrow(view: EditorView, direction: 'ArrowRight' | 'ArrowLeft'): void {
    const evt = new KeyboardEvent('keydown', {
      key: direction,
      code: direction,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(evt);
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
  // INVARIANT 1: BOUNDARY MONOTONICITY & CHARACTER ISOLATION
  // =========================================================================
  describe('Invariant 1: Boundary Monotonicity & Character Isolation', () => {
    it('Invariant 1.1: In aa$Math$bb, starting from offset 1, Shift+Right strictly expands length by 1 for each character before equation without jumping early', () => {
      const doc = 'aa/weq_inline <math><mi>x</mi></math> /weq_inlinebb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('bb');
      expect(eqStart).toBe(2);

      // Start at offset 1 (between first and second 'a')
      const initialOffset = 1;
      view.dispatch({ selection: { anchor: initialOffset, head: initialOffset } });

      let currentHead = initialOffset;
      let currentLen = 0;

      // Step through 'aa' until reaching eqStart
      const stepsBeforeEq = eqStart - initialOffset; // 1 step (to select second 'a')
      for (let step = 1; step <= stepsBeforeEq; step++) {
        pressShiftArrow(view, 'ArrowRight');

        const newHead = view.state.selection.main.head;
        const newLen = Math.abs(newHead - view.state.selection.main.anchor);

        // Strict monotonicity check: head must increase by exactly 1
        expect(newHead).toBe(currentHead + 1);
        expect(newLen).toBe(currentLen + 1);
        expect(newHead).toBeLessThanOrEqual(eqStart);

        // Character isolation check: selected text must strictly equal the substring slice
        const selectedText = view.state.sliceDoc(initialOffset, newHead);
        expect(selectedText).toBe('a');

        currentHead = newHead;
        currentLen = newLen;
      }

      // Exact boundary reached: head === eqStart
      expect(currentHead).toBe(eqStart);

      // Next press: MUST atomically leap across the equation to eqEnd
      pressShiftArrow(view, 'ArrowRight');
      const jumpedHead = view.state.selection.main.head;
      expect(jumpedHead).toBe(eqEnd);
      expect(view.state.selection.main.anchor).toBe(initialOffset);

      // Following presses: must step strictly through 'bb' by 1 char per press
      pressShiftArrow(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(eqEnd + 1);
      expect(view.state.sliceDoc(initialOffset, view.state.selection.main.head)).toBe(
        'a/weq_inline <math><mi>x</mi></math> /weq_inlineb'
      );

      pressShiftArrow(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(eqEnd + 2);

      view.destroy();
      c.remove();
    });

    it('Invariant 1.2: Generalized prefix length N: stepping Shift+Right from offset 0 strictly increments head by 1 until boundary for N=5', () => {
      const doc = 'abcde/weq_inline <math><mi>z</mi></math> /weq_inlinexyz';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('xyz');
      expect(eqStart).toBe(5);

      view.dispatch({ selection: { anchor: 0, head: 0 } });

      // Step through all 5 characters of prefix
      for (let s = 1; s <= 5; s++) {
        pressShiftArrow(view, 'ArrowRight');
        const head = view.state.selection.main.head;
        expect(head).toBe(s); // Exactly s, not jumped early
        expect(view.state.selection.main.anchor).toBe(0);
        expect(view.state.sliceDoc(0, head)).toBe('abcde'.slice(0, s));
      }

      expect(view.state.selection.main.head).toBe(eqStart);

      // 6th press: atomically leaps across equation
      pressShiftArrow(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(eqEnd);

      // 7th and 8th presses: strictly increment through 'xyz'
      pressShiftArrow(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(eqEnd + 1);

      pressShiftArrow(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(eqEnd + 2);

      view.destroy();
      c.remove();
    });

    it('Invariant 1.3: Block equation monotonicity: Shift+Right steps character-by-character through prefix and leaps across block at boundary', () => {
      const doc = '1234```math-word\n<math display="block"><mrow><mi>A</mi></mrow></math>\n```5678';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('```math-word');
      const eqEnd = doc.indexOf('5678');
      expect(eqStart).toBe(4);

      view.dispatch({ selection: { anchor: 1, head: 1 } });

      // Stepping from offset 1: characters 2, 3, 4 (offsets 2, 3, 4)
      for (let expectedHead = 2; expectedHead <= eqStart; expectedHead++) {
        pressShiftArrow(view, 'ArrowRight');
        expect(view.state.selection.main.head).toBe(expectedHead);
        expect(view.state.selection.main.anchor).toBe(1);
      }

      // Next press: jumps across block equation
      pressShiftArrow(view, 'ArrowRight');
      const headAfterJump = view.state.selection.main.head;
      expect(headAfterJump).toBeGreaterThanOrEqual(eqEnd);

      // Next press: strictly extends into following text by 1
      pressShiftArrow(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(headAfterJump + 1);

      view.destroy();
      c.remove();
    });

    it('Invariant 1.4: Multi-equation document: navigating between equations preserves strict character isolation', () => {
      const doc = 'aa/weq_inline <math><mn>1</mn></math> /weq_inlinemiddle/weq_inline <math><mn>2</mn></math> /weq_inlinebb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eq1End = doc.indexOf('middle');
      const eq2Start = doc.indexOf('/weq_inline <math><mn>2');

      // Start right after equation 1, inside 'middle'
      const startInMiddle = eq1End + 1; // after 'm'
      view.dispatch({ selection: { anchor: startInMiddle, head: startInMiddle } });

      // Step through rest of 'middle' until eq2Start
      const remainingInMiddle = eq2Start - startInMiddle;
      for (let i = 1; i <= remainingInMiddle; i++) {
        pressShiftArrow(view, 'ArrowRight');
        expect(view.state.selection.main.head).toBe(startInMiddle + i);
        expect(view.state.selection.main.head).toBeLessThanOrEqual(eq2Start);
      }

      // At boundary of eq2: next press leaps across eq2
      pressShiftArrow(view, 'ArrowRight');
      const eq2End = doc.indexOf('bb');
      expect(view.state.selection.main.head).toBe(eq2End);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // INVARIANT 2: BACKWARD SYMMETRY
  // =========================================================================
  describe('Invariant 2: Backward Symmetry', () => {
    it('Invariant 2.1: In aa$Math$bb, stepping backward from after bb strictly decrements head by 1 per character before the equation', () => {
      const doc = 'aa/weq_inline <math><mi>x</mi></math> /weq_inlinebb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('bb');
      const anchorPos = doc.length; // after second 'b'

      view.dispatch({ selection: { anchor: anchorPos, head: anchorPos } });

      // Step 1: select second 'b' -> head = eqEnd + 1
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(anchorPos);
      expect(view.state.selection.main.head).toBe(eqEnd + 1);
      expect(view.state.sliceDoc(view.state.selection.main.head, anchorPos)).toBe('b');

      // Step 2: select first 'b' -> head = eqEnd
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(anchorPos);
      expect(view.state.selection.main.head).toBe(eqEnd);
      expect(view.state.sliceDoc(view.state.selection.main.head, anchorPos)).toBe('bb');

      // Step 3: at boundary (head === eqEnd) -> atomically leap backward across equation to eqStart
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.anchor).toBe(anchorPos);
      expect(view.state.selection.main.head).toBe(eqStart);

      // Step 4: strictly decrement into 'aa' (selecting second 'a') -> head = eqStart - 1
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(eqStart - 1);

      // Step 5: strictly decrement to select first 'a' -> head = eqStart - 2 (0)
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(eqStart - 2);
      expect(view.state.selection.main.head).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Invariant 2.2: Generalized suffix length M: Shift+Left from end of suffix of length 5 strictly decrements head by 1', () => {
      const doc = 'prefix/weq_inline <math><mi>y</mi></math> /weq_inline12345';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('12345');
      const anchorPos = doc.length;

      view.dispatch({ selection: { anchor: anchorPos, head: anchorPos } });

      // Step backward through '12345' (5 characters)
      for (let s = 1; s <= 5; s++) {
        pressShiftArrow(view, 'ArrowLeft');
        const head = view.state.selection.main.head;
        expect(head).toBe(anchorPos - s);
        expect(head).toBeGreaterThanOrEqual(eqEnd);
      }

      // Now at boundary (head === eqEnd)
      expect(view.state.selection.main.head).toBe(eqEnd);

      // Next press leaps across equation to eqStart
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(eqStart);

      // Next press decrements into prefix
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(eqStart - 1);

      view.destroy();
      c.remove();
    });

    it('Invariant 2.3: Backward symmetry in block equations: Shift+Left steps through suffix, leaps across block, and decrements prefix', () => {
      const doc = 'aa\n```math-word\n<math display="block"><mo>+</mo></math>\n```\nbb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('```math-word');
      const eqEnd = doc.indexOf('```\n') + 3; // end of fence
      const anchorPos = doc.length;

      view.dispatch({ selection: { anchor: anchorPos, head: anchorPos } });

      // Step through 'bb'
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(anchorPos - 1);

      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(anchorPos - 2);

      // Next press steps to or leaps across the block equation
      pressShiftArrow(view, 'ArrowLeft');
      const headAfter1 = view.state.selection.main.head;

      // If on the newline following the block, one more press leaps across
      if (headAfter1 > eqStart) {
        pressShiftArrow(view, 'ArrowLeft');
      }

      // Must be at or before eqStart
      expect(view.state.selection.main.head).toBeLessThanOrEqual(eqStart);

      const headBeforeBlock = view.state.selection.main.head;

      // Next press decrements into prefix
      pressShiftArrow(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(headBeforeBlock - 1);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // INVARIANT 3: CLIPBOARD NON-DESTRUCTIVE INVARIANT
  // =========================================================================
  describe('Invariant 3: Clipboard Non-Destructive Invariant', () => {
    it('Invariant 3.1: Copying cross-boundary inline equation and pasting into native CodeMirror reproduces exact text slice', () => {
      const doc = 'alpha beta /weq_inline <math><mi>x</mi><mo>+</mo><mn>1</mn></math> /weq_inline gamma delta';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Select "beta /weq_inline <math>...</math> /weq_inline gamma"
      const selFrom = doc.indexOf('beta');
      const selTo = doc.indexOf('gamma') + 'gamma'.length;
      view.dispatch({ selection: { anchor: selFrom, head: selTo } });

      const originalSlice = view.state.sliceDoc(selFrom, selTo);

      // Perform Copy
      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);

      const clipboardText = copyEvt.clipboardData?.getData('text/plain') || originalSlice;
      expect(clipboardText).toBe(originalSlice);

      // Create a fresh clean destination editor
      const destDoc = 'Target: ';
      const { view: destView, container: destC } = createMockEditor(destDoc, [fallbackKeymap], true);
      const pastePos = destDoc.length;
      destView.dispatch({ selection: { anchor: pastePos, head: pastePos } });

      // Perform Paste
      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': clipboardText,
      });
      destView.contentDOM.dispatchEvent(pasteEvt);

      // Native paste must reproduce exact slice without corrupting delimiters
      const finalDoc = destView.state.doc.toString();
      const pastedResult = finalDoc.slice(pastePos);

      expect(pastedResult).toBe(originalSlice);
      expect(finalDoc).toBe(destDoc + originalSlice);
      expect(finalDoc).not.toContain('/weq_inline /weq_inline');
      expect(finalDoc).not.toContain('/weq_inline beta');

      view.destroy();
      c.remove();
      destView.destroy();
      destC.remove();
    });

    it('Invariant 3.2: Copying cross-boundary block equation reproduces exact fenced codeblock on paste', () => {
      const doc = 'Header Line\n```math-word\n<math display="block"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n```\nFooter Line';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Select entire document
      view.dispatch({ selection: { anchor: 0, head: doc.length } });
      const originalSlice = view.state.sliceDoc(0, doc.length);

      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);
      const clipboardText = copyEvt.clipboardData?.getData('text/plain') || originalSlice;

      // Paste into destination editor
      const { view: destView, container: destC } = createMockEditor('', [fallbackKeymap], true);
      destView.dispatch({ selection: { anchor: 0, head: 0 } });

      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': clipboardText,
      });
      destView.contentDOM.dispatchEvent(pasteEvt);

      const finalDoc = destView.state.doc.toString();
      expect(finalDoc).toBe(originalSlice);

      // Must not create nested fences or duplicate tags
      expect(finalDoc).not.toContain('```math-word\n```math-word');
      expect(finalDoc).not.toContain('```math-word\nHeader');

      view.destroy();
      c.remove();
      destView.destroy();
      destC.remove();
    });

    it('Invariant 3.3: Partial cross-boundary selection (from markdown prefix into equation body) pastes faithfully without wrapping', () => {
      const doc = 'prefix text /weq_inline <math><mi>x</mi></math> /weq_inline suffix text';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Select from 'text ' to end of '/weq_inline'
      const selFrom = doc.indexOf('text');
      const selTo = doc.indexOf(' suffix');
      view.dispatch({ selection: { anchor: selFrom, head: selTo } });

      const originalSlice = view.state.sliceDoc(selFrom, selTo);

      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);
      const clipboardText = copyEvt.clipboardData?.getData('text/plain') || originalSlice;

      const { view: destView, container: destC } = createMockEditor('Note: ', [fallbackKeymap], true);
      destView.dispatch({ selection: { anchor: 6, head: 6 } });

      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': clipboardText,
      });
      destView.contentDOM.dispatchEvent(pasteEvt);

      expect(destView.state.doc.toString()).toBe('Note: ' + originalSlice);

      view.destroy();
      c.remove();
      destView.destroy();
      destC.remove();
    });

    it('Invariant 3.4: Telemetry verification: copying cross-boundary text logs rich telemetry payload when debug mode is enabled', () => {
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);

      const doc = 'pre /weq_inline <math><mi>k</mi></math> /weq_inline post';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const selFrom = 1;
      const selTo = doc.length - 1;
      view.dispatch({ selection: { anchor: selFrom, head: selTo } });

      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);

      const clipboardEvents = logger.getEvents().filter(
        (e) => e.type === 'clipboard' && e.details?.action === 'copy'
      );
      expect(clipboardEvents.length).toBeGreaterThanOrEqual(1);

      const lastEvent = clipboardEvents[clipboardEvents.length - 1];
      expect(lastEvent.details.context).toBe('cross_boundary_selection');
      expect(lastEvent.details.characterCount).toBe(selTo - selFrom);
      expect(lastEvent.details.selection.spansEquation).toBe(true);
      expect(lastEvent.details.payload.hasMathMarkup).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // INVARIANT 4: PURE MATHML INVARIANT
  // =========================================================================
  describe('Invariant 4: Pure MathML Invariant', () => {
    it('Invariant 4.1: Standalone valid MathML XML without xmlns is converted to equation template with injected xmlns', () => {
      const doc = 'Current document text ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const pureMathML = '<math><mi>x</mi><mo>+</mo><mi>y</mi></math>';
      const pasteEvt = createMockClipboardEvent('paste', {
        'application/mathml+xml': pureMathML,
        'text/plain': pureMathML,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      // Must be intercepted by plugin paste handler
      expect(pasteEvt.defaultPrevented).toBe(true);

      const finalDoc = view.state.doc.toString();
      expect(finalDoc).toContain('/weq_inline');
      expect(finalDoc).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
      expect(finalDoc).toContain('<mi>x</mi><mo>+</mo><mi>y</mi>');

      // No corruption or double tags
      expect(finalDoc).not.toContain('/weq_inline /weq_inline');

      view.destroy();
      c.remove();
    });

    it('Invariant 4.2: Standalone valid MathML XML with <?xml ...?> preamble strips preamble cleanly', () => {
      const doc = 'Preamble test ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const xmlMathML = '<?xml version="1.0" encoding="UTF-8"?>\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
      const pasteEvt = createMockClipboardEvent('paste', {
        'application/mathml+xml': xmlMathML,
        'text/plain': xmlMathML,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      expect(pasteEvt.defaultPrevented).toBe(true);

      const finalDoc = view.state.doc.toString();
      expect(finalDoc).not.toContain('<?xml');
      expect(finalDoc).toContain('/weq_inline');
      expect(finalDoc).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>');

      view.destroy();
      c.remove();
    });

    it('Invariant 4.3: Standalone MathML XML with whitespace, tabs, and newlines converts cleanly without corruption', () => {
      const doc = 'Whitespace test ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const formattedMathML = `
        \t  
        <math xmlns="http://www.w3.org/1998/Math/MathML">
          <mrow>
            <mi>E</mi>
            <mo>=</mo>
            <mi>m</mi>
            <msup><mi>c</mi><mn>2</mn></msup>
          </mrow>
        </math>
        \t  
      `;

      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': formattedMathML,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      expect(pasteEvt.defaultPrevented).toBe(true);

      const finalDoc = view.state.doc.toString();
      expect(finalDoc).toContain('/weq_inline');
      expect(finalDoc).toContain('<mi>E</mi>');
      expect(finalDoc).toContain('<msup><mi>c</mi><mn>2</mn></msup>');

      view.destroy();
      c.remove();
    });

    it('Invariant 4.4: Pure MathML with display="block" converts to block equation fence', () => {
      const doc = 'Preceding paragraph\n';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const blockMathML = '<math display="block" xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mo>∫</mo><mi>f</mi><mo stretchy="false">(</mo><mi>x</mi><mo stretchy="false">)</mo><mi>d</mi><mi>x</mi></mrow></math>';
      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': blockMathML,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      expect(pasteEvt.defaultPrevented).toBe(true);

      const finalDoc = view.state.doc.toString();
      expect(finalDoc).toContain('```math-word');
      expect(finalDoc).toContain(blockMathML);

      view.destroy();
      c.remove();
    });

    it('Invariant 4.5: Impure MathML or mixed text does NOT trigger pure MathML conversion (prevents corrupting markdown)', () => {
      const doc = 'Notes: ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      // MathML embedded in surrounding English sentence
      const mixedText = 'We observe that <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math> represents the variable.';
      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': mixedText,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      // Must NOT be intercepted by equation paste handler (no equation paste telemetry logged)
      const pasteEvents = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details?.action === 'paste');
      expect(pasteEvents.length).toBe(0);

      // Native fallback pastes as raw text
      const finalDoc = view.state.doc.toString();
      expect(finalDoc).toBe('Notes: ' + mixedText);
      expect(finalDoc).not.toContain('/weq_inline');

      view.destroy();
      c.remove();
    });

    it('Invariant 4.6: Clipboard with markdown equation fences is never re-wrapped as pure MathML', () => {
      const doc = 'Existing content ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const fencedText = '/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math> /weq_inline';
      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': fencedText,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      // Must NOT be intercepted by equation paste handler
      const pasteEvents = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details?.action === 'paste');
      expect(pasteEvents.length).toBe(0);

      const finalDoc = view.state.doc.toString();
      expect(finalDoc).toBe('Existing content ' + fencedText);
      expect(finalDoc).not.toContain('/weq_inline /weq_inline');

      view.destroy();
      c.remove();
    });
  });
});
