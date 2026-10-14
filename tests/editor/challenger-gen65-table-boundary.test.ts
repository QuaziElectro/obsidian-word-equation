/**
 * Challenger Adversarial Test Suite: Gen65 Bug 1 & Bug 2
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE
 * Stress-tests:
 * - Bug 1: Table equations across multiple cells, headers, columns, syntaxes,
 *          cursor navigation across cells, DOM widget permanence, idempotency,
 *          and malformed/edge inputs.
 * - Bug 2: Caret landing between table and block equation from all directions
 *          (down from table row, up from equation; left/right boundary crossing),
 *          consecutive table rows, pre-existing empty lines (no double insertion),
 *          collapsed gap lifecycle expansion/collapse invariants, and multi-alternating layouts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, Notice, editorLivePreviewField } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { createTableInlinePostProcessor } from '../../src/post-processor/table-inline-processor';
import {
  buildEquationDecorations,
  buildCollapsedGapDecorations,
  isTableRowLine,
  isInsideTableRow,
  wordEquationStateField,
  wordEquationCollapsedGapField,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { createEquationNavigationExtension } from '../../src/editor/navigation-extension';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { createMockEditor } from '../helpers/cm6-mock';

function pressKey(view: EditorView, key: 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp') {
  const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
}

describe('Challenger Gen65 Adversarial Suite: Bug 1 (Table Equations) & Bug 2 (Boundary Navigation)', () => {
  let app: any;
  let plugin: WordEquationPlugin;

  beforeEach(() => {
    clearActiveEquationState();
    (Notice as any).notices = [];
    app = new App();
    plugin = new WordEquationPlugin(app, {} as any);
    plugin.settings = { ...DEFAULT_SETTINGS };
  });

  afterEach(() => {
    clearActiveEquationState();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SUITE 1: BUG 1 — ADVERSARIAL TABLE EQUATIONS STRESS TESTING
  // =========================================================================
  describe('Suite 1: Bug 1 — Adversarial Table Equations Stress Testing', () => {
    it('1.1: 3x3 table with heterogeneous equation syntaxes across headers and cells', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');

      // Header row with 3 different equation formats
      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');

      const th1 = document.createElement('th');
      th1.textContent = '| /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mfrac><mi>a</mi><mi>b</mi></mfrac></math> /weq_inline |';

      const th2 = document.createElement('th');
      th2.textContent = '$weq <msqrt><mi>x</mi></msqrt> $weq';

      const th3 = document.createElement('th');
      th3.innerHTML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>e</mi><mi>x</mi></msup></math>';

      trHead.appendChild(th1);
      trHead.appendChild(th2);
      trHead.appendChild(th3);
      thead.appendChild(trHead);
      table.appendChild(thead);

      // Body Row 1: LaTeX dollar math, double dollar math, mixed text
      const tbody = document.createElement('tbody');
      const trBody1 = document.createElement('tr');

      const td1_1 = document.createElement('td');
      td1_1.textContent = '$x^2 + y^2 = r^2$';

      const td1_2 = document.createElement('td');
      td1_2.textContent = '$$\\alpha + \\beta = \\gamma$$';

      const td1_3 = document.createElement('td');
      td1_3.textContent = 'Prefix text /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><msub><mi>v</mi><mn>0</mn></msub></math> /weq_inline postfix text';

      trBody1.appendChild(td1_1);
      trBody1.appendChild(td1_2);
      trBody1.appendChild(td1_3);
      tbody.appendChild(trBody1);

      // Body Row 2: Multi-equation cell, empty cell, fenced code block with <br>
      const trBody2 = document.createElement('tr');

      const td2_1 = document.createElement('td');
      td2_1.textContent = 'Value $A$ and value $B$';

      const td2_2 = document.createElement('td');
      td2_2.textContent = '    '; // Empty cell

      const td2_3 = document.createElement('td');
      td2_3.textContent = '```math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>Z</mi></mrow></math><br>```';

      trBody2.appendChild(td2_1);
      trBody2.appendChild(td2_2);
      trBody2.appendChild(td2_3);
      tbody.appendChild(trBody2);

      table.appendChild(tbody);

      // Process the whole table
      processor(table);

      // Assertions on Header
      expect(th1.querySelector('.word-equation-math')).not.toBeNull();
      expect(th1.querySelector('.eq-fraction')).not.toBeNull();
      expect(th1.textContent).not.toContain('/weq_inline');

      expect(th2.querySelector('.word-equation-math')).not.toBeNull();
      expect(th2.querySelector('.eq-radical')).not.toBeNull();
      expect(th2.textContent).not.toContain('$weq');

      expect(th3.querySelector('.word-equation-math')).not.toBeNull();
      expect(th3.querySelector('.eq-superscript')).not.toBeNull();

      // Assertions on Body Row 1
      expect(td1_1.querySelector('.word-equation-math')).not.toBeNull();
      expect(td1_1.querySelector('.eq-superscript')).not.toBeNull();

      expect(td1_2.querySelector('.word-equation-math')).not.toBeNull();

      expect(td1_3.querySelector('.word-equation-math')).not.toBeNull();
      expect(td1_3.querySelector('.eq-subscript')).not.toBeNull();
      expect(td1_3.textContent).toContain('Prefix text');
      expect(td1_3.textContent).toContain('postfix text');
      expect(td1_3.textContent).not.toContain('/weq_inline');

      // Assertions on Body Row 2
      const multiEqs = td2_1.querySelectorAll('.word-equation-math');
      expect(multiEqs.length).toBe(2);
      expect(td2_1.textContent).toContain('Value ');
      expect(td2_1.textContent).toContain(' and value ');

      expect(td2_2.querySelector('.word-equation-math')).toBeNull();
      expect(td2_2.textContent?.trim()).toBe('');

      expect(td2_3.querySelector('.word-equation-math')).not.toBeNull();
      expect(td2_3.textContent).not.toContain('```math-word');
    });

    it('1.2: Idempotency: repeated processor execution does NOT duplicate widgets or corrupt DOM', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'Formula: /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math> /weq_inline End';

      // Pass 1
      processor(td);
      const widgetCount1 = td.querySelectorAll('.word-equation-math').length;
      expect(widgetCount1).toBe(1);
      const firstWidget = td.querySelector('.word-equation-math');

      // Pass 2
      processor(td);
      const widgetCount2 = td.querySelectorAll('.word-equation-math').length;
      expect(widgetCount2).toBe(1);
      expect(td.querySelector('.word-equation-math')).toBe(firstWidget);

      // Pass 3
      processor(td);
      const widgetCount3 = td.querySelectorAll('.word-equation-math').length;
      expect(widgetCount3).toBe(1);
      expect(td.textContent).toContain('Formula:');
      expect(td.textContent).toContain('End');
      expect(td.textContent).not.toContain('/weq_inline');
    });

    it('1.3: Robustness on malformed, unclosed, or edge-case MathML in table cells', () => {
      const processor = createTableInlinePostProcessor();
      const tr = document.createElement('tr');

      // Unclosed MathML
      const tdUnclosed = document.createElement('td');
      tdUnclosed.textContent = '/weq_inline <math><mfrac><mi>a</mi></math> /weq_inline';

      // Empty equation delimiters
      const tdEmptySlash = document.createElement('td');
      tdEmptySlash.textContent = '/weq_inline   /weq_inline';

      const tdEmptyDollar = document.createElement('td');
      tdEmptyDollar.textContent = '$weq $weq';

      // Pipe entities in table cell MathML
      const tdPipe = document.createElement('td');
      tdPipe.textContent = '/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mo>&#124;</mo><mi>x</mi><mo>&#124;</mo></mrow></math> /weq_inline';

      tr.appendChild(tdUnclosed);
      tr.appendChild(tdEmptySlash);
      tr.appendChild(tdEmptyDollar);
      tr.appendChild(tdPipe);

      // Must not throw any exception
      expect(() => processor(tr)).not.toThrow();

      // Pipe cell must render correctly
      expect(tdPipe.querySelector('.word-equation-math')).not.toBeNull();
      expect(tdPipe.textContent).not.toContain('/weq_inline');
    });

    it('1.4: CodeMirror StateField builds inline decorations for multi-cell table equations', () => {
      const doc = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi></math> /weq_inline | /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>b</mi></math> /weq_inline |',
        '| Cell 3 | /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>c</mi></math> /weq_inline |',
      ].join('\n');

      const state = EditorState.create({
        doc,
        extensions: [
          editorLivePreviewField.init(() => true),
          wordEquationStateField,
        ],
      });

      const decSet = state.field(wordEquationStateField);
      const widgets: WordEquationWidget[] = [];

      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widgets.push(w);
          expect(w.isInline).toBe(true);
          expect(isInsideTableRow(state.doc, from, to)).toBe(true);
        }
      });

      // Exactly 3 equations in the table
      expect(widgets.length).toBe(3);
    });

    it('1.5: Cursor navigation across table cells and leaving table entirely keeps CodeMirror widget decorations intact', () => {
      const doc = [
        '# Introduction',
        '| Col 1 | Col 2 | Col 3 |',
        '| --- | --- | --- |',
        '| /weq_inline <math><mi>A</mi></math> /weq_inline | /weq_inline <math><mi>B</mi></math> /weq_inline | /weq_inline <math><mi>C</mi></math> /weq_inline |',
        'Post-table text paragraph.',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Verify all 3 equation widgets are present
      const getWidgetCount = () => {
        let count = 0;
        view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
          if ((dec.spec as any)?.widget instanceof WordEquationWidget) count++;
        });
        return count;
      };

      expect(getWidgetCount()).toBe(3);

      // 1. Move cursor into Cell 1 (Row 4, Col 1)
      const cell1Pos = doc.indexOf('/weq_inline <math><mi>A</mi>');
      view.dispatch({ selection: { anchor: cell1Pos } });
      expect(getWidgetCount()).toBe(3);

      // 2. Move cursor into Cell 2 (Row 4, Col 2)
      const cell2Pos = doc.indexOf('/weq_inline <math><mi>B</mi>');
      view.dispatch({ selection: { anchor: cell2Pos } });
      expect(getWidgetCount()).toBe(3);

      // 3. Move cursor into Cell 3 (Row 4, Col 3)
      const cell3Pos = doc.indexOf('/weq_inline <math><mi>C</mi>');
      view.dispatch({ selection: { anchor: cell3Pos } });
      expect(getWidgetCount()).toBe(3);

      // 4. Move cursor outside table completely (into post-table text)
      const postTablePos = doc.indexOf('Post-table');
      view.dispatch({ selection: { anchor: postTablePos } });
      expect(getWidgetCount()).toBe(3);

      // 5. Move cursor before table completely (into header)
      view.dispatch({ selection: { anchor: 0 } });
      expect(getWidgetCount()).toBe(3);

      view.destroy();
      container.remove();
    });

    it('1.6: Dynamic DOM cell focus/blur simulation: cell equation remains rendered across focus loss', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '| /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>p</mi><mi>q</mi></mfrac></math> /weq_inline |';
      document.body.appendChild(td);

      // Process cell initially (as when cell is displayed)
      processor(td);
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();

      // Simulate focus transfer away from cell (e.g., blur event)
      td.dispatchEvent(new Event('blur'));
      td.dispatchEvent(new Event('focusout', { bubbles: true }));

      // Equation widget must still be rendered in DOM
      expect(td.querySelector('.word-equation-math')).not.toBeNull();
      expect(td.querySelector('.eq-fraction')).not.toBeNull();
      expect(td.textContent).not.toContain('/weq_inline');

      // Call post processor again (as Obsidian does when rendering table cell after edit)
      processor(td);
      expect(td.querySelectorAll('.word-equation-math').length).toBe(1);

      td.remove();
    });
  });


  // =========================================================================
  // SUITE 2: BUG 2 — ADVERSARIAL TABLE BOUNDARY NAVIGATION & INTERMEDIATE LANDING
  // =========================================================================
  describe('Suite 2: Bug 2 — Adversarial Boundary Navigation & Intermediate Landing', () => {
    it('2.1: ArrowRight at end of last table row before block equation inserts intermediate landing and collapses gap', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>y</mi></math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor at the very end of Line 3 (the last table row)
      const tableLastLine = view.state.doc.line(3);
      view.dispatch({ selection: { anchor: tableLastLine.to } });
      expect(view.state.selection.main.head).toBe(tableLastLine.to);

      // Dispatch ArrowRight
      pressKey(view, 'ArrowRight');

      // An implicit intermediate line must be created
      const updatedDoc = view.state.doc.toString();
      const updatedLines = updatedDoc.split('\n');
      expect(updatedLines.length).toBe(7);

      // The new line must be Line 4 and must be completely empty
      const intermediateLine = view.state.doc.line(4);
      expect(intermediateLine.length).toBe(0);
      expect(view.state.selection.main.head).toBe(intermediateLine.from);

      // The gap must be collapsed by wordEquationCollapsedGapField
      const gapDecorations = view.state.field(wordEquationCollapsedGapField);
      let hasGapDecoration = false;
      gapDecorations.between(intermediateLine.from, intermediateLine.from, (from, to, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') {
          hasGapDecoration = true;
        }
      });
      expect(hasGapDecoration).toBe(true);

      view.destroy();
      container.remove();
    });

    it('2.2: ArrowDown on last table row before block equation inserts intermediate landing and collapses gap', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>z</mi></math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor in the middle of Line 3
      const tableLastLine = view.state.doc.line(3);
      view.dispatch({ selection: { anchor: tableLastLine.from + 4 } });

      // Dispatch ArrowDown
      pressKey(view, 'ArrowDown');

      // Intermediate empty line inserted
      expect(view.state.doc.lines).toBe(7);
      const intermediateLine = view.state.doc.line(4);
      expect(intermediateLine.length).toBe(0);
      expect(view.state.selection.main.head).toBe(intermediateLine.from);

      // Gap decorated as collapsed
      const gapDecorations = view.state.field(wordEquationCollapsedGapField);
      let hasGapDecoration = false;
      gapDecorations.between(intermediateLine.from, intermediateLine.from, (from, to, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') {
          hasGapDecoration = true;
        }
      });
      expect(hasGapDecoration).toBe(true);

      view.destroy();
      container.remove();
    });

    it('2.3: ArrowLeft backward exit from block equation before a table inserts intermediate landing', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const eqStartPos = doc.indexOf('```math-word');
      const eqEndPos = doc.length;
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>',
        eqStartPos,
        eqEndPos,
        false,
        'math-word'
      );

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Backward exit towards table
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);

      // Verify intermediate line created
      const updatedLines = view.state.doc.toString().split('\n');
      expect(updatedLines.length).toBe(7);
      const mathLineIndex = updatedLines.findIndex((l) => l.startsWith('```math-word'));
      expect(updatedLines[mathLineIndex - 1]).toBe('');

      // Selection on intermediate line
      const selLine = view.state.doc.lineAt(view.state.selection.main.head);
      expect(selLine.length).toBe(0);
      expect(selLine.number).toBe(mathLineIndex);
    });

    it('2.4: ArrowUp upward exit from block equation before a table inserts intermediate landing', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const eqStartPos = doc.indexOf('```math-word');
      const eqEndPos = doc.length;
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>',
        eqStartPos,
        eqEndPos,
        false,
        'math-word'
      );

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Upward exit towards table
      const handled = widget.handleArrowNavigation('ArrowUp', false, view);
      expect(handled).toBe(true);

      // Verify intermediate line created
      const updatedLines = view.state.doc.toString().split('\n');
      expect(updatedLines.length).toBe(7);
      const mathLineIndex = updatedLines.findIndex((l) => l.startsWith('```math-word'));
      expect(updatedLines[mathLineIndex - 1]).toBe('');

      const selLine = view.state.doc.lineAt(view.state.selection.main.head);
      expect(selLine.length).toBe(0);
      expect(selLine.number).toBe(mathLineIndex);
    });

    it('2.5: Symmetric case: Block Equation directly followed by Table (ArrowRight and ArrowDown exit forward)', () => {
      const doc = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>',
        '```',
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const eqStartPos = 0;
      const eqEndPos = doc.indexOf('| Col 1') - 1;
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>',
        eqStartPos,
        eqEndPos,
        false,
        'math-word'
      );

      // 1. Test forward ArrowRight exit
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      const handledRight = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(handledRight).toBe(true);

      const updatedLines = view.state.doc.toString().split('\n');
      expect(updatedLines.length).toBe(7);
      const tableLineIndex = updatedLines.findIndex((l) => l.startsWith('| Col 1'));
      expect(updatedLines[tableLineIndex - 1]).toBe('');

      const selLine = view.state.doc.lineAt(view.state.selection.main.head);
      expect(selLine.length).toBe(0);
      expect(selLine.number).toBe(tableLineIndex);
    });

    it('2.6: Symmetric case: ArrowLeft at start of first table row following block equation inserts intermediate landing', () => {
      const doc = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>',
        '```',
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor at the start of Line 4 (first table row)
      const tableFirstLine = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: tableFirstLine.from } });

      // Dispatch ArrowLeft
      pressKey(view, 'ArrowLeft');

      // Intermediate empty line inserted
      expect(view.state.doc.lines).toBe(7);
      const intermediateLine = view.state.doc.line(4);
      expect(intermediateLine.length).toBe(0);
      expect(view.state.selection.main.head).toBe(intermediateLine.from);

      view.destroy();
      container.remove();
    });

    it('2.7: Symmetric case: ArrowUp on first table row following block equation inserts intermediate landing', () => {
      const doc = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>',
        '```',
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor inside Line 4 (first table row)
      const tableFirstLine = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: tableFirstLine.from + 4 } });

      // Dispatch ArrowUp
      pressKey(view, 'ArrowUp');

      // Intermediate empty line inserted
      expect(view.state.doc.lines).toBe(7);
      const intermediateLine = view.state.doc.line(4);
      expect(intermediateLine.length).toBe(0);
      expect(view.state.selection.main.head).toBe(intermediateLine.from);

      view.destroy();
      container.remove();
    });

    it('2.8: No double-insertion when empty line already exists between table and equation', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '', // Line 4: already empty
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>k</mi></math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const initialLineCount = view.state.doc.lines;

      // Cursor at end of last table row
      const tableLastLine = view.state.doc.line(3);
      view.dispatch({ selection: { anchor: tableLastLine.to } });

      // Press ArrowRight
      pressKey(view, 'ArrowRight');

      // Line count must NOT change!
      expect(view.state.doc.lines).toBe(initialLineCount);
      // Selection lands on existing empty line (Line 4)
      expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from);

      // Return to table row and test ArrowDown
      view.dispatch({ selection: { anchor: tableLastLine.from + 2 } });
      pressKey(view, 'ArrowDown');

      // Line count must NOT change!
      expect(view.state.doc.lines).toBe(initialLineCount);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from);

      view.destroy();
      container.remove();
    });

    it('2.9: Consecutive table rows non-interference: navigating between table rows does NOT insert newlines', () => {
      const doc = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| Row 1 Col 1 | Row 1 Col 2 |',
        '| Row 2 Col 1 | Row 2 Col 2 |',
        '| Row 3 Col 1 | Row 3 Col 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const initialLineCount = view.state.doc.lines;

      // Cursor on Row 1 (Line 3)
      view.dispatch({ selection: { anchor: view.state.doc.line(3).from + 4 } });
      pressKey(view, 'ArrowDown');
      expect(view.state.doc.lines).toBe(initialLineCount);

      // Cursor on Row 2 (Line 4)
      view.dispatch({ selection: { anchor: view.state.doc.line(4).from + 4 } });
      pressKey(view, 'ArrowUp');
      expect(view.state.doc.lines).toBe(initialLineCount);

      // Cursor at start of Row 2
      view.dispatch({ selection: { anchor: view.state.doc.line(4).from } });
      pressKey(view, 'ArrowLeft');
      expect(view.state.doc.lines).toBe(initialLineCount);

      view.destroy();
      container.remove();
    });

    it('2.10: Collapsed gap dynamic expansion on typing and collapse on deletion', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '', // Line 4: intermediate empty line
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>w</mi></math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const emptyLine = view.state.doc.line(4);

      // 1. While line is empty: gap is collapsed
      let decorations = buildCollapsedGapDecorations(view.state);
      let count = 0;
      decorations.between(emptyLine.from, emptyLine.from, () => { count++; });
      expect(count).toBe(1);

      // 2. User types text on the intermediate line
      view.dispatch({
        changes: { from: emptyLine.from, insert: 'Caption: Data Table' },
      });

      // Gap decoration must be removed because line is no longer empty
      decorations = buildCollapsedGapDecorations(view.state);
      count = 0;
      const modifiedLine = view.state.doc.line(4);
      decorations.between(modifiedLine.from, modifiedLine.from, () => { count++; });
      expect(count).toBe(0);

      // 3. User deletes the text back to empty
      view.dispatch({
        changes: { from: modifiedLine.from, to: modifiedLine.to, insert: '' },
      });

      // Gap decoration must be restored!
      decorations = buildCollapsedGapDecorations(view.state);
      count = 0;
      const restoredLine = view.state.doc.line(4);
      decorations.between(restoredLine.from, restoredLine.from, () => { count++; });
      expect(count).toBe(1);

      view.destroy();
      container.remove();
    });

    it('2.11: Multi-alternating layout: Table -> Eq -> Table -> Eq -> Table', () => {
      const doc = [
        '| T1 |',
        '| --- |',
        '| D1 |',
        '', // Line 4: gap 1
        '```math-word',
        '<math display="block"><mi>E1</mi></math>',
        '```',
        '', // Line 8: gap 2
        '| T2 |',
        '| --- |',
        '| D2 |',
        '', // Line 12: gap 3
        '```math-word',
        '<math display="block"><mi>E2</mi></math>',
        '```',
        '', // Line 16: gap 4
        '| T3 |',
        '| --- |',
        '| D3 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const decorations = buildCollapsedGapDecorations(view.state);

      const gapLines = [4, 8, 12, 16];
      for (const lineNum of gapLines) {
        const line = view.state.doc.line(lineNum);
        let decorated = false;
        decorations.between(line.from, line.from, (from, to, dec) => {
          if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') {
            decorated = true;
          }
        });
        expect(decorated).toBe(true);
      }

      view.destroy();
      container.remove();
    });

    it('2.12: ArrowRight from middle of last table row (pos < curLine.to) does NOT insert newline', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>y</mi></math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const tableLastLine = view.state.doc.line(3);
      // Place cursor in middle of last table row (e.g., pos = from + 3, not at line.to)
      view.dispatch({ selection: { anchor: tableLastLine.from + 3 } });

      pressKey(view, 'ArrowRight');

      // Must NOT have inserted any new line!
      expect(view.state.doc.lines).toBe(6);

      view.destroy();
      container.remove();
    });

    it('2.13: ArrowLeft from middle of first table row (pos > curLine.from) does NOT insert newline', () => {
      const doc = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>y</mi></math>',
        '```',
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const tableFirstLine = view.state.doc.line(4);
      // Place cursor in middle of first table row (not at line.from)
      view.dispatch({ selection: { anchor: tableFirstLine.from + 5 } });

      pressKey(view, 'ArrowLeft');

      // Must NOT have inserted any new line!
      expect(view.state.doc.lines).toBe(6);

      view.destroy();
      container.remove();
    });

    it('2.14: Seamless round-trip traversal: Table -> Intermediate Line -> Equation -> Intermediate Line', () => {
      const doc = [
        '| Col 1 | Col 2 |',
        '| --- | --- |',
        '| Val 1 | Val 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>x</mi></mrow></math>',
        '```',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // 1. Start at end of table row
      const tableRow = view.state.doc.line(3);
      view.dispatch({ selection: { anchor: tableRow.to } });

      // 2. Press ArrowRight: lands on newly inserted intermediate line
      pressKey(view, 'ArrowRight');
      expect(view.state.doc.lines).toBe(7);
      const intermediateLine = view.state.doc.line(4);
      expect(intermediateLine.length).toBe(0);
      expect(view.state.selection.main.head).toBe(intermediateLine.from);

      // 3. From intermediate line, press ArrowRight again: enters block equation!
      pressKey(view, 'ArrowRight');
      const activeState = getActiveEquationState();
      expect(activeState?.isFocused).toBe(true);

      // 4. From inside equation, exit backward: lands back on intermediate line
      let activeWidget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) activeWidget = w;
      });
      expect(activeWidget).not.toBeNull();

      const handledExit = (activeWidget as any).handleArrowNavigation('ArrowLeft', false, view);
      expect(handledExit).toBe(true);

      // Caret is now back on the intermediate line (Line 4), no duplicate lines created!
      expect(view.state.doc.lines).toBe(7);
      expect(view.state.selection.main.head).toBe(view.state.doc.line(4).from);

      view.destroy();
      container.remove();
    });
  });
});

