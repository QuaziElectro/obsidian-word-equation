import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import {
  createSlot,
  createToken,
  createFraction,
  createRoot,
  createRadical,
  createMatrix,
  updateParentPointers,
  resetIdCounter,
  findSlotById,
  isSlotEmpty,
} from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger Gen37: Edge-Case Reverse Entry & Boundary Escapes', () => {
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
  // Mission Item 1: Reverse Entry into Empty Fractions, Roots, Multi-level Fractions, Matrices
  // =========================================================================
  describe('Mission 1: Reverse Entry into Empty Structural Boxes', () => {
    it('1.1: Reverse entry into empty fraction descends into denominator placeholder without body blur', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);
      const dispatchSpy = vi.spyOn(view, 'dispatch');

      // 1. Enter from trailing edge
      widget.enterFromEnd(view);

      // Invariants: focused, activeElement is mathEl, no CM selection dispatched
      expect(widget.isFocused).toBe(true);
      expect(widget.enteredFromEnd).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      expect(document.activeElement).not.toBe(document.body);
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ selection: expect.anything() }));

      // 2. Press ArrowLeft: descends into denominator placeholder
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);
      expect(widget.isFocused).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      expect(document.activeElement).not.toBe(document.body);

      const targetSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(targetSlot).not.toBeNull();
      expect(targetSlot?.role).toBe('denominator');
      expect(isSlotEmpty(targetSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // 3. ArrowLeft from empty denominator descends into numerator placeholder
      const step2 = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(step2).toBe(true);
      const numSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(numSlot?.role).toBe('numerator');
      expect(isSlotEmpty(numSlot!)).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      view.destroy();
      c.remove();
    });

    it('1.2: Reverse entry into empty radical (msqrt) descends into radicand placeholder without body blur', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><msqrt><mrow></mrow></msqrt></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);
      const dispatchSpy = vi.spyOn(view, 'dispatch');

      widget.enterFromEnd(view);

      expect(widget.isFocused).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      expect(document.activeElement).not.toBe(document.body);
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ selection: expect.anything() }));

      // ArrowLeft descends into radicand
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);
      expect(widget.isFocused).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      const radSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(radSlot).not.toBeNull();
      expect(radSlot?.role).toBe('radicand');
      expect(isSlotEmpty(radSlot!)).toBe(true);
      expect(widget.caret.offset).toBe(0);

      view.destroy();
      c.remove();
    });

    it('1.3: Reverse entry into root with index (mroot) descends into index then radicand', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mroot><mrow></mrow><mrow></mrow></mroot></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      // ArrowLeft step 1: descends into index (last child slot of mroot)
      const step1 = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(step1).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      const indexSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(indexSlot?.role).toBe('index');
      expect(isSlotEmpty(indexSlot!)).toBe(true);

      // ArrowLeft step 2: moves to radicand (first child slot of mroot)
      const step2 = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(step2).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      const radSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(radSlot?.role).toBe('radicand');
      expect(isSlotEmpty(radSlot!)).toBe(true);

      view.destroy();
      c.remove();
    });

    it('1.4: Reverse entry into multi-level fraction sequentially traverses each nested level', () => {
      // 1 / (2 / 3)
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow><mn>1</mn></mrow><mrow><mfrac><mrow><mn>2</mn></mrow><mrow><mn>3</mn></mrow></mfrac></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      // Step 1: ArrowLeft descends into outer denominator (after inner fraction)
      let nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      // Step 2: ArrowLeft descends into inner denominator ('3')
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      let curSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(curSlot?.role).toBe('denominator');
      expect((curSlot?.children[0] as any)?.text).toBe('3');

      // Step 3: ArrowLeft steps before '3' in inner denominator
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Step 4: ArrowLeft moves to inner numerator ('2')
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      curSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(curSlot?.role).toBe('numerator');
      expect((curSlot?.children[0] as any)?.text).toBe('2');

      // Step 5: ArrowLeft steps before '2'
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Step 6: ArrowLeft exits inner fraction into outer denominator at offset 0
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);

      // Step 7: ArrowLeft moves to outer numerator ('1')
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      curSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(curSlot?.role).toBe('numerator');
      expect((curSlot?.children[0] as any)?.text).toBe('1');

      // Invariant: activeElement NEVER dropped to body throughout full multi-level traversal
      expect(document.activeElement).toBe(mathEl);
      expect(document.activeElement).not.toBe(document.body);

      view.destroy();
      c.remove();
    });

    it('1.5: Reverse entry into matrix (mtable) descends into bottom-right cell and traverses cells backward', () => {
      // 2x2 matrix: [[empty, empty], [empty, empty]]
      const doc = 'Line 1\n```math-word\n<math display="block"><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(document.activeElement).toBe(mathEl);

      // ArrowLeft step 1: descends into last cell (row 1, col 1)
      let nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      let curSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(curSlot?.role).toBe('cell');

      // ArrowLeft step 2: moves to previous sibling cell (row 1, col 0)
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      curSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(curSlot?.role).toBe('cell');

      // ArrowLeft step 3: moves to previous sibling cell (row 0, col 1)
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      curSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(curSlot?.role).toBe('cell');

      // ArrowLeft step 4: moves to first cell (row 0, col 0)
      nav = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(nav).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      curSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(curSlot?.role).toBe('cell');

      // Invariant: activeElement remains mathEl
      expect(document.activeElement).not.toBe(document.body);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Mission Item 2: ArrowLeft from Markdown Behind Equation Enters and Descends
  // =========================================================================
  describe('Mission 2: CodeMirror Markdown Boundary Entry via ArrowLeft', () => {
    it('2.1: ArrowLeft from Markdown text behind equation enters equation and subsequent ArrowLeft descends without body blur', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3 is here';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      // Position CodeMirror cursor right after the equation block
      // In block mode, next line starts at widget.to + 1 (or line 3 start)
      const afterLine = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: afterLine.from } });
      expect(view.state.selection.main.anchor).toBe(afterLine.from);

      // Verify widget is not yet focused
      expect(widget.isFocused).toBe(false);

      // Now position cursor at widget.to + 1
      view.dispatch({ selection: { anchor: widget.to + 1 } });

      // Trigger ArrowLeft keymap handler on CodeMirror contentDOM
      const leftEvent1 = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(leftEvent1);

      // Check state: widget should now be entered from end
      expect(widget.isFocused).toBe(true);
      expect(widget.enteredFromEnd).toBe(true);
      expect(document.activeElement).toBe(mathEl);
      expect(document.activeElement).not.toBe(document.body);

      // Now press ArrowLeft again (simulating subsequent keystroke into denominator)
      const leftEvent2 = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      mathEl.dispatchEvent(leftEvent2);

      // Caret must have descended into denominator
      const activeState = getActiveEquationState();
      expect(activeState?.isFocused).toBe(true);
      const denSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(denSlot).not.toBeNull();
      expect(denSlot?.role).toBe('denominator');
      expect(isSlotEmpty(denSlot!)).toBe(true);

      // Crucial assertion: activeElement NEVER dropped to document.body
      expect(document.activeElement).toBe(mathEl);
      expect(document.activeElement).not.toBe(document.body);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // Mission Item 3: ArrowRight from Trailing Root Offset Escapes to CodeMirror
  // =========================================================================
  describe('Mission 3: ArrowRight from Trailing Root Offset Escapes to CodeMirror Cleanly', () => {
    it('3.1: ArrowRight from trailing root offset of a root node escapes to CodeMirror without trapping', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mroot><mrow><mn>16</mn></mrow><mn>4</mn></mroot></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);
      const viewFocusSpy = vi.spyOn(view, 'focus');

      // 1. Enter equation from end
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1); // at trailing root offset

      // 2. Press ArrowRight from trailing root offset
      const exitHandled = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(exitHandled).toBe(true);

      // Invariants for clean escape:
      // - Widget is no longer focused
      expect(widget.isFocused).toBe(false);
      // - Active equation state is cleared
      expect(getActiveEquationState()).toBeNull();
      // - View.focus() was called to restore CodeMirror focus
      expect(viewFocusSpy).toHaveBeenCalled();
      // - Caret in CodeMirror is placed after the equation
      const cmPos = view.state.selection.main.anchor;
      expect(cmPos).toBeGreaterThanOrEqual(widget.to);
      // - Anti-oscillation flag was set
      expect(widget.justEscapedForwardAfterEnteringFromEnd).toBe(true);

      // 3. User immediately presses ArrowLeft from the CodeMirror boundary
      // Must NOT immediately re-trap into the equation
      const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(leftEvent);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('3.2: ArrowRight from trailing root offset of an inline equation escapes to CodeMirror cleanly', () => {
      const doc = 'Prefix /weq_inline <math><msqrt><mi>x</mi></msqrt></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);
      const viewFocusSpy = vi.spyOn(view, 'focus');

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(1);

      // Press ArrowRight to escape forward
      const exitHandled = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(exitHandled).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(viewFocusSpy).toHaveBeenCalled();
      expect(view.state.selection.main.anchor).toBe(widget.to);
      expect(widget.justEscapedForwardAfterEnteringFromEnd).toBe(true);

      view.destroy();
      c.remove();
    });
  });
});
