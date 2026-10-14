import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { DebugLogger, getDebugLogger } from '../../src/debug/debug-logger';

describe('Gen 61 Acceptance Tests: Bug 1 (Shift+Arrow Boundary Selection) and Bug 2 (Cross-Boundary Copy/Paste & Telemetry)', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;
  let logger: DebugLogger;

  // Keymap simulating standard browser/CodeMirror native character-by-character navigation when unhandled
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

  function createMockClipboardEvent(type: 'copy' | 'cut' | 'paste', data: Record<string, string> = {}): ClipboardEvent {
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
  // REQUIREMENT 1: BUG 1 ACCEPTANCE TESTS (Shift+Arrow near math block)
  // =========================================================================
  describe('Bug 1: Shift+Arrow Near Math Block Selects Single Character Without Premature Leap', () => {
    it('Scenario 1.1: Inline equation aa$Math$bb - Shift+ArrowRight from after first "a" selects only second "a"', () => {
      const doc = 'aa/weq_inline <math><mi>x</mi></math> /weq_inlinebb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('bb');

      expect(eqStart).toBe(2); // 'a' at 0, 'a' at 1, equation starts at 2

      // Position caret between first and second 'a' (offset 1)
      view.dispatch({ selection: { anchor: 1, head: 1 } });
      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBe(1);

      // 1. First Shift+ArrowRight press: selects ONLY the second 'a' (head advances to eqStart = 2)
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      // Head must be at eqStart (2), NOT jumped across equation to eqEnd
      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBe(eqStart);

      // 2. Second Shift+ArrowRight press: now that head is AT the equation entrance (head === eqStart),
      // it cleanly jumps atomically across the entire equation
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);

      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // 3. Third Shift+ArrowRight press: extends past the equation into "bb" (selecting first 'b')
      const keyEvt3 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt3);

      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBe(eqEnd + 1);

      // 4. Fourth Shift+ArrowRight press: extends to select second 'b'
      const keyEvt4 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt4);

      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBe(eqEnd + 2);

      view.destroy();
      c.remove();
    });

    it('Scenario 1.2: Inline equation aa$Math$bb - Shift+ArrowLeft from after second "b" selects only second "b"', () => {
      const doc = 'aa/weq_inline <math><mi>x</mi></math> /weq_inlinebb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('bb');
      const posAfterSecondB = eqEnd + 2;

      // Position caret after second 'b' (offset eqEnd + 2)
      view.dispatch({ selection: { anchor: posAfterSecondB, head: posAfterSecondB } });
      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(posAfterSecondB);

      // 1. First Shift+ArrowLeft press: selects ONLY the second 'b' (head retreats to eqEnd + 1)
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(eqEnd + 1);

      // 2. Second Shift+ArrowLeft press: selects the first 'b' (head retreats to eqEnd)
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // 3. Third Shift+ArrowLeft press: now that head is AT the equation exit (head === eqEnd),
      // it cleanly jumps atomically backward across the entire equation
      const keyEvt3 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt3);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(eqStart);

      // 4. Fourth Shift+ArrowLeft press: extends past into preceding "aa" (selecting second 'a')
      const keyEvt4 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt4);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(eqStart - 1);

      view.destroy();
      c.remove();
    });

    it('Scenario 1.3: Block equation aa```math-word...```bb - Shift+ArrowRight from after first "a" selects only second "a"', () => {
      const doc = 'aa```math-word\n<math display="block"><mi>y</mi></math>\n```bb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('```math-word');
      const eqEnd = doc.indexOf('bb');

      expect(eqStart).toBe(2);

      // Position caret after first 'a' (offset 1)
      view.dispatch({ selection: { anchor: 1, head: 1 } });

      // 1. First Shift+ArrowRight press: selects only second 'a' (head = 2)
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBe(eqStart);

      // 2. Second Shift+ArrowRight press: head is at eqStart, jumps across block equation
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);

      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(eqEnd);

      const headAfterBlock = view.state.selection.main.head;

      // 3. Third Shift+ArrowRight press: extends past block into "bb"
      const keyEvt3 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt3);

      expect(view.state.selection.main.anchor).toBe(1);
      expect(view.state.selection.main.head).toBe(headAfterBlock + 1);

      view.destroy();
      c.remove();
    });

    it('Scenario 1.4: Block equation aa```math-word...```bb - Shift+ArrowLeft from after second "b" selects only second "b"', () => {
      const doc = 'aa```math-word\n<math display="block"><mi>y</mi></math>\n```bb';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const eqStart = doc.indexOf('```math-word');
      const eqEnd = doc.indexOf('bb');
      const posAfterSecondB = eqEnd + 2;

      // Position caret after second 'b'
      view.dispatch({ selection: { anchor: posAfterSecondB, head: posAfterSecondB } });

      // 1. First Shift+ArrowLeft press: selects only second 'b'
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(eqEnd + 1);

      // 2. Second Shift+ArrowLeft press: selects first 'b' (head reaches eqEnd)
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // 3. Third Shift+ArrowLeft press: jumps backward across block equation
      const keyEvt3 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt3);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(eqStart);

      const headBeforeBlock = view.state.selection.main.head;

      // 4. Fourth Shift+ArrowLeft press: extends past into "aa"
      const keyEvt4 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt4);

      expect(view.state.selection.main.anchor).toBe(posAfterSecondB);
      expect(view.state.selection.main.head).toBe(headBeforeBlock - 1);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // REQUIREMENT 2: BUG 2 ACCEPTANCE TESTS (Cross-boundary copy/paste & telemetry)
  // =========================================================================
  describe('Bug 2: Cross-Boundary Text+Equation Copy/Paste & Clipboard Telemetry', () => {
    it('Scenario 2.1: Clipboard Copy Telemetry Hook records cross-boundary copy when debug is enabled', () => {
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);

      const doc = 'prefix /weq_inline <math><mi>x</mi></math> /weq_inline suffix';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Select spanning from 'fix' across equation into 'suf'
      const selFrom = 3;
      const selTo = doc.indexOf('suffix') + 3;
      view.dispatch({ selection: { anchor: selFrom, head: selTo } });

      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);

      // Telemetry event must be logged
      const events = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details?.action === 'copy');
      expect(events.length).toBeGreaterThanOrEqual(1);

      const copyEvent = events[events.length - 1];
      expect(copyEvent.details.action).toBe('copy');
      expect(copyEvent.details.types).toBeDefined();
      expect(copyEvent.details.characterCount).toBe(selTo - selFrom);
      expect(copyEvent.details.snippet).toBe(doc.slice(selFrom, selTo).slice(0, 100));
      expect(copyEvent.details.selection.spansEquation).toBe(true);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: Cross-boundary selection copy and paste retains pristine Markdown without double delimiters (inline)', () => {
      const doc = 'start prefix /weq_inline <math><mi>x</mi></math> /weq_inline suffix end';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Select "prefix /weq_inline <math><mi>x</mi></math> /weq_inline suffix"
      const selFrom = doc.indexOf('prefix');
      const selTo = doc.indexOf('suffix') + 'suffix'.length;
      view.dispatch({ selection: { anchor: selFrom, head: selTo } });

      const copiedSlice = view.state.sliceDoc(selFrom, selTo);
      expect(copiedSlice).toContain('/weq_inline');
      expect(copiedSlice).toContain('prefix');
      expect(copiedSlice).toContain('suffix');

      // Dispatch copy
      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);
      const clipboardText = copyEvt.clipboardData?.getData('text/plain') || copiedSlice;

      // Move cursor to destination line and paste
      const destPos = doc.length;
      view.dispatch({ selection: { anchor: destPos, head: destPos } });

      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': clipboardText,
      });
      view.contentDOM.dispatchEvent(pasteEvt);

      // The pasted content must NOT be double-wrapped in "/weq_inline /weq_inline"
      const finalDoc = view.state.doc.toString();
      expect(finalDoc).not.toContain('/weq_inline /weq_inline');
      expect(finalDoc).not.toContain('/weq_inline prefix');

      // Count occurrences of /weq_inline: exactly 4 tags (2 pairs: original + pasted)
      const countTags = (finalDoc.match(/\/weq_inline/g) || []).length;
      expect(countTags).toBe(4);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.3: Cross-boundary selection copy and paste retains pristine Markdown without double codeblocks (block)', () => {
      const doc = 'Header\n```math-word\n<math display="block"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n```\nFooter';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Select from "Header\n```math-word" through "```\nFooter"
      const selFrom = 0;
      const selTo = doc.length;
      view.dispatch({ selection: { anchor: selFrom, head: selTo } });

      const copiedSlice = view.state.sliceDoc(selFrom, selTo);
      expect(copiedSlice).toContain('```math-word');

      const copyEvt = createMockClipboardEvent('copy');
      view.contentDOM.dispatchEvent(copyEvt);
      const clipboardText = copyEvt.clipboardData?.getData('text/plain') || copiedSlice;

      // Paste at end
      const destPos = doc.length;
      view.dispatch({ selection: { anchor: destPos, head: destPos } });

      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': clipboardText,
      });
      view.contentDOM.dispatchEvent(pasteEvt);

      const finalDoc = view.state.doc.toString();
      // Must NOT contain nested or duplicate consecutive code fence openers
      expect(finalDoc).not.toContain('```math-word\n```math-word');
      expect(finalDoc).not.toContain('```math-word\nHeader');

      // Exactly 2 occurrences of opening ```math-word
      const blockCount = (finalDoc.match(/```math-word/g) || []).length;
      expect(blockCount).toBe(2);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.4: Pure standalone MathML XML in clipboard correctly expands into equation template', () => {
      const doc = 'Some text here ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Move cursor to end of text
      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const pureMathML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>z</mi></math>';
      const pasteEvt = createMockClipboardEvent('paste', {
        'application/mathml+xml': pureMathML,
        'text/plain': pureMathML,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      // Paste handler must intercept and call preventDefault
      expect(pasteEvt.defaultPrevented).toBe(true);

      const finalDoc = view.state.doc.toString();
      // Should expand into inline equation template
      expect(finalDoc).toContain('/weq_inline');
      expect(finalDoc).toContain('<mi>z</mi>');

      view.destroy();
      c.remove();
    });

    it('Scenario 2.5: Pure MathML XML with <?xml ...?> preamble expands into equation template', () => {
      const doc = 'Existing text ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const mathmlWithXml = '<?xml version="1.0" encoding="UTF-8"?>\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></math>';
      const pasteEvt = createMockClipboardEvent('paste', {
        'application/mathml+xml': mathmlWithXml,
        'text/plain': mathmlWithXml,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      expect(pasteEvt.defaultPrevented).toBe(true);
      const finalDoc = view.state.doc.toString();
      expect(finalDoc).toContain('/weq_inline');
      expect(finalDoc).toContain('<mi>a</mi>');
      expect(finalDoc).toContain('<mi>b</mi>');
      expect(finalDoc).not.toContain('<?xml'); // XML preamble stripped cleanly

      view.destroy();
      c.remove();
    });

    it('Scenario 2.6: Impure MathML snippet surrounded by plain text delegates to native paste without wrapping', () => {
      const doc = 'Prefix ';
      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      const insertPos = doc.length;
      view.dispatch({ selection: { anchor: insertPos, head: insertPos } });

      const impureText = 'Notice that <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math> is a variable';
      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': impureText,
      });

      view.contentDOM.dispatchEvent(pasteEvt);

      // Must NOT be intercepted by equation paste handler (no equation paste telemetry logged)
      const pasteEvents = logger.getEvents().filter((e) => e.type === 'clipboard' && e.details?.action === 'paste');
      expect(pasteEvents.length).toBe(0);

      const finalDoc = view.state.doc.toString();
      // Native paste inserts as raw text without wrapping in /weq_inline
      expect(finalDoc).toContain(impureText);
      expect(finalDoc).not.toContain('/weq_inline');

      view.destroy();
      c.remove();
    });
  });
});
