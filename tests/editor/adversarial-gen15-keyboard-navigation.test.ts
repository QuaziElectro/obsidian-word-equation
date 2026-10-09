import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  createSuperscript,
  createSubscript,
  createSubSup,
  createMatrix,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { serializeMathML } from '../../src/core/mathml-serializer';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';

describe('Gen15 Adversarial Challenge: Keyboard Navigation (R2) Stress Suite', () => {
  let container: HTMLElement;

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
  });

  function getWidgetAndDom(view: any, searchPos = 0): { widget: WordEquationWidget; dom: HTMLElement } {
    let widget: WordEquationWidget | null = null;
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(searchPos, view.state.doc.length, (from: number, to: number, dec: any) => {
        if (!widget && dec.spec?.widget instanceof WordEquationWidget) {
          widget = dec.spec.widget;
        }
      });
    }
    const dom = (view.dom.querySelector('.word-equation-block') ||
      view.dom.querySelector('.word-equation-inline')) as HTMLElement;
    if (!widget || !dom) {
      throw new Error('Widget or DOM container not found');
    }
    return { widget, dom };
  }

  // =========================================================================
  // 1. Entering From Surrounding Text & Caret Initialization
  // =========================================================================
  describe('1. Entering From Surrounding Text', () => {
    it('enters equation from preceding Markdown text with ArrowRight into offset 0', () => {
      const doc = 'Preceding text\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mi>y</mi></math>\n```\nFollowing text';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      // Position CM cursor immediately before equation
      view.dispatch({ selection: { anchor: widget.from } });
      expect(view.state.selection.main.head).toBe(widget.from);
      expect(dom.querySelector('.eq-caret')).toBeNull();

      // Press ArrowRight via CM contentDOM
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Caret must now be inside equation at offset 0
      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState!.isFocused).toBe(true);
      expect(activeState!.caret.offset).toBe(0);

      const caretEl = dom.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();
      expect(caretEl!.textContent).toBe('|');
      expect(caretEl!.isConnected).toBe(true);
      expect(dom.classList.contains('eq-active') || dom.querySelector('.word-equation-math.eq-active') !== null).toBe(true);

      view.destroy();
      c.remove();
    });

    it('enters equation from following Markdown text with ArrowLeft into end offset', () => {
      const doc = 'Prefix\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mi>b</mi></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      // Position CM cursor immediately after equation
      const afterPos = widget.to;
      view.dispatch({ selection: { anchor: afterPos } });
      expect(dom.querySelector('.eq-caret')).toBeNull();

      // Press ArrowLeft via CM contentDOM
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState!.isFocused).toBe(true);
      expect(activeState!.caret.offset).toBe(3);

      const caretEl = dom.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();
      expect(caretEl!.textContent).toBe('|');

      view.destroy();
      c.remove();
    });

    it('enters inline equation cleanly from preceding and following character', () => {
      const doc = 'Hello /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>z</mi></math> /weq_inline world';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      // Enter from start
      view.dispatch({ selection: { anchor: widget.from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      let activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState!.caret.offset).toBe(0);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Exit
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Enter from end
      view.dispatch({ selection: { anchor: widget.to } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState!.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // 2. Subsequent ArrowRight Presses: Caret Non-Reset Invariant
  // =========================================================================
  describe('2. Subsequent ArrowRight Presses Non-Reset Invariant', () => {
    it('verifies consecutive ArrowRight presses advance sequentially and DO NOT reset to offset 0', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mi>z</mi></math>\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      // Step 0: Enter equation
      view.dispatch({ selection: { anchor: widget.from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(widget.caret.offset).toBe(0);
      expect(getActiveEquationState()!.caret.offset).toBe(0);

      // Step 1: Second ArrowRight MUST advance to offset 1 (NOT reset to 0!)
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset, 'Second ArrowRight must advance to offset 1').toBe(1);
      expect(getActiveEquationState()!.caret.offset).toBe(1);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 2: Third ArrowRight MUST advance to offset 2
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset, 'Third ArrowRight must advance to offset 2').toBe(2);
      expect(getActiveEquationState()!.caret.offset).toBe(2);

      // Step 3: Fourth ArrowRight MUST advance to offset 3
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset, 'Fourth ArrowRight must advance to offset 3').toBe(3);
      expect(getActiveEquationState()!.caret.offset).toBe(3);

      // Step 4: Fifth ArrowRight MUST advance to offset 4
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset, 'Fifth ArrowRight must advance to offset 4').toBe(4);
      expect(getActiveEquationState()!.caret.offset).toBe(4);

      // Step 5: Sixth ArrowRight MUST advance to offset 5 (end of equation)
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset, 'Sixth ArrowRight must advance to offset 5').toBe(5);
      expect(getActiveEquationState()!.caret.offset).toBe(5);

      view.destroy();
      c.remove();
    });

    it('verifies non-reset invariant when events are dispatched directly to mathEl DOM', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>*</mo><mi>b</mi></math>\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      const mathEl = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathEl).not.toBeNull();

      mathEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset).toBe(1);

      mathEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset).toBe(2);

      mathEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset).toBe(3);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // 3. Rapid Arrow Key Presses (50-100 cycles) & Jitter Stress Test
  // =========================================================================
  describe('3. Rapid Arrow Key Bursts and Jitter', () => {
    it('survives a rapid burst of 100 alternating ArrowRight/ArrowLeft presses without caret vanishing', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mrow><mi>y</mi><mo>-</mo><mn>2</mn></mrow></mfrac>' +
        '<mo>=</mo><msqrt><mi>z</mi></msqrt>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      const mathEl = dom.querySelector('.word-equation-math') as HTMLElement;

      mathEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      for (let i = 0; i < 100; i++) {
        const key = i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
        mathEl.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

        const carets = dom.querySelectorAll('.eq-caret');
        expect(carets.length, `Cycle ${i}: Caret count must be exactly 1`).toBe(1);
        expect(carets[0].textContent, `Cycle ${i}: Caret text must be '|'`).toBe('|');
        expect(carets[0].isConnected, `Cycle ${i}: Caret must remain attached`).toBe(true);

        const isActive = dom.classList.contains('eq-active') || dom.querySelector('.word-equation-math.eq-active') !== null;
        expect(isActive, `Cycle ${i}: Equation must remain active`).toBe(true);
      }

      view.destroy();
      c.remove();
    });

    it('processes rapid burst navigation across entire equation without throwing or desyncing', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mrow>' +
        '<msup><mi>a</mi><mn>2</mn></msup><mo>+</mo>' +
        '<msup><mi>b</mi><mn>2</mn></msup><mo>=</mo>' +
        '<msup><mi>c</mi><mn>2</mn></msup>' +
        '</mrow>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      let step = 0;
      while (step < 60) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        step++;

        if (!dom.classList.contains('eq-active') && !dom.querySelector('.word-equation-math.eq-active')) {
          break;
        }

        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Step ${step}: Caret must not vanish`).not.toBeNull();
        expect(caret!.textContent).toBe('|');
      }

      widget.enterFromEnd(view);
      let reverseStep = 0;
      while (reverseStep < 60) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        reverseStep++;

        if (!dom.classList.contains('eq-active') && !dom.querySelector('.word-equation-math.eq-active')) {
          break;
        }

        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Reverse Step ${reverseStep}: Caret must not vanish`).not.toBeNull();
        expect(caret!.textContent).toBe('|');
      }

      expect(step).toBeGreaterThan(5);
      expect(reverseStep).toBeGreaterThan(5);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // 4. Traversing Nested Boxes & Empty Placeholders
  // =========================================================================
  describe('4. Traversing Nested Boxes and Empty Placeholders', () => {
    it('traverses deeply nested fractions (continued fraction) smoothly without losing caret', () => {
      const cSlot = createSlot('numerator', [createToken('c', 'mi')]);
      const dSlot = createSlot('denominator', [createToken('d', 'mi')]);
      const innerFrac = createFraction(cSlot, dSlot);

      const numSlot = createSlot('numerator', [createToken('a', 'mi')]);
      const denSlot = createSlot('denominator', [
        createToken('b', 'mi'),
        createToken('+', 'mo'),
        innerFrac,
      ]);
      const outerFrac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [outerFrac]);
      updateParentPointers(root);

      const mathml = serializeMathML(root);
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Extract actual parsed slot roles from widget AST
      const outerParsedFrac = widget.ast.children[0] as any;
      const expectedNumId = outerParsedFrac.numerator.id;
      const expectedDenId = outerParsedFrac.denominator.id;
      const innerParsedFrac = outerParsedFrac.denominator.children[2] as any;
      const expectedInnerNumId = innerParsedFrac.numerator.id;
      const expectedInnerDenId = innerParsedFrac.denominator.id;

      const visitedSlots = new Set<string>();
      let steps = 0;

      while (steps < 40) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        steps++;

        if (!dom.classList.contains('eq-active') && !dom.querySelector('.word-equation-math.eq-active')) {
          break;
        }

        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Step ${steps}: Caret must not vanish in nested fraction`).not.toBeNull();

        const slotEl = caret!.closest('.eq-slot');
        if (slotEl) {
          visitedSlots.add(slotEl.getAttribute('data-slot-id') || 'unknown');
        }
      }

      expect(visitedSlots.has(expectedNumId)).toBe(true);
      expect(visitedSlots.has(expectedDenId)).toBe(true);
      expect(visitedSlots.has(expectedInnerNumId)).toBe(true);
      expect(visitedSlots.has(expectedInnerDenId)).toBe(true);

      view.destroy();
      c.remove();
    });

    it('navigates through empty placeholders and toggles .eq-focused without leaving ghost carets', () => {
      const numSlot = createSlot('numerator', []);
      const denSlot = createSlot('denominator', []);
      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      const mathml = serializeMathML(root);
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      const parsedFrac = widget.ast.children[0] as any;
      const targetNumSlotId = parsedFrac.numerator.id;
      const targetDenSlotId = parsedFrac.denominator.id;

      // Navigate into numerator placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.slotId).toBe(targetNumSlotId);

      const numPh = dom.querySelector(`[data-placeholder-for="${targetNumSlotId}"]`);
      expect(numPh).not.toBeNull();
      expect(numPh!.classList.contains('eq-focused')).toBe(true);
      expect(numPh!.querySelector('.eq-caret')).not.toBeNull();

      const denPh = dom.querySelector(`[data-placeholder-for="${targetDenSlotId}"]`);
      expect(denPh!.classList.contains('eq-focused')).toBe(false);
      expect(denPh!.textContent).toBe('⬚');

      // Navigate into denominator placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.slotId).toBe(targetDenSlotId);

      expect(numPh!.classList.contains('eq-focused')).toBe(false);
      expect(numPh!.textContent).toBe('⬚');
      expect(denPh!.classList.contains('eq-focused')).toBe(true);
      expect(denPh!.querySelector('.eq-caret')).not.toBeNull();

      expect(dom.querySelectorAll('.eq-caret').length).toBe(1);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // 5. Exiting Back to Markdown
  // =========================================================================
  describe('5. Exiting Back to Markdown', () => {
    it('exits cleanly to following Markdown text after reaching the end with ArrowRight', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n```\nTrailing';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget.caret.offset).toBe(1);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect(dom.classList.contains('eq-active')).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();

      const selHead = view.state.selection.main.head;
      expect(selHead).toBeGreaterThanOrEqual(widget.to);

      view.destroy();
      c.remove();
    });

    it('exits cleanly to preceding Markdown text after reaching offset 0 with ArrowLeft', () => {
      const doc = 'Heading\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi></math>\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect(dom.classList.contains('eq-active')).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();

      const selHead = view.state.selection.main.head;
      expect(selHead).toBeLessThanOrEqual(widget.from);

      view.destroy();
      c.remove();
    });
  });
});