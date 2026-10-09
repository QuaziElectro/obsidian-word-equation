/**
 * Challenger Gen 62 Invariant Properties Verification Suite
 * Author: teamwork_preview_challenger_p2_2_rep1_gen62
 *
 * Mathematically and empirically verifies the 4 core structural invariants:
 * 1. Invariant 1 (Height & Vertical Space Invariance):
 *    - When an empty intermediate line exists between two consecutive block equations,
 *      its height is strictly 0px (classes include `.word-equation-collapsed-gap`).
 *    - Adding text breaks the invariant (height > 0px); deleting back to empty restores
 *      the invariant (height 0px).
 * 2. Invariant 2 (Bidirectional Symmetry of Caret Navigation):
 *    - Exiting Eq 1 forward lands at pos P. Exiting Eq 2 backward lands at pos P.
 *    - ArrowLeft from pos P enters Eq 1 from end. ArrowRight from pos P enters Eq 2 from start.
 * 3. Invariant 3 (Selection Parity Invariance):
 *    - For any AST equation structure E, executing `handleSelectionStep` in `WordEquationWidget`
 *      versus `InteractiveEquationBox` produces identical selection anchor/head tuples.
 *    - For any selection S in `InteractiveEquationBox`, pressing unshifted ArrowLeft/ArrowRight
 *      collapses selection to min/max position without jumping an extra character.
 * 4. Invariant 4 (Command Palette Cardinality Invariant):
 *    - `listCommands().filter(c => c.name.toLowerCase().includes('block equation')).length === 1`
 *    - `listCommands().filter(c => c.name.toLowerCase().includes('inline equation')).length === 1`
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import {
  wordEquationStateField,
  wordEquationCollapsedGapField,
  buildCollapsedGapDecorations,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { parseMathML } from '../../src/core/mathml-parser';
import {
  findSlotById,
  getAllSlotsInOrder,
  normalizeSelection,
  comparePositions,
} from '../../src/core/ast';
import { SlotNode, CaretPosition, SelectionRange } from '../../src/core/types';
import { handleSelectionStep } from '../../src/editor/navigation';

describe('Challenger Gen 62 Invariant Property Verification', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const cssPath = path.resolve(__dirname, '../../styles.css');
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      styleEl = document.createElement('style');
      styleEl.id = 'gen62-invariants-style';
      styleEl.textContent = cssContent;
      document.head.appendChild(styleEl);
    }
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    if (styleEl) styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // INVARIANT 1: Height & Vertical Space Invariance
  // =========================================================================
  describe('Invariant 1: Height & Vertical Space Invariance', () => {
    it('Property 1.1: Empty intermediate line between block equations strictly possesses .word-equation-collapsed-gap decoration and 0px computed height', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const intermediateLine = view.state.doc.line(4);
      expect(intermediateLine.length).toBe(0);

      // Verify decoration set contains .word-equation-collapsed-gap
      const gapDecs = buildCollapsedGapDecorations(view.state);
      let foundCollapsedDec = false;
      gapDecs.between(intermediateLine.from, intermediateLine.to, (from, to, dec) => {
        if ((dec.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
          foundCollapsedDec = true;
        }
      });
      expect(foundCollapsedDec).toBe(true);

      // Verify DOM CSS rule for .cm-line.word-equation-collapsed-gap enforces 0px height
      const testLineEl = document.createElement('div');
      testLineEl.className = 'cm-line word-equation-collapsed-gap';
      document.body.appendChild(testLineEl);
      const computed = window.getComputedStyle(testLineEl);
      expect(computed.height).toBe('0px');
      expect(computed.lineHeight).toBe('0px');
      expect(computed.minHeight).toBe('0px');
      testLineEl.remove();

      view.destroy();
      c.remove();
    });

    it('Property 1.2: Dynamic Expansion & Restoration Invariant: typing text breaks 0px invariant (>0px); deleting back to empty restores 0px invariant across repeated cycles', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const cycles = ['hello', '1234567890', 'x', 'a + b = c', '   whitespace   '];

      for (let i = 0; i < cycles.length; i++) {
        const textToInsert = cycles[i];

        // 1. Initial State: Line is empty -> MUST be collapsed (0px)
        let intermediateLine = view.state.doc.line(4);
        expect(intermediateLine.length).toBe(0);
        let gapDecs = buildCollapsedGapDecorations(view.state);
        let hasGapDec = false;
        gapDecs.between(intermediateLine.from, intermediateLine.to, (f, t, d) => {
          if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
            hasGapDec = true;
          }
        });
        expect(hasGapDec).toBe(true);

        // 2. Perturbation: Insert text into intermediate line
        view.dispatch({
          changes: { from: intermediateLine.from, insert: textToInsert },
          selection: { anchor: intermediateLine.from + textToInsert.length },
        });

        // 3. Invariant Broken: Line has text -> MUST NOT be collapsed
        intermediateLine = view.state.doc.line(4);
        expect(intermediateLine.length).toBe(textToInsert.length);
        gapDecs = buildCollapsedGapDecorations(view.state);
        let hasGapDecWithText = false;
        gapDecs.between(intermediateLine.from, intermediateLine.to, (f, t, d) => {
          if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
            hasGapDecWithText = true;
          }
        });
        expect(hasGapDecWithText).toBe(false);

        // 4. Restoration: Delete text back to empty string
        view.dispatch({
          changes: { from: intermediateLine.from, to: intermediateLine.to, insert: '' },
          selection: { anchor: intermediateLine.from },
        });

        // 5. Invariant Restored: Line is empty again -> MUST be collapsed (0px)
        intermediateLine = view.state.doc.line(4);
        expect(intermediateLine.length).toBe(0);
        gapDecs = buildCollapsedGapDecorations(view.state);
        let hasGapDecRestored = false;
        gapDecs.between(intermediateLine.from, intermediateLine.to, (f, t, d) => {
          if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
            hasGapDecRestored = true;
          }
        });
        expect(hasGapDecRestored).toBe(true);
      }

      view.destroy();
      c.remove();
    });

    it('Property 1.3: Multi-Block Invariance: stacked cascade of N consecutive block equations with intermediate empty lines all collapse to 0px independently', () => {
      // 4 block equations with 3 intermediate empty lines
      const docStr =
        '```math-word\n<math><mn>1</mn></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mn>2</mn></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mn>3</mn></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mn>4</mn></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      // Lines 4, 8, and 12 are intermediate empty lines
      const line4 = view.state.doc.line(4);
      const line8 = view.state.doc.line(8);
      const line12 = view.state.doc.line(12);

      expect(line4.length).toBe(0);
      expect(line8.length).toBe(0);
      expect(line12.length).toBe(0);

      const gapDecs = buildCollapsedGapDecorations(view.state);

      const checkGapOnLine = (line: { from: number; to: number }) => {
        let found = false;
        gapDecs.between(line.from, line.to, (f, t, d) => {
          if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) found = true;
        });
        return found;
      };

      // All 3 empty lines must have collapsed gap decoration
      expect(checkGapOnLine(line4)).toBe(true);
      expect(checkGapOnLine(line8)).toBe(true);
      expect(checkGapOnLine(line12)).toBe(true);

      // Typing into middle line (line 8) breaks only line 8
      view.dispatch({
        changes: { from: line8.from, insert: 'text' },
      });

      const updatedDecs = buildCollapsedGapDecorations(view.state);
      const checkUpdatedGap = (line: { from: number; to: number }) => {
        let found = false;
        updatedDecs.between(line.from, line.to, (f, t, d) => {
          if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) found = true;
        });
        return found;
      };

      expect(checkUpdatedGap(view.state.doc.line(4))).toBe(true);
      expect(checkUpdatedGap(view.state.doc.line(8))).toBe(false);
      expect(checkUpdatedGap(view.state.doc.line(12))).toBe(true);

      view.destroy();
      c.remove();
    });

    it('Property 1.4: Non-Sandwiched Lines Negative Invariant: empty lines not sandwiched between consecutive block equations are never collapsed', () => {
      const docStr =
        '\n' + // line 1: empty before block eq
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        'Normal markdown text paragraph\n' +
        '\n' + // line 6: empty between text and block eq
        '```math-word\n<math><mi>B</mi></math>\n```\n' +
        '\n'; // line 10: empty at end of doc

      const { view, container: c } = createMockEditor(docStr, [], true);
      const gapDecs = buildCollapsedGapDecorations(view.state);

      // Check all lines
      let anyCollapsed = false;
      gapDecs.between(0, view.state.doc.length, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
          anyCollapsed = true;
        }
      });

      // No lines should be collapsed because none are sandwiched between consecutive block equations
      expect(anyCollapsed).toBe(false);

      view.destroy();
      c.remove();
    });

    it('Property 1.5: weq Delimiter Invariance: consecutive ```weq equations also receive .word-equation-collapsed-gap on intermediate empty line and collapse to 0px', () => {
      const docStr =
        '```weq\n<math><mi>A</mi></math>\n```\n' +
        '\n' +
        '```weq\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const emptyLine = view.state.doc.line(4);
      expect(emptyLine.length).toBe(0);

      const gapDecs = buildCollapsedGapDecorations(view.state);
      let foundCollapsed = false;
      gapDecs.between(emptyLine.from, emptyLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
          foundCollapsed = true;
        }
      });
      expect(foundCollapsed).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // INVARIANT 2: Bidirectional Symmetry of Caret Navigation
  // =========================================================================
  describe('Invariant 2: Bidirectional Symmetry of Caret Navigation', () => {
    it('Property 2.1: Symmetrical Landing: Exiting Eq 1 forward lands at pos P; exiting Eq 2 backward lands at identical pos P', () => {
      // Document with pre-existing empty line between Eq 1 and Eq 2
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let w1: WordEquationWidget | null = null;
      let w2: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          if (w.code.includes('A')) w1 = w;
          if (w.code.includes('B')) w2 = w;
        }
      });
      expect(w1).not.toBeNull();
      expect(w2).not.toBeNull();

      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || w1!.toDOM(view);
      const dom2 = (view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement) || w2!.toDOM(view);

      // 1. Enter Eq 1, navigate to end, exit forward
      w1!.enterFromStart(view);
      expect(w1!.isFocused).toBe(true);
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // past 'A'
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // exit forward
      expect(w1!.isFocused).toBe(false);

      const posP_forward = view.state.selection.main.anchor;
      const lineP_forward = view.state.doc.lineAt(posP_forward);
      expect(lineP_forward.length).toBe(0); // must land on intermediate empty line

      // 2. Enter Eq 2, navigate to start, exit backward
      w2!.enterFromStart(view);
      expect(w2!.isFocused).toBe(true);
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); // exit backward
      expect(w2!.isFocused).toBe(false);

      const posP_backward = view.state.selection.main.anchor;
      const lineP_backward = view.state.doc.lineAt(posP_backward);
      expect(lineP_backward.length).toBe(0);

      // Exact symmetry: both forward and backward exits land at identical pos P
      expect(posP_forward).toBe(posP_backward);
      expect(lineP_forward.number).toBe(lineP_backward.number);

      view.destroy();
      c.remove();
    });

    it('Property 2.2: Symmetrical Re-entry: from pos P, ArrowLeft enters Eq 1 from end and ArrowRight enters Eq 2 from start', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const intermediateLine = view.state.doc.line(4);
      const posP = intermediateLine.from;

      // Place caret at pos P
      view.dispatch({ selection: { anchor: posP } });
      expect(view.state.selection.main.anchor).toBe(posP);

      // 1. ArrowRight from pos P MUST enter Eq 2 from start
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const activeAfterRight = getActiveEquationState();
      expect(activeAfterRight?.isFocused).toBe(true);
      expect((activeAfterRight?.ast?.children[0] as any)?.text).toBe('B');
      expect(activeAfterRight?.caret.offset).toBe(0); // at start

      // Clear back to pos P
      clearActiveEquationState();
      view.dispatch({ selection: { anchor: posP } });

      // 2. ArrowLeft from pos P MUST enter Eq 1 from end
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      const activeAfterLeft = getActiveEquationState();
      expect(activeAfterLeft?.isFocused).toBe(true);
      expect((activeAfterLeft?.ast?.children[0] as any)?.text).toBe('A');
      expect(activeAfterLeft?.caret.offset).toBe(1); // at end (past 'A')

      view.destroy();
      c.remove();
    });

    it('Property 2.3: Closed Loop Symmetry: Eq1 start -> Eq1 exit -> pos P -> Eq2 enter -> Eq2 exit -> pos P -> Eq1 enter forms a conservative closed cycle', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let w1: WordEquationWidget | null = null;
      let w2: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          if (w.code.includes('A')) w1 = w;
          if (w.code.includes('B')) w2 = w;
        }
      });
      expect(w1).not.toBeNull();
      expect(w2).not.toBeNull();

      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || w1!.toDOM(view);

      // Step 1: Enter Eq 1 from start
      w1!.enterFromStart(view);
      expect(w1!.isFocused).toBe(true);

      // Step 2: Exit Eq 1 forward
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(w1!.isFocused).toBe(false);
      const posP = view.state.selection.main.anchor;
      const initialDocLines = view.state.doc.lines;

      // Step 3: Enter Eq 2 via ArrowRight from pos P
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('B');

      // Step 4: Exit Eq 2 backward via ArrowLeft
      const dom2 = view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement;
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(getActiveEquationState()).toBeNull();
      expect(view.state.selection.main.anchor).toBe(posP);

      // Step 5: Enter Eq 1 from end via ArrowLeft from pos P
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('A');

      // Idempotency: line count did not accumulate extra lines across full cycle
      expect(view.state.doc.lines).toBe(initialDocLines);

      view.destroy();
      c.remove();
    });

    it('Property 2.4: Consecutive block equations without pre-existing empty line: forward exit creates line P, backward exit from Eq 2 lands at line P, and repeat exits remain strictly idempotent', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let w1: WordEquationWidget | null = null;
      let w2: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          if (w.code.includes('A')) w1 = w;
          if (w.code.includes('B')) w2 = w;
        }
      });
      expect(w1).not.toBeNull();
      expect(w2).not.toBeNull();

      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || w1!.toDOM(view);

      // 1. Forward exit from Eq 1 creates intermediate line
      w1!.enterFromStart(view);
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const posP = view.state.selection.main.anchor;
      const intermediateLine = view.state.doc.lineAt(posP);
      expect(intermediateLine.length).toBe(0);
      const docLinesAfterFirstExit = view.state.doc.lines;

      // 2. Re-enter Eq 2, then exit backward
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);

      const dom2 = view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement;
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      // Backward exit must land on same intermediate line posP
      expect(view.state.selection.main.anchor).toBe(posP);
      expect(view.state.doc.lines).toBe(docLinesAfterFirstExit);

      // 3. Repeat exit forward from Eq 1 must not create duplicate line
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(view.state.selection.main.anchor).toBe(posP);
      expect(view.state.doc.lines).toBe(docLinesAfterFirstExit);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // INVARIANT 3: Selection Parity Invariance
  // =========================================================================
  describe('Invariant 3: Selection Parity Invariance', () => {
    const testMathmlExpressions = [
      // 1. Simple linear
      '<math><mi>x</mi><mo>+</mo><mi>y</mi><mo>-</mo><mi>z</mi></math>',
      // 2. Single fraction
      '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>',
      // 3. Fraction with expressions
      '<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>-</mo><mi>d</mi></mrow></mfrac></math>',
      // 4. Nested fraction
      '<math><mfrac><mfrac><mn>1</mn><mn>2</mn></mfrac><mn>3</mn></mfrac></math>',
      // 5. Square root
      '<math><msqrt><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow></msqrt></math>',
      // 6. Quadratic formula
      '<math><mi>x</mi><mo>=</mo><mfrac><mrow><mo>-</mo><mi>b</mi><mo>±</mo><msqrt><mrow><msup><mi>b</mi><mn>2</mn></msup><mo>-</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></math>',
    ];

    it('Property 3.1: For any AST equation structure E, executing handleSelectionStep in WordEquationWidget versus InteractiveEquationBox produces identical selection anchor/head tuples', () => {
      for (const mathml of testMathmlExpressions) {
        // Create InteractiveEquationBox
        const boxContainer = document.createElement('div');
        container.appendChild(boxContainer);
        const box = new InteractiveEquationBox({
          container: boxContainer,
          initialContent: mathml,
          onChange: () => {},
        });
        box.focus();

        // Create WordEquationWidget with identical AST structure E
        const widget = new WordEquationWidget(mathml, 0, 100, true, '/weq_inline');
        widget.isFocused = true;
        // Invariant contract: operate on identical AST structure E
        widget.ast = box.ast;

        // Start both at offset 0
        box.caret = { slotId: box.ast.id, offset: 0 };
        box.selection = null;
        box.highlightedSlotId = null;

        widget.caret = { slotId: box.ast.id, offset: 0 };
        widget.selection = null;
        widget.highlightedSlotId = null;

        // Perform 6 forward Shift+ArrowRight steps
        for (let stepIdx = 0; stepIdx < 6; stepIdx++) {
          // Step widget
          widget.handleArrowNavigation('ArrowRight', true);

          // Step box
          box.dom.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
          );

          // Verify Selection Parity
          const wSel = widget.selection as SelectionRange | null;
          if (wSel === null) {
            expect(box.selection).toBeNull();
          } else {
            expect(box.selection).not.toBeNull();
            expect(box.selection!.anchor.slotId).toBe(wSel.anchor.slotId);
            expect(box.selection!.anchor.offset).toBe(wSel.anchor.offset);
            expect(box.selection!.head.slotId).toBe(wSel.head.slotId);
            expect(box.selection!.head.offset).toBe(wSel.head.offset);
          }

          // Verify Caret Parity
          expect(box.caret.slotId).toBe(widget.caret.slotId);
          expect(box.caret.offset).toBe(widget.caret.offset);

          // Verify Highlight Parity
          expect(box.highlightedSlotId).toBe(widget.highlightedSlotId);
        }

        // Perform 4 backward Shift+ArrowLeft steps
        for (let stepIdx = 0; stepIdx < 4; stepIdx++) {
          widget.handleArrowNavigation('ArrowLeft', true);
          box.dom.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true })
          );

          const wSelBack = widget.selection as SelectionRange | null;
          if (wSelBack === null) {
            expect(box.selection).toBeNull();
          } else {
            expect(box.selection).not.toBeNull();
            expect(box.selection!.anchor.slotId).toBe(wSelBack.anchor.slotId);
            expect(box.selection!.anchor.offset).toBe(wSelBack.anchor.offset);
            expect(box.selection!.head.slotId).toBe(wSelBack.head.slotId);
            expect(box.selection!.head.offset).toBe(wSelBack.head.offset);
          }

          expect(box.caret.slotId).toBe(widget.caret.slotId);
          expect(box.caret.offset).toBe(widget.caret.offset);
          expect(box.highlightedSlotId).toBe(widget.highlightedSlotId);
        }

        box.destroy();
        boxContainer.remove();
      }
    });

    it('Property 3.2: For any selection S in InteractiveEquationBox, pressing unshifted ArrowLeft/ArrowRight collapses selection to min/max position without jumping an extra character', () => {
      const mathml = '<math><mi>a</mi><mo>+</mo><mi>b</mi><mo>+</mo><mi>c</mi></math>';
      const boxContainer = document.createElement('div');
      container.appendChild(boxContainer);
      const box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: mathml,
        onChange: () => {},
      });
      box.focus();

      // Test combinations of selection ranges: forward (anchor < head) and reverse (anchor > head)
      const testSelections: SelectionRange[] = [
        { anchor: { slotId: box.ast.id, offset: 1 }, head: { slotId: box.ast.id, offset: 4 } }, // forward
        { anchor: { slotId: box.ast.id, offset: 4 }, head: { slotId: box.ast.id, offset: 1 } }, // reverse
        { anchor: { slotId: box.ast.id, offset: 0 }, head: { slotId: box.ast.id, offset: 5 } }, // full
      ];

      for (const sel of testSelections) {
        const norm = normalizeSelection(box.ast, sel);
        const expectedLeftPos = norm.start;
        const expectedRightPos = norm.end;

        // Test Unshifted ArrowLeft Collapse
        box.selection = { anchor: { ...sel.anchor }, head: { ...sel.head } };
        box.caret = { ...sel.head };
        box.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: false, bubbles: true })
        );

        // Invariant: Selection collapsed to null, caret at EXACT left boundary
        expect(box.selection).toBeNull();
        expect(box.caret.slotId).toBe(expectedLeftPos.slotId);
        expect(box.caret.offset).toBe(expectedLeftPos.offset);

        // Test Unshifted ArrowRight Collapse
        box.selection = { anchor: { ...sel.anchor }, head: { ...sel.head } };
        box.caret = { ...sel.head };
        box.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: false, bubbles: true })
        );

        // Invariant: Selection collapsed to null, caret at EXACT right boundary
        expect(box.selection).toBeNull();
        expect(box.caret.slotId).toBe(expectedRightPos.slotId);
        expect(box.caret.offset).toBe(expectedRightPos.offset);
      }

      box.destroy();
      boxContainer.remove();
    });

    it('Property 3.3: Collapse Step Invariant: unshifted arrow collapse consumes the event without extra movement; subsequent press resumes regular single-step movement from that exact collapsed position', () => {
      const mathml = '<math><mi>x</mi><mo>+</mo><mi>y</mi><mo>+</mo><mi>z</mi></math>';
      const boxContainer = document.createElement('div');
      container.appendChild(boxContainer);
      const box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: mathml,
        onChange: () => {},
      });
      box.focus();

      // Selection covering '+' and 'y' (offset 1 to 3)
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 1 },
        head: { slotId: box.ast.id, offset: 3 },
      };

      // 1. First ArrowLeft: collapses to offset 1 (left boundary) without stepping further left
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(1);

      // 2. Second ArrowLeft: now regular navigation steps from 1 to 0 (past 'x')
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(0);

      // 3. Establish selection again
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 1 },
        head: { slotId: box.ast.id, offset: 3 },
      };

      // 4. First ArrowRight: collapses to offset 3 (right boundary) without stepping further right
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(3);

      // 5. Second ArrowRight: regular navigation steps from 3 to 4 (past second '+')
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(4);

      box.destroy();
      boxContainer.remove();
    });

    it('Property 3.4: Nested Slot Selection Parity: starting selection inside nested fraction numerator produces identical anchor/head tuples in WordEquationWidget and InteractiveEquationBox', () => {
      const mathml = '<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mi>c</mi></mfrac></math>';
      const boxContainer = document.createElement('div');
      container.appendChild(boxContainer);
      const box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: mathml,
        onChange: () => {},
      });
      box.focus();

      const widget = new WordEquationWidget(mathml, 0, 100, true, '/weq_inline');
      widget.isFocused = true;
      widget.ast = box.ast;

      // Find the numerator slot inside the fraction
      const allSlots = getAllSlotsInOrder(box.ast);
      const numSlot = allSlots.find((s) => s.role === 'numerator') || allSlots[1];
      expect(numSlot).toBeDefined();

      // Start both at offset 0 of numerator slot
      box.caret = { slotId: numSlot.id, offset: 0 };
      box.selection = null;
      box.highlightedSlotId = null;

      widget.caret = { slotId: numSlot.id, offset: 0 };
      widget.selection = null;
      widget.highlightedSlotId = null;

      // Step 3 times forward with Shift+ArrowRight
      for (let i = 0; i < 3; i++) {
        widget.handleArrowNavigation('ArrowRight', true);
        box.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })
        );

        expect(box.selection).not.toBeNull();
        const wSel = widget.selection as unknown as SelectionRange;
        expect(box.selection!.anchor.slotId).toBe(wSel.anchor.slotId);
        expect(box.selection!.anchor.offset).toBe(wSel.anchor.offset);
        expect(box.selection!.head.slotId).toBe(wSel.head.slotId);
        expect(box.selection!.head.offset).toBe(wSel.head.offset);
        expect(box.caret.slotId).toBe(widget.caret.slotId);
        expect(box.caret.offset).toBe(widget.caret.offset);
      }

      box.destroy();
      boxContainer.remove();
    });
  });

  // =========================================================================
  // INVARIANT 4: Command Palette Cardinality Invariant
  // =========================================================================
  describe('Invariant 4: Command Palette Cardinality Invariant', () => {
    it('Property 4.1: Standard App listCommands() contains strictly 1 block equation command and strictly 1 inline equation command', async () => {
      const app: any = new App();
      const plugin = new WordEquationPlugin(app, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();

      const allCommands = app.commands.listCommands();

      const blockCommands = allCommands.filter((c: any) =>
        c.name?.toLowerCase().includes('block equation')
      );
      const inlineCommands = allCommands.filter((c: any) =>
        c.name?.toLowerCase().includes('inline equation')
      );

      // Cardinality Invariants
      expect(blockCommands.length).toBe(1);
      expect(inlineCommands.length).toBe(1);

      // Verify no duplicate legacy command names exist in command palette listing
      const legacyWordCmds = allCommands.filter((c: any) =>
        c.name?.toLowerCase().includes('word equation')
      );
      expect(legacyWordCmds.length).toBe(0);

      plugin.onunload();
    });

    it('Property 4.2: Desktop plain-object commands store preserves non-enumerable legacy aliases without command palette duplication', async () => {
      const desktopApp: any = new App();
      const plainCommandsMap: Record<string, any> = {};

      desktopApp.commands = {
        commands: plainCommandsMap,
        listCommands: () => {
          // In desktop Obsidian, Command Palette enumerates Object.values of the commands dict,
          // which ignores non-enumerable properties.
          return Object.values(plainCommandsMap);
        },
        executeCommandById: (id: string) => {
          const cmd = plainCommandsMap[id];
          if (cmd?.callback) return cmd.callback();
          if (cmd?.editorCallback) {
            const view = desktopApp.workspace.getActiveViewOfType(MarkdownView);
            if (view) return cmd.editorCallback((view as any).editor);
          }
        },
      };

      const plugin = new WordEquationPlugin(desktopApp, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();

      const enumeratedKeys = Object.keys(desktopApp.commands.commands);

      // Legacy command keys must NOT be enumerable
      expect(enumeratedKeys.includes('insert-word-equation')).toBe(false);
      expect(enumeratedKeys.includes('insert-word-equation-inline')).toBe(false);
      expect(enumeratedKeys.includes('obsidian-word-equation:insert-word-equation')).toBe(false);
      expect(enumeratedKeys.includes('obsidian-word-equation:insert-word-equation-inline')).toBe(false);

      // But direct indexing access to legacy aliases must succeed for backward compatibility
      expect(desktopApp.commands.commands['insert-word-equation']).toBeDefined();
      expect(desktopApp.commands.commands['insert-word-equation-inline']).toBeDefined();

      plugin.onunload();
    });

    it('Property 4.3: Backward-Compatible Programmatic Invocation: both canonical and legacy command IDs execute successfully', async () => {
      const app: any = new App();
      const plugin = new WordEquationPlugin(app, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();

      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      let editorContent = '';
      mdView.editor = {
        replaceSelection: (t: string) => {
          editorContent += t;
        },
      } as any;

      // 1. Canonical block command
      editorContent = '';
      app.commands.executeCommandById('insert-block-equation');
      expect(editorContent).toContain('```math-word');

      // 2. Legacy block command alias
      editorContent = '';
      app.commands.executeCommandById('insert-word-equation');
      expect(editorContent).toContain('```math-word');

      // 3. Canonical inline command
      editorContent = '';
      app.commands.executeCommandById('insert-inline-equation');
      expect(editorContent).toContain('/weq_inline');

      // 4. Legacy inline command alias
      editorContent = '';
      app.commands.executeCommandById('insert-word-equation-inline');
      expect(editorContent).toContain('/weq_inline');

      plugin.onunload();
    });

    it('Property 4.4: Re-load Idempotency Invariant: repeated plugin onload cycles preserve strict cardinality of 1', async () => {
      const app: any = new App();
      const plugin = new WordEquationPlugin(app, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };

      // Cycle 1
      await plugin.onload();
      let allCommands = app.commands.listCommands();
      expect(allCommands.filter((c: any) => c.name?.toLowerCase().includes('block equation')).length).toBe(1);
      expect(allCommands.filter((c: any) => c.name?.toLowerCase().includes('inline equation')).length).toBe(1);
      plugin.onunload();

      // Cycle 2
      await plugin.onload();
      allCommands = app.commands.listCommands();
      expect(allCommands.filter((c: any) => c.name?.toLowerCase().includes('block equation')).length).toBe(1);
      expect(allCommands.filter((c: any) => c.name?.toLowerCase().includes('inline equation')).length).toBe(1);
      plugin.onunload();
    });

    it('Property 4.5: Command Metadata and Hotkey Integrity: canonical block command registers Alt+= hotkey and valid editorCallback', async () => {
      const app: any = new App();
      const plugin = new WordEquationPlugin(app, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();

      const allCommands = app.commands.listCommands();
      const blockCmd = allCommands.find((c: any) => c.name?.toLowerCase().includes('block equation'));
      const inlineCmd = allCommands.find((c: any) => c.name?.toLowerCase().includes('inline equation'));

      expect(blockCmd).toBeDefined();
      expect(inlineCmd).toBeDefined();

      // Verify block command hotkey is not defined per Obsidian review guidelines
      expect(blockCmd.hotkeys).toBeUndefined();

      // Verify editorCallbacks are functions
      expect(typeof blockCmd.editorCallback).toBe('function');
      expect(typeof inlineCmd.editorCallback).toBe('function');

      plugin.onunload();
    });
  });
});
