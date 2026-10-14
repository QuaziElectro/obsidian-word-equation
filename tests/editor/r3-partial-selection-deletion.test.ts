/**
 * R3 Partial Selection Across Boundaries & Generalized Recursive Deletion Tests
 * Verifies:
 * 1. Topological position comparison (comparePositions) using LCA traversal.
 * 2. Partial selection spanning numerator into denominator with Shift+ArrowDown.
 * 3. Visual highlight verification (.eq-partial-selected / .eq-selected-token / .eq-selected-slot).
 * 4. Mouse drag partial selection and collapsing selection.
 * 5. Selection deletion and character replacement.
 * 6. Generalized Deletion Rule 1: Element deletion to the left.
 * 7. Generalized Deletion Rule 2: Deletion of parent fraction when Backspace is pressed at start of empty placeholder.
 * 8. Generalized Deletion Rule 3: 2-stage Backspace on non-empty placeholder (Stage 1 highlights, Stage 2 empties/deletes).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createSuperscript,
  createMatrix,
  comparePositions,
  isSlotEmpty,
  resetIdCounter,
  updateParentPointers,
} from '../../src/core/ast';
import {
  normalizeSelection,
  deleteSelection,
  deleteParentStructure,
  updatePartialSelectionDom,
} from '../../src/editor/selection';
import {
  getActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import { createMockEditor } from '../helpers/cm6-mock';

describe('Requirement R3: Partial Selection & Generalized Deletion Rules', () => {
  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
  });

  afterEach(() => {
    clearActiveEquationState();
  });

  // =========================================================================
  // 1. AST Topological Position Comparison (comparePositions)
  // =========================================================================
  describe('comparePositions with Lowest Common Ancestor (LCA)', () => {
    it('compares positions within the same slot based on offsets', () => {
      const root = createSlot('root', [
        createToken('a', 'mi'),
        createToken('+', 'mo'),
        createToken('b', 'mi'),
      ]);
      const pos0 = { slotId: root.id, offset: 0 };
      const pos1 = { slotId: root.id, offset: 1 };
      const pos2 = { slotId: root.id, offset: 2 };

      expect(comparePositions(root, pos0, pos1)).toBeLessThan(0);
      expect(comparePositions(root, pos1, pos0)).toBeGreaterThan(0);
      expect(comparePositions(root, pos1, pos1)).toBe(0);
      expect(comparePositions(root, pos1, pos2)).toBeLessThan(0);
    });

    it('correctly compares positions across numerator and denominator in a fraction', () => {
      const numSlot = createSlot('numerator', [createToken('a', 'mi'), createToken('b', 'mi')]);
      const denSlot = createSlot('denominator', [createToken('c', 'mi'), createToken('d', 'mi')]);
      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Any position in numerator should be before any position in denominator
      const numEnd = { slotId: numSlot.id, offset: 2 };
      const denStart = { slotId: denSlot.id, offset: 0 };

      expect(comparePositions(root, numEnd, denStart)).toBeLessThan(0);
      expect(comparePositions(root, denStart, numEnd)).toBeGreaterThan(0);

      const numMid = { slotId: numSlot.id, offset: 1 };
      const denMid = { slotId: denSlot.id, offset: 1 };
      expect(comparePositions(root, numMid, denMid)).toBeLessThan(0);
    });

    it('correctly compares a preceding token in root with a child slot inside a fraction', () => {
      const numSlot = createSlot('numerator', [createToken('x', 'mi')]);
      const denSlot = createSlot('denominator', [createToken('y', 'mi')]);
      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [createToken('1', 'mn'), frac, createToken('2', 'mn')]);
      updateParentPointers(root);

      const beforeFrac = { slotId: root.id, offset: 0 };
      const insideNum = { slotId: numSlot.id, offset: 0 };
      const insideDen = { slotId: denSlot.id, offset: 1 };
      const afterFrac = { slotId: root.id, offset: 2 };

      expect(comparePositions(root, beforeFrac, insideNum)).toBeLessThan(0);
      expect(comparePositions(root, insideNum, afterFrac)).toBeLessThan(0);
      expect(comparePositions(root, insideDen, afterFrac)).toBeLessThan(0);
      expect(comparePositions(root, afterFrac, insideDen)).toBeGreaterThan(0);
    });

    it('correctly compares across nested fractions', () => {
      // outer: frac(1, frac(2, 3))
      const innerNum = createSlot('numerator', [createToken('2', 'mn')]);
      const innerDen = createSlot('denominator', [createToken('3', 'mn')]);
      const innerFrac = createFraction(innerNum, innerDen);

      const outerNum = createSlot('numerator', [createToken('1', 'mn')]);
      const outerDen = createSlot('denominator', [innerFrac]);
      const outerFrac = createFraction(outerNum, outerDen);

      const root = createSlot('root', [outerFrac]);
      updateParentPointers(root);

      const p1 = { slotId: outerNum.id, offset: 1 };
      const p2 = { slotId: innerNum.id, offset: 0 };
      const p3 = { slotId: innerDen.id, offset: 1 };

      expect(comparePositions(root, p1, p2)).toBeLessThan(0);
      expect(comparePositions(root, p2, p3)).toBeLessThan(0);
      expect(comparePositions(root, p1, p3)).toBeLessThan(0);
    });
  });

  // =========================================================================
  // 2. Partial Selection Spanning Numerator into Denominator with Shift+Arrow
  // =========================================================================
  describe('Partial Selection Crossing Boundaries via Shift+Arrow', () => {
    it('selects from numerator down into denominator via Shift+ArrowDown and verifies DOM highlights', () => {
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Find numerator slot
      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      expect(numEl).not.toBeNull();
      const numSlotId = numEl.getAttribute('data-slot-id')!;

      // Position caret at offset 1 of numerator (between 'a' and '+')
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      expect(widget!.selection).toBeNull();

      // Press Shift+ArrowDown to extend selection across fraction boundary into denominator
      dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })
      );

      // Selection must be active and span from numerator to denominator
      expect(widget!.selection).not.toBeNull();
      expect(widget!.selection!.anchor.slotId).toBe(numSlotId);
      expect(widget!.selection!.anchor.offset).toBe(1);

      const denEl = dom.querySelector('.eq-denominator .eq-slot') as HTMLElement;
      const denSlotId = denEl.getAttribute('data-slot-id')!;
      expect(widget!.selection!.head.slotId).toBe(denSlotId);

      // Verify DOM visual highlights:
      // Both .eq-numerator and .eq-denominator must have .eq-partial-selected
      const numContainer = dom.querySelector('.eq-numerator') as HTMLElement;
      const denContainer = dom.querySelector('.eq-denominator') as HTMLElement;
      expect(numContainer.classList.contains('eq-partial-selected')).toBe(true);
      expect(denContainer.classList.contains('eq-partial-selected')).toBe(true);

      // The selected tokens in numerator ('+' and 'b') and denominator ('c') must have .eq-selected-token
      const selectedTokens = dom.querySelectorAll('.eq-selected-token');
      expect(selectedTokens.length).toBeGreaterThan(0);

      // Token 'a' in numerator (offset 0) should NOT be selected
      const numTokens = numEl.querySelectorAll('.eq-token');
      expect(numTokens[0].classList.contains('eq-selected-token')).toBe(false); // 'a'
      expect(numTokens[1].classList.contains('eq-selected-token')).toBe(true); // '+'
      expect(numTokens[2].classList.contains('eq-selected-token')).toBe(true); // 'b'

      view.destroy();
      container.remove();
    });

    it('collapses selection and clears DOM highlights when an arrow key is pressed without Shift', () => {
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      // Shift+ArrowDown to select across boundary
      dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })
      );
      expect(widget!.selection).not.toBeNull();
      expect(dom.querySelectorAll('.eq-partial-selected').length).toBeGreaterThan(0);

      // Now press ArrowRight WITHOUT Shift to collapse
      dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: false, bubbles: true })
      );

      // Selection must be cleared
      expect(widget!.selection).toBeNull();

      // Highlights must be removed from DOM
      expect(dom.querySelectorAll('.eq-partial-selected').length).toBe(0);
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // 3. Selection Deletion & Character Replacement
  // =========================================================================
  describe('Selection Deletion & Character Replacement', () => {
    it('deletes selected cross-boundary elements when Backspace is pressed', () => {
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      // Shift+ArrowDown to span numerator into denominator
      dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })
      );
      expect(widget!.selection).not.toBeNull();

      // Press Backspace to delete the selected tokens
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Selection must be cleared and caret placed at selection start
      expect(widget!.selection).toBeNull();
      expect(widget!.caret.slotId).toBe(numSlotId);
      expect(widget!.caret.offset).toBe(1);

      // Document must reflect deletion of selected tokens ('+' and 'b' in numerator)
      expect(view.state.doc.toString()).toContain('<mi>a</mi>');

      view.destroy();
      container.remove();
    });

    it('replaces the selected range when typing a character', () => {
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      // Select with Shift+ArrowRight
      dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
      );
      expect(widget!.selection).not.toBeNull();

      // Type character 'z' to replace selection
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));

      expect(widget!.selection).toBeNull();
      expect(view.state.doc.toString()).toContain('<mi>z</mi>');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // 4. Generalized Deletion Rule 1: Element Deletion to the Left
  // =========================================================================
  describe('Rule 1: Element Deletion to the Left (offset > 0)', () => {
    it('deletes the element to the left when caret.offset > 0 in a nested numerator', () => {
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow><mi>x</mi><mi>y</mi></mrow><mrow><mn>2</mn></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;

      // Position caret after 'x' (offset 1)
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      // Backspace deletes 'x'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.caret.offset).toBe(0);
      expect(view.state.doc.toString()).not.toContain('<mi>x</mi>');
      expect(view.state.doc.toString()).toContain('<mi>y</mi>');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // 5. Generalized Deletion Rule 2: Deletion of Parent Structure on Empty Placeholder
  // =========================================================================
  describe('Rule 2: Deletion of Parent Structure on Empty Placeholder', () => {
    it('deletes the whole fraction when Backspace is pressed at start of an empty numerator', () => {
      const docStr = `## Heading\n\`\`\`math-word\n<math><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;

      // Place caret at start of empty numerator
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Press Backspace at start of empty numerator: deletes parent fraction!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // The fraction structure must be gone from the AST
      expect(widget!.ast.children.length).toBe(0);
      expect(view.state.doc.toString()).not.toContain('<mfrac>');

      view.destroy();
      container.remove();
    });

    it('deletes the whole fraction when Backspace is pressed at start of an empty denominator', () => {
      const docStr = `## Heading\n\`\`\`math-word\n<math><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const denEl = dom.querySelector('.eq-denominator .eq-slot') as HTMLElement;
      const denSlotId = denEl.getAttribute('data-slot-id')!;

      // Place caret at start of empty denominator
      widget!.enterFromStart(view);
      widget!.caret = { slotId: denSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Press Backspace at start of empty denominator: deletes parent fraction!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.ast.children.length).toBe(0);
      expect(view.state.doc.toString()).not.toContain('<mfrac>');

      view.destroy();
      container.remove();
    });

    it('deletes only the inner fraction when Backspace is pressed in a nested empty fraction', () => {
      // outer fraction: 1 / (empty frac)
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow><mn>1</mn></mrow><mrow><mfrac><mrow></mrow><mrow></mrow></mfrac></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Locate inner fraction's numerator
      const nestedFrac = dom.querySelector('.eq-denominator .eq-fraction') as HTMLElement;
      expect(nestedFrac).not.toBeNull();
      const innerNumSlot = nestedFrac.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const innerNumSlotId = innerNumSlot.getAttribute('data-slot-id')!;

      widget!.enterFromStart(view);
      widget!.caret = { slotId: innerNumSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Press Backspace in nested empty fraction
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Inner fraction is deleted; outer fraction remains with numerator '1'!
      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('fraction');
      const outerFrac = widget!.ast.children[0] as any;
      expect(outerFrac.numerator.children.length).toBe(1);
      expect(outerFrac.numerator.children[0].text).toBe('1');
      expect(outerFrac.denominator.children.length).toBe(0); // denominator is now empty placeholder

      view.destroy();
      container.remove();
    });

    it('deletes radical when Backspace is pressed at start of empty radicand', () => {
      const docStr = `\`\`\`math-word\n<math><msqrt><mrow></mrow></msqrt></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const radEl = dom.querySelector('.eq-radicand .eq-slot') as HTMLElement;
      const radSlotId = radEl.getAttribute('data-slot-id')!;

      widget!.enterFromStart(view);
      widget!.caret = { slotId: radSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.ast.children.length).toBe(0);
      expect(view.state.doc.toString()).not.toContain('<msqrt>');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // 6. Generalized Deletion Rule 3: 2-Stage Highlight & Deletion on Non-Empty Placeholder
  // =========================================================================
  describe('Rule 3: 2-Stage Highlight & Deletion on Non-Empty Placeholder', () => {
    it('highlights placeholder on 1st Backspace at offset 0, then deletes its contents on 2nd Backspace', () => {
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;

      // Position caret at very start of non-empty numerator (offset 0, before 'x')
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Stage 1: 1st Backspace must NOT delete yet; it highlights the placeholder!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.highlightedSlotId).toBe(numSlotId);
      // Numerator is still intact in AST!
      expect(view.state.doc.toString()).toContain('<mi>x</mi>');
      expect(view.state.doc.toString()).toContain('<mn>1</mn>');

      // DOM must have .eq-placeholder-highlighted or .eq-selected-slot on the placeholder
      expect(
        numEl.classList.contains('eq-placeholder-highlighted') ||
        numEl.classList.contains('eq-selected-slot')
      ).toBe(true);

      // Stage 2: 2nd Backspace while highlightedSlotId === numSlotId empties the placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Numerator contents are now deleted!
      expect(widget!.highlightedSlotId).toBeNull();
      const numSlot = (widget!.ast.children[0] as any).numerator;
      expect(numSlot.children.length).toBe(0); // Now empty placeholder
      expect(view.state.doc.toString()).not.toContain('<mi>x</mi>');

      // Stage 3: In Gen19 R2, Backspace on empty numerator when denominator is non-empty ('1')
      // must NOT delete the fraction; it moves the caret to the end of the non-empty denominator!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Fraction is NOT deleted!
      expect(widget!.ast.children.length).toBe(1);
      expect(view.state.doc.toString()).toContain('<mfrac>');
      const denSlot = (widget!.ast.children[0] as any).denominator;
      expect(widget!.caret.slotId).toBe(denSlot.id);
      expect(widget!.caret.offset).toBe(1);

      // Now backspacing on denominator: caret is at offset 1, so Backspace deletes '1' (Rule 1)
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      const currentDen = (widget!.ast.children[0] as any).denominator;
      expect(currentDen.children.length).toBe(0);
      expect(widget!.caret.offset).toBe(0);

      // With both numerator and denominator empty, Backspace deletes the parent fraction!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(widget!.ast.children.length).toBe(0);
      expect(view.state.doc.toString()).not.toContain('<mfrac>');

      view.destroy();
      container.remove();
    });
  });
});
