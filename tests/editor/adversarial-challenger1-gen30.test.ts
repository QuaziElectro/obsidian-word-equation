import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import {
  findSlotBelow,
  findSlotAbove,
  handleArrowKey,
} from '../../src/editor/navigation';
import {
  createSlot,
  createToken,
  createFraction,
  createRoot,
  createRadical,
  updateParentPointers,
  resetIdCounter,
  findSlotById,
  getAllSlotsInOrder,
} from '../../src/core/ast';
import {
  setupAccurateDomEnvironment,
} from '../helpers/dom-layout-engine';
import {
  DebugLogger,
  getDebugLogger,
} from '../../src/debug/debug-logger';

describe('Adversarial Navigation Stress Harness (Challenger 1 Gen30)', () => {
  let container: HTMLElement;
  let logger: DebugLogger;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
    logger = getDebugLogger();
    logger.resetForTesting();
  });

  afterEach(() => {
    clearActiveEquationState();
    logger.resetForTesting();
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function getWidgetAndDom(view: any, searchPos = 0): { widget: WordEquationWidget; dom: HTMLElement } {
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
    return { widget, dom };
  }

  // =========================================================================
  // Challenge 1: 3-Level Nested Fraction Traversal (Ascent & Descent)
  // =========================================================================
  describe('Challenge 1: Multi-Level Nested Fraction Traversal', () => {
    it('traverses 3-level nested fraction vertically without premature exit', () => {
      // Structure: 1 / (2 / (3 / 4))
      // Level 1: num = "1", den = [frac2]
      // Level 2: num = "2", den = [frac3]
      // Level 3: num = "3", den = "4"
      const t1 = createToken('1', 'mn');
      const s1 = createSlot('numerator', [t1]);

      const t2 = createToken('2', 'mn');
      const s2 = createSlot('numerator', [t2]);

      const t3 = createToken('3', 'mn');
      const s3 = createSlot('numerator', [t3]);

      const t4 = createToken('4', 'mn');
      const s4 = createSlot('denominator', [t4]);

      const frac3 = createFraction(s3, s4);
      const den2 = createSlot('denominator', [frac3]);

      const frac2 = createFraction(s2, den2);
      const den1 = createSlot('denominator', [frac2]);

      const frac1 = createFraction(s1, den1);
      const root = createSlot('root', [frac1]);
      updateParentPointers(root);

      // Start in deepest denominator (s4)
      let caret = { slotId: s4.id, offset: 0 };

      // Up step 1: from s4 (den of frac3) to s3 (num of frac3)
      let nav = findSlotAbove(root, caret);
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(s3.id);

      // Up step 2: from s3 (num of frac3) to s2 (num of frac2)
      nav = findSlotAbove(root, nav.caret);
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(s2.id);

      // Up step 3: from s2 (num of frac2) to s1 (num of frac1)
      nav = findSlotAbove(root, nav.caret);
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(s1.id);

      // Up step 4: from s1 (num of top frac1) -> should exit upward
      nav = findSlotAbove(root, nav.caret);
      expect(nav.handled).toBe(false);
      expect(nav.exitDirection).toBe('up');

      // Now descend downwards from s1
      // Down step 1: from s1 to s2 (numerator of inner fraction)
      nav = findSlotBelow(root, { slotId: s1.id, offset: 0 });
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(s2.id);

      // Down step 2: from s2 to s3 (numerator of innermost fraction)
      nav = findSlotBelow(root, nav.caret);
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(s3.id);

      // Down step 3: from s3 to s4 (denominator of innermost fraction)
      nav = findSlotBelow(root, nav.caret);
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(s4.id);

      // Down step 4: from s4 -> exits downward
      nav = findSlotBelow(root, nav.caret);
      expect(nav.handled).toBe(false);
      expect(nav.exitDirection).toBe('down');
    });

    it('traverses completely empty 2-level nested fractions horizontally in exact document order', () => {
      // frac( frac(empty1, empty2), frac(empty3, empty4) )
      const e1 = createSlot('numerator');
      const e2 = createSlot('denominator');
      const topFrac = createFraction(e1, e2);
      const numSlot = createSlot('numerator', [topFrac]);

      const e3 = createSlot('numerator');
      const e4 = createSlot('denominator');
      const botFrac = createFraction(e3, e4);
      const denSlot = createSlot('denominator', [botFrac]);

      const outerFrac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [outerFrac]);
      updateParentPointers(root);

      // Start at root offset 0
      let caret = { slotId: root.id, offset: 0 };
      const visitedSlots: string[] = [];

      // Forward traversal through the structure
      // 1. Root offset 0 -> numSlot offset 0
      let nav = handleArrowKey(root, caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(numSlot.id);
      expect(nav.caret.offset).toBe(0);

      // 2. numSlot offset 0 -> e1 offset 0
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(e1.id);
      expect(nav.caret.offset).toBe(0);

      // 3. e1 offset 0 -> e2 offset 0
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(e2.id);
      expect(nav.caret.offset).toBe(0);

      // 4. e2 offset 0 -> numSlot offset 1 (exit inner fraction)
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(numSlot.id);
      expect(nav.caret.offset).toBe(1);

      // 5. numSlot offset 1 -> denSlot offset 0
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(denSlot.id);
      expect(nav.caret.offset).toBe(0);

      // 6. denSlot offset 0 -> e3 offset 0
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(e3.id);
      expect(nav.caret.offset).toBe(0);

      // 7. e3 offset 0 -> e4 offset 0
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(e4.id);
      expect(nav.caret.offset).toBe(0);

      // 8. e4 offset 0 -> denSlot offset 1
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(denSlot.id);
      expect(nav.caret.offset).toBe(1);

      // 9. denSlot offset 1 -> root offset 1
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(root.id);
      expect(nav.caret.offset).toBe(1);
    });
  });

  // =========================================================================
  // Challenge 2: Nested Radicals and Roots
  // =========================================================================
  describe('Challenge 2: Nested Radicals and Roots Placeholder Navigation', () => {
    it('findSlotBelow from root slot enters radical radicand', () => {
      const radicand = createSlot('radicand', [createToken('x', 'mi')]);
      const rad = createRadical(radicand);
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      const navDown = findSlotBelow(root, { slotId: root.id, offset: 0 });
      expect(navDown.handled).toBe(true);
      expect(navDown.caret.slotId).toBe(radicand.id);
    });

    it('demonstrates limitation: findSlotBelow cannot descend from non-root container slot into inner fraction', () => {
      // Structure: root -> radical(radicand: [ frac(num, den) ])
      const numSlot = createSlot('numerator', [createToken('a', 'mi')]);
      const denSlot = createSlot('denominator', [createToken('b', 'mi')]);
      const frac = createFraction(numSlot, denSlot);

      const rootRadicand = createSlot('radicand', [frac]);
      const rad = createRadical(rootRadicand);

      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      // Down from root slot -> enters rootRadicand
      const navDown1 = findSlotBelow(root, { slotId: root.id, offset: 0 });
      expect(navDown1.handled).toBe(true);
      expect(navDown1.caret.slotId).toBe(rootRadicand.id);

      // Inside rootRadicand, caret is at offset 0 before the fraction.
      // Calling findSlotBelow here fails because parentNode is radicalNode,
      // and findSlotBelow only checks children when !parentNode (root slot).
      const navDown2 = findSlotBelow(root, navDown1.caret);
      // EMPIRICAL FINDING: navDown2.handled is false, exits down prematurely!
      expect(navDown2.handled).toBe(false);
      expect(navDown2.exitDirection).toBe('down');
    });
  });

  // =========================================================================
  // Challenge 3: Root Slot Multi-Composite Sibling Selection
  // =========================================================================
  describe('Challenge 3: Root Slot Multi-Composite Sibling Selection', () => {
    it('chooses the nearest composite node based on caret offset in root slot', () => {
      // AST: [ 'a', '+', frac(b, c), '+', rad(d) ]
      // indices: 0:'a', 1:'+', 2:frac, 3:'+', 4:rad
      const tokA = createToken('a', 'mi');
      const tokPlus1 = createToken('+', 'mo');

      const sB = createSlot('numerator', [createToken('b', 'mi')]);
      const sC = createSlot('denominator', [createToken('c', 'mi')]);
      const frac = createFraction(sB, sC);

      const tokPlus2 = createToken('+', 'mo');

      const sD = createSlot('radicand', [createToken('d', 'mi')]);
      const rad = createRadical(sD);

      const root = createSlot('root', [tokA, tokPlus1, frac, tokPlus2, rad]);
      updateParentPointers(root);

      // 1. Caret at root offset 1 (near fraction at index 2)
      // distance to frac (index 2) is |2 - 1| = 1
      // distance to rad (index 4) is |4 - 1| = 3
      // findSlotBelow must choose fraction numerator
      const nav1 = findSlotBelow(root, { slotId: root.id, offset: 1 });
      expect(nav1.handled).toBe(true);
      expect(nav1.caret.slotId).toBe(sB.id);

      // 2. Caret at root offset 4 (near radical at index 4)
      // distance to frac (index 2) is |2 - 4| = 2
      // distance to rad (index 4) is |4 - 4| = 0
      // findSlotBelow must choose radical radicand
      const nav2 = findSlotBelow(root, { slotId: root.id, offset: 4 });
      expect(nav2.handled).toBe(true);
      expect(nav2.caret.slotId).toBe(sD.id);

      // 3. Caret at root offset 4 with findSlotAbove must choose radical radicand
      const navUp = findSlotAbove(root, { slotId: root.id, offset: 4 });
      expect(navUp.handled).toBe(true);
      expect(navUp.caret.slotId).toBe(sD.id);

      // 4. Caret at root offset 1 with findSlotAbove must choose fraction denominator
      const navUp1 = findSlotAbove(root, { slotId: root.id, offset: 1 });
      expect(navUp1.handled).toBe(true);
      expect(navUp1.caret.slotId).toBe(sC.id);
    });
  });

  // =========================================================================
  // Challenge 4: Rapid Random Arrow Transitions (Fuzz Stress Test)
  // =========================================================================
  describe('Challenge 4: Rapid Random Arrow Transitions Fuzz Harness', () => {
    it('survives 200 rapid pseudo-random arrow keystrokes without invariant violation', () => {
      // Complex composite equation:
      // \frac{ \sqrt{a} + b }{ \frac{c}{d} }
      const sA = createSlot('radicand', [createToken('a', 'mi')]);
      const radA = createRadical(sA);
      const sPlus = createToken('+', 'mo');
      const sB = createToken('b', 'mi');
      const num = createSlot('numerator', [radA, sPlus, sB]);

      const sC = createSlot('numerator', [createToken('c', 'mi')]);
      const sD = createSlot('denominator', [createToken('d', 'mi')]);
      const innerFrac = createFraction(sC, sD);
      const den = createSlot('denominator', [innerFrac]);

      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      const allSlots = getAllSlotsInOrder(root);
      const slotMap = new Map<string, typeof root>();
      for (const s of allSlots) {
        slotMap.set(s.id, s);
      }

      const keys: ('ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown')[] = [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
      ];

      // Seeded deterministic pseudo-random generator
      let seed = 42;
      function nextRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }

      let currentCaret = { slotId: root.id, offset: 0 };

      for (let step = 0; step < 200; step++) {
        const key = keys[Math.floor(nextRandom() * keys.length)];
        const nav = handleArrowKey(root, currentCaret, key);

        if (nav.handled) {
          currentCaret = nav.caret;
        } else {
          // If boundary exit was hit, re-enter from root or current to continue stress test
          currentCaret = { slotId: root.id, offset: 0 };
        }

        // INVARIANT VERIFICATIONS:
        // 1. Caret offset is non-negative integer
        expect(Number.isInteger(currentCaret.offset)).toBe(true);
        expect(currentCaret.offset).toBeGreaterThanOrEqual(0);

        // 2. Slot exists in AST
        const currentSlot = slotMap.get(currentCaret.slotId);
        expect(currentSlot).toBeDefined();

        // 3. Offset does not exceed slot children count
        expect(currentCaret.offset).toBeLessThanOrEqual(currentSlot!.children.length);
      }
    });
  });

  // =========================================================================
  // Challenge 5: Boundary Ping-Pong and Escape Invariants
  // =========================================================================
  describe('Challenge 5: Boundary Ping-Pong and Escape Invariants', () => {
    it('entering from end and escaping forward repeatedly does not oscillate or corrupt state', () => {
      const doc = 'Word1 /weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi></math> /weq_inline Word2';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);
      const dispatchSpy = vi.spyOn(view, 'dispatch');

      for (let cycle = 0; cycle < 3; cycle++) {
        // 1. Enter from end
        dispatchSpy.mockClear();
        widget.enterFromEnd(view);
        expect(widget.isFocused).toBe(true);
        expect(widget.enteredFromEnd).toBe(true);
        expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({
          selection: expect.anything(),
        }));

        // 2. Step right to exit forward
        const exited = widget.handleArrowNavigation('ArrowRight', false, view);
        expect(exited).toBe(true);
        expect(widget.isFocused).toBe(false);
        expect(widget.justEscapedForwardAfterEnteringFromEnd).toBe(true);
        expect(view.state.selection.main.anchor).toBe(widget.to);

        // 3. Dispatch ArrowLeft at boundary: must NOT re-enter immediately
        view.contentDOM.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
        );
        expect(widget.isFocused).toBe(false);
      }

      view.destroy();
      c.remove();
    });

    it('enterFromStart and escape backward cleanly resets flags and syncs selection', () => {
      const doc = 'Prefix /weq_inline <math><mi>z</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Escape backward
      const exited = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(exited).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(widget.enteredFromEnd).toBe(false);
      expect(widget.justEscapedForwardAfterEnteringFromEnd).toBe(false);
      expect(view.state.selection.main.anchor).toBe(widget.from);

      view.destroy();
      c.remove();
    });
  });
});
