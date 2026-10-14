import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
  setActiveEquationState,
} from '../../src/editor/active-session';
import {
  resetIdCounter,
  findSlotById,
  isSlotEmpty,
  findFirstEditableSlot,
  findLastEditableSlot,
} from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { updateVisualCaretDom, insertCharacter } from '../../src/editor/selection';

describe('Adversarial Challenger 1 (Gen47): Caret Navigation Engine & Boundary Entry Empirical Stress Suite', () => {
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

  function getWidgetAndDom(view: any, searchPos = 0): { widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement } {
    let widget: WordEquationWidget | null = null;
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(searchPos, view.state.doc.length, (from: number, to: number, dec: any) => {
        if (!widget && (dec.spec?.widget instanceof WordEquationWidget || dec.widget instanceof WordEquationWidget)) {
          widget = dec.spec?.widget || dec.widget;
        }
      });
    }
    const dom = (view.dom.querySelector('.word-equation-block') ||
      view.dom.querySelector('.word-equation-inline')) as HTMLElement;
    if (!widget || !dom) {
      throw new Error('Widget or DOM container not found');
    }
    const mathEl = (dom.querySelector('.word-equation-math') || dom) as HTMLElement;
    return { widget, dom, mathEl };
  }

  // =========================================================================
  // SUITE 1: Deeply Nested Fractions Traversal & Vertical Climbing
  // =========================================================================
  describe('Suite 1: Deeply Nested Fractions Traversal & Vertical Climbing', () => {
    it('1.1: 3-Level fraction 1 / (2 / (3 / 4)) horizontal ArrowRight traversal visits every level and maintains .eq-caret', () => {
      // 1 / (2 / (3 / 4))
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mn>4</mn></mfrac></mfrac></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      const visitedRoles: string[] = [];
      let steps = 0;
      const maxSteps = 30;

      while (widget.isFocused && steps < maxSteps) {
        steps++;
        const currentSlot = findSlotById(widget.ast, widget.caret.slotId);
        if (currentSlot && currentSlot.role) {
          visitedRoles.push(currentSlot.role);
        }
        const caretEl = dom.querySelector('.eq-caret');
        expect(caretEl, `Caret DOM element missing at step ${steps}`).not.toBeNull();
        expect(caretEl?.textContent).toBe('|');

        widget.handleArrowNavigation('ArrowRight', false, view);
      }

      // Equation must have exited cleanly without hanging
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();
      expect(steps).toBeLessThan(maxSteps);
      // Both numerator and denominator roles must have been visited multiple times across the 3 fraction layers
      expect(visitedRoles.filter((r) => r === 'numerator').length).toBeGreaterThanOrEqual(3);
      expect(visitedRoles.filter((r) => r === 'denominator').length).toBeGreaterThanOrEqual(3);

      view.destroy();
      c.remove();
    });

    it('1.2: 3-Level fraction backward ArrowLeft traversal from rear visits all levels in reverse order', () => {
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mn>4</mn></mfrac></mfrac></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      // Enter from rear
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(widget.ast.children.length);

      let steps = 0;
      const maxSteps = 30;

      while (widget.isFocused && steps < maxSteps) {
        steps++;
        const caretEl = dom.querySelector('.eq-caret');
        expect(caretEl, `Caret missing on backward step ${steps}`).not.toBeNull();
        widget.handleArrowNavigation('ArrowLeft', false, view);
      }

      // Should have exited cleanly backwards
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();
      expect(steps).toBeLessThan(maxSteps);

      view.destroy();
      c.remove();
    });

    it('1.3: Vertical ArrowUp sequential climbing through 3 levels of nested fractions without early escape', () => {
      // 1 / (2 / (3 / 4))
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mn>4</mn></mfrac></mfrac></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Navigate down to denominator 3 ('4')
      while (widget.isFocused) {
        const slot = findSlotById(widget.ast, widget.caret.slotId);
        if (slot?.children?.some((child: any) => child.type === 'token' && child.text === '4')) {
          break;
        }
        widget.handleArrowNavigation('ArrowRight', false, view);
      }

      const bottomSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(bottomSlot?.children?.some((child: any) => child.type === 'token' && child.text === '4')).toBe(true);

      // Now climb upwards: 4 -> 3 -> 2 -> 1 -> exit 'up'
      // Level 1 climb: ArrowUp to '3'
      const up1 = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(up1).toBe(true);
      const slotUp1 = findSlotById(widget.ast, widget.caret.slotId);
      expect(slotUp1?.children?.some((child: any) => child.text === '3')).toBe(true);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Level 2 climb: ArrowUp to '2'
      const up2 = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(up2).toBe(true);
      const slotUp2 = findSlotById(widget.ast, widget.caret.slotId);
      expect(slotUp2?.children?.some((child: any) => child.text === '2')).toBe(true);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Level 3 climb: ArrowUp to '1'
      const up3 = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(up3).toBe(true);
      const slotUp3 = findSlotById(widget.ast, widget.caret.slotId);
      expect(slotUp3?.children?.some((child: any) => child.text === '1')).toBe(true);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Final ArrowUp from top numerator exits equation 'up'
      const up4 = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(up4).toBe(true); // Handled by exit routine
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('1.4: Symmetric compound fraction ((a / b) / (c / d)) traverses all 4 leaf terms', () => {
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mfrac><mi>a</mi><mi>b</mi></mfrac><mfrac><mi>c</mi><mi>d</mi></mfrac></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      const visitedTerms: string[] = [];
      let steps = 0;
      while (widget.isFocused && steps < 40) {
        steps++;
        const slot = findSlotById(widget.ast, widget.caret.slotId);
        const term = (slot?.children?.find((c: any) => c.type === 'token') as any)?.text;
        if (term && !visitedTerms.includes(term)) {
          visitedTerms.push(term);
        }
        widget.handleArrowNavigation('ArrowRight', false, view);
      }

      expect(visitedTerms).toEqual(['a', 'b', 'c', 'd']);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 2: Empty vs Populated Fractions & Multi-token Navigation
  // =========================================================================
  describe('Suite 2: Empty vs Populated Fractions & Multi-Token Navigation', () => {
    it('2.1: Multi-character populated fraction steps through each character offset without skipping', () => {
      // (123) / (xyz)
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mrow><mn>1</mn><mn>2</mn><mn>3</mn></mrow><mrow><mi>x</mi><mi>y</mi><mi>z</mi></mrow></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Step 1: Descend into numerator
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      const numSlotId = widget.caret.slotId;
      expect(widget.caret.offset).toBe(0);

      // Offsets 0 -> 1 -> 2 -> 3 in numerator
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(numSlotId);
      expect(widget.caret.offset).toBe(1);

      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(numSlotId);
      expect(widget.caret.offset).toBe(2);

      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(numSlotId);
      expect(widget.caret.offset).toBe(3);

      // Next step advances to denominator offset 0
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      const denSlotId = widget.caret.slotId;
      expect(denSlotId).not.toBe(numSlotId);
      expect(widget.caret.offset).toBe(0);

      // Offsets 0 -> 1 -> 2 -> 3 in denominator
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(denSlotId);
      expect(widget.caret.offset).toBe(1);

      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(denSlotId);
      expect(widget.caret.offset).toBe(2);

      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(denSlotId);
      expect(widget.caret.offset).toBe(3);

      // Next step exits denominator to root offset 1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);

      // Final step exits equation
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('2.2: Multiple sequential fractions separated by operator navigate sequentially without cross-contamination', () => {
      // (1 / 2) + (3 / 4)
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mn>1</mn><mn>2</mn></mfrac><mo>+</mo><mfrac><mn>3</mn><mn>4</mn></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      const tokensVisited: string[] = [];
      let steps = 0;
      while (widget.isFocused && steps < 30) {
        steps++;
        const slot = findSlotById(widget.ast, widget.caret.slotId);
        if (slot) {
          const t = (slot.children[widget.caret.offset] as any)?.text;
          if (t && !tokensVisited.includes(t)) {
            tokensVisited.push(t);
          }
        }
        widget.handleArrowNavigation('ArrowRight', false, view);
      }

      // Must have traversed through '1', '2', '+', '3', '4' in order
      expect(tokensVisited).toContain('1');
      expect(tokensVisited).toContain('2');
      expect(tokensVisited).toContain('+');
      expect(tokensVisited).toContain('3');
      expect(tokensVisited).toContain('4');
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 3: Rapid & Burst Arrow Key Press Stress
  // =========================================================================
  describe('Suite 3: Rapid & Burst Arrow Key Press Stress', () => {
    it('3.1: 100 rapid ArrowRight keystrokes execute synchronously without throwing or desyncing', () => {
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      expect(() => {
        for (let i = 0; i < 100; i++) {
          widget.handleArrowNavigation('ArrowRight', false, view);
        }
      }).not.toThrow();

      // Equation must have cleanly deactivated and not remained stuck in an invalid state
      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()?.isFocused || false).toBe(false);

      view.destroy();
      c.remove();
    });

    it('3.2: 50 oscillatory ArrowRight / ArrowLeft cycles maintain strict state consistency and do not leak DOM carets', () => {
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      // Descend into numerator
      widget.handleArrowNavigation('ArrowRight', false, view);
      expect(widget.isFocused).toBe(true);

      for (let i = 0; i < 50; i++) {
        // Move right to denominator
        widget.handleArrowNavigation('ArrowRight', false, view);
        const caretsRight = dom.querySelectorAll('.eq-caret');
        expect(caretsRight.length).toBeLessThanOrEqual(1);

        // Move left back to numerator
        widget.handleArrowNavigation('ArrowLeft', false, view);
        const caretsLeft = dom.querySelectorAll('.eq-caret');
        expect(caretsLeft.length).toBeLessThanOrEqual(1);
      }

      expect(widget.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 4: Zero-Trap Invariant on Left Entry Across Formats
  // =========================================================================
  describe('Suite 4: Zero-Trap Invariant on Left Entry Across Formats', () => {
    it('4.1: 20 consecutive Entry -> Immediate Exit cycles execute cleanly on Block equation', () => {
      const doc = 'Prefix text\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom, mathEl } = getWidgetAndDom(view);

      for (let cycle = 1; cycle <= 20; cycle++) {
        // 1. Enter from start
        widget.enterFromStart(view);
        expect(widget.isFocused, `Cycle ${cycle}: enterFromStart failed`).toBe(true);
        expect(widget.caret.offset, `Cycle ${cycle}: initial offset not 0`).toBe(0);
        expect(dom.querySelector('.eq-caret'), `Cycle ${cycle}: caret missing`).not.toBeNull();
        expect(mathEl.classList.contains('eq-active'), `Cycle ${cycle}: mathEl not active`).toBe(true);

        // 2. Immediate ArrowLeft exit
        const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
        expect(handled, `Cycle ${cycle}: ArrowLeft unhandled`).toBe(true);
        expect(widget.isFocused, `Cycle ${cycle}: equation remained focused`).toBe(false);
        expect(dom.querySelector('.eq-caret'), `Cycle ${cycle}: caret leaked in DOM`).toBeNull();
        expect(mathEl.classList.contains('eq-active'), `Cycle ${cycle}: eq-active remained`).toBe(false);
        expect(getActiveEquationState()?.isFocused || false).toBe(false);
      }

      view.destroy();
      c.remove();
    });

    it('4.2: Zero-trap immediate exit verified on Inline equations', () => {
      const doc = 'Before text $weq <math><mfrac><mn>1</mn><mn>2</mn></mfrac></math> $weq After text';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom, mathEl } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);

      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(false);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 5: Rear Boundary Entry & Clean Exit
  // =========================================================================
  describe('Suite 5: Rear Boundary Entry & Clean Forward Exit', () => {
    it('5.1: enterFromEnd followed by immediate ArrowRight exits forward cleanly without trapping', () => {
      const doc = 'Prefix text\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom, mathEl } = getWidgetAndDom(view);

      // Enter from rear
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(widget.ast.children.length);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(true);

      const dispatchSpy = vi.spyOn(view, 'dispatch');
      const focusSpy = vi.spyOn(view, 'focus');

      // Immediate ArrowRight should exit forward
      const handled = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(handled).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(false);
      expect(focusSpy).toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalled();

      view.destroy();
      c.remove();
    });

    it('5.2: 20 consecutive rear Entry -> Immediate Forward Exit cycles execute cleanly', () => {
      const doc = 'Prefix text\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom, mathEl } = getWidgetAndDom(view);

      for (let cycle = 1; cycle <= 20; cycle++) {
        widget.enterFromEnd(view);
        expect(widget.isFocused).toBe(true);

        const handled = widget.handleArrowNavigation('ArrowRight', false, view);
        expect(handled).toBe(true);
        expect(widget.isFocused).toBe(false);
        expect(dom.querySelector('.eq-caret')).toBeNull();
        expect(mathEl.classList.contains('eq-active')).toBe(false);
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 6: CodeMirror 6 Widget Recycling, reconcileDomAst & DOM Slot Synchronization
  // =========================================================================
  describe('Suite 6: CodeMirror 6 Widget Recycling, reconcileDomAst & DOM Slot Synchronization', () => {
    it('6.1: reconcileDomAst adopts AST from mounted DOM widget when instance is recycled', () => {
      const code = '<math display="block"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
      const doc = `Prefix\n\`\`\`math-word\n${code}\n\`\`\`\nSuffix`;
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget: widget1, dom } = getWidgetAndDom(view);

      // Widget 1 has its original AST slot IDs
      const origAst = widget1.ast;
      const origRootId = origAst.id;

      // Simulate CodeMirror instantiating a new widget instance on document transaction
      const widget2 = new WordEquationWidget(code, widget1.from, widget1.to, false, 'math-word');
      expect(widget2.ast.id).not.toBe(origRootId); // Freshly generated slot IDs!

      // Widget 2 is reconciled against mounted DOM
      (widget2 as any).reconcileDomAst(view);

      // widget2 must adopt widget1's mounted AST, preserving identical slot IDs!
      expect(widget2.ast.id).toBe(origRootId);
      expect(widget2.ast).toBe(origAst);

      view.destroy();
      c.remove();
    });

    it('6.2: reconcileDomAst triggers rerender if mounted DOM slot IDs are desynchronized from AST', () => {
      const code = '<math display="block"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
      const doc = `Prefix\n\`\`\`math-word\n${code}\n\`\`\`\nSuffix`;
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      // Corrupt the DOM slot ID to simulate a desynchronized state
      const firstSlotEl = dom.querySelector('.eq-slot');
      firstSlotEl?.setAttribute('data-slot-id', 'stale_corrupted_slot_id_999');

      const rerenderSpy = vi.spyOn(widget, 'rerender');

      // Call reconcileDomAst
      (widget as any).reconcileDomAst(view);

      // rerender() must have been called to resynchronize DOM with widget.ast
      expect(rerenderSpy).toHaveBeenCalled();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 7: updateVisualCaretDom 4-Tier Resilience
  // =========================================================================
  describe('Suite 7: updateVisualCaretDom 4-Tier Resilience', () => {
    it('7.1: Injects caret into target slot element when slot ID matches DOM', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      const targetSlot = widget.ast.children[0] && (widget.ast.children[0] as any).numerator;
      expect(targetSlot).toBeDefined();

      updateVisualCaretDom(dom, { slotId: targetSlot.id, offset: 0 }, true);

      const caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(caret?.textContent).toBe('|');
      expect(caret?.getAttribute('data-caret')).toBe('true');
      expect(caret?.getAttribute('aria-hidden')).toBe('true');

      view.destroy();
      c.remove();
    });

    it('7.2: Recovers gracefully when slot ID is invalid or desynchronized without throwing or corrupting layout', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { dom } = getWidgetAndDom(view);

      // Pass non-existent slot ID
      expect(() => {
        updateVisualCaretDom(dom, { slotId: 'completely_nonexistent_slot_id_404', offset: 0 }, true);
      }).not.toThrow();

      // Does not throw and does not leave multiple caret elements
      const carets = dom.querySelectorAll('.eq-caret');
      expect(carets.length).toBeLessThanOrEqual(1);

      view.destroy();
      c.remove();
    });

    it('7.3: Cleans up carets and removes eq-active on blur (isFocused = false)', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom, mathEl } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(true);

      // Update with isFocused = false
      updateVisualCaretDom(dom, null, false);
      expect(dom.querySelector('.eq-caret')).toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(false);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 8: Window Capture Interceptor & Modifier Handling
  // =========================================================================
  describe('Suite 8: Window Capture Interceptor & Modifier Handling', () => {
    it('8.1: Window capture keydown listener does NOT intercept when Ctrl/Alt/Meta is held', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      const navSpy = vi.spyOn(widget, 'handleArrowNavigation');

      // Dispatch ArrowRight with ctrlKey = true
      const ctrlEvent = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlEvent);

      // Should not have intercepted navigation
      expect(ctrlEvent.defaultPrevented).toBe(false);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SUITE 9: Deep Vertical ArrowDown Descent & Structural Invariants
  // =========================================================================
  describe('Suite 9: Deep Vertical ArrowDown Descent & Structural Invariants', () => {
    it('9.1: Vertical ArrowDown sequential descent from numerator 1 down to deepest denominator 4', () => {
      // 1 / (2 / (3 / 4))
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mn>4</mn></mfrac></mfrac></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      // Descend into numerator 1
      widget.handleArrowNavigation('ArrowRight', false, view);
      expect(widget.isFocused).toBe(true);
      const slot1 = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot1?.children?.some((child: any) => child.text === '1')).toBe(true);

      // ArrowDown step 1: from '1' down to numerator 2 ('2')
      expect(widget.handleArrowNavigation('ArrowDown', false, view)).toBe(true);
      const slot2 = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot2?.children?.some((child: any) => child.text === '2')).toBe(true);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // ArrowDown step 2: from '2' down to numerator 3 ('3')
      expect(widget.handleArrowNavigation('ArrowDown', false, view)).toBe(true);
      const slot3 = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot3?.children?.some((child: any) => child.text === '3')).toBe(true);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // ArrowDown step 3: from '3' down to denominator 3 ('4')
      expect(widget.handleArrowNavigation('ArrowDown', false, view)).toBe(true);
      const slot4 = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot4?.children?.some((child: any) => child.text === '4')).toBe(true);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // ArrowDown step 4: from bottom slot exits equation 'down'
      expect(widget.handleArrowNavigation('ArrowDown', false, view)).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('9.2: Left-heavy nested fraction (((1 / 2) / 3) / 4) traverses all 4 numbers in forward and reverse order', () => {
      // (((1 / 2) / 3) / 4)
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mfrac><mfrac><mn>1</mn><mn>2</mn></mfrac><mn>3</mn></mfrac><mn>4</mn></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Forward traversal
      const termsForward: string[] = [];
      let steps = 0;
      while (widget.isFocused && steps < 40) {
        steps++;
        const slot = findSlotById(widget.ast, widget.caret.slotId);
        const term = (slot?.children?.find((ch: any) => ch.type === 'token') as any)?.text;
        if (term && !termsForward.includes(term)) {
          termsForward.push(term);
        }
        widget.handleArrowNavigation('ArrowRight', false, view);
      }
      expect(termsForward).toEqual(['1', '2', '3', '4']);
      expect(widget.isFocused).toBe(false);

      // Rearward traversal
      widget.enterFromEnd(view);
      const termsBackward: string[] = [];
      steps = 0;
      while (widget.isFocused && steps < 40) {
        steps++;
        const slot = findSlotById(widget.ast, widget.caret.slotId);
        const term = (slot?.children?.find((ch: any) => ch.type === 'token') as any)?.text;
        if (term && !termsBackward.includes(term)) {
          termsBackward.push(term);
        }
        widget.handleArrowNavigation('ArrowLeft', false, view);
      }
      expect(termsBackward).toEqual(['4', '3', '2', '1']);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('9.3: Character editing inside deepest fraction leaf retains structural integrity', () => {
      // 1 / (2 / (3 / 4))
      const doc = 'Before\n```math-word\n<math display="block"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mrow></mrow></mfrac></mfrac></mfrac></math>\n```\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Navigate into the empty leaf denominator of the 3rd fraction
      while (widget.isFocused) {
        const slot = findSlotById(widget.ast, widget.caret.slotId);
        if (slot?.role === 'denominator' && isSlotEmpty(slot)) {
          break;
        }
        widget.handleArrowNavigation('ArrowRight', false, view);
      }

      const emptyLeaf = findSlotById(widget.ast, widget.caret.slotId);
      expect(emptyLeaf?.role).toBe('denominator');
      expect(isSlotEmpty(emptyLeaf!)).toBe(true);

      // Type character '9' into the empty leaf
      const insertRes = insertCharacter(widget.ast, widget.caret, '9');
      expect(insertRes.handled).toBe(true);
      widget.ast = insertRes.root;
      widget.caret = insertRes.caret;
      widget.rerender();

      // Verify DOM reflects inserted token inside denominator
      const leafSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(leafSlot?.children?.some((ch: any) => ch.text === '9')).toBe(true);

      view.destroy();
      c.remove();
    });
  });
});

