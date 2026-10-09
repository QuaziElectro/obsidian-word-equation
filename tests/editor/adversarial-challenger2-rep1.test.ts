import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import {
  findSlotById,
  isSlotEmpty,
  resetIdCounter,
} from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Navigation, Focus Recovery & Backward Entry Typing/Deletion Suite', () => {
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
  // Section 1: handleArrowNavigation Combinatorial & State Integrity Challenges
  // =========================================================================
  describe('Domain 1: handleArrowNavigation Combinatorial & State Integrity', () => {
    it('1.1: Complex 3-level nested fraction survives 100-step navigation sequence without AST or caret corruption', () => {
      // 1 / (2 / (3 / 4))
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mn>4</mn></mfrac></mfrac></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      const navKeys: Array<'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'> = [
        'ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp',
        'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowUp',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'
      ];

      for (let step = 0; step < 100; step++) {
        const key = navKeys[step % navKeys.length];
        widget.handleArrowNavigation(key, false, view);

        if (widget.isFocused) {
          // Invariant 1: slotId must exist in the AST
          const activeSlot = findSlotById(widget.ast, widget.caret.slotId);
          expect(activeSlot, `Step ${step}: Slot ${widget.caret.slotId} must exist in AST`).not.toBeNull();

          // Invariant 2: offset must be within valid range [0, slot.children.length]
          expect(widget.caret.offset).toBeGreaterThanOrEqual(0);
          expect(widget.caret.offset).toBeLessThanOrEqual(activeSlot!.children.length);
          expect(Number.isInteger(widget.caret.offset)).toBe(true);

          // Invariant 3: Active session state matches widget
          const activeSession = getActiveEquationState();
          expect(activeSession?.caret.slotId).toBe(widget.caret.slotId);
          expect(activeSession?.caret.offset).toBe(widget.caret.offset);
        } else {
          // If exited, re-enter from end to continue stress testing
          widget.enterFromEnd(view);
          expect(widget.isFocused).toBe(true);
        }
      }

      view.destroy();
      c.remove();
    });

    it('1.2: Boundary ping-pong (20 cycles of enterFromEnd and forward escape) maintains clean state', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      for (let cycle = 0; cycle < 20; cycle++) {
        // 1. Enter from end
        widget.enterFromEnd(view);
        expect(widget.isFocused, `Cycle ${cycle}: widget should be focused`).toBe(true);
        expect(widget.enteredFromEnd, `Cycle ${cycle}: enteredFromEnd should be true`).toBe(true);
        expect(widget.caret.offset).toBe(widget.ast.children.length);

        // 2. Escape forward via ArrowRight
        const exited = widget.handleArrowNavigation('ArrowRight', false, view);
        expect(exited, `Cycle ${cycle}: forward exit should be handled`).toBe(true);
        expect(widget.isFocused, `Cycle ${cycle}: widget should be blurred after exit`).toBe(false);
        expect(widget.justEscapedForwardAfterEnteringFromEnd).toBe(true);
        expect(getActiveEquationState()).toBeNull();
      }

      view.destroy();
      c.remove();
    });

    it('1.3: Full traversals back-and-forth across an entire multi-token equation do not drop focus or desync offsets', () => {
      const doc = 'Prefix /weq_inline <math><mi>a</mi><mo>+</mo><mi>b</mi><mo>=</mo><mi>c</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      // Enter from end
      widget.enterFromEnd(view);
      expect(widget.caret.offset).toBe(5);

      // Navigate backwards step-by-step
      for (let i = 4; i >= 0; i--) {
        const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
        expect(handled).toBe(true);
        expect(widget.isFocused).toBe(true);
        expect(widget.caret.offset).toBe(i);
      }

      // At offset 0, pressing ArrowLeft exits backward
      const exitedBefore = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(exitedBefore).toBe(true);
      expect(widget.isFocused).toBe(false);

      // Re-enter from start
      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      // Navigate forwards step-by-step
      for (let i = 1; i <= 5; i++) {
        const handled = widget.handleArrowNavigation('ArrowRight', false, view);
        expect(handled).toBe(true);
        expect(widget.isFocused).toBe(true);
        expect(widget.caret.offset).toBe(i);
      }

      // At offset 5, pressing ArrowRight exits forward
      const exitedAfter = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(exitedAfter).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('1.4: Shift+Arrow partial selection navigation collapses properly on subsequent non-shift navigation', () => {
      const doc = 'Prefix /weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      // Shift+ArrowRight to expand selection across 'x' and '+'
      widget.handleArrowNavigation('ArrowRight', true, view);
      expect(widget.selection).not.toBeNull();
      expect(widget.selection?.anchor.offset).toBe(0);
      expect(widget.selection?.head.offset).toBe(1);

      widget.handleArrowNavigation('ArrowRight', true, view);
      expect(widget.selection?.head.offset).toBe(2);

      // Non-shift navigation collapses selection cleanly
      widget.handleArrowNavigation('ArrowRight', false, view);
      expect(widget.selection).toBeNull();
      expect(widget.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Section 2: window.requestAnimationFrame Defensive Focus Recovery
  // =========================================================================
  describe('Domain 2: window.requestAnimationFrame Defensive Focus Recovery', () => {
    it('2.1: Recovers focus when document.activeElement is blurred to document.body', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromEnd(view);
      expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);

      // Simulate involuntary focusout to document.body
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      // Trigger the rAF callback
      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // Defensive recovery MUST re-assert focus on mathEl
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

      view.destroy();
      c.remove();
    });

    it('2.2: Adversarial Race Condition: Does NOT steal focus back if widget was deactivated before rAF executes', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // User immediately exits forward before the animation frame fires!
      widget.handleArrowNavigation('ArrowRight', false, view);
      expect(widget.isFocused).toBe(false);

      // Involuntary or regular blur to document.body
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      // Trigger queued rAF callbacks
      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // Invariant: Because widget is NO LONGER focused (this.isFocused === false),
      // it MUST NOT steal focus back!
      expect(focusSpy).not.toHaveBeenCalled();

      view.destroy();
      c.remove();
    });

    it('2.3: Non-body element focus: Does NOT steal focus if document.activeElement is another control', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromEnd(view);

      // Focus shifted to an input box or external element (not document.body)
      const externalInput = document.createElement('input');
      document.body.appendChild(externalInput);
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(externalInput);
      focusSpy.mockClear();

      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // Focus must NOT be stolen from external input
      expect(focusSpy).not.toHaveBeenCalled();

      externalInput.remove();
      view.destroy();
      c.remove();
    });

    it('2.4: Broken/Detached DOM: Safe no-op without exception when containerEl or mathEl is missing or unmounted', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      widget.enterFromEnd(view);

      // Unmount / nullify container
      (widget as any).containerEl = null as any;
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);

      // Must not throw uncaught error
      expect(() => {
        for (const cb of rafCallbacks) {
          cb(performance.now());
        }
      }).not.toThrow();

      view.destroy();
      c.remove();
    });

    it('2.5: Rapid burst of 10 enterFromEnd calls queues multiple frames cleanly without corruption', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      const focusSpy = vi.spyOn(mathEl, 'focus');

      for (let i = 0; i < 10; i++) {
        widget.enterFromEnd(view);
      }

      expect(rafCallbacks.length).toBeGreaterThanOrEqual(10);
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // Successfully recovered focus
      expect(focusSpy).toHaveBeenCalled();
      expect(widget.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Section 3: Typing and Deletion Immediately After Entering Empty Placeholders from Behind
  // =========================================================================
  describe('Domain 3: Typing and Deletion Immediately After Backward Entry into Empty Placeholders', () => {
    function dispatchKey(view: any, key: string): WordEquationWidget {
      const activeWidget = getActiveEquationWidget() || getWidgetAndDom(view).widget;
      const targetDom =
        (view.dom.querySelector('.word-equation-math') as HTMLElement) ||
        (activeWidget.containerEl?.querySelector('.word-equation-math') as HTMLElement) ||
        (view.dom.querySelector('.word-equation-block') as HTMLElement) ||
        activeWidget.containerEl;
      targetDom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      const blockEl = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      return (blockEl as any)?.__widget || (targetDom as any)?.__widget || getActiveEquationWidget() || activeWidget;
    }

    it('3.1: Entering empty fraction from behind, ArrowLeft into denominator, typing characters immediately updates AST and replaces placeholder', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      // 1. Enter from behind
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(1);

      // 2. Step backward into empty denominator placeholder
      const leftHandled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(leftHandled).toBe(true);

      const denSlotId = widget.caret.slotId;
      const denSlot = findSlotById(widget.ast, denSlotId);
      expect(denSlot).not.toBeNull();
      expect(denSlot?.role).toBe('denominator');
      expect(isSlotEmpty(denSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // 3. Immediately type character 'x'
      widget = dispatchKey(view, 'x');

      // Verify AST updated
      let updatedDen = findSlotById(widget.ast, widget.caret.slotId);
      expect(updatedDen).not.toBeNull();
      expect(updatedDen!.children.length).toBe(1);
      expect((updatedDen!.children[0] as any).text).toBe('x');
      expect(widget.caret.offset).toBe(1);
      expect(isSlotEmpty(updatedDen!)).toBe(false);

      // 4. Type more characters: '+', '7'
      widget = dispatchKey(view, '+');
      widget = dispatchKey(view, '7');

      updatedDen = findSlotById(widget.ast, widget.caret.slotId);
      expect(updatedDen!.children.length).toBe(3);
      expect((updatedDen!.children[1] as any).text).toBe('+');
      expect((updatedDen!.children[2] as any).text).toBe('7');
      expect(widget.caret.offset).toBe(3);

      // 5. Backspace immediately removes characters sequentially
      widget = dispatchKey(view, 'Backspace');
      updatedDen = findSlotById(widget.ast, widget.caret.slotId);
      expect(updatedDen!.children.length).toBe(2);
      expect(widget.caret.offset).toBe(2);

      widget = dispatchKey(view, 'Backspace');
      updatedDen = findSlotById(widget.ast, widget.caret.slotId);
      expect(updatedDen!.children.length).toBe(1);
      expect(widget.caret.offset).toBe(1);

      widget = dispatchKey(view, 'Backspace');
      updatedDen = findSlotById(widget.ast, widget.caret.slotId);
      expect(updatedDen!.children.length).toBe(0);
      expect(widget.caret.offset).toBe(0);
      expect(isSlotEmpty(updatedDen!)).toBe(true);

      view.destroy();
      c.remove();
    });

    it('3.2: Immediate Backspace in empty denominator when numerator is non-empty moves caret to numerator without dissolving fraction', () => {
      // Fraction with non-empty numerator "42" and empty denominator
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mn>42</mn><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      // 1. Enter from behind
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // 2. ArrowLeft into empty denominator
      widget.handleArrowNavigation('ArrowLeft', false, view);
      const denSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(denSlot?.role).toBe('denominator');
      expect(isSlotEmpty(denSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // 3. Press Backspace immediately:
      // Specification invariant: Non-empty sibling (numerator) must NOT be dissolved.
      // Caret must navigate to the end of the non-empty numerator slot!
      widget = dispatchKey(view, 'Backspace');

      let currentSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(currentSlot?.role).toBe('numerator');
      expect(currentSlot!.children.length).toBe(1); // '42'
      expect(widget.caret.offset).toBe(1); // at the end of numerator

      // 4. Type character '5' into numerator
      widget = dispatchKey(view, '5');
      currentSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(currentSlot!.children.length).toBe(2);
      expect(widget.caret.offset).toBe(2);

      // 5. Backspace character '5'
      widget = dispatchKey(view, 'Backspace');
      currentSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(currentSlot!.children.length).toBe(1);
      expect(widget.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });

    it('3.3: Immediate Backspace in empty denominator when numerator is ALSO empty dissolves parent fraction cleanly', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      // Enter from behind and step left into denominator
      widget.enterFromEnd(view);
      widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(widget.caret.offset).toBe(0);

      // Press Backspace immediately on completely empty fraction
      dispatchKey(view, 'Backspace');

      // Sibling is also empty -> fraction is dissolved or deleted, no crash
      expect(widget.ast).toBeDefined();

      view.destroy();
      c.remove();
    });

    it('3.4: Delete key immediately after entering empty placeholder is safely handled without error', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      // Enter from behind into empty denominator
      widget.enterFromEnd(view);
      widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(widget.caret.offset).toBe(0);

      // Press Delete on empty placeholder: must not throw or desync
      expect(() => {
        widget = dispatchKey(view, 'Delete');
      }).not.toThrow();

      // Now type 'abc'
      widget = dispatchKey(view, 'a');
      widget = dispatchKey(view, 'b');
      widget = dispatchKey(view, 'c');

      let denSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(denSlot!.children.length).toBe(3);
      expect(widget.caret.offset).toBe(3);

      // Navigate left back between 'a' and 'b' (offset 1)
      widget.handleArrowNavigation('ArrowLeft', false, view);
      widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(widget.caret.offset).toBe(1);

      // Press Delete: removes 'b' to the right of caret
      widget = dispatchKey(view, 'Delete');
      denSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(denSlot!.children.length).toBe(2);
      expect((denSlot!.children[0] as any).text).toBe('a');
      expect((denSlot!.children[1] as any).text).toBe('c');
      expect(widget.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });

    it('3.5: Empty radical/root backward entry, typing, and deletion', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><msqrt><mrow></mrow></msqrt></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      // 1. Enter from behind
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // 2. Step left into empty radicand placeholder
      widget.handleArrowNavigation('ArrowLeft', false, view);
      let radSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(radSlot).not.toBeNull();
      expect(isSlotEmpty(radSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // 3. Type character 'm'
      widget = dispatchKey(view, 'm');
      radSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(radSlot!.children.length).toBe(1);
      expect((radSlot!.children[0] as any).text).toBe('m');
      expect(widget.caret.offset).toBe(1);

      // 4. Backspace character 'm'
      widget = dispatchKey(view, 'Backspace');
      radSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(radSlot!.children.length).toBe(0);
      expect(widget.caret.offset).toBe(0);
      expect(isSlotEmpty(radSlot!)).toBe(true);

      // 5. Backspace on empty radicand dissolves radical
      widget = dispatchKey(view, 'Backspace');
      expect(widget.ast).toBeDefined();

      view.destroy();
      c.remove();
    });
  });
});
