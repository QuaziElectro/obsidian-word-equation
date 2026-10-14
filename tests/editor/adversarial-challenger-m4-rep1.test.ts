/**
 * Adversarial Challenger M4 Rep 1: Caret Navigation & Boundary Focus Stress Harness
 *
 * EMPIRICAL ADVERSARIAL VERIFICATION:
 * 1. Matrix stress across 8 distinct equation topologies (atoms, empty fractions, nested fractions, radicals, scripts, inline).
 * 2. Reverse boundary entry, placeholder descent, and complete reverse traversal.
 * 3. Rapid boundary ping-pong (50 cycles) under stress conditions.
 * 4. Continuous activeElement verification: document.activeElement must NEVER be document.body.
 * 5. Hostile blur and defensive rAF focus recovery validation.
 * 6. Multi-equation contiguous traversal.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import { resetIdCounter, findSlotById, isSlotEmpty } from '../../src/core/ast';
import { insertCharacter } from '../../src/editor/selection';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger M4 Rep 1: Navigation & Focus Invariants', () => {
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
    vi.restoreAllMocks();
  });

  function getWidgetsAndDoms(view: any): Array<{ widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement }> {
    const list: Array<{ widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement }> = [];
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(0, view.state.doc.length, (from: number, to: number, dec: any) => {
        const w = dec.spec?.widget;
        if (w instanceof WordEquationWidget) {
          const dom = (view.dom.querySelector(`[data-equation-from="${w.from}"]`) ||
            view.dom.querySelector('.word-equation-block') ||
            view.dom.querySelector('.word-equation-inline')) as HTMLElement;
          const mathEl = (dom?.querySelector('.word-equation-math') || dom) as HTMLElement;
          list.push({ widget: w, dom, mathEl });
        }
      });
    }
    return list;
  }

  function getSingleWidget(view: any): { widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement } {
    const list = getWidgetsAndDoms(view);
    if (list.length === 0) {
      throw new Error('No WordEquationWidget found in view decorations');
    }
    return list[0];
  }

  // =========================================================================
  // Challenge 1: Topology Matrix Stress Testing for Reverse Boundary Entry
  // =========================================================================
  describe('Challenge 1: Topology Matrix Stress for Reverse Entry & Focus Retention', () => {
    const topologies = [
      {
        name: 'Simple Atom (x)',
        doc: 'Line 1\n```math-word\n<math display="block"><mi>x</mi></math>\n```\nLine 3',
        expectedDescendRole: 'root',
      },
      {
        name: 'Empty Block Fraction',
        doc: 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3',
        expectedDescendRole: 'denominator',
      },
      {
        name: 'Asymmetric Fraction (empty numerator, populated denominator)',
        doc: 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow><mn>42</mn></mrow></mfrac></math>\n```\nLine 3',
        expectedDescendRole: 'denominator',
      },
      {
        name: 'Asymmetric Fraction (populated numerator, empty denominator)',
        doc: 'Line 1\n```math-word\n<math display="block"><mfrac><mrow><mn>42</mn></mrow><mrow></mrow></mfrac></math>\n```\nLine 3',
        expectedDescendRole: 'denominator',
      },
      {
        name: 'Deeply Nested 3-Level Fraction',
        doc: 'Line 1\n```math-word\n<math display="block"><mfrac><mrow><mn>1</mn></mrow><mrow><mfrac><mrow><mn>2</mn></mrow><mrow><mfrac><mrow><mn>3</mn></mrow><mrow><mn>4</mn></mrow></mfrac></mrow></mfrac></mrow></mfrac></math>\n```\nLine 3',
        expectedDescendRole: 'denominator',
      },
      {
        name: 'Nested Empty Fractions',
        doc: 'Line 1\n```math-word\n<math display="block"><mfrac><mrow><mfrac><mrow></mrow><mrow></mrow></mfrac></mrow><mrow><mfrac><mrow></mrow><mrow></mrow></mfrac></mrow></mfrac></math>\n```\nLine 3',
        expectedDescendRole: 'denominator',
      },
      {
        name: 'Radical with Radicand Placeholder',
        doc: 'Line 1\n```math-word\n<math display="block"><msqrt><mrow></mrow></msqrt></math>\n```\nLine 3',
        expectedDescendRole: 'radicand',
      },
      {
        name: 'Root with Index and Radicand',
        doc: 'Line 1\n```math-word\n<math display="block"><mroot><mrow></mrow><mn>3</mn></mroot></math>\n```\nLine 3',
        expectedDescendRole: 'index',
      },
      {
        name: 'Subscript & Superscript (msubsup)',
        doc: 'Line 1\n```math-word\n<math display="block"><msubsup><mi>x</mi><mrow></mrow><mrow><mn>2</mn></mrow></msubsup></math>\n```\nLine 3',
        expectedDescendRole: 'sup',
      },
      {
        name: 'Inline Empty Fraction',
        doc: 'Prefix /weq_inline <math><mfrac><mrow></mrow><mrow></mrow></mfrac></math> /weq_inline Suffix',
        expectedDescendRole: 'denominator',
      },
    ];

    topologies.forEach(({ name, doc, expectedDescendRole }) => {
      it(`[${name}] enters from end, retains focus, and descends into rightmost slot without body blur`, () => {
        const { view, container: c } = createMockEditor(doc, [], true);
        const { widget, mathEl } = getSingleWidget(view);
        const dispatchSpy = vi.spyOn(view, 'dispatch');

        // 1. Enter from end
        widget.enterFromEnd(view);

        // INVARIANT 1: widget is focused
        expect(widget.isFocused).toBe(true);
        expect(widget.enteredFromEnd).toBe(true);

        // INVARIANT 2: view.dispatch did NOT emit a selection transaction (Root Cause Prevention)
        expect(dispatchSpy).not.toHaveBeenCalledWith(
          expect.objectContaining({ selection: expect.anything() })
        );

        // INVARIANT 3: document.activeElement is NOT document.body
        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(mathEl);

        // 2. Press ArrowLeft to descend into equation
        const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
        expect(handled).toBe(true);
        expect(widget.isFocused).toBe(true);

        // INVARIANT 4: activeElement remains valid (NOT body)
        expect(document.activeElement).not.toBe(document.body);

        // Verify descended slot role matches expectation
        const currentSlot = findSlotById(widget.ast, widget.caret.slotId);
        expect(currentSlot).toBeDefined();
        if (expectedDescendRole !== 'root') {
          expect(currentSlot?.role).toBe(expectedDescendRole);
        }

        view.destroy();
        c.remove();
      });
    });
  });

  // =========================================================================
  // Challenge 2: Complete Reverse Traversal Stress (ArrowLeft from End to Exit)
  // =========================================================================
  describe('Challenge 2: Complete Reverse Traversal Stress', () => {
    it('traverses complex equation entirely in reverse until clean backward exit without activeElement dropping to body', () => {
      // Equation: a + b / c = d^2
      const doc = 'Line 1\n```math-word\n<math display="block"><mi>a</mi><mo>+</mo><mfrac><mi>b</mi><mi>c</mi></mfrac><mo>=</mo><msup><mi>d</mi><mn>2</mn></msup></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getSingleWidget(view);

      // Track activeElement at every step
      const activeElementHistory: string[] = [];
      const recordActiveElement = () => {
        const tag = document.activeElement?.tagName || 'null';
        const cls = document.activeElement?.className || '';
        activeElementHistory.push(`${tag}.${cls}`);
        // CRITICAL ADVERSARIAL ASSERTION: NEVER BODY
        expect(document.activeElement).not.toBe(document.body);
      };

      // 1. Enter from end
      widget.enterFromEnd(view);
      recordActiveElement();

      // 2. Press ArrowLeft repeatedly until equation exits
      let stepCount = 0;
      const maxSteps = 50; // Safety against infinite loops

      while (widget.isFocused && stepCount < maxSteps) {
        stepCount++;
        const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
        recordActiveElement();
        if (!widget.isFocused) {
          // Cleanly exited backward
          break;
        }
        expect(handled).toBe(true);
      }

      // Assert that it completed exit backward within reasonable steps
      expect(stepCount).toBeGreaterThan(4);
      expect(stepCount).toBeLessThan(maxSteps);
      expect(widget.isFocused).toBe(false);

      // CodeMirror view must be focused after backward exit
      expect(document.activeElement).not.toBe(document.body);
      expect(activeElementHistory.every((entry) => !entry.startsWith('BODY'))).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 3: Rapid Boundary Ping-Pong (50 Cycles Stress)
  // =========================================================================
  describe('Challenge 3: Rapid Boundary Ping-Pong Stress Harness', () => {
    it('survives 50 consecutive reverse-enter / forward-exit cycles with zero focus drops to body', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getSingleWidget(view);

      const CYCLES = 50;

      for (let i = 0; i < CYCLES; i++) {
        // Step 1: Enter from behind
        widget.enterFromEnd(view);
        expect(widget.isFocused).toBe(true);
        expect(document.activeElement).toBe(mathEl);
        expect(document.activeElement).not.toBe(document.body);

        // Step 2: Exit forward via ArrowRight
        const exited = widget.handleArrowNavigation('ArrowRight', false, view);
        expect(exited).toBe(true);
        expect(widget.isFocused).toBe(false);
        expect(widget.justEscapedForwardAfterEnteringFromEnd).toBe(true);

        // CodeMirror should be focused, activeElement NOT body
        expect(document.activeElement).not.toBe(document.body);

        // Reset anti-oscillation flag for next synthetic test cycle
        widget.justEscapedForwardAfterEnteringFromEnd = false;
      }

      view.destroy();
      c.remove();
    });

    it('survives 50 consecutive reverse-enter / backward-exit cycles with zero focus drops to body', () => {
      // Empty expression where entering from end and pressing ArrowLeft immediately exits backward
      const doc = 'Line 1\n```math-word\n<math display="block"><mrow></mrow></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getSingleWidget(view);

      const CYCLES = 50;

      for (let i = 0; i < CYCLES; i++) {
        // Enter from behind
        widget.enterFromEnd(view);
        expect(widget.isFocused).toBe(true);
        expect(document.activeElement).toBe(mathEl);

        // Press ArrowLeft: at offset 0 of root, exits backward
        const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
        expect(widget.isFocused).toBe(false);
        expect(document.activeElement).not.toBe(document.body);
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 4: Deep Placeholder Typing and Subsequent Exit Traversal
  // =========================================================================
  describe('Challenge 4: Placeholder Descent and Interactive Input Acceptance', () => {
    it('enters denominator placeholder from behind, accepts character insertion, and escapes cleanly', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getSingleWidget(view);

      // 1. Enter from behind
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // 2. Step into denominator
      widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(widget.isFocused).toBe(true);

      const denSlotId = widget.caret.slotId;
      const denSlotBefore = findSlotById(widget.ast, denSlotId);
      expect(denSlotBefore?.role).toBe('denominator');
      expect(denSlotBefore?.children.length).toBe(0);

      // 3. Simulate character insertion (typing '9' into placeholder)
      const res = insertCharacter(widget.ast, widget.caret, '9');
      expect(res.handled).toBe(true);
      widget.ast = res.root;
      widget.caret = res.caret;
      widget.updateCaretOnly();

      // Caret must have advanced
      const denSlotAfter = findSlotById(widget.ast, denSlotId);
      expect(denSlotAfter?.children.length).toBe(1);
      expect(widget.caret.offset).toBe(1);
      expect(document.activeElement).not.toBe(document.body);

      // 4. ArrowRight from offset 1 exits denominator slot to after fraction
      const right1 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(right1).toBe(true);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);

      // 5. ArrowRight again exits forward out of equation into CodeMirror
      const right2 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(right2).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(document.activeElement).not.toBe(document.body);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 5: Hostile Blur & Defensive rAF Focus Recovery Stress
  // =========================================================================
  describe('Challenge 5: Defensive rAF Focus Recovery Stress Invariants', () => {
    it('re-focuses mathEl if activeElement involuntarily drops to body while widget remains focused', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mi>z</mi></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getSingleWidget(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromEnd(view);
      expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);

      // Hostile simulation: document.activeElement becomes body
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      // Trigger rAF
      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // Must have called mathEl.focus() to recover
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

      view.destroy();
      c.remove();
    });

    it('does NOT steal focus if user intentionally clicked away (isFocused === false) before rAF fires', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mi>z</mi></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getSingleWidget(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromEnd(view);

      // User exits before rAF runs
      widget.isFocused = false;
      focusSpy.mockClear();

      // Hostile blur to body
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);

      // Trigger rAF
      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // INVARIANT: mathEl.focus MUST NOT be called because widget is no longer focused!
      expect(focusSpy).not.toHaveBeenCalled();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 6: Multi-Equation Contiguous Traversal Stress
  // =========================================================================
  describe('Challenge 6: Multi-Equation Contiguous Traversal', () => {
    it('seamlessly transitions focus between multiple equations without any body drops', () => {
      const doc = [
        'Line 1',
        '```math-word',
        '<math display="block"><mi>x</mi></math>',
        '```',
        'Middle Text',
        '```math-word',
        '<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>',
        '```',
        'End Line',
      ].join('\n');

      const { view, container: c } = createMockEditor(doc, [], true);
      const widgets = getWidgetsAndDoms(view);
      expect(widgets.length).toBe(2);

      const [eq1, eq2] = widgets;

      // 1. Enter Eq 2 from end
      eq2.widget.enterFromEnd(view);
      expect(eq2.widget.isFocused).toBe(true);
      expect(eq1.widget.isFocused).toBe(false);
      expect(document.activeElement).toBe(eq2.mathEl);

      // 2. Step into denominator of Eq 2
      eq2.widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(eq2.widget.isFocused).toBe(true);
      expect(document.activeElement).not.toBe(document.body);

      // 3. Step left into numerator of Eq 2
      eq2.widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(eq2.widget.isFocused).toBe(true);
      expect(document.activeElement).not.toBe(document.body);

      // 4. Step left to before fraction
      eq2.widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(eq2.widget.isFocused).toBe(true);
      expect(document.activeElement).not.toBe(document.body);

      // 5. Step left to exit Eq 2 backward into document
      eq2.widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(eq2.widget.isFocused).toBe(false);
      expect(document.activeElement).not.toBe(document.body);

      // 6. Enter Eq 1 from end
      eq1.widget.enterFromEnd(view);
      expect(eq1.widget.isFocused).toBe(true);
      expect(eq2.widget.isFocused).toBe(false);
      expect(document.activeElement).toBe(eq1.mathEl);

      // 7. Exit Eq 1 forward
      eq1.widget.handleArrowNavigation('ArrowRight', false, view);
      expect(eq1.widget.isFocused).toBe(false);
      expect(document.activeElement).not.toBe(document.body);

      view.destroy();
      c.remove();
    });
  });
});
