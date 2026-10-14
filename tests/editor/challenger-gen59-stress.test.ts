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
  createFraction,
  createRadical,
  resetIdCounter,
  findSlotById,
  extractSelectionAST,
  normalizeSelection,
  updateParentPointers,
  comparePositions,
} from '../../src/core/ast';
import { CaretPosition, SelectionRange, SlotNode } from '../../src/core/types';
import { WordEquationWidget } from '../../src/editor/widget';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { createMockEditor } from '../helpers/cm6-mock';

describe('Challenger 1 (Gen 59): Empirical Adversarial Stress Harness for Bugs 1–3', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;
  let mockView: EditorView;
  let mockContainer: HTMLElement;

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

  // =========================================================================
  // SUITE 1: BUG 1 — RAPID ARROW SELECTION COLLAPSE STRESS & DIRECTIONAL INVARIANTS
  // =========================================================================
  describe('Suite 1: Bug 1 — Rapid Arrow Selection Collapse Stress & Invariants', () => {
    it('Scenario 1.1: Rapid successive ArrowLeft keystrokes after forward selection (collapse then step)', () => {
      // Equation: "abcdef" (6 tokens)
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi><mi>e</mi><mi>f</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Select "cd": forward selection from offset 2 to 4
      widget.isFocused = true;
      widget.caret = { slotId, offset: 4 };
      widget.selection = {
        anchor: { slotId, offset: 2 },
        head: { slotId, offset: 4 },
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

      // Press 1: Collapse on ArrowLeft
      const handled1 = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(handled1).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 2 });
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();

      // Press 2: Rapid successive ArrowLeft must now navigate 1 character left (to offset 1)
      const handled2 = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(handled2).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 1 });

      // Press 3: Rapid successive ArrowLeft navigates to offset 0
      const handled3 = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(handled3).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 0 });
    });

    it('Scenario 1.2: Rapid successive ArrowRight keystrokes after backward selection (collapse then step)', () => {
      // Equation: "abcdef"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi><mi>e</mi><mi>f</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Backward selection: Anchor at offset 5, Head at offset 2 (selected "cde" backwards)
      widget.isFocused = true;
      widget.caret = { slotId, offset: 2 };
      widget.selection = {
        anchor: { slotId, offset: 5 },
        head: { slotId, offset: 2 },
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

      // Press 1: Collapse on ArrowRight directly to right edge (offset 5)
      const handled1 = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(handled1).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 5 });
      expect(widget.selection).toBeNull();

      // Press 2: Rapid successive ArrowRight navigates to offset 6 (end of slot)
      const handled2 = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(handled2).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 6 });
    });

    it('Scenario 1.3: ArrowLeft on backward selection snaps to left edge without overshoot', () => {
      // Equation: "abcdef"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi><mi>e</mi><mi>f</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Backward selection: Anchor at offset 4, Head at offset 1
      widget.isFocused = true;
      widget.caret = { slotId, offset: 1 };
      widget.selection = {
        anchor: { slotId, offset: 4 },
        head: { slotId, offset: 1 },
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

      // Press ArrowLeft: must collapse directly to offset 1 (NOT overshoot to offset 0)
      const handled = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(handled).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 1 });
      expect(widget.selection).toBeNull();
    });

    it('Scenario 1.4: ArrowRight on forward selection snaps to right edge without overshoot', () => {
      // Equation: "abcdef"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi><mi>e</mi><mi>f</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Forward selection: Anchor at offset 1, Head at offset 4
      widget.isFocused = true;
      widget.caret = { slotId, offset: 4 };
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 4 },
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

      // Press ArrowRight: must collapse directly to offset 4 (NOT overshoot to offset 5)
      const handled = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(handled).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 4 });
      expect(widget.selection).toBeNull();
    });

    it('Scenario 1.5: Arrow collapse inside deeply nested fraction slots preserves slot confinement', () => {
      // Equation: \frac{x+y}{z}
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow>
          <mrow><mi>z</mi></mrow>
        </mfrac>
      </math>`;
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const fracNode = widget.ast.children[0] as any;
      const numSlot = fracNode.numerator;

      // Backward selection in numerator: anchor at offset 3 (after y), head at offset 1 (between x and +)
      widget.isFocused = true;
      widget.caret = { slotId: numSlot.id, offset: 1 };
      widget.selection = {
        anchor: { slotId: numSlot.id, offset: 3 },
        head: { slotId: numSlot.id, offset: 1 },
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

      // Press ArrowLeft: collapses to offset 1 in numerator slot
      const handledLeft = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(handledLeft).toBe(true);
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 1 });
      expect(widget.selection).toBeNull();

      // Now set forward selection in numerator (offset 0 to 2)
      widget.selection = {
        anchor: { slotId: numSlot.id, offset: 0 },
        head: { slotId: numSlot.id, offset: 2 },
      };
      widget.caret = { slotId: numSlot.id, offset: 2 };

      // Press ArrowRight: collapses to offset 2 in numerator slot
      const handledRight = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(handledRight).toBe(true);
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 2 });
      expect(widget.selection).toBeNull();
    });

    it('Scenario 1.6: Single-token selection collapse minimal boundary test', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>x</mi><mi>y</mi><mi>z</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Select single character 'y' (offset 1 to 2)
      widget.isFocused = true;
      widget.caret = { slotId, offset: 2 };
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 2 },
      };

      // Collapse left -> 1
      widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(widget.caret).toEqual({ slotId, offset: 1 });
      expect(widget.selection).toBeNull();

      // Re-select 'y' (backward: 2 to 1)
      widget.selection = {
        anchor: { slotId, offset: 2 },
        head: { slotId, offset: 1 },
      };
      // Collapse right -> 2
      widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(widget.caret).toEqual({ slotId, offset: 2 });
      expect(widget.selection).toBeNull();
    });

    it('Scenario 1.7: Zero-width selection (anchor === head) performs normal navigation without swallow', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      widget.isFocused = true;
      widget.caret = { slotId, offset: 1 };
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 1 },
      };

      // Press ArrowRight: not treated as active range, navigates to offset 2
      const handled = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(handled).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 2 });
    });

    it('Scenario 1.8: InteractiveEquationBox rapid arrow collapse and follow-up navigation', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi></mrow></math>',
        onChange: () => {},
      });
      box.focus();

      const slotId = box.ast.id;

      // Backward selection: offset 3 to 1
      box.selection = {
        anchor: { slotId, offset: 3 },
        head: { slotId, offset: 1 },
      };
      box.updateVisualState();

      // Press 1: ArrowRight collapses to offset 3
      const rightEvt1 = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
      box.dom.dispatchEvent(rightEvt1);
      expect(box.caret.offset).toBe(3);
      expect(box.selection).toBeNull();

      // Press 2: Next ArrowRight steps to offset 4
      const rightEvt2 = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
      box.dom.dispatchEvent(rightEvt2);
      expect(box.caret.offset).toBe(4);

      // Now forward selection: offset 1 to 3
      box.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 3 },
      };
      box.updateVisualState();

      // Press 1: ArrowLeft collapses to offset 1
      const leftEvt1 = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
      box.dom.dispatchEvent(leftEvt1);
      expect(box.caret.offset).toBe(1);
      expect(box.selection).toBeNull();

      // Press 2: Next ArrowLeft steps to offset 0
      const leftEvt2 = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
      box.dom.dispatchEvent(leftEvt2);
      expect(box.caret.offset).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 2: BUG 2 — SHIFT+ARROW MULTI-KEYSTROKE & MULTI-LINE MARKDOWN EXTENSIONS
  // =========================================================================
  describe('Suite 2: Bug 2 — Shift+Arrow Multi-Keystroke & Multi-Line Markdown Boundary Extensions', () => {
    it('Scenario 2.1: Multi-line document: Shift+ArrowRight across block equation into 5 lines of markdown', () => {
      const doc = [
        'Heading line',
        '```math-word',
        '<math><mi>x</mi><mo>+</mo><mi>y</mi></math>',
        '```',
        '',
        'Line A after blank',
        'Line B text',
        'Line C text',
        'Line D trailing',
      ].join('\n');

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
          return false;
        },
      });

      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);
      const eqStart = doc.indexOf('```math-word');
      const eqEnd = doc.indexOf('\n\nLine A'); // Closing ``` pos

      // Place caret at start of equation block
      view.dispatch({ selection: { anchor: eqStart, head: eqStart } });

      // First Shift+ArrowRight: atomically jumps across the entire block equation
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(eqStart);
      // Head must encompass the equation block
      const headAfterJump = view.state.selection.main.head;
      expect(headAfterJump).toBeGreaterThan(eqStart);

      // Now dispatch 25 consecutive Shift+ArrowRight keystrokes into multi-line markdown
      let prevHead = headAfterJump;
      for (let i = 1; i <= 25; i++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);

        const currentHead = view.state.selection.main.head;
        // Invariant: head must monotonically advance at every single keystroke (never freeze or stall)
        expect(currentHead).toBe(prevHead + 1);
        expect(view.state.selection.main.anchor).toBe(eqStart);
        prevHead = currentHead;
      }

      // Selection has successfully traversed past newlines into downstream lines
      const selectedText = view.state.doc.sliceString(eqStart, prevHead);
      expect(selectedText).toContain('Line A after blank');

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: Multi-line document: Shift+ArrowLeft backward across block equation into preceding lines', () => {
      const doc = [
        'Preceding Line 1',
        'Preceding Line 2',
        '```math-word',
        '<math><mi>z</mi></math>',
        '```',
        'Suffix Line After',
      ].join('\n');

      const fallbackKeymap: Extension = EditorView.domEventHandlers({
        keydown: (evt, v) => {
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
      });

      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);
      const eqStart = doc.indexOf('```math-word');
      const suffixPos = doc.indexOf('Suffix Line After') + 10;

      // Position cursor inside "Suffix Line After"
      view.dispatch({ selection: { anchor: suffixPos, head: suffixPos } });

      // Step backward through suffix text to equation boundary
      const stepsToEq = suffixPos - doc.indexOf('Suffix Line After');
      for (let i = 0; i < stepsToEq; i++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);
      }

      // Next Shift+ArrowLeft press leaps across equation backward
      const keyEvtJump = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvtJump);

      expect(view.state.selection.main.anchor).toBe(suffixPos);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(eqStart);

      const headBeforeEq = view.state.selection.main.head;

      // Continue stepping backward into preceding lines
      let prevHead = headBeforeEq;
      for (let i = 1; i <= 16; i++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);

        const currentHead = view.state.selection.main.head;
        expect(currentHead).toBe(prevHead - 1);
        expect(view.state.selection.main.anchor).toBe(suffixPos);
        prevHead = currentHead;
      }

      // Successfully selected backward into Preceding Line 2
      const backwardText = view.state.doc.sliceString(prevHead, suffixPos);
      expect(backwardText).toContain('Preceding Line 2');

      view.destroy();
      c.remove();
    });

    it('Scenario 2.3: Multiple adjacent inline equations traversal in continuous selection', () => {
      const doc = 'Alpha /weq_inline <math><mi>x</mi></math> /weq_inline Beta /weq_inline <math><mi>y</mi></math> /weq_inline Gamma';
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
          return false;
        },
      });

      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);

      // Start at 0
      view.dispatch({ selection: { anchor: 0, head: 0 } });

      let lastHead = 0;
      // Step across the entire document
      while (lastHead < doc.length) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);

        const newHead = view.state.selection.main.head;
        // Invariant: every keystroke must advance head
        expect(newHead).toBeGreaterThan(lastHead);
        lastHead = newHead;
      }

      expect(view.state.selection.main.head).toBe(doc.length);
      expect(view.state.selection.main.anchor).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.4: Extreme document boundaries (BOF at 0 and EOF at doc.length)', () => {
      // Equation at index 0
      const doc = '/weq_inline <math><mi>a</mi></math> /weq_inline EndText';
      const { view, container: c } = createMockEditor(doc, [], true);

      // At pos 0, Shift+ArrowLeft must not crash or underflow
      view.dispatch({ selection: { anchor: 0, head: 0 } });
      const leftEvt = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      expect(() => view.contentDOM.dispatchEvent(leftEvt)).not.toThrow();
      expect(view.state.selection.main.head).toBe(0);

      // At doc.length, Shift+ArrowRight must not crash or overflow
      view.dispatch({ selection: { anchor: doc.length, head: doc.length } });
      const rightEvt = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      expect(() => view.contentDOM.dispatchEvent(rightEvt)).not.toThrow();
      expect(view.state.selection.main.head).toBe(doc.length);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.5: High-frequency 50-keystroke burst simulation across equation boundary', () => {
      const doc = 'PrefixWords\n/weq_inline <math><mi>q</mi></math> /weq_inline\n' + 'x'.repeat(100);
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
          return false;
        },
      });

      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);
      const eqStart = doc.indexOf('/weq_inline');
      view.dispatch({ selection: { anchor: eqStart, head: eqStart } });

      // Dispatch 50 keystrokes rapidly
      for (let i = 0; i < 50; i++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);
      }

      // Head must have successfully advanced far into the trailing string
      expect(view.state.selection.main.head).toBeGreaterThan(eqStart + 40);
      expect(view.state.selection.main.anchor).toBe(eqStart);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 3: BUG 3 — DEEP NESTED PARTIAL AST EXTRACTIONS & CLIPBOARD FIDELITY
  // =========================================================================
  describe('Suite 3: Bug 3 — Deep Nested Partial AST Extractions & Clipboard Fidelity', () => {
    it('Scenario 3.1: 3-level deep nested structure: extractSelectionAST on innermost sub-fraction', () => {
      // AST: \sqrt{ \frac{ \frac{a+b}{c} }{ d } }
      const complexXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msqrt>
          <mfrac>
            <mrow>
              <mfrac>
                <mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>
                <mrow><mi>c</mi></mrow>
              </mfrac>
            </mrow>
            <mrow><mi>d</mi></mrow>
          </mfrac>
        </msqrt>
      </math>`;

      const ast = parseMathML(complexXml);
      updateParentPointers(ast);

      // Locate innermost fraction
      const radNode = ast.children[0] as any;
      const radSlot = radNode.radicand;
      const outerFrac = radSlot.children[0] as any;
      const outerNumSlot = outerFrac.numerator;
      const innerFrac = outerNumSlot.children[0] as any;
      const innerNumSlot = innerFrac.numerator;

      // Select tokens "a+" inside innermost numerator (offset 0 to 2)
      const sel: SelectionRange = {
        anchor: { slotId: innerNumSlot.id, offset: 0 },
        head: { slotId: innerNumSlot.id, offset: 2 },
      };

      const extracted = extractSelectionAST(ast, sel);
      expect(extracted.role).toBe('root');
      expect(extracted.children.length).toBe(2);
      expect((extracted.children[0] as any).text).toBe('a');
      expect((extracted.children[1] as any).text).toBe('+');

      const xmlOut = serializeMathML(extracted, { display: 'inline', pretty: false });
      expect(xmlOut).toContain('<mi>a</mi><mo>+</mo>');
      // Must NOT contain outer structures
      expect(xmlOut).not.toContain('<msqrt>');
      expect(xmlOut).not.toContain('<mi>c</mi>');
      expect(xmlOut).not.toContain('<mi>d</mi>');
    });

    it('Scenario 3.2: Copying a nested radical within fraction copies only the radical', () => {
      // Equation: \frac{ \sqrt{x+1} + y }{ 2 }
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow>
            <msqrt><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></msqrt>
            <mo>+</mo>
            <mi>y</mi>
          </mrow>
          <mrow><mn>2</mn></mrow>
        </mfrac>
      </math>`;

      const widget = new WordEquationWidget(xml, 0, 150, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const fracNode = widget.ast.children[0] as any;
      const numSlot = fracNode.numerator;

      // Select ONLY the square root node inside numerator (offset 0 to 1 in numerator slot)
      widget.isFocused = true;
      widget.caret = { slotId: numSlot.id, offset: 1 };
      widget.selection = {
        anchor: { slotId: numSlot.id, offset: 0 },
        head: { slotId: numSlot.id, offset: 1 },
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

      const { event: copyEvt, storage } = createMockClipboardEvent();
      widget.handleCopyEvent(copyEvt, false);

      const mathml = storage['application/mathml+xml'];
      expect(mathml).toBeDefined();
      expect(mathml).toContain('<msqrt>');
      expect(mathml).toContain('<mi>x</mi>');
      // Must NOT contain '+ y' or '/ 2'
      expect(mathml).not.toContain('<mi>y</mi>');
      expect(mathml).not.toContain('<mn>2</mn>');
      expect(mathml.length).toBeLessThan(xml.length);
    });

    it('Scenario 3.3: Cut operation (isCut = true) splices out selected sub-tree and preserves surrounding AST', () => {
      // Equation: "alpha + beta + gamma"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>+</mo><mi>g</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Select "+ b +" (offsets 1 to 4 in root slot)
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 4 },
      };
      widget.caret = { slotId, offset: 4 };
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
      widget.handleCopyEvent(cutEvt, true);

      // Clipboard has "+ b +"
      expect(storage['application/mathml+xml']).toContain('<mo>+</mo>');
      expect(storage['application/mathml+xml']).toContain('<mi>b</mi>');
      expect(storage['application/mathml+xml']).not.toContain('<mi>a</mi>');
      expect(storage['application/mathml+xml']).not.toContain('<mi>g</mi>');

      // AST after cut has only "a" and "g" remaining
      const slotAfter = findSlotById(widget.ast, slotId);
      expect(slotAfter).toBeDefined();
      expect(slotAfter!.children.length).toBe(2);
      expect((slotAfter!.children[0] as any).text).toBe('a');
      expect((slotAfter!.children[1] as any).text).toBe('g');

      // Selection must be cleared and caret placed at offset 1
      expect(widget.selection).toBeNull();
      expect(widget.caret.offset).toBe(1);
    });

    it('Scenario 3.4: Round-trip copy from Widget A and paste into Widget B slot', () => {
      const xmlA = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>u</mi><mfrac><mi>p</mi><mi>q</mi></mfrac><mi>v</mi></mrow></math>';
      const widgetA = new WordEquationWidget(xmlA, 0, 100, false);
      const domA = widgetA.toDOM(mockView);
      container.appendChild(domA);

      // Select the fraction p/q (offset 1 to 2)
      widgetA.isFocused = true;
      widgetA.caret = { slotId: widgetA.ast.id, offset: 2 };
      widgetA.selection = {
        anchor: { slotA: widgetA.ast.id, offset: 1 } as any,
        head: { slotA: widgetA.ast.id, offset: 2 } as any,
      };
      widgetA.selection.anchor.slotId = widgetA.ast.id;
      widgetA.selection.head.slotId = widgetA.ast.id;

      setActiveEquationState({
        from: widgetA.from,
        to: widgetA.to,
        caret: widgetA.caret,
        selection: widgetA.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widgetA.ast,
      }, widgetA);

      const { event: copyEvt, storage } = createMockClipboardEvent();
      widgetA.handleCopyEvent(copyEvt, false);

      const copiedXml = storage['application/mathml+xml'];
      expect(copiedXml).toContain('<mfrac>');

      // Now create Widget B with "1 + "
      const xmlB = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mn>1</mn><mo>+</mo></mrow></math>';
      const widgetB = new WordEquationWidget(xmlB, 110, 200, false);
      const domB = widgetB.toDOM(mockView);
      container.appendChild(domB);

      widgetB.isFocused = true;
      widgetB.caret = { slotId: widgetB.ast.id, offset: 2 }; // End of root slot

      const { event: pasteEvt } = createMockClipboardEvent({
        'application/mathml+xml': copiedXml,
        'text/plain': copiedXml,
      });

      widgetB.handlePasteEvent(pasteEvt);

      // Widget B now has "1 + " followed by the fraction!
      expect(widgetB.ast.children.length).toBe(3);
      expect((widgetB.ast.children[0] as any).text).toBe('1');
      expect((widgetB.ast.children[1] as any).text).toBe('+');
      expect(widgetB.ast.children[2].type).toBe('fraction');
    });

    it('Scenario 3.5: InteractiveEquationBox deep nested sub-tree copy and cut parity', () => {
      let changedXml = '';
      const box = new InteractiveEquationBox({
        container,
        initialContent: `<math xmlns="http://www.w3.org/1998/Math/MathML">
          <mfrac>
            <mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow>
            <mrow><mi>z</mi></mrow>
          </mfrac>
        </math>`,
        onChange: (xml) => {
          changedXml = xml;
        },
      });
      box.focus();

      const fracNode = box.ast.children[0] as any;
      const numSlot = fracNode.numerator;

      // Select "+ y" in numerator (offset 1 to 3)
      box.selection = {
        anchor: { slotId: numSlot.id, offset: 1 },
        head: { slotId: numSlot.id, offset: 3 },
      };
      box.caret = { slotId: numSlot.id, offset: 3 };
      box.updateVisualState();

      // Copy
      const { event: copyEvt, storage: copyStorage } = createMockClipboardEvent();
      box.handleCopyEvent(copyEvt, false);
      expect(copyStorage['application/mathml+xml']).toContain('<mo>+</mo><mi>y</mi>');
      expect(copyStorage['application/mathml+xml']).not.toContain('<mi>x</mi>');
      expect(copyStorage['application/mathml+xml']).not.toContain('<mi>z</mi>');

      // Cut
      const { event: cutEvt, storage: cutStorage } = createMockClipboardEvent();
      box.handleCopyEvent(cutEvt, true);
      expect(cutStorage['application/mathml+xml']).toContain('<mo>+</mo><mi>y</mi>');

      // Remaining numerator has only 'x'
      const updatedNum = findSlotById(box.ast, numSlot.id);
      expect(updatedNum!.children.length).toBe(1);
      expect((updatedNum!.children[0] as any).text).toBe('x');
      expect(box.caret.offset).toBe(1);

      // onChange callback fired with updated MathML
      expect(changedXml).toContain('<mi>x</mi>');
      expect(changedXml).not.toContain('<mi>y</mi>');
    });

    it('Scenario 3.6: Backward partial selection in extractSelectionAST sorts bounds deterministically', () => {
      const root = createSlot('root', [
        createToken('1', 'mn'),
        createToken('2', 'mn'),
        createToken('3', 'mn'),
        createToken('4', 'mn'),
      ]);

      // Backward selection: Anchor 3, Head 1
      const backwardSel: SelectionRange = {
        anchor: { slotId: root.id, offset: 3 },
        head: { slotId: root.id, offset: 1 },
      };

      const extracted = extractSelectionAST(root, backwardSel);
      expect(extracted.children.length).toBe(2);
      expect((extracted.children[0] as any).text).toBe('2');
      expect((extracted.children[1] as any).text).toBe('3');
    });
  });
});
