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
  resetIdCounter,
  findSlotById,
  isSlotEmpty,
} from '../../src/core/ast';
import { insertCharacter } from '../../src/editor/selection';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger 2 (Gen44): Empirical Verification of Left-Entry, Zero-Trap Exit & Nested Traversal', () => {
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
  // SECTION 1: Symmetrical Defensive Focus Assertion in enterFromStart()
  // =========================================================================
  describe('Section 1: enterFromStart() Defensive Focus Assertion', () => {
    it('1.1: enterFromStart initializes caret at root offset 0, focuses mathEl, and schedules RAF assertion', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });
      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromStart(view);

      // Caret is at root offset 0
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(0);

      // mathEl is focused synchronously
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

      // Defensive RAF assertion was scheduled
      expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);

      view.destroy();
      c.remove();
    });

    it('1.2: RAF defensive focus assertion recovers focus to mathEl if CodeMirror microtask blurs to document.body', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });
      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromStart(view);
      expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);

      // Simulate the 8ms involuntary blur to document.body (Smoking gun Event #44 from BUG_REPORT.md)
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
      focusSpy.mockClear();

      // Trigger the scheduled rAF callback
      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // Proves that mathEl was defensively re-focused, preventing keystroke starvation
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

      view.destroy();
      c.remove();
    });

    it('1.3: RAF focus assertion does NOT steal focus if widget has already been deactivated or blurred intentionally', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, mathEl } = getWidgetAndDom(view);

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return 1;
      });
      const focusSpy = vi.spyOn(mathEl, 'focus');

      widget.enterFromStart(view);
      focusSpy.mockClear();

      // Widget becomes unfocused (e.g. user clicked another application or pane)
      widget.isFocused = false;
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);

      // Execute RAF callback
      for (const cb of rafCallbacks) {
        cb(performance.now());
      }

      // Focus must NOT be stolen because widget.isFocused === false
      expect(focusSpy).not.toHaveBeenCalled();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SECTION 2: Immediate ArrowLeft Exit at Root Offset 0 (Zero-Trap Guarantee)
  // =========================================================================
  describe('Section 2: ArrowLeft Immediate Exit at Root Offset 0', () => {
    it('2.1: Pressing ArrowLeft at root offset 0 immediately exits without trapping (Empty Fraction)', () => {
      const doc = 'Prefix text\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom, mathEl } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(true);

      const dispatchSpy = vi.spyOn(view, 'dispatch');
      const viewFocusSpy = vi.spyOn(view, 'focus');

      // Press ArrowLeft
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);

      // Must be handled (by exit routine) and deactivate equation
      expect(handled).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()?.isFocused || false).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(false);

      // CodeMirror editor must have regained focus and selection before equation
      expect(viewFocusSpy).toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
        selection: expect.objectContaining({ anchor: Math.max(0, widget.from - 1) }),
      }));

      view.destroy();
      c.remove();
    });

    it('2.2: Burst stress test: 40 consecutive ArrowLeft presses do NOT get trapped or crash', () => {
      // Re-creates Phase E of BUG_REPORT.md (Events #55 to #134: 40 consecutive ArrowLeft presses)
      const doc = 'Prefix text\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Keystroke 1: exits immediately
      const handled1 = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled1).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();

      // Subsequent 39 keystrokes: equation remains deactivated, zero exceptions
      for (let i = 2; i <= 40; i++) {
        expect(() => {
          widget.handleArrowNavigation('ArrowLeft', false, view);
        }).not.toThrow();
        expect(widget.isFocused).toBe(false);
        expect(dom.querySelector('.eq-caret')).toBeNull();
      }

      view.destroy();
      c.remove();
    });

    it('2.3: Zero-trap ArrowLeft exit verified across diverse math structures', () => {
      const structures = [
        { name: 'Radical (Square Root)', mathml: '<msqrt><mrow></mrow></msqrt>' },
        { name: 'Nth Root', mathml: '<mroot><mrow></mrow><mrow></mrow></mroot>' },
        { name: '2x2 Matrix', mathml: '<mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable>' },
        { name: 'Superscript', mathml: '<msup><mrow></mrow><mrow></mrow></msup>' },
        { name: 'Subscript', mathml: '<msub><mrow></mrow><mrow></mrow></msub>' },
        { name: 'Sub-Superscript', mathml: '<msubsup><mrow></mrow><mrow></mrow><mrow></mrow></msubsup>' },
        { name: 'Nested Fraction in Radical', mathml: '<msqrt><mfrac><mrow></mrow><mrow></mrow></mfrac></msqrt>' },
      ];

      for (const s of structures) {
        const doc = `Prefix\n\`\`\`math-word\n<math display="block">${s.mathml}</math>\n\`\`\`\nSuffix`;
        const { view, container: c } = createMockEditor(doc, [], true);
        const { widget, dom, mathEl } = getWidgetAndDom(view);

        widget.enterFromStart(view);
        expect(widget.isFocused, `Failed left-entry on ${s.name}`).toBe(true);
        expect(widget.caret.offset, `Initial offset not 0 on ${s.name}`).toBe(0);

        const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
        expect(handled, `ArrowLeft unhandled on ${s.name}`).toBe(true);
        expect(widget.isFocused, `Caret trapped on ${s.name}`).toBe(false);
        expect(dom.querySelector('.eq-caret'), `Caret element remained on ${s.name}`).toBeNull();
        expect(mathEl.classList.contains('eq-active'), `eq-active remained on ${s.name}`).toBe(false);

        view.destroy();
        c.remove();
      }
    });
  });

  // =========================================================================
  // SECTION 3: Sequential ArrowRight Stepping across Diverse Math Structures
  // =========================================================================
  describe('Section 3: Sequential ArrowRight Stepping through Structural Slots', () => {
    it('3.1: Empty Fraction: Steps through numerator -> denominator -> root offset 1 -> exits after without freezing', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      // Step 1: Descend into numerator placeholder
      const step1 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(step1).toBe(true);
      const numSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(numSlot?.role).toBe('numerator');
      expect(isSlotEmpty(numSlot!)).toBe(true);
      expect(dom.querySelector('.eq-numerator .eq-focused')).not.toBeNull();
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 2: Step into denominator placeholder
      const step2 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(step2).toBe(true);
      const denSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(denSlot?.role).toBe('denominator');
      expect(isSlotEmpty(denSlot!)).toBe(true);
      expect(dom.querySelector('.eq-denominator .eq-focused')).not.toBeNull();
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 3: Step out of fraction to root slot offset 1 (trailing position after fraction)
      const step3 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(step3).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);
      expect(widget.isFocused).toBe(true);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 4: Exit equation cleanly forward to CodeMirror
      const step4 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(step4).toBe(true); // Handled by exit routine
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();

      view.destroy();
      c.remove();
    });

    it('3.2: 3-Level Nested Fraction: Steps through all 4 structural levels sequentially', () => {
      // 1 / (2 / (3 / 4))
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mi>1</mi><mfrac><mi>2</mi><mfrac><mi>3</mi><mi>4</mi></mfrac></mfrac></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      // Traverse through the nested slots:
      // Num1 ('1') -> Den1 (Frac2: Num2 ('2')) -> Frac3: Num3 ('3') -> Den3 ('4') -> Exit
      const visitedSlots: string[] = [];
      let steps = 0;
      while (widget.isFocused && steps < 20) {
        steps++;
        const currentSlot = findSlotById(widget.ast, widget.caret.slotId);
        if (currentSlot && !visitedSlots.includes(currentSlot.id)) {
          visitedSlots.push(currentSlot.id);
        }
        expect(dom.querySelector('.eq-caret'), `Caret disappeared at step ${steps}`).not.toBeNull();
        widget.handleArrowNavigation('ArrowRight', false, view);
      }

      // All 4 fractions/numbers must have been visited without freeze or premature escape
      expect(visitedSlots.length).toBeGreaterThanOrEqual(4);
      expect(widget.isFocused).toBe(false); // Cleanly exited

      view.destroy();
      c.remove();
    });

    it('3.3: Square Root (Radical) and Nth Root: Steps through radicand, index, and root offset 1 without freezing', () => {
      // Nth root: radicand and index
      const doc = 'Prefix\n```math-word\n<math display="block"><mroot><mrow></mrow><mrow></mrow></mroot></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      // Step 1: Descend into radicand
      const s1 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(s1).toBe(true);
      const radSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(radSlot?.role).toBe('radicand');
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 2: Step into index
      const s2 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(s2).toBe(true);
      const idxSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(idxSlot?.role).toBe('index');
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 3: Step to root offset 1
      const s3 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(s3).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);

      // Step 4: Exit forward
      const s4 = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(s4).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('3.4: 2x2 Matrix: Steps sequentially through all 4 cells in row-major order', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      const cellSlots: string[] = [];

      // Cell 0,0
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      cellSlots.push(widget.caret.slotId);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Cell 0,1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      cellSlots.push(widget.caret.slotId);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Cell 1,0
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      cellSlots.push(widget.caret.slotId);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Cell 1,1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      cellSlots.push(widget.caret.slotId);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // All 4 slots are unique cells
      const uniqueSlots = new Set(cellSlots);
      expect(uniqueSlots.size).toBe(4);

      // Step to root offset 1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);

      // Next ArrowRight exits matrix forward
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('3.5: 3x3 Matrix: Steps through all 9 cells sequentially without freezing', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      const visitedCells: string[] = [];
      for (let i = 0; i < 9; i++) {
        const handled = widget.handleArrowNavigation('ArrowRight', false, view);
        expect(handled, `Matrix step ${i + 1} failed`).toBe(true);
        expect(dom.querySelector('.eq-caret'), `Caret lost at cell ${i + 1}`).not.toBeNull();
        visitedCells.push(widget.caret.slotId);
      }

      // Verify 9 distinct cell slots visited
      const set = new Set(visitedCells);
      expect(set.size).toBe(9);

      // Step to root offset 1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);

      // Clean exit
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('3.6: Exponents & Subscripts: Steps through base and sup/sub/subsup slots', () => {
      // Sub-Superscript: base, sub, sup
      const doc = 'Prefix\n```math-word\n<math display="block"><msubsup><mrow></mrow><mrow></mrow><mrow></mrow></msubsup></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Step 1: Base
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('base');
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 2: Sub
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('sub');
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 3: Sup
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('sup');
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 4: Root offset 1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);

      // Step 5: Exit
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('3.7: Compound Complex Structure: Matrix containing fraction and square root cells', () => {
      // 1x2 matrix: cell 1 has fraction, cell 2 has square root
      const doc = 'Prefix\n```math-word\n<math display="block"><mtable><mtr><mtd><mfrac><mrow></mrow><mrow></mrow></mfrac></mtd><mtd><msqrt><mrow></mrow></msqrt></mtd></mtr></mtable></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Step 1: Matrix Cell 0,0
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('cell');

      // Step 2: Fraction numerator inside Cell 0,0
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('numerator');

      // Step 3: Fraction denominator inside Cell 0,0
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('denominator');

      // Step 4: Step out of fraction into Cell 0,0 offset 1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('cell');

      // Step 5: Matrix Cell 0,1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('cell');

      // Step 6: Radical radicand inside Cell 0,1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('radicand');

      // Step 7: Step out of radical into Cell 0,1 offset 1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('cell');

      // Step 8: Step out of matrix into root offset 1
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);

      // Step 9: Clean exit after compound structure
      expect(widget.handleArrowNavigation('ArrowRight', false, view)).toBe(true);
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('3.8: Interactivity check: typing character into placeholder during traversal succeeds cleanly', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      // Step into numerator
      widget.handleArrowNavigation('ArrowRight', false, view);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('numerator');

      // Type '7'
      const res = insertCharacter(widget.ast, widget.caret, '7');
      expect(res.handled).toBe(true);
      widget.ast = res.root;
      widget.caret = res.caret;

      const numSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(numSlot?.children.length).toBe(1);
      expect((numSlot?.children[0] as any).text).toBe('7');
      // Caret is already after '7' at offset 1
      expect(widget.caret.offset).toBe(1);

      // ArrowRight from end of numerator moves to denominator
      widget.handleArrowNavigation('ArrowRight', false, view);
      expect(findSlotById(widget.ast, widget.caret.slotId)?.role).toBe('denominator');
      expect(widget.caret.offset).toBe(0);

      // Type '8' into denominator
      const res2 = insertCharacter(widget.ast, widget.caret, '8');
      expect(res2.handled).toBe(true);
      widget.ast = res2.root;
      widget.caret = res2.caret;

      const denSlot = findSlotById(widget.ast, widget.caret.slotId);
      expect(denSlot?.children.length).toBe(1);
      expect((denSlot?.children[0] as any).text).toBe('8');
      expect(widget.caret.offset).toBe(1);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SECTION 4: Bidirectional Traversal and Symmetrical Invariants
  // =========================================================================
  describe('Section 4: Bidirectional Traversal and Inversion Invariance', () => {
    it('4.1: Stepping fully forward, then backward retraces exact slots in reverse to root offset 0 and exits before', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Forward: Root(0) -> Num -> Den
      widget.handleArrowNavigation('ArrowRight', false, view);
      const numSlotId = widget.caret.slotId;
      widget.handleArrowNavigation('ArrowRight', false, view);
      const denSlotId = widget.caret.slotId;

      expect(numSlotId).not.toBe(denSlotId);

      // Backward: Den -> Num -> Root(0) -> Exit before
      // 1. Den -> Num
      const b1 = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(b1).toBe(true);
      expect(widget.caret.slotId).toBe(numSlotId);

      // 2. Num -> Root offset 0
      const b2 = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(b2).toBe(true);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(0);

      // 3. Root offset 0 -> Exits before cleanly
      const b3 = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(b3).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();

      view.destroy();
      c.remove();
    });

    it('4.2: Rapid ping-pong navigation between adjacent placeholders maintains caret stability without focus leaks', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      widget.handleArrowNavigation('ArrowRight', false, view); // Num
      const numId = widget.caret.slotId;
      widget.handleArrowNavigation('ArrowRight', false, view); // Den
      const denId = widget.caret.slotId;

      // Ping pong 20 times between Den and Num
      for (let i = 0; i < 20; i++) {
        widget.handleArrowNavigation('ArrowLeft', false, view);
        expect(widget.caret.slotId).toBe(numId);
        expect(dom.querySelectorAll('.eq-caret').length).toBe(1);

        widget.handleArrowNavigation('ArrowRight', false, view);
        expect(widget.caret.slotId).toBe(denId);
        expect(dom.querySelectorAll('.eq-caret').length).toBe(1);
      }

      expect(widget.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // SECTION 5: Real DOM KeyboardEvent Routing
  // =========================================================================
  describe('Section 5: Direct DOM KeyboardEvent Dispatch', () => {
    it('5.1: Dispatching ArrowRight keydown DOM event to mathEl navigates into nested placeholder', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom, mathEl } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.caret.offset).toBe(0);

      const navSpy = vi.spyOn(widget, 'handleArrowNavigation');

      // Dispatch real DOM keydown on dom
      const evt = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      dom.dispatchEvent(evt);

      expect(navSpy).toHaveBeenCalledWith('ArrowRight', false, view);
      expect(evt.defaultPrevented).toBe(true);

      view.destroy();
      c.remove();
    });

    it('5.2: Dispatching ArrowLeft keydown DOM event to mathEl at root offset 0 cleanly exits', () => {
      const doc = 'Prefix\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Dispatch real DOM keydown on dom
      const evt = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        bubbles: true,
        cancelable: true,
      });
      dom.dispatchEvent(evt);

      expect(evt.defaultPrevented).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelector('.eq-caret')).toBeNull();

      view.destroy();
      c.remove();
    });
  });
});
