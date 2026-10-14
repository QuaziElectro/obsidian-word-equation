import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { keymap } from '@codemirror/view';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { resetIdCounter } from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger M2 (Gen48): Boundary Navigation Stress Suite', () => {
  let container: HTMLElement;

  // Fallback default navigation keymap mimicking CM6 standard cursorCharRight / cursorCharLeft
  const defaultCursorKeymap = keymap.of([
    {
      key: 'ArrowRight',
      run: (v) => {
        const head = v.state.selection.main.head;
        if (head < v.state.doc.length) {
          v.dispatch({ selection: { anchor: head + 1 } });
          return true;
        }
        return false;
      },
    },
    {
      key: 'ArrowLeft',
      run: (v) => {
        const head = v.state.selection.main.head;
        if (head > 0) {
          v.dispatch({ selection: { anchor: head - 1 } });
          return true;
        }
        return false;
      },
    },
  ]);

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // Helper to dispatch keydown event to editor
  function pressKey(view: any, key: 'ArrowRight' | 'ArrowLeft') {
    const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);
  }

  // =========================================================================
  // SUITE 1: Full Horizontal Stepping Spectrum (-3, -2, -1, 0, inside, exit, +1, +2, +3)
  // =========================================================================
  describe('Suite 1: Full Horizontal Stepping Spectrum Around Equation Boundaries', () => {
    it('empirically verifies sequential ArrowRight navigation across entire spectrum (-3 to +3)', () => {
      // "ABCD/weq_inline <math><mi>x</mi></math> /weq_inlineEFGH"
      // from = 4, to = 4 + 43 = 47
      const doc = 'ABCD/weq_inline <math><mi>x</mi></math> /weq_inlineEFGH';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
      const from = doc.indexOf('/weq_inline');
      const to = doc.indexOf('EFGH');

      // 1. Position cursor at 3 chars before 'from' (pos = from - 3 = 1, between 'A' and 'B')
      view.dispatch({ selection: { anchor: from - 3 } });
      expect(view.state.selection.main.head).toBe(from - 3);

      // Step 1: from - 3 -> from - 2
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from - 2);

      // Step 2: from - 2 -> from - 1
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from - 1);

      // Step 3: from - 1 -> from
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from);

      // Step 4: at from -> enter equation from start!
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Step 5: inside equation: offset 0 -> offset 1
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Step 6: inside equation at end: offset 1 -> exit to 'to'
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to);

      // Step 7: at 'to' -> to + 1
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to + 1);

      // Step 8: to + 1 -> to + 2
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to + 2);

      // Step 9: to + 2 -> to + 3
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to + 3);

      view.destroy();
      c.remove();
    });

    it('empirically verifies sequential ArrowLeft navigation across entire spectrum (+3 to -3)', () => {
      const doc = 'ABCD/weq_inline <math><mi>x</mi></math> /weq_inlineEFGH';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
      const from = doc.indexOf('/weq_inline');
      const to = doc.indexOf('EFGH');

      // 1. Position cursor at 3 chars after 'to' (pos = to + 3, between 'G' and 'H')
      view.dispatch({ selection: { anchor: to + 3 } });
      expect(view.state.selection.main.head).toBe(to + 3);

      // Step 1: to + 3 -> to + 2
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to + 2);

      // Step 2: to + 2 -> to + 1
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to + 1);

      // Step 3: to + 1 -> to
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to);

      // Step 4: at 'to' -> enter equation from end!
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Step 5: inside equation: offset 1 -> offset 0
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Step 6: inside equation at start: offset 0 -> exit backward to 'from'
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from);

      // Step 7: at 'from' -> from - 1
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from - 1);

      // Step 8: from - 1 -> from - 2
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from - 2);

      // Step 9: from - 2 -> from - 3
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from - 3);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 2: Multiple Consecutive Inline Equations on Same Line
  // =========================================================================
  describe('Suite 2: Multiple Consecutive Inline Equations on the Same Line', () => {
    it('seamlessly traverses TEXT1/weq_inline.../weq_inlineTEXT2/weq_inline.../weq_inlineTEXT3 forward and backward', () => {
      const doc = 'TEXT1/weq_inline <math><mi>a</mi></math> /weq_inlineTEXT2/weq_inline <math><mi>b</mi></math> /weq_inlineTEXT3';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);

      const from1 = doc.indexOf('/weq_inline');
      const to1 = doc.indexOf('TEXT2');
      const from2 = doc.indexOf('/weq_inline', to1);
      const to2 = doc.indexOf('TEXT3');

      expect(from1).toBe(5);
      expect(to1).toBeGreaterThan(from1);
      expect(from2).toBe(to1 + 5);
      expect(to2).toBeGreaterThan(from2);

      // PART A: Forward traversal from pos = 0 to end
      view.dispatch({ selection: { anchor: 0 } });

      // Traverse through TEXT1 (pos 0 -> 1 -> 2 -> 3 -> 4 -> 5 = from1)
      for (let expectedPos = 1; expectedPos <= from1; expectedPos++) {
        pressKey(view, 'ArrowRight');
        expect(getActiveEquationState()?.isFocused).toBeFalsy();
        expect(view.state.selection.main.head).toBe(expectedPos);
      }

      // Enter Equation 1 at from1
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(from1);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Step inside Equation 1 (offset 0 -> 1)
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Exit Equation 1 forward -> lands at to1
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to1);

      // Traverse through TEXT2 (pos to1 -> to1+1 -> ... -> from2)
      for (let expectedPos = to1 + 1; expectedPos <= from2; expectedPos++) {
        pressKey(view, 'ArrowRight');
        expect(getActiveEquationState()?.isFocused).toBeFalsy();
        expect(view.state.selection.main.head).toBe(expectedPos);
      }

      // Enter Equation 2 at from2
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(from2);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Step inside Equation 2 (offset 0 -> 1)
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Exit Equation 2 forward -> lands at to2
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to2);

      // Traverse through TEXT3
      for (let i = 1; i <= 5; i++) {
        pressKey(view, 'ArrowRight');
        expect(getActiveEquationState()?.isFocused).toBeFalsy();
        expect(view.state.selection.main.head).toBe(to2 + i);
      }

      // PART B: Backward traversal from end to pos = 0
      // Traverse backward through TEXT3 to to2
      for (let expectedPos = to2 + 4; expectedPos >= to2; expectedPos--) {
        pressKey(view, 'ArrowLeft');
        expect(getActiveEquationState()?.isFocused).toBeFalsy();
        expect(view.state.selection.main.head).toBe(expectedPos);
      }

      // Enter Equation 2 from end at to2
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(from2);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Step inside Equation 2 backward (offset 1 -> 0)
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Exit Equation 2 backward -> lands at from2
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from2);

      // Traverse backward through TEXT2 to to1
      for (let expectedPos = from2 - 1; expectedPos >= to1; expectedPos--) {
        pressKey(view, 'ArrowLeft');
        expect(getActiveEquationState()?.isFocused).toBeFalsy();
        expect(view.state.selection.main.head).toBe(expectedPos);
      }

      // Enter Equation 1 from end at to1
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(from1);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Step inside Equation 1 backward (offset 1 -> 0)
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Exit Equation 1 backward -> lands at from1
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from1);

      // Traverse backward through TEXT1 to 0
      for (let expectedPos = from1 - 1; expectedPos >= 0; expectedPos--) {
        pressKey(view, 'ArrowLeft');
        expect(getActiveEquationState()?.isFocused).toBeFalsy();
        expect(view.state.selection.main.head).toBe(expectedPos);
      }

      view.destroy();
      c.remove();
    });

    it('handles zero-distance back-to-back inline equations without intervening text (to1 === from2)', () => {
      // Two inline equations immediately touching each other
      const doc = 'START/weq_inline <math><mi>x</mi></math> /weq_inline/weq_inline <math><mi>y</mi></math> /weq_inlineEND';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);

      const widgets: { from: number; to: number; widget: WordEquationWidget }[] = [];
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widgets.push({ from, to, widget: w });
        }
      });

      expect(widgets.length).toBe(2);
      const from1 = widgets[0].from;
      const to1 = widgets[0].to;
      const from2 = widgets[1].from;
      const to2 = widgets[1].to;

      expect(to1).toBe(from2); // Zero intervening text

      // Place cursor inside Eq1 at offset 1
      view.dispatch({ selection: { anchor: from1 } });
      pressKey(view, 'ArrowRight'); // Enter Eq1
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(from1);
      pressKey(view, 'ArrowRight'); // Inside Eq1 offset 1

      // Exit Eq1 forward -> lands exactly at boundary pos = to1 = from2!
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from2);

      // Next ArrowRight immediately enters Eq2 from start
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(from2);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Exit Eq2 backward -> lands back at from2 = to1
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(from2);

      // Next ArrowLeft immediately enters Eq1 from end
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(from1);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 3: Document Boundaries: Equation at Start (pos = 0) and EOF
  // =========================================================================
  describe('Suite 3: Document Boundaries: Equation at Start of Document (pos = 0) and at EOF', () => {
    it('verifies inline equation starting at position 0 (pos = 0 boundary)', () => {
      // Equation is at the very beginning of the document
      const doc = '/weq_inline <math><mi>x</mi></math> /weq_inlineTrailing';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
      const from = 0;
      const to = doc.indexOf('Trailing');

      // 1. Cursor starts at pos = 0
      view.dispatch({ selection: { anchor: 0 } });
      expect(view.state.selection.main.head).toBe(0);
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      // Press ArrowLeft at pos = 0: boundary clamp, does NOT error or enter equation
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(0);

      // Press ArrowRight at pos = 0: enters equation from start!
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(0);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Press ArrowLeft inside equation at offset 0: exits backward to pos = 0
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(0);

      // Re-enter and traverse forward
      pressKey(view, 'ArrowRight'); // Enter at offset 0
      pressKey(view, 'ArrowRight'); // Advance to offset 1
      pressKey(view, 'ArrowRight'); // Exit forward to 'to'
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to);

      view.destroy();
      c.remove();
    });

    it('verifies inline equation ending at EOF (to = doc.length boundary)', () => {
      const doc = 'Leading/weq_inline <math><mi>x</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
      const from = doc.indexOf('/weq_inline');
      const to = doc.length;

      // 1. Enter equation from start
      view.dispatch({ selection: { anchor: from } });
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);

      // 2. Advance to end of equation
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // 3. Exit forward to EOF
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to);

      // 4. Press ArrowRight at EOF: does NOT error, stays at EOF
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to);

      // 5. Press ArrowLeft at EOF: enters equation from end!
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });

    it('verifies isolated equation filling the entire document (pos = 0 AND pos = EOF)', () => {
      const doc = '/weq_inline <math><mi>x</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
      const from = 0;
      const to = doc.length;

      // Start at 0
      view.dispatch({ selection: { anchor: 0 } });
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Step to end
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Exit forward to EOF
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(to);

      // Re-enter from end at EOF
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Step to start
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.caret.offset).toBe(0);

      // Exit backward to pos = 0
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(0);

      view.destroy();
      c.remove();
    });

    it('verifies block equation at document start (pos = 0)', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>z</mi></math>\n```\nAfterText';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);

      // Place cursor at pos = 0
      view.dispatch({ selection: { anchor: 0 } });
      expect(view.state.selection.main.head).toBe(0);

      // ArrowRight at pos 0 enters block equation from start
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(0);

      view.destroy();
      c.remove();
    });

    it('verifies block equation at document EOF', () => {
      const doc = 'BeforeText\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>w</mi></math>\n```';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
      const to = doc.length;

      // Place cursor at EOF (pos = to)
      view.dispatch({ selection: { anchor: to } });
      expect(view.state.selection.main.head).toBe(to);

      // ArrowLeft at EOF enters block equation from end
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 4: Boundary Invariants Under Non-Empty Selections
  // =========================================================================
  describe('Suite 4: Boundary Invariants Under Non-Empty Range Selections', () => {
    it('does NOT intercept ArrowRight or ArrowLeft when a non-empty selection touches the boundary', () => {
      const doc = 'TEXT1/weq_inline <math><mi>x</mi></math> /weq_inlineTEXT2';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
      const from = doc.indexOf('/weq_inline');
      const to = doc.indexOf('TEXT2');

      // Non-empty range selection: [from - 2, from] (e.g. selecting "T1")
      view.dispatch({ selection: { anchor: from - 2, head: from } });
      expect(view.state.selection.main.empty).toBe(false);

      // Dispatch ArrowRight: navigation extension must ignore non-empty selection (return false)
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      // Non-empty range selection: [to, to + 2] (e.g. selecting "TE")
      view.dispatch({ selection: { anchor: to, head: to + 2 } });
      expect(view.state.selection.main.empty).toBe(false);

      // Dispatch ArrowLeft: navigation extension must ignore non-empty selection (return false)
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 5: Single-Character Intervening Text Between Consecutive Equations
  // =========================================================================
  describe('Suite 5: Single-Character Separators Between Multiple Equations', () => {
    it('accurately steps across single-character text separators (1-char boundary test)', () => {
      // 1 char 'A', Eq1, 1 char 'B', Eq2, 1 char 'C'
      const doc = 'A/weq_inline <math><mi>x</mi></math> /weq_inlineB/weq_inline <math><mi>y</mi></math> /weq_inlineC';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);

      const widgets: { from: number; to: number; widget: WordEquationWidget }[] = [];
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widgets.push({ from, to, widget: w });
        }
      });

      expect(widgets.length).toBe(2);
      const eq1 = widgets[0];
      const eq2 = widgets[1];

      expect(eq1.from).toBe(1); // after 'A'
      expect(eq2.from).toBe(eq1.to + 1); // separated by exactly 1 character 'B'

      // PART 1: Forward navigation from pos 0
      view.dispatch({ selection: { anchor: 0 } });

      // Step over 'A' -> lands at pos 1 (eq1.from)
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(1);

      // ArrowRight at pos 1 enters Eq1
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(eq1.from);

      // Step through Eq1
      pressKey(view, 'ArrowRight'); // inside offset 1
      pressKey(view, 'ArrowRight'); // exits forward to eq1.to
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq1.to);

      // At eq1.to, single character 'B' separates eq1 and eq2.
      // Pressing ArrowRight MUST step over 'B' to eq2.from, and NOT prematurely enter eq2!
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq2.from);

      // Pressing ArrowRight at eq2.from enters Eq2
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(eq2.from);

      // Step through Eq2
      pressKey(view, 'ArrowRight'); // inside offset 1
      pressKey(view, 'ArrowRight'); // exits forward to eq2.to
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq2.to);

      // Step over 'C'
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq2.to + 1);

      // PART 2: Backward navigation from pos eq2.to + 1
      // Step backward over 'C' -> lands at eq2.to
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq2.to);

      // ArrowLeft at eq2.to enters Eq2 from end
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(eq2.from);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Step backward through Eq2
      pressKey(view, 'ArrowLeft'); // inside offset 0
      pressKey(view, 'ArrowLeft'); // exits backward to eq2.from
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq2.from);

      // At eq2.from, single character 'B' separates eq2 and eq1.
      // Pressing ArrowLeft MUST step backward over 'B' to eq1.to, and NOT prematurely enter eq1!
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq1.to);

      // Pressing ArrowLeft at eq1.to enters Eq1 from end
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(eq1.from);
      expect(getActiveEquationState()?.caret.offset).toBe(1);

      // Step backward through Eq1
      pressKey(view, 'ArrowLeft'); // inside offset 0
      pressKey(view, 'ArrowLeft'); // exits backward to eq1.from
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(eq1.from);

      // Step backward over 'A'
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(0);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 6: Block Equation Boundary Consistency Across Adjacent Lines
  // =========================================================================
  describe('Suite 6: Block Equation Multi-Line Boundary Transitions', () => {
    it('preserves adjacent line characters when approaching block equation from above and below', () => {
      const doc = 'LineOne\n```math-word\n<math display="block"><mi>M</mi></math>\n```\nLineThree';
      const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);

      let blockFrom = -1;
      let blockTo = -1;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget && !w.isInline) {
          blockFrom = from;
          blockTo = to;
        }
      });

      expect(blockFrom).toBe(8); // "LineOne\n" has length 8
      expect(blockTo).toBeGreaterThan(blockFrom);

      // 1. Position cursor at LineOne before last char 'e' (pos = 6)
      view.dispatch({ selection: { anchor: 6 } });
      pressKey(view, 'ArrowRight');
      // Must step to pos 7 ('e'), NOT enter block equation!
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(7);

      // At pos 7 (line.to of LineOne): pressing ArrowRight enters block equation from start
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(blockFrom);

      // Exit block equation
      clearActiveEquationState();

      // 2. Position cursor in LineThree after first char 'L' (pos = blockTo + 2)
      view.dispatch({ selection: { anchor: blockTo + 2 } });
      pressKey(view, 'ArrowLeft');
      // Must step backward to pos blockTo + 1 ('L'), NOT enter block equation!
      expect(getActiveEquationState()?.isFocused).toBeFalsy();
      expect(view.state.selection.main.head).toBe(blockTo + 1);

      // At pos blockTo + 1 (line.from of LineThree): pressing ArrowLeft enters block equation from end
      pressKey(view, 'ArrowLeft');
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(blockFrom);

      view.destroy();
      c.remove();
    });
  });
});
