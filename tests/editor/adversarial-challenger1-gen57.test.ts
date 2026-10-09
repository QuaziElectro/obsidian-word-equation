import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMathML } from '../../src/core/mathml-parser';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { resetIdCounter } from '../../src/core/ast';
import { SelectionRange, SlotNode } from '../../src/core/types';
import { updatePartialSelectionDom } from '../../src/editor/selection';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';

describe('Adversarial Challenger 1 (Gen 57): Comprehensive Empirical Stress Certification for Bugs 1–5', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const cssPath = path.resolve(__dirname, '../../styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    styleEl = document.createElement('style');
    styleEl.textContent = cssContent;
    document.head.appendChild(styleEl);
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = function () {
        return [] as any;
      };
    }
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // BUG 3: Shift+Arrow Boundary Selection Extension Stress
  // =========================================================================
  describe('Bug 3 Adversarial Challenge: Shift+Arrow Boundary Traversals & Boundary Resiliency', () => {
    it('Scenario 3.1: Sequential Shift+ArrowRight past equation boundary into text character-by-character', () => {
      const doc = 'Intro\n/weq_inline <math><mi>x</mi></math> /weq_inlineTargetWords\nEnd';
      // Provide standard fallback keymap so keys that fall through boundary handler continue extending
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
      const eqEnd = doc.indexOf('TargetWords');

      // Set selection spanning the equation from start to end
      view.dispatch({ selection: { anchor: eqStart, head: eqEnd } });
      expect(view.state.selection.main.anchor).toBe(eqStart);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // Press Shift+ArrowRight multiple times consecutively
      for (let step = 1; step <= 5; step++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);

        // Each step must advance the head further into "TargetWords" without sticking
        expect(view.state.selection.main.head).toBe(eqEnd + step);
        expect(view.state.selection.main.anchor).toBe(eqStart);
      }

      view.destroy();
      c.remove();
    });

    it('Scenario 3.2: Sequential Shift+ArrowLeft past backward equation boundary into prefix text', () => {
      const doc = 'PrefixTextHere\n/weq_inline <math><mi>y</mi></math> /weq_inlineSuffix';
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

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('Suffix');

      // Set selection spanning equation backward from end to start
      view.dispatch({ selection: { anchor: eqEnd, head: eqStart } });
      expect(view.state.selection.main.anchor).toBe(eqEnd);
      expect(view.state.selection.main.head).toBe(eqStart);

      // Press Shift+ArrowLeft multiple times consecutively
      for (let step = 1; step <= 4; step++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);

        expect(view.state.selection.main.head).toBe(eqStart - step);
        expect(view.state.selection.main.anchor).toBe(eqEnd);
      }

      view.destroy();
      c.remove();
    });

    it('Scenario 3.3: Shift+ArrowRight at equation boundary immediately adjacent to document end (EOF boundary safety)', () => {
      // Equation is at the very end of the document
      const doc = 'Start\n/weq_inline <math><mi>z</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(doc, [], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.length;

      view.dispatch({ selection: { anchor: eqStart, head: eqEnd } });

      // Dispatch Shift+ArrowRight when already at document.length
      const keyEvt = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      // Must not throw or produce invalid range
      expect(() => view.contentDOM.dispatchEvent(keyEvt)).not.toThrow();
      expect(view.state.selection.main.head).toBe(doc.length);
      expect(view.state.selection.main.anchor).toBe(eqStart);

      view.destroy();
      c.remove();
    });

    it('Scenario 3.4: Shift+ArrowLeft at backward boundary immediately adjacent to document start (BOF boundary safety)', () => {
      // Equation is at the very start of the document
      const doc = '/weq_inline <math><mi>a</mi></math> /weq_inline\nRest of document';
      const { view, container: c } = createMockEditor(doc, [], true);

      const eqStart = 0;
      const eqEnd = doc.indexOf('\nRest');

      view.dispatch({ selection: { anchor: eqEnd, head: eqStart } });

      // Dispatch Shift+ArrowLeft when head is at 0
      const keyEvt = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      expect(() => view.contentDOM.dispatchEvent(keyEvt)).not.toThrow();
      expect(view.state.selection.main.head).toBe(0);
      expect(view.state.selection.main.anchor).toBe(eqEnd);

      view.destroy();
      c.remove();
    });

    it('Scenario 3.5: Shift+ArrowRight across adjacent back-to-back inline equations', () => {
      // Two equations placed back-to-back
      const doc = 'Prefix /weq_inline <math><mi>a</mi></math> /weq_inline/weq_inline <math><mi>b</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);

      const firstEqStart = doc.indexOf('/weq_inline');
      const firstEqEnd = doc.indexOf('/weq_inline', firstEqStart + 1) + '/weq_inline'.length;

      view.dispatch({ selection: { anchor: firstEqStart, head: firstEqEnd } });

      // Press Shift+ArrowRight at boundary between the two equations
      const keyEvt = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt);

      // Must advance into the second equation / following text without getting stuck
      expect(view.state.selection.main.head).toBeGreaterThan(firstEqEnd);

      view.destroy();
      c.remove();
    });

    it('Scenario 3.6: Shift+ArrowRight past block equation boundary into following text line', () => {
      const doc = 'Heading\n```math-word\n<math><mi>x</mi></math>\n```\nFollowing text line';
      const { view, container: c } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      const blockEnd = doc.indexOf('Following text line');

      view.dispatch({ selection: { anchor: blockStart, head: blockEnd } });

      const keyEvt = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt);

      expect(view.state.selection.main.head).toBeGreaterThan(blockEnd);
      expect(view.state.selection.main.anchor).toBe(blockStart);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 4: Up Arrow Multi-Line Adjacency & Non-Skip Stress
  // =========================================================================
  describe('Bug 4 Adversarial Challenge: Vertical Arrow Navigation Across Intervening Blank and Short Lines', () => {
    it('Scenario 4.1: Up Arrow from Line N+2 when Line N+1 is completely blank (empty newline) does NOT enter equation', () => {
      // Document structure:
      // Line 1: Heading
      // Line 2: ```math-word
      // Line 3: <math><mi>x</mi></math>
      // Line 4: ```
      // Line 5: (empty blank line)
      // Line 6: Cursor is here
      const doc = 'Heading\n```math-word\n<math><mi>x</mi></math>\n```\n\nCursor is here';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line6 = view.state.doc.line(6);
      view.dispatch({ selection: { anchor: line6.from + 2, head: line6.from + 2 } });
      expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(6);

      // Press ArrowUp
      const arrowUpEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(arrowUpEvt);

      // Must NOT enter the equation on line 2-4!
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.2: Up Arrow from Line N+2 when Line N+1 contains a single character ("a") does NOT enter equation', () => {
      // Line 1: ```math-word
      // Line 2: <math><mi>x</mi></math>
      // Line 3: ```
      // Line 4: a
      // Line 5: Second line
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\na\nSecond line';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line5 = view.state.doc.line(5);
      view.dispatch({ selection: { anchor: line5.from + 3, head: line5.from + 3 } });

      const arrowUpEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(arrowUpEvt);

      // Must NOT enter the equation
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.3: Up Arrow from Line N+3 with two intermediate blank lines does NOT enter equation', () => {
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\n\n\nFar below line';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line6 = view.state.doc.line(6);
      view.dispatch({ selection: { anchor: line6.from, head: line6.from } });

      const arrowUpEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(arrowUpEvt);

      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.4: Up Arrow from Line N+1 (immediately adjacent line) correctly enters equation from end', () => {
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\nDirectly adjacent line';
      const { view, container: c } = createMockEditor(doc, [], true);

      // Line 4 is directly adjacent to Line 3 (block closing)
      const line4 = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: line4.from, head: line4.from } });

      const arrowUpEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(arrowUpEvt);

      // Directly adjacent line SHOULD enter the equation
      expect(getActiveEquationState()?.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });

    it('Scenario 4.5: Multiple block equations separated by lines: ArrowUp from below equation 2 does not jump into equation 1', () => {
      const doc = '```math-word\n<math><mi>a</mi></math>\n```\nIntermediate note\n```math-word\n<math><mi>b</mi></math>\n```\n\nLine below eq2';
      const { view, container: c } = createMockEditor(doc, [], true);

      // Line 9: Line below eq2
      const line9 = view.state.doc.line(9);
      view.dispatch({ selection: { anchor: line9.from, head: line9.from } });

      const arrowUpEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(arrowUpEvt);

      // Must not jump into equation 2 (because line 8 is empty) and must certainly not jump into equation 1
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 1: Nested Highlight Brightness Stacking Deep Structural Stress
  // =========================================================================
  describe('Bug 1 Adversarial Challenge: Complex Heterogeneous Math Nesting', () => {
    it('Scenario 1.1: Radical containing Fraction containing Matrix containing Fraction: outer radical selected', () => {
      const complexXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msqrt>
          <mfrac>
            <mrow>
              <mfenced open="[" close="]">
                <mtable>
                  <mtr>
                    <mtd>
                      <mfrac><mn>1</mn><mn>2</mn></mfrac>
                    </mtd>
                  </mtr>
                </mtable>
              </mfenced>
            </mrow>
            <mrow><mn>3</mn></mrow>
          </mfrac>
        </msqrt>
      </math>`;

      const ast = parseMathML(complexXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const allSelectedStructures = dom.querySelectorAll('.eq-selected-structure');
      // Exactly ONE element receives .eq-selected-structure
      expect(allSelectedStructures.length).toBe(1);
      expect(dom.querySelector('.eq-radical')?.classList.contains('eq-selected-structure')).toBe(true);

      // Verify nested fraction, matrix, and inner fraction do not have .eq-selected-structure
      const innerFractions = dom.querySelectorAll('.eq-fraction.eq-selected-structure');
      expect(innerFractions.length).toBe(0);

      const innerMatrices = dom.querySelectorAll('.eq-matrix.eq-selected-structure');
      expect(innerMatrices.length).toBe(0);
    });

    it('Scenario 1.2: Triple nested radicals sqrt(sqrt(sqrt(x))): outermost selection has no stacking', () => {
      const tripleRootXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msqrt>
          <msqrt>
            <msqrt>
              <mi>x</mi>
            </msqrt>
          </msqrt>
        </msqrt>
      </math>`;

      const ast = parseMathML(tripleRootXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const allSelected = dom.querySelectorAll('.eq-selected-structure');
      expect(allSelected.length).toBe(1);

      const radicals = dom.querySelectorAll('.eq-radical');
      expect(radicals.length).toBe(3);
      expect(radicals[0].classList.contains('eq-selected-structure')).toBe(true);
      expect(radicals[1].classList.contains('eq-selected-structure')).toBe(false);
      expect(radicals[2].classList.contains('eq-selected-structure')).toBe(false);
    });
  });

  // =========================================================================
  // BUG 2: Mouse Click Outside Selection Clearing Stress
  // =========================================================================
  describe('Bug 2 Adversarial Challenge: Outside Clicks and Hostile State Mutators', () => {
    it('Scenario 2.1: Clicking in empty blank line below equation completely purges selection', () => {
      const doc = 'Prefix\n/weq_inline <math><mi>a</mi><mo>+</mo><mi>b</mi></math> /weq_inline\n\n\nTrailing';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 0 },
        head: { slotId: widget.ast.id, offset: 2 },
      };
      widget.updateCaretOnly();

      expect(widget.isFocused).toBe(true);
      expect(widget.selection).not.toBeNull();

      // Click on blank line 3
      const line3 = view.state.doc.line(3);
      view.dispatch({ selection: { anchor: line3.from, head: line3.from } });
      const pointerEvt = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(pointerEvt);

      // Verify absolute purge
      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
      expect(getActiveEquationState()).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: Repeated clicks outside do not trigger state thrashing or errors', () => {
      const doc = 'Text\n/weq_inline <math><mi>u</mi><mo>+</mo><mi>v</mi></math> /weq_inline\nEnd';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 0 },
        head: { slotId: widget.ast.id, offset: 2 },
      };
      widget.updateCaretOnly();

      // Dispatch 5 successive pointerdown clicks outside
      for (let i = 0; i < 5; i++) {
        const pointerEvt = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
        view.contentDOM.dispatchEvent(pointerEvt);
      }

      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect(getActiveEquationState()).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 5: Escape Creates Dual Carets Deep Structural Stress
  // =========================================================================
  describe('Bug 5 Adversarial Challenge: Escape Key From Deep Structures & Edge Cases', () => {
    it('Scenario 5.1: Escape from inside a 2x2 Matrix cell leaves zero .eq-caret and one CM caret', () => {
      const matrixXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfenced open="[" close="]">
          <mtable>
            <mtr>
              <mtd><mn>1</mn></mtd>
              <mtd><mn>2</mn></mtd>
            </mtr>
            <mtr>
              <mtd><mn>3</mn></mtd>
              <mtd><mn>4</mn></mtd>
            </mtr>
          </mtable>
        </mfenced>
      </math>`;

      const doc = `Prefix\n\`\`\`math-word\n${matrixXml}\n\`\`\`\nSuffix`;
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);

      // Press Escape
      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      expect(view.state.selection.ranges.length).toBe(1);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(widget.from);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.2: Escape from inside an indexed root (cube root) leaves zero .eq-caret', () => {
      const rootXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mroot>
          <mi>x</mi>
          <mn>3</mn>
        </mroot>
      </math>`;

      const doc = `Prefix\n\`\`\`math-word\n${rootXml}\n\`\`\`\nSuffix`;
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);

      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      expect(view.state.selection.ranges.length).toBe(1);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.3: Escape when multiple equations exist on the same line operates cleanly', () => {
      const doc = 'Prefix /weq_inline <math><mi>x</mi></math> /weq_inline middle /weq_inline <math><mi>y</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);

      const widgets: WordEquationWidget[] = [];
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widgets.push(w);
      });
      expect(widgets.length).toBe(2);

      const [w1, w2] = widgets;
      // Focus w2
      w2.enterFromStart(view, 'ArrowRight');
      expect(w2.isFocused).toBe(true);

      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      (w2 as any).containerEl?.dispatchEvent(escEvt);

      expect(w2.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect((w2 as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      expect((w1 as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);

      view.destroy();
      c.remove();
    });
  });
});
