/**
 * Gen18 Adversarial Stress Test Suite: Requirements R3 & R4
 *
 * Targeted Adversarial Verification:
 * R3:
 * - Cross-boundary selection across complex nested structures (e.g. numerator of inner fraction to denominator of outer fraction).
 * - Inverted selection (head < anchor) crossing boundaries with Shift+ArrowUp / Shift+ArrowLeft.
 * - Partial selection deletion and replacement by typing with cross-boundary ranges.
 * - Generalized recursive deletion Rule 1, Rule 2, Rule 3 across 3-level fractions, roots, and scripts.
 * - 2-stage Backspace state machine: non-empty placeholder highlight (Stage 1), emptying on second Backspace (Stage 2), and parent structure dissolution on third Backspace (Stage 3).
 *
 * R4:
 * - Gallery item click insertion into active nested slots (e.g. clicking radical button while inside fraction denominator).
 * - Smart caret placement verifying caret is in first empty slot of inserted structure.
 * - Focus preservation: clicking gallery buttons does not blur the equation widget or cause caret disappearance.
 * - Auto-show gallery trigger: verify sidebar reveals on equation focus when enabled, and stays closed when disabled.
 * - Rapid toggle command executions (20+ cycles).
 * - Interoperability: gallery insertion replacing active cross-boundary selection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  createSuperscript,
  createMatrix,
  comparePositions,
  isSlotEmpty,
  resetIdCounter,
  updateParentPointers,
  findSlotById,
} from '../../src/core/ast';
import {
  normalizeSelection,
  deleteSelection,
  deleteParentStructure,
  updatePartialSelectionDom,
  insertCharacter,
  handleBackspace,
} from '../../src/editor/selection';
import {
  getActiveEquationState,
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import { createMockEditor } from '../helpers/cm6-mock';
import WordEquationPlugin, {
  VIEW_TYPE_EQUATION_GALLERY,
  DEFAULT_SETTINGS,
} from '../../src/main';
import {
  EquationGalleryView,
  GALLERY_CATEGORIES,
} from '../../src/gallery/gallery-view';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Gen18 Adversarial Stress Suite: Requirements R3 & R4', () => {
  let app: any;
  let plugin: WordEquationPlugin;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    app = new App();
    plugin = new WordEquationPlugin(app, {} as any);
    plugin.settings = { ...DEFAULT_SETTINGS };
  });

  afterEach(() => {
    clearActiveEquationState();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // Section 1: R3 Cross-Boundary & Nested Partial Selection Stress Tests
  // =========================================================================
  describe('R3: Cross-Boundary & Inverted Partial Selection', () => {
    it('Test 1: selects across complex 3-level nested fractions from inner numerator to outer denominator', () => {
      // Structure: \frac{\frac{a + b}{c + d}}{e + f}
      const docStr = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mfrac>',
        '    <mrow>',
        '      <mfrac>',
        '        <mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>',
        '        <mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow>',
        '      </mfrac>',
        '    </mrow>',
        '    <mrow><mi>e</mi><mo>+</mo><mi>f</mi></mrow>',
        '  </mfrac>',
        '</math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Locate inner fraction's numerator and outer denominator
      let innerNumEl: HTMLElement | null = null;
      dom.querySelectorAll('.eq-numerator .eq-slot').forEach((el) => {
        if (el.textContent?.includes('a') && el.textContent?.includes('b')) {
          innerNumEl = el as HTMLElement;
        }
      });
      expect(innerNumEl).not.toBeNull();
      const innerNumSlotId = innerNumEl!.getAttribute('data-slot-id')!;

      // Position caret inside inner numerator at offset 1 (between 'a' and '+')
      widget!.enterFromStart(view);
      widget!.caret = { slotId: innerNumSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      // 1. Shift+ArrowDown into inner denominator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      expect(widget!.selection).not.toBeNull();

      // 2. Shift+ArrowDown again into outer denominator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));

      // Outer denominator slot contains 'e + f'
      let outerDenEl: HTMLElement | null = null;
      dom.querySelectorAll('.eq-denominator > .eq-slot').forEach((el) => {
        if (el.textContent?.includes('e') && el.textContent?.includes('f')) {
          outerDenEl = el as HTMLElement;
        }
      });
      expect(outerDenEl).not.toBeNull();
      const outerDenSlotId = outerDenEl!.getAttribute('data-slot-id')!;

      expect(widget!.selection!.anchor.slotId).toBe(innerNumSlotId);
      expect(widget!.selection!.anchor.offset).toBe(1);
      expect(widget!.selection!.head.slotId).toBe(outerDenSlotId);

      // Verify topological ordering: anchor < head
      expect(comparePositions(widget!.ast, widget!.selection!.anchor, widget!.selection!.head)).toBeLessThan(0);

      // Verify DOM highlights span both inner fraction components and outer denominator
      expect(innerNumEl!.closest('.eq-numerator')?.classList.contains('eq-partial-selected')).toBe(true);
      expect(outerDenEl!.closest('.eq-denominator')?.classList.contains('eq-partial-selected')).toBe(true);

      // Token 'a' in inner numerator is not selected; token '+' and 'b' are selected
      const numTokens = innerNumEl!.querySelectorAll('.eq-token');
      expect(numTokens[0].classList.contains('eq-selected-token')).toBe(false); // 'a'
      expect(numTokens[1].classList.contains('eq-selected-token')).toBe(true);  // '+'
      expect(numTokens[2].classList.contains('eq-selected-token')).toBe(true);  // 'b'

      view.destroy();
      container.remove();
    });

    it('Test 2: inverted selection (head < anchor) crossing boundaries upward with Shift+ArrowUp', () => {
      // Structure: \frac{a + b}{c + d}
      const docStr = '```math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const denEl = dom.querySelector('.eq-denominator .eq-slot') as HTMLElement;
      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const denSlotId = denEl.getAttribute('data-slot-id')!;
      const numSlotId = numEl.getAttribute('data-slot-id')!;

      // Caret in denominator at offset 2 (between '+' and 'd')
      widget!.enterFromStart(view);
      widget!.caret = { slotId: denSlotId, offset: 2 };
      widget!.updateCaretOnly(dom);

      // Inverted selection: Shift+ArrowUp moves head upward into numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));

      expect(widget!.selection).not.toBeNull();
      expect(widget!.selection!.anchor.slotId).toBe(denSlotId);
      expect(widget!.selection!.anchor.offset).toBe(2);
      expect(widget!.selection!.head.slotId).toBe(numSlotId);

      // Head is topologically BEFORE anchor
      const cmp = comparePositions(widget!.ast, widget!.selection!.head, widget!.selection!.anchor);
      expect(cmp).toBeLessThan(0);

      // normalizeSelection must correctly recognize backward direction and order start <= end
      const normalized = normalizeSelection(widget!.ast, widget!.selection!);
      expect(normalized.isBackward).toBe(true);
      expect(normalized.start.slotId).toBe(numSlotId);
      expect(normalized.end.slotId).toBe(denSlotId);

      // Visual highlight: both numerator and denominator have partial selection class
      expect(dom.querySelector('.eq-numerator')?.classList.contains('eq-partial-selected')).toBe(true);
      expect(dom.querySelector('.eq-denominator')?.classList.contains('eq-partial-selected')).toBe(true);

      view.destroy();
      container.remove();
    });

    it('Test 3: inverted selection (head < anchor) traversing backward across composite boundaries with Shift+ArrowLeft', () => {
      // Structure: a + \frac{b}{c} + d
      const docStr = '```math-word\n<math><mrow><mi>a</mi><mo>+</mo><mfrac><mrow><mi>b</mi></mrow><mrow><mi>c</mi></mrow></mfrac><mo>+</mo><mi>d</mi></mrow></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Position caret at end of root slot (after 'd')
      widget!.enterFromEnd(view);
      const rootSlotId = widget!.ast.id;
      const initialOffset = widget!.ast.children.length; // 5 children

      // Extend selection backward with Shift+ArrowLeft multiple times
      // 1. past 'd'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      // 2. past '+'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      // 3. atomically selects fraction structure
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));

      expect(widget!.selection).not.toBeNull();
      expect(widget!.selection!.anchor.slotId).toBe(rootSlotId);
      expect(widget!.selection!.anchor.offset).toBe(initialOffset);

      // Head selects fraction atomically in root slot (Bug 1 fixed: no descent into denominator)
      expect(widget!.selection!.head.slotId).toBe(rootSlotId);
      expect(widget!.selection!.head.offset).toBe(2);
      expect(dom.querySelector('.eq-fraction')?.classList.contains('eq-selected-structure')).toBe(true);

      // Topological order: head < anchor
      expect(comparePositions(widget!.ast, widget!.selection!.head, widget!.selection!.anchor)).toBeLessThan(0);

      view.destroy();
      container.remove();
    });

    it('Test 4: cross-boundary partial selection deletion across 3-level fraction clears intermediate slots', () => {
      // Structure: \frac{1}{\frac{2}{\frac{3}{4}}}
      const docStr = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mfrac>',
        '    <mrow><mn>1</mn></mrow>',
        '    <mrow>',
        '      <mfrac>',
        '        <mrow><mn>2</mn></mrow>',
        '        <mrow>',
        '          <mfrac>',
        '            <mrow><mn>3</mn></mrow>',
        '            <mrow><mn>4</mn></mrow>',
        '          </mfrac>',
        '        </mrow>',
        '      </mfrac>',
        '    </mrow>',
        '  </mfrac>',
        '</math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Locate level 2 numerator ('2') and level 3 denominator ('4')
      const slots = dom.querySelectorAll('.eq-slot');
      let lvl2NumSlotId = '';
      let lvl3DenSlotId = '';
      slots.forEach((s) => {
        if (s.textContent?.trim() === '2') lvl2NumSlotId = s.getAttribute('data-slot-id')!;
        if (s.textContent?.trim() === '4') lvl3DenSlotId = s.getAttribute('data-slot-id')!;
      });
      expect(lvl2NumSlotId).not.toBe('');
      expect(lvl3DenSlotId).not.toBe('');

      // Set cross-boundary selection from '2' to '4'
      widget!.enterFromStart(view);
      widget!.selection = {
        anchor: { slotId: lvl2NumSlotId, offset: 0 },
        head: { slotId: lvl3DenSlotId, offset: 1 },
      };
      widget!.caret = widget!.selection.head;
      widget!.updateCaretOnly(dom);

      // Press Backspace to delete the selected cross-boundary range
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Selection must be cleared
      expect(widget!.selection).toBeNull();
      expect(widget!.caret.slotId).toBe(lvl2NumSlotId);
      expect(widget!.caret.offset).toBe(0);

      // Level 2 numerator '2' must be deleted
      const lvl2NumSlot = findSlotById(widget!.ast, lvl2NumSlotId);
      expect(lvl2NumSlot?.children.length).toBe(0);

      // Intermediate level 3 numerator '3' must also be cleared
      const lvl3Num = dom.querySelector('.eq-fraction .eq-fraction .eq-numerator .eq-slot');
      if (lvl3Num) {
        const id = lvl3Num.getAttribute('data-slot-id')!;
        const slotObj = findSlotById(widget!.ast, id);
        expect(slotObj?.children.length).toBe(0);
      }

      view.destroy();
      container.remove();
    });

    it('Test 5: replaces cross-boundary range by typing printable character', () => {
      const docStr = '```math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const denEl = dom.querySelector('.eq-denominator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;
      const denSlotId = denEl.getAttribute('data-slot-id')!;

      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      // Shift+ArrowDown to span numerator '+' and 'b' and denominator 'c'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      expect(widget!.selection).not.toBeNull();

      // Type printable character 'w' to replace the range
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));

      expect(widget!.selection).toBeNull();
      const updatedNum = findSlotById(widget!.ast, numSlotId)!;
      // Numerator should have 'a' followed by 'w'
      expect((updatedNum.children[0] as any).text).toBe('a');
      expect((updatedNum.children[1] as any).text).toBe('w');

      // Document synced cleanly
      expect(view.state.doc.toString()).toContain('<mi>w</mi>');

      view.destroy();
      container.remove();
    });

    it('Test 6: multi-character token partial selection and deletion', () => {
      const docStr = '```math-word\n<math><mrow><mn>12345</mn></mrow></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      // Select the token node
      widget!.selection = {
        anchor: { slotId: widget!.ast.id, offset: 0 },
        head: { slotId: widget!.ast.id, offset: 1 },
      };
      widget!.caret = widget!.selection.head;
      widget!.updateCaretOnly(dom);

      // Backspace deletes the selection
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.selection).toBeNull();
      expect(widget!.ast.children.length).toBe(0);
      expect(view.state.doc.toString()).not.toContain('12345');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // Section 2: R3 Generalized Recursive Deletion Rules Stress Tests
  // =========================================================================
  describe('R3: Generalized Recursive Deletion Rules', () => {
    it('Test 7: Rule 1 deletes element to left at offset > 0 across deeply nested 3-level structure', () => {
      // Structure: \frac{a}{\frac{b}{\frac{x + y}{z}}}
      const docStr = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mfrac>',
        '    <mrow><mi>a</mi></mrow>',
        '    <mrow>',
        '      <mfrac>',
        '        <mrow><mi>b</mi></mrow>',
        '        <mrow>',
        '          <mfrac>',
        '            <mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow>',
        '            <mrow><mi>z</mi></mrow>',
        '          </mfrac>',
        '        </mrow>',
        '      </mfrac>',
        '    </mrow>',
        '  </mfrac>',
        '</math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Locate innermost numerator 'x + y'
      const slots = dom.querySelectorAll('.eq-slot');
      let targetSlotId = '';
      slots.forEach((s) => {
        if (s.textContent?.includes('x') && s.textContent?.includes('+')) {
          targetSlotId = s.getAttribute('data-slot-id')!;
        }
      });
      expect(targetSlotId).not.toBe('');

      // Caret right after '+' (offset 2)
      widget!.enterFromStart(view);
      widget!.caret = { slotId: targetSlotId, offset: 2 };
      widget!.updateCaretOnly(dom);

      // Backspace deletes '+' (Rule 1)
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.caret.offset).toBe(1);
      const targetSlot = findSlotById(widget!.ast, targetSlotId)!;
      expect(targetSlot.children.length).toBe(2);
      expect((targetSlot.children[0] as any).text).toBe('x');
      expect((targetSlot.children[1] as any).text).toBe('y');
      expect(view.state.doc.toString()).not.toContain('<mo>+</mo>');

      // Outer fractions remain fully intact
      expect(widget!.ast.children.length).toBe(1);
      expect(view.state.doc.toString()).toContain('<mi>a</mi>');
      expect(view.state.doc.toString()).toContain('<mi>b</mi>');

      view.destroy();
      container.remove();
    });

    it('Test 8: Rule 2 dissolves innermost fraction when Backspace is pressed at start of empty placeholder', () => {
      // Structure: \frac{a}{\frac{b}{\frac{}{c}}} (innermost numerator is empty)
      const docStr = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mfrac>',
        '    <mrow><mi>a</mi></mrow>',
        '    <mrow>',
        '      <mfrac>',
        '        <mrow><mi>b</mi></mrow>',
        '        <mrow>',
        '          <mfrac>',
        '            <mrow></mrow>',
        '            <mrow><mi>c</mi></mrow>',
        '          </mfrac>',
        '        </mrow>',
        '      </mfrac>',
        '    </mrow>',
        '  </mfrac>',
        '</math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(docStr, [], true);
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Find innermost empty numerator
      const innermostFrac = dom.querySelector('.eq-fraction .eq-fraction .eq-fraction') as HTMLElement;
      expect(innermostFrac).not.toBeNull();
      const emptyNumSlot = innermostFrac.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const emptyNumSlotId = emptyNumSlot.getAttribute('data-slot-id')!;

      widget!.enterFromStart(view);
      widget!.caret = { slotId: emptyNumSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Backspace at offset 0 of empty numerator when denominator has '4' (non-empty):
      // Under Gen19 R2, the fraction is NOT dissolved; caret moves to denominator '4'!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Level 3 fraction must still be intact!
      let outerFrac = widget!.ast.children[0] as any;
      let midFrac = outerFrac.denominator.children[0] as any;
      let innerFrac = midFrac.denominator.children[0] as any;
      expect(innerFrac).toBeDefined();
      expect(innerFrac.type).toBe('fraction');
      expect(widget!.caret.slotId).toBe(innerFrac.denominator.id);
      expect(widget!.caret.offset).toBe(1);

      // Now backspacing on denominator: caret is at offset 1, so Backspace deletes '4' (Rule 1)
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      outerFrac = widget!.ast.children[0] as any;
      midFrac = outerFrac.denominator.children[0] as any;
      innerFrac = midFrac.denominator.children[0] as any;
      expect(innerFrac.denominator.children.length).toBe(0);

      // Now both numerator and denominator of level-3 fraction are empty: Backspace dissolves it!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Level 3 fraction must be completely gone
      outerFrac = widget!.ast.children[0] as any;
      midFrac = outerFrac.denominator.children[0] as any;
      expect(midFrac.denominator.children.length).toBe(0); // empty placeholder now

      // Document must have only 2 levels of fractions
      const mfracMatches = view.state.doc.toString().match(/<mfrac>/g);
      expect(mfracMatches?.length).toBe(2);

      view.destroy();
      container.remove();
    });

    it('Test 9: Rule 2 dissolves radical inside fraction numerator when Backspace is pressed at start of empty radicand', () => {
      // Structure: \frac{\sqrt{} + 1}{2}
      const docStr = '```math-word\n<math><mfrac><mrow><msqrt><mrow></mrow></msqrt><mo>+</mo><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const radSlot = dom.querySelector('.eq-radicand .eq-slot') as HTMLElement;
      const radSlotId = radSlot.getAttribute('data-slot-id')!;

      widget!.enterFromStart(view);
      widget!.caret = { slotId: radSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Backspace at start of empty radicand: dissolves the radical
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Radical is removed, '+ 1' remains in numerator
      expect(view.state.doc.toString()).not.toContain('<msqrt>');
      const numSlot = (widget!.ast.children[0] as any).numerator;
      expect(numSlot.children.length).toBe(2);
      expect(numSlot.children[0].text).toBe('+');
      expect(numSlot.children[1].text).toBe('1');

      view.destroy();
      container.remove();
    });

    it('Test 10: Rule 3 3-stage Backspace state machine on non-empty placeholder in 3-level nested fraction', () => {
      // Structure: \frac{1}{\frac{2}{3}}
      const docStr = '```math-word\n<math><mfrac><mrow><mn>1</mn></mrow><mrow><mfrac><mrow><mn>2</mn></mrow><mrow><mn>3</mn></mrow></mfrac></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Locate inner denominator ('3')
      const slots = dom.querySelectorAll('.eq-slot');
      let innerDenSlotId = '';
      let innerDenEl: HTMLElement | null = null;
      slots.forEach((s) => {
        if (s.textContent?.trim() === '3') {
          innerDenSlotId = s.getAttribute('data-slot-id')!;
          innerDenEl = s as HTMLElement;
        }
      });
      expect(innerDenSlotId).not.toBe('');

      widget!.enterFromStart(view);
      widget!.caret = { slotId: innerDenSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // --- Stage 1: 1st Backspace highlights placeholder without modifying AST ---
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.highlightedSlotId).toBe(innerDenSlotId);
      expect(innerDenEl!.classList.contains('eq-placeholder-highlighted') || innerDenEl!.classList.contains('eq-selected-slot')).toBe(true);
      // '3' is still in AST!
      expect(view.state.doc.toString()).toContain('<mn>3</mn>');

      // --- Stage 2: 2nd Backspace empties placeholder ---
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.highlightedSlotId).toBeNull();
      const denSlot = findSlotById(widget!.ast, innerDenSlotId)!;
      expect(denSlot.children.length).toBe(0); // Now empty placeholder
      expect(view.state.doc.toString()).not.toContain('<mn>3</mn>');

      // --- Stage 3: In Gen19 R2, Backspace on empty denominator when numerator has '2' (non-empty)
      // does NOT dissolve the fraction; it moves caret to the end of the non-empty numerator! ---
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      let outerFrac = widget!.ast.children[0] as any;
      let innerFrac = outerFrac.denominator.children[0] as any;
      expect(innerFrac).toBeDefined();
      expect(innerFrac.type).toBe('fraction');
      expect(widget!.caret.slotId).toBe(innerFrac.numerator.id);
      expect(widget!.caret.offset).toBe(1);

      // Backspace on numerator: caret at offset 1 deletes '2' (Rule 1)
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      outerFrac = widget!.ast.children[0] as any;
      innerFrac = outerFrac.denominator.children[0] as any;
      expect(innerFrac.numerator.children.length).toBe(0);

      // Now both slots are empty: Backspace dissolves inner fraction!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Inner fraction is dissolved; outer denominator now empty
      outerFrac = widget!.ast.children[0] as any;
      expect(outerFrac.denominator.children.length).toBe(0);
      expect(view.state.doc.toString()).not.toContain('<mn>2</mn>');

      view.destroy();
      container.remove();
    });

    it('Test 11: Rule 3 3-stage Backspace on script exponent dissolves to base', () => {
      // Structure: x^{y + 1}
      const docStr = '```math-word\n<math><msup><mrow><mi>x</mi></mrow><mrow><mi>y</mi><mo>+</mo><mn>1</mn></mrow></msup></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const supEl = dom.querySelector('.eq-superscript .eq-slot') as HTMLElement;
      expect(supEl).not.toBeNull();
      const supSlotId = supEl.getAttribute('data-slot-id')!;

      widget!.enterFromStart(view);
      widget!.caret = { slotId: supSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Backspace 1: highlights sup placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(widget!.highlightedSlotId).toBe(supSlotId);

      // Backspace 2: empties sup slot
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(widget!.highlightedSlotId).toBeNull();
      const supSlot = findSlotById(widget!.ast, supSlotId)!;
      expect(supSlot.children.length).toBe(0);

      // Backspace 3: dissolves superscript into base 'x'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(widget!.ast.children.length).toBe(1);
      expect((widget!.ast.children[0] as any).text).toBe('x');
      expect(view.state.doc.toString()).not.toContain('<msup>');

      view.destroy();
      container.remove();
    });

    it('Test 12: Rule 3 at Root Slot selects equation in CodeMirror and deletes on subsequent Backspace', () => {
      const docStr = '## Header\n```math-word\n<math><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></math>\n```\nAfter';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.caret.offset).toBe(0);

      // Backspace at root offset 0: selects equation in CodeMirror
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect(view.state.selection.main.empty).toBe(false);
      expect(view.state.selection.main.from).toBe(widget!.from);
      expect(view.state.selection.main.to).toBe(widget!.to);

      // Second Backspace in CodeMirror deletes the whole equation
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(view.state.doc.toString()).toBe('## Header\nAfter');
      expect(view.state.selection.main.anchor).toBe(widget!.from);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // Section 3: R4 Equation Gallery Sidebar & Smart Caret Placement Stress Tests
  // =========================================================================
  describe('R4: Gallery Item Insertion & Smart Caret Placement', () => {
    it('Test 13: inserts gallery radical item into active nested slot (fraction denominator)', async () => {
      await plugin.onload();

      const docStr = '```math-word\n<math><mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const denEl = dom.querySelector('.eq-denominator .eq-slot') as HTMLElement;
      const denSlotId = denEl.getAttribute('data-slot-id')!;

      // Focus inside denominator after 'b' (offset 1)
      widget!.enterFromStart(view);
      widget!.caret = { slotId: denSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      // Click square root button
      const sqrtBtn = gallery.contentEl.querySelector('.equation-gallery-btn[data-item="sqrt"]') as HTMLButtonElement;
      expect(sqrtBtn).not.toBeNull();
      sqrtBtn.click();

      // Denominator should now contain 'b' AND the new radical
      const updatedDen = findSlotById(widget!.ast, denSlotId)!;
      expect(updatedDen.children.length).toBe(2);
      expect(updatedDen.children[0].type).toBe('token');
      expect(updatedDen.children[1].type).toBe('radical');

      // Smart caret placement: caret placed in the radicand placeholder of the new radical!
      const radNode = updatedDen.children[1] as any;
      expect(widget!.caret.slotId).toBe(radNode.radicand.id);
      expect(widget!.caret.offset).toBe(0);

      // Document synced
      expect(view.state.doc.toString()).toContain('<msqrt>');

      view.destroy();
      container.remove();
    });

    it('Test 14: verifies smart caret placement across fraction, root, script, matrix, and operator', () => {
      const doc = '```math-word\n<math><mrow></mrow></math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      // 1. Fraction: caret -> numerator
      const w1 = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false);
      w1.enterFromStart(cmView);
      w1.insertMathSnippet('<mfrac><mrow></mrow><mrow></mrow></mfrac>', cmView);
      const frac = w1.ast.children[0] as any;
      expect(w1.caret.slotId).toBe(frac.numerator.id);
      expect(w1.caret.offset).toBe(0);

      // 2. Square Root: caret -> radicand
      const w2 = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false);
      w2.enterFromStart(cmView);
      w2.insertMathSnippet('<msqrt><mrow></mrow></msqrt>', cmView);
      const rad = w2.ast.children[0] as any;
      expect(w2.caret.slotId).toBe(rad.radicand.id);
      expect(w2.caret.offset).toBe(0);

      // 3. Cube Root (mroot): caret -> radicand (first empty slot)
      const w3 = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false);
      w3.enterFromStart(cmView);
      w3.insertMathSnippet('<mroot><mrow></mrow><mn>3</mn></mroot>', cmView);
      const rootNode = w3.ast.children[0] as any;
      expect(w3.caret.slotId).toBe(rootNode.radicand.id);
      expect(w3.caret.offset).toBe(0);

      // 4. Superscript (x^{⬚}): caret -> exponent
      const w4 = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false);
      w4.enterFromStart(cmView);
      w4.insertMathSnippet('<msup><mrow><mi>x</mi></mrow><mrow></mrow></msup>', cmView);
      const supNode = w4.ast.children[0] as any;
      expect(w4.caret.slotId).toBe(supNode.sup.id);
      expect(w4.caret.offset).toBe(0);

      // 5. Matrix 2x2: caret -> first cell (row 0, col 0)
      const w5 = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false);
      w5.enterFromStart(cmView);
      w5.insertMathSnippet('<mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable>', cmView);
      const matNode = w5.ast.children[0] as any;
      expect(w5.caret.slotId).toBe(matNode.rows[0][0].id);
      expect(w5.caret.offset).toBe(0);

      // 6. Operator (±): no empty child slots, caret placed after operator (offset 1)
      const w6 = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false);
      w6.enterFromStart(cmView);
      w6.insertMathSnippet('<mo>±</mo>', cmView);
      expect(w6.caret.slotId).toBe(w6.ast.id);
      expect(w6.caret.offset).toBe(1);

      cmView.destroy();
    });

    it('Test 15: focus preservation ensures clicking gallery buttons prevents blur and keeps visual caret rendered', async () => {
      await plugin.onload();

      const docStr = '```math-word\n<math><mrow><mi>x</mi></mrow></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const btn = gallery.contentEl.querySelector('.equation-gallery-btn') as HTMLButtonElement;
      expect(btn).not.toBeNull();

      // Dispatch pointerdown and mousedown
      const ptrEvt = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      const mouseEvt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

      btn.dispatchEvent(ptrEvt);
      btn.dispatchEvent(mouseEvt);

      // Default must be prevented on both to avoid browser focus shifting
      expect(ptrEvt.defaultPrevented).toBe(true);
      expect(mouseEvt.defaultPrevented).toBe(true);

      // Equation widget remains focused!
      expect(widget!.isFocused).toBe(true);
      expect(getActiveEquationState()?.isFocused).toBe(true);

      // Blinking caret DOM element (.eq-caret) must still be rendered
      const caretEl = dom.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('Test 16: auto-show gallery triggers sidebar view when enabled and stays quiet when disabled', async () => {
      await plugin.onload();
      const activateSpy = vi.spyOn(plugin, 'activateGalleryView');

      // Case A: autoShowGallery is false
      plugin.settings.autoShowGallery = false;
      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'root', offset: 0 },
        isFocused: true,
      });
      expect(activateSpy).not.toHaveBeenCalled();

      // Case B: autoShowGallery is true
      clearActiveEquationState();
      plugin.settings.autoShowGallery = true;
      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'root', offset: 0 },
        isFocused: true,
      });
      expect(activateSpy).toHaveBeenCalledTimes(1);

      // Case C: Toggling autoShowGallery back to false
      clearActiveEquationState();
      plugin.settings.autoShowGallery = false;
      setActiveEquationState({
        from: 20,
        to: 30,
        caret: { slotId: 'root', offset: 0 },
        isFocused: true,
      });
      expect(activateSpy).toHaveBeenCalledTimes(1); // still 1
    });
  });

  // =========================================================================
  // Section 4: R4 Commands, Sidebar Lifecycle & Delimiter Stress Tests
  // =========================================================================
  describe('R4: Commands, Sidebar Lifecycle & Delimiters', () => {
    it('Test 17: survives rapid gallery toggle command executions (25 cycles) without leaking leaves', async () => {
      await plugin.onload();

      expect(app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length).toBe(0);

      // 25 rapid toggle cycles
      for (let i = 0; i < 25; i++) {
        await app.commands.executeCommandById('toggle-equation-gallery');
        const count = app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length;
        // Odd iteration -> 1 leaf; Even iteration -> 0 leaves
        expect(count).toBe((i % 2 === 0) ? 1 : 0);
      }

      // Final 25th cycle (index 24) had 1 leaf; toggle once more to detach cleanly
      await app.commands.executeCommandById('toggle-equation-gallery');
      expect(app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length).toBe(0);
    });

    it('Test 18: gallery insertion into inline equation preserves inline delimiter syntax', async () => {
      await plugin.onload();

      const docStr = 'Text before /weq_inline <math><mrow><mi>x</mi></mrow></math> /weq_inline text after';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      expect(widget!.isInline).toBe(true);
      const dom = widget!.toDOM(view);

      widget!.enterFromEnd(view);

      // Insert radical into inline equation
      widget!.insertMathSnippet('<msqrt><mrow></mrow></msqrt>', view);

      // Document must retain /weq_inline markers
      const updatedText = view.state.doc.toString();
      expect(updatedText).toContain('/weq_inline');
      expect(updatedText).toContain('<msqrt>');
      expect(updatedText).not.toContain('```math-word');

      view.destroy();
      container.remove();
    });

    it('Test 19: gallery snippet insertion directly replaces active cross-boundary selection', async () => {
      await plugin.onload();

      const docStr = '```math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const numEl = dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      const numSlotId = numEl.getAttribute('data-slot-id')!;

      // Position caret at numerator offset 1
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 1 };
      widget!.updateCaretOnly(dom);

      // Shift+ArrowDown to span across fraction boundary
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      expect(widget!.selection).not.toBeNull();

      // Now insert a gallery operator '×' while selection is active
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const timesBtn = gallery.contentEl.querySelector('.equation-gallery-btn[data-item="times"]') as HTMLButtonElement;
      expect(timesBtn).not.toBeNull();
      timesBtn.click();

      // Selected cross-boundary tokens are replaced, '×' is inserted
      expect(widget!.selection).toBeNull();
      expect(view.state.doc.toString()).toContain('×');

      view.destroy();
      container.remove();
    });

    it('Test 20: executes "Insert block equation" (Alt+=) and "Insert inline equation" command palette commands', async () => {
      await plugin.onload();

      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      // 1. Execute "Insert block equation"
      await app.commands.executeCommandById('insert-block-equation');
      let content = mdView.editor.getValue();
      expect(content).toContain('```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
      expect(content).toContain('```\n');

      // 2. Clear and execute "Insert inline equation"
      mdView.editor.setValue('');
      await app.commands.executeCommandById('insert-inline-equation');
      content = mdView.editor.getValue();
      expect(content).toBe('/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math> /weq_inline');
    });
  });
});
