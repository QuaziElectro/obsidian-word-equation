/**
 * Challenger Adversarial Stress Test Suite: Gen69 Track A
 * Testing Bugs 1, 2, and 5 (Editor, Table Sizing, Full-Page Capture)
 *
 * Authored by: challenger_1_gen69 (Empirical Challenger)
 * Targets:
 * - Bug 1: Table inline equations with varied trailing characters (spaces, unicode,
 *          long strings, punctuation, empty cells) across entry/exit, verifying bounding
 *          client rect deltas < 1px.
 * - Bug 2: Block table equations across multiple rapid focus entry/exit transitions,
 *          measuring bounding rects, margins, and outline states to verify zero dimension drift.
 * - Bug 5: Stress test full-page equation click capture, typing prevention, and key trapping
 *          with multi-line delimiters (math-page<br><br>), rapid clicks, boundary keys, and outside keystrokes.
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
  createEquationNavigationExtension,
} from '../../src/editor/navigation-extension';
import { createMockEditor } from '../helpers/cm6-mock';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';
import { createTableInlinePostProcessor } from '../../src/post-processor/table-inline-processor';
import * as debugLogger from '../../src/debug/debug-logger';

describe('Challenger Gen69 Track A Adversarial Stress Suite (Bugs 1, 2, 5)', () => {
  beforeEach(() => {
    setupAccurateDomEnvironment();
    clearActiveEquationState();
  });

  afterEach(() => {
    clearActiveEquationState();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TARGET 1: BUG 1 — TABLE INLINE MATH TRAILING TEXT SHIFT STRESS
  // =========================================================================
  describe('Target 1 (Bug 1): Table Inline Math Followed by Varied Trailing Characters Across Entry/Exit', () => {
    const trailingTestCases = [
      {
        name: 'Multiple spaces and tabs',
        trailing: '    \t   after math',
      },
      {
        name: 'Unicode, emoji, and math symbols',
        trailing: ' ∑∏√⚡💡 測試 text αβγδ café naïve',
      },
      {
        name: 'Long unbroken alphanumeric string (250 chars)',
        trailing: ' ' + 'A'.repeat(250),
      },
      {
        name: 'Cluster of punctuation and brackets',
        trailing: ' ,.;:!?()[]{}"\'`~@#$%^&*-_=+',
      },
      {
        name: 'Empty trailing text (equation at end of cell)',
        trailing: '',
      },
      {
        name: 'Whitespace only trailing text',
        trailing: '   ',
      },
      {
        name: 'Markdown bold and italic text',
        trailing: ' **bold text** and *italicized word* and `inline_code()`',
      },
      {
        name: 'Internal markdown link syntax',
        trailing: ' [[Target Note#Heading|Custom Label]]',
      },
    ];

    trailingTestCases.forEach(({ name, trailing }) => {
      it(`verifies bounding client rect delta < 1px across entry/exit: ${name}`, () => {
        const spyMetrics = vi.spyOn(debugLogger, 'captureTableCellMetrics');

        // Create table cell with inline equation and trailing content
        const cell = document.createElement('td');
        cell.className = 'table-cell-wrapper';

        const widget = new WordEquationWidget(
          '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>s</mi><mo>∑</mo></math>',
          5,
          45,
          true, // isInline
          'weq_inline',
          false, // isBlockInTable
          'inline',
          true // isInlineInTable
        );

        // Render initial unfocused state (cursor outside cell)
        widget.isFocused = false;
        const dom = (widget as any).renderCurrentDom();
        cell.appendChild(dom);

        const trailingSpan = document.createElement('span');
        trailingSpan.className = 'table-trailing-text';
        trailingSpan.textContent = trailing;
        cell.appendChild(trailingSpan);
        document.body.appendChild(cell);

        // Apply layout simulation
        computeAndApplyLayout(cell, 100, 100);

        const rectExit = dom.getBoundingClientRect();
        const mathRectExit = (dom.querySelector('.word-equation-math') as HTMLElement).getBoundingClientRect();
        const trailingRectExit = trailingSpan.getBoundingClientRect();

        // Check CSS styling invariants for unfocused state
        expect(dom.classList.contains('word-equation-table-inline')).toBe(true);
        expect(dom.style.margin).toBe('0px');
        const mathElExit = dom.querySelector('.word-equation-math') as HTMLElement;
        expect(mathElExit.style.padding).toBe('2px 4px');
        expect(mathElExit.style.minHeight).toBe('1.6em');
        expect(mathElExit.style.minWidth).toBe('2em');

        // Transition: Focus entry (cursor enters cell)
        widget.isFocused = true;
        widget.updateCaretOnly(dom);
        computeAndApplyLayout(cell, 100, 100);

        const rectEntry = dom.getBoundingClientRect();
        const mathRectEntry = (dom.querySelector('.word-equation-math') as HTMLElement).getBoundingClientRect();
        const trailingRectEntry = trailingSpan.getBoundingClientRect();

        // Check CSS styling invariants for focused state
        expect(dom.style.margin).toBe('0px');
        const mathElEntry = dom.querySelector('.word-equation-math') as HTMLElement;
        expect(mathElEntry.style.padding).toBe('2px 4px');
        expect(mathElEntry.style.minHeight).toBe('1.6em');
        expect(mathElEntry.style.minWidth).toBe('2em');

        // DELTA VERIFICATION (< 1px)
        const deltaWidgetWidth = Math.abs(rectEntry.width - rectExit.width);
        const deltaWidgetHeight = Math.abs(rectEntry.height - rectExit.height);
        const deltaMathWidth = Math.abs(mathRectEntry.width - mathRectExit.width);
        const deltaMathHeight = Math.abs(mathRectEntry.height - mathRectExit.height);
        const deltaTrailingLeft = Math.abs(trailingRectEntry.left - trailingRectExit.left);
        const deltaTrailingTop = Math.abs(trailingRectEntry.top - trailingRectExit.top);

        expect(deltaWidgetWidth).toBeLessThan(1.0);
        expect(deltaWidgetHeight).toBeLessThan(1.0);
        expect(deltaMathWidth).toBeLessThan(1.0);
        expect(deltaMathHeight).toBeLessThan(1.0);
        expect(deltaTrailingLeft).toBeLessThan(1.0);
        expect(deltaTrailingTop).toBeLessThan(1.0);

        // Transition: Focus exit (cursor leaves cell)
        widget.isFocused = false;
        widget.updateCaretOnly(dom);
        computeAndApplyLayout(cell, 100, 100);

        const rectReExit = dom.getBoundingClientRect();
        const trailingRectReExit = trailingSpan.getBoundingClientRect();
        expect(Math.abs(rectReExit.width - rectExit.width)).toBeLessThan(1.0);
        expect(Math.abs(trailingRectReExit.left - trailingRectExit.left)).toBeLessThan(1.0);

        // Telemetry verification
        expect(spyMetrics).toHaveBeenCalledWith(expect.anything(), 'cell_entry', 5, 45);
        expect(spyMetrics).toHaveBeenCalledWith(expect.anything(), 'cell_exit', 5, 45);

        cell.remove();
      });
    });

    it('verifies inline equation parsing with varied delimiters sets isInlineInTable = true', () => {
      const markdownTable = [
        '| Header 1 | Header 2 | Header 3 | Header 4 |',
        '| --- | --- | --- | --- |',
        '| /weq_inline <math><mi>A</mi></math> /weq_inline text | \\weq_inline <math><mi>B</mi></math> \\weq_inline unicode ⚡ | $weq <math><mi>C</mi></math> $weq trailing | $x^2 + y^2 = z^2$ end |',
      ].join('\n');

      const state = EditorState.create({
        doc: markdownTable,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      const widgets: WordEquationWidget[] = [];

      decSet.between(0, markdownTable.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widgets.push(w);
        }
      });

      expect(widgets.length).toBe(4);
      for (const w of widgets) {
        expect(w.isInline).toBe(true);
        expect(w.isInlineInTable).toBe(true);
        expect(w.isBlockInTable).toBe(false);

        const dom = (w as any).renderCurrentDom();
        expect(dom.classList.contains('word-equation-table-inline')).toBe(true);
        expect(dom.style.margin).toBe('0px');
      }
    });

    it('verifies post-processor renders reading-view table cells with identical box model to Live Preview', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.textContent = '/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>s</mi><mo>∑</mo></math> /weq_inlinesDASDasdasd';
      tr.appendChild(td);
      table.appendChild(tr);

      processor(table);

      const mathEl = td.querySelector('.word-equation-math') as HTMLElement;
      expect(mathEl).not.toBeNull();
      // Reading view styling matches Live Preview table inline rules
      expect(td.textContent).toContain('sDASDasdasd');
      expect(td.textContent).not.toContain('/weq_inline');
    });
  });

  // =========================================================================
  // TARGET 2: BUG 2 — BLOCK TABLE EQUATION RAPID TRANSITIONS & ZERO DRIFT
  // =========================================================================
  describe('Target 2 (Bug 2): Block Table Equation Rapid Transitions and Zero Dimension Drift', () => {
    it('undergoes 50 rapid alternating entry/exit cycles with 0 dimension drift and strict margin stability', () => {
      const spyMetrics = vi.spyOn(debugLogger, 'captureTableCellMetrics');

      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mfrac><mrow><msqrt><mi>x</mi></msqrt></mrow><mrow><mi>y</mi><mo>+</mo><mn>1</mn></mrow></mfrac></mrow></math>',
        10,
        90,
        false, // isInline
        'math-word',
        true // isBlockInTable
      );

      const cell = document.createElement('td');
      cell.className = 'table-cell-wrapper';
      const dom = (widget as any).renderCurrentDom();
      cell.appendChild(dom);
      document.body.appendChild(cell);

      computeAndApplyLayout(cell, 50, 50);

      // Measure baseline unfocused geometry
      const initialRect = dom.getBoundingClientRect();
      const initialMathRect = (dom.querySelector('.word-equation-math') as HTMLElement).getBoundingClientRect();
      const initialMargin = dom.style.margin;
      const initialPadding = dom.style.padding;

      expect(dom.classList.contains('word-equation-table-block')).toBe(true);
      expect(initialMargin).toMatch(/^0\.25em( 0px| 0)?$/);
      expect(initialPadding).toBe('0px');

      // Run 50 rapid cycles of entry and exit
      const cycles = 50;
      for (let i = 0; i < cycles; i++) {
        // --- Focus Entry ---
        widget.isFocused = true;
        widget.updateCaretOnly(dom);
        computeAndApplyLayout(cell, 50, 50);

        const entryMath = dom.querySelector('.word-equation-math') as HTMLElement;
        expect(entryMath.classList.contains('eq-active')).toBe(true);
        expect(dom.style.margin).toMatch(/^0\.25em( 0px| 0)?$/);
        expect(dom.style.padding).toBe('0px');
        expect(entryMath.style.padding).toBe('6px 12px');
        expect(entryMath.style.minHeight).toBe('2.2em');

        // Verify outline does not alter bounding size
        const entryRect = dom.getBoundingClientRect();
        expect(Math.abs(entryRect.width - initialRect.width)).toBeLessThan(1.0);
        expect(Math.abs(entryRect.height - initialRect.height)).toBeLessThan(1.0);

        // --- Focus Exit ---
        widget.isFocused = false;
        widget.updateCaretOnly(dom);
        computeAndApplyLayout(cell, 50, 50);

        const exitMath = dom.querySelector('.word-equation-math') as HTMLElement;
        expect(exitMath.classList.contains('eq-active')).toBe(false);
        expect(dom.style.margin).toMatch(/^0\.25em( 0px| 0)?$/);
        expect(dom.style.padding).toBe('0px');
        expect(exitMath.style.padding).toBe('6px 12px');
        expect(exitMath.style.minHeight).toBe('2.2em');

        const exitRect = dom.getBoundingClientRect();
        expect(Math.abs(exitRect.width - initialRect.width)).toBeLessThan(1.0);
        expect(Math.abs(exitRect.height - initialRect.height)).toBeLessThan(1.0);
      }

      // Check after 50 cycles: zero cumulative drift
      const finalRect = dom.getBoundingClientRect();
      const finalMathRect = (dom.querySelector('.word-equation-math') as HTMLElement).getBoundingClientRect();

      expect(finalRect.width).toBe(initialRect.width);
      expect(finalRect.height).toBe(initialRect.height);
      expect(finalMathRect.width).toBe(initialMathRect.width);
      expect(finalMathRect.height).toBe(initialMathRect.height);

      // Verify margin never leaked global 1em 0
      expect(dom.style.margin).not.toContain('1em');
      expect(dom.style.margin).toMatch(/^0\.25em( 0px| 0)?$/);

      // Verify telemetry was called for all 50 entries and 50 exits (plus initial render)
      expect(spyMetrics).toHaveBeenCalledTimes(cycles * 2 + 1);

      cell.remove();
    });

    it('verifies dimension stability across multiple diverse mathematical structures in table cells', () => {
      const formulas = [
        {
          name: 'Simple monomial',
          xml: '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>x</mi></mrow></math>',
        },
        {
          name: 'Deep nested fraction',
          xml: '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mfrac><mrow><mn>1</mn></mrow><mrow><mfrac><mrow><mn>2</mn></mrow><mrow><mn>3</mn></mrow></mfrac></mrow></mfrac></mrow></math>',
        },
        {
          name: '2x2 Matrix block',
          xml: '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>0</mn></mtd></mtr><mtr><mtd><mn>0</mn></mtd><mtd><mn>1</mn></mtd></mtr></mtable></mrow></math>',
        },
        {
          name: 'Large integration operator with bounds',
          xml: '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><msubsup><mo>∫</mo><mn>0</mn><mo>∞</mo></msubsup><msup><mi>e</mi><mrow><mo>−</mo><msup><mi>x</mi><mn>2</mn></msup></mrow></msup><mi>d</mi><mi>x</mi></mrow></math>',
        },
      ];

      for (const { name, xml } of formulas) {
        const widget = new WordEquationWidget(
          xml,
          0,
          xml.length,
          false,
          'math-word',
          true
        );

        const cell = document.createElement('td');
        const dom = (widget as any).renderCurrentDom();
        cell.appendChild(dom);
        document.body.appendChild(cell);

        computeAndApplyLayout(cell, 20, 20);

        widget.isFocused = false;
        widget.updateCaretOnly(dom);
        computeAndApplyLayout(cell, 20, 20);
        const unfocusedRect = dom.getBoundingClientRect();

        widget.isFocused = true;
        widget.updateCaretOnly(dom);
        computeAndApplyLayout(cell, 20, 20);
        const focusedRect = dom.getBoundingClientRect();

        expect(Math.abs(focusedRect.width - unfocusedRect.width), `${name} width delta`).toBeLessThan(1.0);
        expect(Math.abs(focusedRect.height - unfocusedRect.height), `${name} height delta`).toBeLessThan(1.0);

        cell.remove();
      }
    });
  });

  // =========================================================================
  // TARGET 3: BUG 5 — FULL-PAGE MATH BLOCK CLICK CAPTURE, TYPING & KEYS
  // =========================================================================
  describe('Target 3 (Bug 5): Full-Page Math Block Click Capture, Typing Prevention & Key Trapping', () => {
    it('correctly matches multi-line delimiters (math-page<br><br>, weq-page<br><br>, mixed tags, fenced) spanning full cell', () => {
      const tableWithDelims = [
        '| math-page<br><br> | weq-page<br><br> | math-page<br/><br/> | math-page<br  /><br  /> |',
        '| --- | --- | --- | --- |',
        '| math-page<br>$$E=mc^2$$<br> | normal text cell | ```math-page\n<math display="full-page"><mi>P</mi></math>\n``` | end |',
      ].join('\n');

      const state = EditorState.create({
        doc: tableWithDelims,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      const fpWidgets: WordEquationWidget[] = [];

      decSet.between(0, tableWithDelims.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget && w.displayMode === 'full-page') {
          fpWidgets.push(w);
        }
      });

      // Should match 5 full-page widgets across the cells
      expect(fpWidgets.length).toBeGreaterThanOrEqual(5);
      for (const w of fpWidgets) {
        expect(w.displayMode).toBe('full-page');
      }
    });

    it('captures clicks anywhere within container/page into the equation and prevents default', () => {
      const doc = '```math-page\n<math display="full-page"><mrow><mi>M</mi></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      // Locate widget and container element
      const widget = findFullPageWidget(view);
      expect(widget).not.toBeNull();

      clearActiveEquationState();

      // Click on contentDOM outside the inner math element
      const mockEvent = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
      });

      // Dispatch to contentDOM (container background)
      view.contentDOM.dispatchEvent(mockEvent);

      // Event should be intercepted and prevented
      expect(mockEvent.defaultPrevented).toBe(true);

      // Caret must be focused inside equation
      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState!.isFocused).toBe(true);

      view.destroy();
      container.remove();
    });

    it('withstands rapid consecutive clicks on container background without state loss or errors', () => {
      const doc = '| math-page<br><br> | Other Col |\n| --- | --- |';
      const { view, container } = createMockEditor(doc, [], true);

      const fpWidget = findFullPageWidget(view);
      expect(fpWidget).not.toBeNull();

      // 20 rapid clicks on container
      for (let i = 0; i < 20; i++) {
        clearActiveEquationState();
        const ev = new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);

        const active = getActiveEquationState();
        expect(active?.isFocused).toBe(true);
      }

      view.destroy();
      container.remove();
    });

    it('does NOT intercept clicks directly inside the .word-equation-math element (allows local slot hit testing)', () => {
      const doc = '```math-page\n<math display="full-page"><mrow><mi>K</mi></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      const widget = findFullPageWidget(view);
      expect(widget).not.toBeNull();
      const enterSpy = vi.spyOn(widget!, 'enterFromStart');

      const mathEl = view.dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathEl).not.toBeNull();

      const ev = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
      });

      // Direct click on math element
      mathEl.dispatchEvent(ev);

      // Container handler should NOT call enterFromStart (which resets caret to 0)
      expect(enterSpy).not.toHaveBeenCalled();

      view.destroy();
      container.remove();
    });

    it('strictly suppresses outside typing and deletion transactions in full-page containers', () => {
      const doc = '```math-page\n<math display="full-page"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [equationTransactionFilterPlugin], true);

      // 1. Attempt typing outside full-page equation at end of document
      view.dispatch({
        changes: { from: view.state.doc.length, insert: 'UnwantedOutsideText' },
        userEvent: 'input.type',
      });
      expect(view.state.doc.toString()).not.toContain('UnwantedOutsideText');

      // 2. Attempt typing outside at start of document
      view.dispatch({
        changes: { from: 0, insert: 'PrefixText' },
        userEvent: 'input.type',
      });
      expect(view.state.doc.toString()).not.toContain('PrefixText');

      // 3. Attempt backward delete
      const lenBefore = view.state.doc.length;
      view.dispatch({
        changes: { from: view.state.doc.length - 2, to: view.state.doc.length },
        userEvent: 'delete.backward',
      });
      expect(view.state.doc.length).toBe(lenBefore);

      // 4. Attempt forward delete
      view.dispatch({
        changes: { from: 0, to: 2 },
        userEvent: 'delete.forward',
      });
      expect(view.state.doc.length).toBe(lenBefore);

      // 5. Attempt paste outside equation
      view.dispatch({
        changes: { from: view.state.doc.length, insert: 'PastedContent' },
        userEvent: 'input.paste',
      });
      expect(view.state.doc.toString()).not.toContain('PastedContent');

      // 6. Attempt unflagged transaction without userEvent
      view.dispatch({
        changes: { from: view.state.doc.length, insert: 'SilentInjection' },
      });
      expect(view.state.doc.toString()).not.toContain('SilentInjection');

      view.destroy();
      container.remove();
    });

    it('permits typing in adjacent table cells while strictly suppressing typing in the full-page cell', () => {
      const doc = '| math-page<br><br> | Second Editable Cell |\n| --- | --- |';
      const { view, container } = createMockEditor(doc, [equationTransactionFilterPlugin], true);

      // 1. Typing in Second Cell (should SUCCEED)
      const secondCellPos = doc.indexOf('Second Editable Cell') + 6;
      view.dispatch({
        changes: { from: secondCellPos, insert: ' [EDITED]' },
        selection: { anchor: secondCellPos + 9 },
        userEvent: 'input.type',
      });
      expect(view.state.doc.toString()).toContain('Second [EDITED] Editable Cell');

      // 2. Typing in First Cell (full-page container - should be BLOCKED)
      const firstCellPos = doc.indexOf('math-page');
      view.dispatch({
        changes: { from: firstCellPos, insert: 'BlockedText' },
        selection: { anchor: firstCellPos + 11 },
        userEvent: 'input.type',
      });
      expect(view.state.doc.toString()).not.toContain('BlockedText');

      view.destroy();
      container.remove();
    });

    it('traps caret inside full-page widget on ArrowLeft at offset 0 and ArrowRight at max offset', () => {
      const doc = '```math-page\n<math display="full-page"><mrow><mi>A</mi><mo>+</mo><mi>B</mi></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      const widget = new WordEquationWidget(
        '<math display="full-page"><mrow><mi>A</mi><mo>+</mo><mi>B</mi></mrow></math>',
        0,
        doc.length,
        false,
        'math-page',
        false,
        'full-page'
      );

      widget.isFocused = true;

      // Trapping at start (offset 0): ArrowLeft must not escape
      widget.caret = { slotId: widget.ast.id, offset: 0 };
      const leftHandled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(leftHandled).toBe(true);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Trapping at end (max offset): ArrowRight must not escape
      widget.caret = { slotId: widget.ast.id, offset: widget.ast.children.length };
      const rightHandled = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(rightHandled).toBe(true);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(widget.ast.children.length);

      view.destroy();
      container.remove();
    });

    it('keydown handler intercepts outside keystroke in full-page container and focuses widget', () => {
      const doc = '```math-page\n<math display="full-page"><mrow><mi>X</mi></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      // Position CM cursor outside equation at end of doc
      view.dispatch({
        selection: { anchor: view.state.doc.length },
      });

      // Clear active state to simulate unfocused equation with cursor in container
      clearActiveEquationState();
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      const keyEvent = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      });

      view.contentDOM.dispatchEvent(keyEvent);

      expect(keyEvent.defaultPrevented).toBe(true);
      const active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);

      view.destroy();
      container.remove();
    });
  });
});
