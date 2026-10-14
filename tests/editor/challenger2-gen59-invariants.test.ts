import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';
import {
  createSlot,
  createToken,
  resetIdCounter,
  findSlotById,
  extractSelectionAST,
  normalizeSelection,
  cloneNode,
} from '../../src/core/ast';
import { CaretPosition, SelectionRange, SlotNode } from '../../src/core/types';
import { WordEquationWidget } from '../../src/editor/widget';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { wordEquationStateField } from '../../src/editor/state-field';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { createMockEditor } from '../helpers/cm6-mock';

describe('Challenger 2 (Gen 59): Invariant Preservation & Adversarial Edge Verification', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;
  let mockView: EditorView;
  let mockContainer: HTMLElement;

  // Fallback keymap simulating native CM6 character selection when outside equations
  const standardEditorFallbackKeymap: Extension = EditorView.domEventHandlers({
    keydown: (evt, v) => {
      if (evt.defaultPrevented) return false;
      const sel = v.state.selection.main;
      if (evt.shiftKey && evt.key === 'ArrowRight') {
        v.dispatch({
          selection: {
            anchor: sel.anchor,
            head: Math.min(v.state.doc.length, sel.head + 1),
          },
        });
        return true;
      }
      if (evt.shiftKey && evt.key === 'ArrowLeft') {
        v.dispatch({
          selection: {
            anchor: sel.anchor,
            head: Math.max(0, sel.head - 1),
          },
        });
        return true;
      }
      return false;
    },
  });

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const editorResult = createMockEditor(' '.repeat(300));
    mockView = editorResult.view;
    mockContainer = editorResult.container;

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
    container.remove();
    if (mockView) mockView.destroy();
    if (mockContainer) mockContainer.remove();
    if (styleEl) styleEl.remove();
    document.body.innerHTML = '';
  });

  function createMockClipboardEvent(initialData: Record<string, string> = {}): {
    event: ClipboardEvent;
    storage: Record<string, string>;
  } {
    const storage: Record<string, string> = { ...initialData };
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: {
        types: Object.keys(storage),
        setData: vi.fn((type: string, val: string) => {
          storage[type] = val;
        }),
        getData: vi.fn((type: string) => storage[type] || ''),
      },
    } as unknown as ClipboardEvent;
    return { event, storage };
  }

  function validateWellFormedXML(xmlString: string): { isValid: boolean; error?: string } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return { isValid: false, error: parserError.textContent || 'XML parsing error' };
    }
    return { isValid: true };
  }

  // =========================================================================
  // GROUP 1: BUG 1 INVARIANTS — ZERO-OVERSHOOT SELECTION COLLAPSE
  // =========================================================================
  describe('Group 1: Bug 1 Invariants — Zero-Overshoot Selection Collapse', () => {
    it('Invariant 1.1: Entire equation selected (forward & backward): ArrowLeft collapses to 0, ArrowRight collapses to end without escaping', () => {
      // Equation: "a + b = c" (5 tokens)
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>=</mo><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const rootSlotId = widget.ast.id;
      const totalTokens = widget.ast.children.length; // 5

      // --- Forward selection covering the whole equation ---
      widget.isFocused = true;
      widget.caret = { slotId: rootSlotId, offset: totalTokens };
      widget.selection = {
        anchor: { slotId: rootSlotId, offset: 0 },
        head: { slotId: rootSlotId, offset: totalTokens },
      };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Press ArrowLeft: must collapse to 0, not step outside or to -1
      const leftHandled = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(leftHandled).toBe(true);
      expect(widget.caret).toEqual({ slotId: rootSlotId, offset: 0 });
      expect(widget.selection).toBeNull();
      expect(widget.isFocused).toBe(true);

      // Subsequent keystroke from 0: pressing ArrowRight must move smoothly to offset 1
      const nextRight = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(nextRight).toBe(true);
      expect(widget.caret).toEqual({ slotId: rootSlotId, offset: 1 });

      // --- Backward selection covering the whole equation ---
      widget.caret = { slotId: rootSlotId, offset: 0 };
      widget.selection = {
        anchor: { slotId: rootSlotId, offset: totalTokens },
        head: { slotId: rootSlotId, offset: 0 },
      };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Press ArrowRight: must collapse to totalTokens (5), not step past into exit
      const rightHandled = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(rightHandled).toBe(true);
      expect(widget.caret).toEqual({ slotId: rootSlotId, offset: totalTokens });
      expect(widget.selection).toBeNull();
      expect(widget.isFocused).toBe(true);

      // Subsequent keystroke from 5: pressing ArrowLeft must move smoothly to offset 4
      const nextLeft = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(nextLeft).toBe(true);
      expect(widget.caret).toEqual({ slotId: rootSlotId, offset: 4 });
    });

    it('Invariant 1.2: Single-character selection collapse (both forward & backward) lands on exact boundary', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // 1. Forward 1-char selection on '+' (offset 1 to 2)
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 2 },
      };
      widget.caret = { slotId, offset: 2 };

      // ArrowLeft must land strictly at 1 (zero overshoot left)
      expect(widget.handleArrowNavigation('ArrowLeft', false, mockView)).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 1 });
      expect(widget.selection).toBeNull();

      // Reset to forward 1-char selection
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 2 },
      };
      widget.caret = { slotId, offset: 2 };

      // ArrowRight must land strictly at 2 (zero overshoot right)
      expect(widget.handleArrowNavigation('ArrowRight', false, mockView)).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 2 });
      expect(widget.selection).toBeNull();

      // 2. Backward 1-char selection on '+' (anchor 2, head 1)
      widget.selection = {
        anchor: { slotId, offset: 2 },
        head: { slotId, offset: 1 },
      };
      widget.caret = { slotId, offset: 1 };

      // ArrowLeft must land strictly at 1
      expect(widget.handleArrowNavigation('ArrowLeft', false, mockView)).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 1 });
      expect(widget.selection).toBeNull();

      // Reset to backward 1-char selection
      widget.selection = {
        anchor: { slotId, offset: 2 },
        head: { slotId, offset: 1 },
      };
      widget.caret = { slotId, offset: 1 };

      // ArrowRight must land strictly at 2
      expect(widget.handleArrowNavigation('ArrowRight', false, mockView)).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 2 });
      expect(widget.selection).toBeNull();
    });

    it('Invariant 1.3: Cross-placeholder boundary selection collapse snaps precisely to topological start/end', () => {
      // Fraction: numerator = "ab", denominator = "cd"
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mi>a</mi><mi>b</mi></mrow>
          <mrow><mi>c</mi><mi>d</mi></mrow>
        </mfrac>
      </math>`;
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const fracNode = widget.ast.children[0] as any;
      const numSlot = fracNode.numerator as SlotNode;
      const denSlot = fracNode.denominator as SlotNode;

      // Cross-slot selection from numerator offset 1 ('b') to denominator offset 2 ('d')
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId: numSlot.id, offset: 1 },
        head: { slotId: denSlot.id, offset: 2 },
      };
      widget.caret = { slotId: denSlot.id, offset: 2 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // ArrowLeft must collapse directly to numerator offset 1 (inside numerator!)
      const leftRes = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(leftRes).toBe(true);
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 1 });
      expect(widget.selection).toBeNull();

      // Now reset cross-slot selection (backward: from denominator offset 2 to numerator offset 1)
      widget.selection = {
        anchor: { slotId: denSlot.id, offset: 2 },
        head: { slotId: numSlot.id, offset: 1 },
      };
      widget.caret = { slotId: numSlot.id, offset: 1 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // ArrowRight must collapse directly to denominator offset 2 (inside denominator!)
      const rightRes = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(rightRes).toBe(true);
      expect(widget.caret).toEqual({ slotId: denSlot.id, offset: 2 });
      expect(widget.selection).toBeNull();
    });

    it('Invariant 1.4: Empty placeholder highlight collapse does not crash or exceed 0', () => {
      // Fraction with empty numerator and empty denominator
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac><mrow></mrow><mrow></mrow></mfrac>
      </math>`;
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const fracNode = widget.ast.children[0] as any;
      const numSlot = fracNode.numerator as SlotNode;
      expect(numSlot.children.length).toBe(0);

      widget.isFocused = true;
      widget.highlightedSlotId = numSlot.id;
      widget.selection = null;

      // ArrowLeft on empty placeholder: collapses to offset 0
      expect(widget.handleArrowNavigation('ArrowLeft', false, mockView)).toBe(true);
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 0 });
      expect(widget.highlightedSlotId).toBeNull();

      // Highlight again, ArrowRight on empty placeholder: collapses to offset 0
      widget.highlightedSlotId = numSlot.id;
      expect(widget.handleArrowNavigation('ArrowRight', false, mockView)).toBe(true);
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 0 });
      expect(widget.highlightedSlotId).toBeNull();
    });

    it('Invariant 1.5: InteractiveEquationBox preserves zero-overshoot on entire equation selection', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mi>z</mi></mrow></math>',
        onChange: () => {},
      });
      box.focus();

      const slotId = box.ast.id;
      const totalLen = box.ast.children.length; // 5

      // Select full equation backwards
      box.selection = {
        anchor: { slotId, offset: totalLen },
        head: { slotId, offset: 0 },
      };
      box.updateVisualState();

      // ArrowRight collapses to 5
      const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
      box.dom.dispatchEvent(rightEvent);
      expect(box.caret.offset).toBe(totalLen);
      expect(box.selection).toBeNull();

      // Select full equation forwards
      box.selection = {
        anchor: { slotId, offset: 0 },
        head: { slotId, offset: totalLen },
      };
      box.updateVisualState();

      // ArrowLeft collapses to 0
      const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
      box.dom.dispatchEvent(leftEvent);
      expect(box.caret.offset).toBe(0);
      expect(box.selection).toBeNull();
    });
  });

  // =========================================================================
  // GROUP 2: BUG 2 INVARIANTS — SYMMETRICAL SHIFT+ARROW BOUNDARY EXTENSION
  // =========================================================================
  describe('Group 2: Bug 2 Invariants — Boundary Extension Symmetry & Edge Topologies', () => {
    it('Invariant 2.1: Start-of-file equation boundary (pos = 0): Shift+ArrowRight jumps across equation, extends into trailing text', () => {
      // Equation block begins at index 0 of the document
      const doc = '```math-word\n<math><mi>α</mi></math>\n```\nTrailing text after equation at start of file';
      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();
      expect(widget!.from).toBe(0);

      const eqEnd = widget!.to;

      // 1. Position cursor at pos 0
      view.dispatch({ selection: { anchor: 0, head: 0 } });

      // 2. First Shift+ArrowRight press: leaps across equation to boundary
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(eqEnd);
      const headAfterJump = view.state.selection.main.head;

      // 3. Consecutive Shift+ArrowRight presses: extends smoothly into trailing text
      for (let step = 1; step <= 5; step++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);
        expect(view.state.selection.main.head).toBe(headAfterJump + step);
      }

      // 4. Symmetrical reversal: pressing Shift+ArrowLeft retreats back toward headAfterJump
      for (let step = 4; step >= 0; step--) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);
        expect(view.state.selection.main.head).toBe(headAfterJump + step);
      }

      view.destroy();
      c.remove();
    });

    it('Invariant 2.2: End-of-file equation boundary (to = doc.length): Shift+ArrowLeft jumps backward across equation, extends into leading text', () => {
      const doc = 'Leading text before equation at end of file\n```math-word\n<math><mi>ω</mi></math>\n```';
      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();
      expect(widget!.to).toBe(doc.length);

      const eqStart = widget!.from;

      // 1. Position cursor at absolute end of document
      view.dispatch({ selection: { anchor: doc.length, head: doc.length } });

      // 2. First Shift+ArrowLeft: jumps backward across equation to entrance
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(doc.length);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(eqStart);
      const headAfterJump = view.state.selection.main.head;

      // 3. Consecutive Shift+ArrowLeft presses: extends smoothly backward into leading text
      for (let step = 1; step <= 5; step++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);
        expect(view.state.selection.main.head).toBe(headAfterJump - step);
      }

      view.destroy();
      c.remove();
    });

    it('Invariant 2.3: Adjacent block equations (no intervening text): Shift+ArrowRight leaps across Eq1, then immediately leaps across Eq2', () => {
      const doc = '```math-word\n<math><mi>A</mi></math>\n```\n```math-word\n<math><mi>B</mi></math>\n```\nAfter both equations';
      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);

      const widgets: WordEquationWidget[] = [];
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widgets.push(w);
      });
      expect(widgets.length).toBe(2);

      const [eq1, eq2] = widgets;

      // Start at 0 (before Eq1)
      view.dispatch({ selection: { anchor: 0, head: 0 } });

      // First Shift+ArrowRight: leaps across Eq1
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(eq1.to);

      // Second Shift+ArrowRight: approaches/leaps across Eq2
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(eq2.to);

      // Third Shift+ArrowRight: extends past Eq2 into "After both equations"
      const headAfterEq2 = view.state.selection.main.head;
      const keyEvt3 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt3);
      expect(view.state.selection.main.head).toBe(headAfterEq2 + 1);

      view.destroy();
      c.remove();
    });

    it('Invariant 2.4: Immediate punctuation following inline equation: Shift+ArrowRight steps into punctuation, then surrounding text', () => {
      const doc = 'Notice /weq_inline <math><mi>k</mi></math> /weq_inline, which is true!';
      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);

      const eqStart = doc.indexOf('/weq_inline');
      const commaPos = doc.indexOf(', which');

      view.dispatch({ selection: { anchor: eqStart, head: eqStart } });

      // Jump across equation
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);
      expect(view.state.selection.main.head).toBe(commaPos);

      // Extend across comma
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);
      expect(view.state.selection.main.head).toBe(commaPos + 1);

      // Extend across space
      const keyEvt3 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt3);
      expect(view.state.selection.main.head).toBe(commaPos + 2);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // GROUP 3: BUG 3 INVARIANTS — CLIPBOARD PARTIAL COPY VALIDITY
  // =========================================================================
  describe('Group 3: Bug 3 Invariants — MathML XML Validity & Partial Copy/Cut Extraction', () => {
    it('Invariant 3.1: Extracted partial MathML is strictly well-formed XML and includes correct MathML namespace', () => {
      // Formula: f(x) = 3x + 7
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mrow>
          <mi>f</mi>
          <mo>(</mo>
          <mi>x</mi>
          <mo>)</mo>
          <mo>=</mo>
          <mn>3</mn>
          <mi>x</mi>
          <mo>+</mo>
          <mn>7</mn>
        </mrow>
      </math>`;
      const widget = new WordEquationWidget(xml, 0, 200, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const rootSlot = widget.ast;
      // Select expression "3x + 7" (offsets 5 to 9)
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId: rootSlot.id, offset: 5 },
        head: { slotId: rootSlot.id, offset: 9 },
      };
      widget.caret = { slotId: rootSlot.id, offset: 9 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      const { event: copyEvt, storage } = createMockClipboardEvent();
      widget.handleCopyEvent(copyEvt, false);

      const mathml = storage['application/mathml+xml'];
      expect(mathml).toBeDefined();

      // 1. Must contain MathML namespace
      expect(mathml).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');

      // 2. Must be well-formed XML without parsererror
      const xmlCheck = validateWellFormedXML(mathml);
      expect(xmlCheck.isValid).toBe(true);

      // 3. Must contain exact extracted tokens with correct element tags: <mn>3</mn>, <mi>x</mi>, <mo>+</mo>, <mn>7</mn>
      expect(mathml).toContain('<mn>3</mn>');
      expect(mathml).toContain('<mi>x</mi>');
      expect(mathml).toContain('<mo>+</mo>');
      expect(mathml).toContain('<mn>7</mn>');

      // 4. Must NOT contain unselected tokens
      expect(mathml).not.toContain('<mi>f</mi>');
      expect(mathml).not.toContain('<mo>(</mo>');
      expect(mathml).not.toContain('<mo>=</mo>');
    });

    it('Invariant 3.2: Partial selection inside nested radical extracts only inner tokens without outer radical', () => {
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msqrt>
          <mrow>
            <mi>a</mi>
            <mo>+</mo>
            <mi>b</mi>
          </mrow>
        </msqrt>
      </math>`;
      const widget = new WordEquationWidget(xml, 0, 200, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const radNode = widget.ast.children[0] as any;
      const radSlot = radNode.radicand as SlotNode;

      // Select "+ b" inside radicand (offsets 1 to 3)
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId: radSlot.id, offset: 1 },
        head: { slotId: radSlot.id, offset: 3 },
      };
      widget.caret = { slotId: radSlot.id, offset: 3 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      const { event: copyEvt, storage } = createMockClipboardEvent();
      widget.handleCopyEvent(copyEvt, false);

      const mathml = storage['application/mathml+xml'];
      expect(mathml).toBeDefined();
      expect(validateWellFormedXML(mathml).isValid).toBe(true);
      expect(mathml).toContain('<mo>+</mo>');
      expect(mathml).toContain('<mi>b</mi>');
      expect(mathml).not.toContain('<msqrt>');
      expect(mathml).not.toContain('<mi>a</mi>');
    });

    it('Invariant 3.3: Cut operation (isCut = true) preserves unselected surrounding tokens and updates caret', () => {
      // Equation: "a + b + c" (5 tokens)
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>+</mo><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const rootSlot = widget.ast;

      // Select "+ b" (offsets 1 to 3)
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId: rootSlot.id, offset: 1 },
        head: { slotId: rootSlot.id, offset: 3 },
      };
      widget.caret = { slotId: rootSlot.id, offset: 3 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      const { event: cutEvt, storage } = createMockClipboardEvent();
      widget.handleCopyEvent(cutEvt, true); // Cut!

      // 1. Clipboard contains "+ b"
      expect(storage['application/mathml+xml']).toContain('<mo>+</mo>');
      expect(storage['application/mathml+xml']).toContain('<mi>b</mi>');
      expect(validateWellFormedXML(storage['application/mathml+xml']).isValid).toBe(true);

      // 2. AST has only 3 tokens remaining: "a", "+", "c"
      expect(widget.ast.children.length).toBe(3);
      expect((widget.ast.children[0] as any).text).toBe('a');
      expect((widget.ast.children[1] as any).text).toBe('+');
      expect((widget.ast.children[2] as any).text).toBe('c');

      // 3. Selection is cleared and caret rests at cut boundary (offset 1)
      expect(widget.selection).toBeNull();
      expect(widget.caret.offset).toBe(1);

      // 4. Remaining AST serializes into valid MathML
      const remainingXml = serializeMathML(widget.ast, { display: 'block', pretty: false });
      expect(validateWellFormedXML(remainingXml).isValid).toBe(true);
      expect(remainingXml).toContain('<mi>a</mi><mo>+</mo><mi>c</mi>');
    });

    it('Invariant 3.4: InteractiveEquationBox produces well-formed XML and preserves remaining nodes on Cut', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>α</mi><mo>+</mo><mi>β</mi><mo>=</mo><mi>γ</mi></mrow></math>',
        onChange: () => {},
      });
      box.focus();

      const rootSlotId = box.ast.id;

      // Select "+ β" (offsets 1 to 3)
      box.selection = {
        anchor: { slotId: rootSlotId, offset: 1 },
        head: { slotId: rootSlotId, offset: 3 },
      };
      box.caret = { slotId: rootSlotId, offset: 3 };
      box.updateVisualState();

      const { event: cutEvt, storage } = createMockClipboardEvent();
      box.handleCopyEvent(cutEvt, true);

      // 1. Valid XML in clipboard
      expect(validateWellFormedXML(storage['application/mathml+xml']).isValid).toBe(true);
      expect(storage['application/mathml+xml']).toContain('<mo>+</mo>');
      expect(storage['application/mathml+xml']).toContain('<mi>β</mi>');

      // 2. Remaining AST has 3 tokens: α, =, γ
      expect(box.ast.children.length).toBe(3);
      expect((box.ast.children[0] as any).text).toBe('α');
      expect((box.ast.children[1] as any).text).toBe('=');
      expect((box.ast.children[2] as any).text).toBe('γ');
      expect(box.caret.offset).toBe(1);
      expect(box.selection).toBeNull();
    });
  });
});
