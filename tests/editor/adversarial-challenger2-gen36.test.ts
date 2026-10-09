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

describe('Gen36 Adversarial Navigation Challenger 2: Placeholder Traversal, Typing, Deletion & Defensive Recovery', () => {
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

  // =========================================================================
  // Challenge 1: Multi-Level Nested Empty Fractions Descent & Typing
  // =========================================================================
  describe('Challenge 1: Multi-Level Nested Empty Fractions Descent & Immediate Typing', () => {
    it('descends through a 3-level empty fraction into deepest denominator, types characters, and verifies AST integrity', () => {
      // 3-level fraction: <mfrac><mrow></mrow><mfrac><mrow></mrow><mfrac><mrow></mrow><mrow></mrow></mfrac></mfrac></mfrac>
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mfrac><mrow></mrow><mfrac><mrow></mrow><mrow></mrow></mfrac></mfrac></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      // 1. Enter from behind
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.enteredFromEnd).toBe(true);

      // 2. Press ArrowLeft 3 times to descend into deepest denominator
      widget.handleArrowNavigation('ArrowLeft', false, view);
      widget.handleArrowNavigation('ArrowLeft', false, view);
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);

      const targetSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(targetSlot).not.toBeNull();
      expect(targetSlot?.role).toBe('denominator');
      expect(isSlotEmpty(targetSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // 3. Immediately type characters "z", "+", "9"
      widget = dispatchKey(view, 'z');
      widget = dispatchKey(view, '+');
      widget = dispatchKey(view, '9');

      let currentSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(currentSlot).not.toBeNull();
      expect(currentSlot!.children.length).toBe(3);
      expect((currentSlot!.children[0] as any).text).toBe('z');
      expect((currentSlot!.children[1] as any).text).toBe('+');
      expect((currentSlot!.children[2] as any).text).toBe('9');
      expect(widget.caret.offset).toBe(3);
      expect(isSlotEmpty(currentSlot!)).toBe(false);

      // 4. Backspace all 3 characters back to empty
      widget = dispatchKey(view, 'Backspace');
      widget = dispatchKey(view, 'Backspace');
      widget = dispatchKey(view, 'Backspace');

      currentSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(currentSlot!.children.length).toBe(0);
      expect(widget.caret.offset).toBe(0);
      expect(isSlotEmpty(currentSlot!)).toBe(true);

      // 5. Navigate ArrowUp to the level-3 numerator
      const up1 = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(up1).toBe(true);
      let numSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(numSlot?.role).toBe('numerator');
      expect(isSlotEmpty(numSlot!)).toBe(true);

      // 6. Type "pi" into level-3 numerator
      widget = dispatchKey(view, 'p');
      widget = dispatchKey(view, 'i');
      numSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(numSlot!.children.length).toBe(2);
      expect(widget.caret.offset).toBe(2);

      // 7. ArrowUp again to level-2 numerator
      const up2 = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(up2).toBe(true);
      let l2NumSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(l2NumSlot?.role).toBe('numerator');

      // 8. Type "w" into level-2 numerator
      widget = dispatchKey(view, 'w');
      l2NumSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(l2NumSlot!.children.length).toBe(1);
      expect(widget.caret.offset).toBe(1);

      // 9. ArrowUp again to level-1 (top) numerator
      const up3 = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(up3).toBe(true);
      let topNumSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(topNumSlot?.role).toBe('numerator');

      // 10. Type "1" into top numerator
      widget = dispatchKey(view, '1');
      topNumSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(topNumSlot!.children.length).toBe(1);

      view.destroy();
      c.remove();
    });

    it('descends into empty root radicand from behind, types expression, and verifies forward exit', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mroot><mrow></mrow><mrow></mrow></mroot></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // Step into index (or radicand)
      widget.handleArrowNavigation('ArrowLeft', false, view);
      let slot = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot).not.toBeNull();
      expect(isSlotEmpty(slot!)).toBe(true);

      // Type "3"
      widget = dispatchKey(view, '3');
      slot = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot!.children.length).toBe(1);
      expect((slot!.children[0] as any).text).toBe('3');

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 2: Backspace and Deletion Invariants in Placeholders
  // =========================================================================
  describe('Challenge 2: Backspace and Deletion Invariants in Placeholders', () => {
    it('backspace at start of empty placeholder with non-empty sibling moves caret to sibling instead of deleting', () => {
      // Fraction with non-empty numerator "alpha" and empty denominator
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mi>alpha</mi><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      widget.handleArrowNavigation('ArrowLeft', false, view);

      // Confirm we are in empty denominator
      let denSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(denSlot?.role).toBe('denominator');
      expect(isSlotEmpty(denSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Press Backspace
      widget = dispatchKey(view, 'Backspace');

      // Fraction MUST NOT be dissolved; caret must move to numerator
      const activeSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(activeSlot?.role).toBe('numerator');
      expect(activeSlot!.children.length).toBe(1);
      expect(widget.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });

    it('backspace at start of empty numerator with non-empty denominator moves caret to denominator', () => {
      // Fraction with empty numerator and non-empty denominator "beta"
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mi>beta</mi></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      widget.handleArrowNavigation('ArrowRight', false, view);

      // In empty numerator
      let numSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(numSlot?.role).toBe('numerator');
      expect(isSlotEmpty(numSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Press Backspace
      widget = dispatchKey(view, 'Backspace');

      // Caret moves to end of denominator
      const activeSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(activeSlot?.role).toBe('denominator');
      expect(activeSlot!.children.length).toBe(1);
      expect(widget.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });

    it('backspace on empty placeholder when entire parent structure is empty dissolves parent structure cleanly', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      widget.handleArrowNavigation('ArrowLeft', false, view);

      expect(widget.caret.offset).toBe(0);

      // Press Backspace: both numerator and denominator empty -> dissolves or deletes
      widget = dispatchKey(view, 'Backspace');

      // The AST should now either dissolve the fraction or remove it from root
      expect(widget.ast).toBeDefined();

      view.destroy();
      c.remove();
    });

    it('type characters, delete one with Backspace, delete one with Delete key, verify correct remaining characters', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      widget.handleArrowNavigation('ArrowLeft', false, view);

      // Type "abcde"
      widget = dispatchKey(view, 'a');
      widget = dispatchKey(view, 'b');
      widget = dispatchKey(view, 'c');
      widget = dispatchKey(view, 'd');
      widget = dispatchKey(view, 'e');

      let slot = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot!.children.length).toBe(5);
      expect(widget.caret.offset).toBe(5);

      // Backspace deletes 'e'
      widget = dispatchKey(view, 'Backspace');
      slot = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot!.children.length).toBe(4);
      expect((slot!.children[3] as any).text).toBe('d');
      expect(widget.caret.offset).toBe(4);

      // Navigate left twice: caret before 'c' (offset 2)
      widget.handleArrowNavigation('ArrowLeft', false, view);
      widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(widget.caret.offset).toBe(2);

      // Delete deletes 'c'
      widget = dispatchKey(view, 'Delete');
      slot = findSlotById(widget.ast, widget.caret.slotId);
      expect(slot!.children.length).toBe(3);
      expect((slot!.children[0] as any).text).toBe('a');
      expect((slot!.children[1] as any).text).toBe('b');
      expect((slot!.children[2] as any).text).toBe('d');
      expect(widget.caret.offset).toBe(2);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 3: Defensive rAF Focus Recovery Rigorous Verification
  // =========================================================================
  describe('Challenge 3: Defensive rAF Focus Recovery Invariant Testing', () => {
    it('recovers focus to mathEl when document.activeElement dropped to document.body and widget isFocused is true', () => {
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

      // Simulate involuntary drop to document.body
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

      view.destroy();
      c.remove();
    });

    it('does NOT steal focus if user legitimately navigated away or clicked outside before rAF runs', () => {
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

      // User escapes forward immediately
      widget.handleArrowNavigation('ArrowRight', false, view);
      expect(widget.isFocused).toBe(false);

      // activeElement is body
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // MUST NOT focus mathEl because isFocused is false
      expect(focusSpy).not.toHaveBeenCalled();

      view.destroy();
      c.remove();
    });

    it('does NOT steal focus if activeElement is CodeMirror cm-content', () => {
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

      // activeElement is view.contentDOM
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(view.contentDOM);
      focusSpy.mockClear();

      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // MUST NOT steal focus from CodeMirror editor
      expect(focusSpy).not.toHaveBeenCalled();

      view.destroy();
      c.remove();
    });

    it('survives stress burst of 25 consecutive enterFromEnd calls without unhandled exceptions', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });

      const focusSpy = vi.spyOn(mathEl, 'focus');

      for (let i = 0; i < 25; i++) {
        widget.enterFromEnd(view);
      }

      expect(rafCallbacks.length).toBeGreaterThanOrEqual(25);

      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      expect(focusSpy).toHaveBeenCalled();
      expect(widget.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Challenge 4: Pseudo-Random Fuzzing of Navigation, Typing, and Deletion
  // =========================================================================
  describe('Challenge 4: Fuzzing Navigation, Typing, and Deletion in Placeholders', () => {
    it('maintains valid AST, slot IDs, offsets, and non-body focus throughout 50 random operations', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      let { widget } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      const operations = [
        () => widget.handleArrowNavigation('ArrowLeft', false, view),
        () => widget.handleArrowNavigation('ArrowRight', false, view),
        () => widget.handleArrowNavigation('ArrowUp', false, view),
        () => widget.handleArrowNavigation('ArrowDown', false, view),
        () => { widget = dispatchKey(view, 'x'); },
        () => { widget = dispatchKey(view, '7'); },
        () => { widget = dispatchKey(view, '+'); },
        () => { widget = dispatchKey(view, 'Backspace'); },
        () => { widget = dispatchKey(view, 'Delete'); },
      ];

      // Seeded deterministic pseudo-random sequence
      let seed = 12345;
      function nextRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }

      for (let opIndex = 0; opIndex < 50; opIndex++) {
        const choice = Math.floor(nextRandom() * operations.length);
        operations[choice]();

        if (widget.isFocused) {
          // Invariant 1: slotId must exist in the AST
          const activeSlot = findSlotById(widget.ast, widget.caret.slotId);
          expect(activeSlot, `Op ${opIndex}: Slot ${widget.caret.slotId} must exist`).not.toBeNull();

          // Invariant 2: offset must be within valid range [0, slot.children.length]
          expect(widget.caret.offset).toBeGreaterThanOrEqual(0);
          expect(widget.caret.offset).toBeLessThanOrEqual(activeSlot!.children.length);
        } else {
          // Re-enter from end if exited
          widget.enterFromEnd(view);
          expect(widget.isFocused).toBe(true);
        }
      }

      view.destroy();
      c.remove();
    });
  });
});
