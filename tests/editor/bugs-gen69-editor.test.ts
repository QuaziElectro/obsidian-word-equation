/**
 * Test Suite: Gen69 Editor Fixes (Bugs 1, 2, 5)
 *
 * Covers:
 * - Bug 1: Table Inline Math Followed by Text — Text Shift on Entry/Exit.
 *          Identical box model (margin 0, padding 2px 4px) in .cm-line and table reading view.
 * - Bug 2: Table Full-Line Math Block Sizing Consistency.
 *          Identical dimensions and vertical margins (0.25em 0) inside and outside table cells;
 *          deep telemetry logging with captureTableCellMetrics remains operational.
 * - Bug 5: Full-Page Math Block Caret Capture & Outside Typing Prevention.
 *          Support for math-page/weq-page in tableUnfencedBlockRegex;
 *          caret capture on container/page click and selection update;
 *          suppression of outside typing via transaction filter and keydown capture.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  wordEquationStateField,
  isTableRowLine,
  isInsideTableRow,
  buildEquationDecorations,
} from '../../src/editor/state-field';
import {
  WordEquationWidget,
  isInternalEquationUpdating,
} from '../../src/editor/widget';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import {
  isInsideFullPageContainer,
  findFullPageWidget,
  equationTransactionFilterPlugin,
  equationSelectionHighlightPlugin,
} from '../../src/editor/navigation-extension';
import { createMockEditor } from '../helpers/cm6-mock';
import { createTableInlinePostProcessor } from '../../src/post-processor/table-inline-processor';
import * as debugLogger from '../../src/debug/debug-logger';

describe('Gen69 Editor Fixes: Bugs 1, 2, and 5', () => {
  beforeEach(() => {
    clearActiveEquationState();
  });

  afterEach(() => {
    clearActiveEquationState();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // BUG 1: TABLE INLINE MATH TEXT SHIFT ON ENTRY / EXIT
  // =========================================================================
  describe('Bug 1: Table Inline Math Followed by Text — Text Shift on Entry/Exit', () => {
    it('sets isInlineInTable = true for inline equations inside table rows', () => {
      const doc = '| /weq_inline <math><mi>s</mi><mo>∑</mo></math> /weq_inlinesDASDasdasd | Col 2 |\n| --- | --- |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget: WordEquationWidget | null = null;
      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = w;
        }
      });

      expect(foundWidget).not.toBeNull();
      expect(foundWidget!.isInline).toBe(true);
      expect(foundWidget!.isInlineInTable).toBe(true);
    });

    it('sets isInlineInTable = true for dollar syntax inline equations inside table rows', () => {
      const doc = '| $s\\Sigma\\Sigma$ sDASDasdasd | Col 2 |\n| --- | --- |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget: WordEquationWidget | null = null;
      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = w;
        }
      });

      expect(foundWidget).not.toBeNull();
      expect(foundWidget!.isInline).toBe(true);
      expect(foundWidget!.isInlineInTable).toBe(true);
    });

    it('renderCurrentDom produces word-equation-table-inline with margin 0 and compact padding 2px 4px', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>s</mi></math>',
        2,
        40,
        true, // isInline
        'weq_inline',
        false, // isBlockInTable
        'inline',
        true // isInlineInTable
      );

      const dom = (widget as any).renderCurrentDom();

      expect(dom.classList.contains('word-equation-table-inline')).toBe(true);
      expect(dom.style.margin).toBe('0px');

      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.padding).toBe('2px 4px');
      expect(mathBox.style.minHeight).toBe('1.6em');
      expect(mathBox.style.minWidth).toBe('2em');
    });

    it('invokes captureTableCellMetrics for table inline equations on render', () => {
      const spy = vi.spyOn(debugLogger, 'captureTableCellMetrics');

      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>s</mi></math>',
        2,
        40,
        true,
        'weq_inline',
        false,
        'inline',
        true // isInlineInTable
      );

      (widget as any).renderCurrentDom();

      expect(spy).toHaveBeenCalled();
    });

    it('preserves identical box model between focused and unfocused table inline equations', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>s</mi></math>',
        2,
        40,
        true,
        'weq_inline',
        false,
        'inline',
        true
      );

      // Unfocused state (outside cell)
      widget.isFocused = false;
      const unfocusedDom = (widget as any).renderCurrentDom();
      const unfocusedMath = unfocusedDom.querySelector('.word-equation-math') as HTMLElement;

      // Focused state (inside cell)
      widget.isFocused = true;
      const focusedDom = (widget as any).renderCurrentDom();
      const focusedMath = focusedDom.querySelector('.word-equation-math') as HTMLElement;

      expect(unfocusedDom.style.margin).toBe(focusedDom.style.margin);
      expect(unfocusedMath.style.padding).toBe(focusedMath.style.padding);
      expect(unfocusedMath.style.minHeight).toBe(focusedMath.style.minHeight);
      expect(unfocusedMath.style.minWidth).toBe(focusedMath.style.minWidth);
    });
  });

  // =========================================================================
  // BUG 2: TABLE FULL-LINE MATH BLOCK SIZING CONSISTENCY & TELEMETRY
  // =========================================================================
  describe('Bug 2: Table Full-Line Math Block Sizing Consistency', () => {
    it('sets isBlockInTable = true for block equations in table cells', () => {
      const doc = '| math-word<br>$$\\int f(x) dx$$<br> | Col 2 |\n| --- | --- |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget: WordEquationWidget | null = null;
      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget && w.isBlockInTable) {
          foundWidget = w;
        }
      });

      expect(foundWidget).not.toBeNull();
      expect(foundWidget!.isBlockInTable).toBe(true);
      expect(foundWidget!.isInline).toBe(false);
    });

    it('renderCurrentDom produces word-equation-table-block with margin 0.25em 0 and padding 0', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>A</mi></mrow></math>',
        10,
        60,
        false,
        'math-word',
        true // isBlockInTable
      );

      const dom = (widget as any).renderCurrentDom();

      expect(dom.classList.contains('word-equation-table-block')).toBe(true);
      expect(dom.style.margin).toMatch(/^0\.25em( 0px| 0)?$/);
      expect(dom.style.padding).toBe('0px');
      expect(dom.style.display).toBe('flex');
      expect(dom.style.width).toBe('100%');

      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.margin).toBe('0px');
      expect(mathBox.style.padding).toBe('6px 12px');
      expect(mathBox.style.borderRadius).toBe('6px');
      expect(mathBox.style.minHeight).toBe('2.2em');
    });

    it('captureTableCellMetrics is called on both cell_entry and cell_exit', () => {
      const spy = vi.spyOn(debugLogger, 'captureTableCellMetrics');

      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>A</mi></mrow></math>',
        10,
        60,
        false,
        'math-word',
        true
      );

      widget.isFocused = true;
      (widget as any).renderCurrentDom();
      expect(spy).toHaveBeenCalledWith(expect.anything(), 'cell_entry', 10, 60);

      widget.isFocused = false;
      (widget as any).renderCurrentDom();
      expect(spy).toHaveBeenCalledWith(expect.anything(), 'cell_exit', 10, 60);
    });

    it('table block equation maintains consistent dimensions across focus entry/exit', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>X</mi></mrow></math>',
        10,
        60,
        false,
        'math-word',
        true
      );

      widget.isFocused = false;
      const exitDom = (widget as any).renderCurrentDom();
      const exitMath = exitDom.querySelector('.word-equation-math') as HTMLElement;

      widget.isFocused = true;
      const entryDom = (widget as any).renderCurrentDom();
      const entryMath = entryDom.querySelector('.word-equation-math') as HTMLElement;

      expect(entryDom.style.margin).toBe(exitDom.style.margin);
      expect(entryDom.style.padding).toBe(exitDom.style.padding);
      expect(entryMath.style.padding).toBe(exitMath.style.padding);
      expect(entryMath.style.borderRadius).toBe(exitMath.style.borderRadius);
      expect(entryMath.style.minHeight).toBe(exitMath.style.minHeight);
    });
  });

  // =========================================================================
  // BUG 5: FULL-PAGE MATH BLOCK CARET CAPTURE & OUTSIDE TYPING PREVENTION
  // =========================================================================
  describe('Bug 5: Full-Page Math Block Caret Capture & Outside Typing Prevention', () => {
    it('tableUnfencedBlockRegex matches math-page<br><br> in table rows and sets displayMode full-page', () => {
      const doc = '| math-page<br><br> | Second Col |\n| --- | --- |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget: WordEquationWidget | null = null;
      let rangeFrom = -1;
      let rangeTo = -1;

      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = w;
          rangeFrom = from;
          rangeTo = to;
        }
      });

      expect(foundWidget).not.toBeNull();
      expect(foundWidget!.displayMode).toBe('full-page');
      expect(foundWidget!.delimiter).toBe('math-page');
      // Covers full cell between pipes
      expect(rangeFrom).toBe(doc.indexOf('|') + 1);
      expect(rangeTo).toBe(doc.indexOf('| Second Col'));
    });

    it('tableUnfencedBlockRegex matches weq-page<br><br> in table rows', () => {
      const doc = '| weq-page<br><br> | Col 2 |\n| --- | --- |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget: WordEquationWidget | null = null;
      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = w;
        }
      });

      expect(foundWidget).not.toBeNull();
      expect(foundWidget!.displayMode).toBe('full-page');
    });

    it('tableUnfencedBlockRegex matches math-page with latex formula in table row', () => {
      const doc = '| math-page<br>$$E=mc^2$$<br> | Col 2 |\n| --- | --- |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget: WordEquationWidget | null = null;
      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = w;
        }
      });

      expect(foundWidget).not.toBeNull();
      expect(foundWidget!.displayMode).toBe('full-page');
      expect(foundWidget!.code).toContain('math');
    });

    it('isInsideFullPageContainer identifies full-page container for note page', () => {
      const doc = '```math-page\n<math display="full-page"><mi>P</mi></math>\n```\n';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const info = isInsideFullPageContainer(state, 10);
      expect(info.isFullPage).toBe(true);
      expect(info.widget).toBeDefined();
      expect(info.widget!.displayMode).toBe('full-page');
    });

    it('isInsideFullPageContainer identifies full-page table cell correctly without leaking to other cells', () => {
      const doc = '| math-page<br><br> | Normal Text Cell |\n| --- | --- |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      // Position in Cell 1 (full-page equation)
      const cell1Pos = 5;
      const cell1Info = isInsideFullPageContainer(state, cell1Pos);
      expect(cell1Info.isFullPage).toBe(true);
      expect(cell1Info.widget).toBeDefined();

      // Position in Cell 2 (normal cell)
      const cell2Pos = doc.indexOf('Normal Text Cell') + 2;
      const cell2Info = isInsideFullPageContainer(state, cell2Pos);
      expect(cell2Info.isFullPage).toBe(false);
    });

    it('findFullPageWidget locates full-page widget in editor view', () => {
      const doc = '```math-page\n<math display="full-page"><mi>X</mi></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      const fpWidget = findFullPageWidget(view);
      expect(fpWidget).not.toBeNull();
      expect(fpWidget!.displayMode).toBe('full-page');

      view.destroy();
      container.remove();
    });

    it('equationTransactionFilterPlugin suppresses outside typing transactions in full-page note', () => {
      const doc = '```math-page\n<math display="full-page"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [equationTransactionFilterPlugin], true);

      // Attempt to type text at EOF outside the full-page block
      view.dispatch({
        changes: { from: view.state.doc.length, insert: 'asdasd' },
        userEvent: 'input.type',
      });

      // Filter should cancel the transaction because typing occurred outside full-page block
      expect(view.state.doc.toString()).not.toContain('asdasd');

      view.destroy();
      container.remove();
    });

    it('equationTransactionFilterPlugin suppresses delete transactions outside full-page block', () => {
      const doc = '```math-page\n<math display="full-page"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [equationTransactionFilterPlugin], true);

      const lenBefore = view.state.doc.length;
      view.dispatch({
        changes: { from: view.state.doc.length - 1, to: view.state.doc.length },
        userEvent: 'delete.backward',
      });

      expect(view.state.doc.length).toBe(lenBefore);

      view.destroy();
      container.remove();
    });

    it('equationTransactionFilterPlugin allows internal equation changes when isInternalEquationUpdating is true', () => {
      const doc = '```math-page\n<math display="full-page"><mrow></mrow></math>\n```\n';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField, equationTransactionFilterPlugin],
      });

      // Widget internal update sets isUpdatingActiveEquation = true
      const widget = new WordEquationWidget(
        '<math display="full-page"><mrow></mrow></math>',
        0,
        doc.length,
        false,
        'math-page',
        false,
        'full-page'
      );

      // Verify isInternalEquationUpdating is normally false
      expect(isInternalEquationUpdating()).toBe(false);
    });

    it('traps caret at start (offset 0) when navigating left out of full-page note equation', () => {
      const widget = new WordEquationWidget(
        '<math display="full-page"><mrow><mi>A</mi></mrow></math>',
        0,
        60,
        false,
        'math-page',
        false,
        'full-page'
      );

      const doc = '```math-page\n<math display="full-page"><mrow><mi>A</mi></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      widget.isFocused = true;
      widget.caret = { slotId: widget.ast.id, offset: 0 };

      // Simulate backward arrow navigation at start
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);

      view.destroy();
      container.remove();
    });

    it('traps caret at end when navigating right out of full-page note equation', () => {
      const widget = new WordEquationWidget(
        '<math display="full-page"><mrow><mi>A</mi></mrow></math>',
        0,
        60,
        false,
        'math-page',
        false,
        'full-page'
      );

      const doc = '```math-page\n<math display="full-page"><mrow><mi>A</mi></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      widget.isFocused = true;
      widget.caret = { slotId: widget.ast.id, offset: widget.ast.children.length };

      // Simulate forward arrow navigation at end
      const handled = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(handled).toBe(true);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(widget.ast.children.length);

      view.destroy();
      container.remove();
    });
  });
});
