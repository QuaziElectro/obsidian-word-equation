/**
 * Bug 1 Comprehensive Test Suite: Table Equation Delimiter Leaks & Full-Cell Block Sizing
 *
 * Verifies:
 * 1. Delimiter Hiding & Stripping in Tables:
 *    - Supports both `\weq_inline` and `/weq_inline`.
 *    - Strips surrounding delimiter text before and after rendered equation (`\weq_inline $...$ \weq_inline`).
 *    - Strips block equation delimiters (`math-word<br>$...$<br>` and ```math-word<br>...<br>```).
 *    - CodeMirror Live Preview decorations span entire delimiters without text leakage.
 * 2. Full-Cell Block Sizing:
 *    - Block equations in table cells expand to fill the entire table cell:
 *      width: 100%, height: 100%, min-height: 100%, flex centering, cell padding: 0.
 *    - Inner `.word-equation-math` within table cell block equation expands to 100% width and min-height with border-radius: 0.
 *    - Inline equations in tables preserve inline pill presentation.
 * 3. Immediate Caret Entry:
 *    - ArrowRight entering table cell containing block equation immediately mounts editor with active caret `|`.
 *    - ArrowLeft entering table cell containing block equation immediately mounts editor with active caret `|`.
 *    - ArrowDown from row above into table block equation cell immediately mounts editor with active caret `|`.
 *    - ArrowUp from row below into table block equation cell immediately mounts editor with active caret `|`.
 *    - Mouse click anywhere in table cell containing block equation immediately activates equation editor with active caret `|`.
 * 4. Clean Exits:
 *    - Exiting forward or backward does NOT insert newlines or break Markdown table rows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { createTableInlinePostProcessor } from '../../src/post-processor/table-inline-processor';
import {
  buildEquationDecorations,
  isTableRowLine,
  isInsideTableRow,
  wordEquationStateField,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { createMockEditor } from '../helpers/cm6-mock';

function pressKey(view: EditorView, key: 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp') {
  const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
}

describe('Bug 1: Table Equation Delimiter Leaks & Full-Cell Block Sizing', () => {
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
  // SUITE 1: DELIMITER HIDING & STRIPPING IN TABLES
  // =========================================================================
  describe('1. Delimiter Hiding & Stripping in Tables', () => {
    it('1.1: Strips backslash inline delimiter `\\weq_inline $...$ \\weq_inline` completely in post-processor', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'Result: \\weq_inline $\\frac{a}{b}$ \\weq_inline is final';

      processor(td);

      expect(td.textContent).not.toContain('\\weq_inline');
      expect(td.textContent).toContain('Result:');
      expect(td.textContent).toContain('is final');

      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.querySelector('.eq-fraction')).not.toBeNull();
    });

    it('1.2: Strips forward slash inline delimiter `/weq_inline $...$ /weq_inline` completely in post-processor', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'Col: /weq_inline $\\sqrt{x}$ /weq_inline Done';

      processor(td);

      expect(td.textContent).not.toContain('/weq_inline');
      expect(td.textContent).toContain('Col:');
      expect(td.textContent).toContain('Done');

      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.querySelector('.eq-radical')).not.toBeNull();
    });

    it('1.3: Strips `\\weq_inline <math>...</math> \\weq_inline` with MathML', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '\\weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi></math> \\weq_inline';

      processor(td);

      expect(td.textContent).not.toContain('\\weq_inline');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
    });

    it('1.4: Strips unfenced block delimiter `math-word<br>$...$<br>` in table cell', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'math-word<br>$\\sum_{i=1}^n x_i$<br>';

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('<br>');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.querySelector('.word-equation-block')).not.toBeNull();
    });

    it('1.5: Strips unfenced block delimiter with double dollar `math-word<br>$$...$$<br>` in table cell', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'math-word<br>$$\\int_0^1 f(x) dx$$<br>';

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('<br>');
      expect(td.textContent).not.toContain('$$');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.querySelector('.word-equation-block')).not.toBeNull();
    });

    it('1.6: Strips fenced block delimiter with br linebreaks ````math-word<br>...<br>```` in table cell', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '```math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>M</mi></mrow></math><br>```<br>';

      processor(td);

      expect(td.textContent).not.toContain('```math-word');
      expect(td.textContent).not.toContain('```');
      expect(td.textContent).not.toContain('<br>');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.querySelector('.word-equation-block')).not.toBeNull();
    });

    it('1.7: CodeMirror Live Preview builds full delimiter-covering decorations for \\weq_inline', () => {
      const doc = '| \\weq_inline $\\frac{1}{2}$ \\weq_inline | col2 |';
      const state = EditorState.create({ doc });
      const decs = buildEquationDecorations(state);

      let found = false;
      decs.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          found = true;
          // The decoration must start at '\weq_inline' and end at the second '\weq_inline'
          const coveredText = doc.slice(from, to);
          expect(coveredText).toBe('\\weq_inline $\\frac{1}{2}$ \\weq_inline');
          expect(w.isInline).toBe(true);
        }
      });
      expect(found).toBe(true);
    });

    it('1.8: CodeMirror Live Preview builds full delimiter-covering decorations for unfenced math-word<br> in table row', () => {
      const doc = '| math-word<br>$\\alpha + \\beta$<br> | col2 |';
      const state = EditorState.create({ doc });
      const decs = buildEquationDecorations(state);

      let found = false;
      decs.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          found = true;
          const coveredText = doc.slice(from, to);
          expect(coveredText).toBe('math-word<br>$\\alpha + \\beta$<br>');
          expect(w.isInline).toBe(false);
          expect(w.isBlockInTable).toBe(true);
        }
      });
      expect(found).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 2: FULL-LINE (BLOCK) EQUATION SIZING IN TABLE CELLS
  // =========================================================================
  describe('2. Full-Line (Block) Equation Sizing in Table Cells', () => {
    it('2.1: Post-processor applies full-cell block sizing (width: 100%, height: 100%, flex, padding: 0)', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.textContent = 'math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>X</mi></mrow></math><br>';
      tr.appendChild(td);
      table.appendChild(tr);

      processor(table);

      // Cell padding is reset to 0
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);
      expect(td.style.padding).toBe('0px');

      // Block container expands to 100% dimensions
      const blockEl = td.querySelector('.word-equation-block') as HTMLElement;
      expect(blockEl).not.toBeNull();
      expect(blockEl.classList.contains('word-equation-table-block')).toBe(true);
      expect(blockEl.style.width).toBe('100%');
      expect(blockEl.style.height).toBe('100%');
      expect(blockEl.style.minHeight).toBe('100%');
      expect(blockEl.style.display).toBe('flex');
      expect(blockEl.style.alignItems).toBe('center');
      expect(blockEl.style.justifyContent).toBe('center');

      // Inner math box expands to 100% dimensions with flex centering
      const mathBox = blockEl.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.width).toBe('100%');
      expect(mathBox.style.height).toBe('100%');
      expect(mathBox.style.minHeight).toBe('100%');
      expect(mathBox.style.display).toBe('flex');
      expect(['0', '0px']).toContain(mathBox.style.borderRadius);
    });

    it('2.2: Live Preview widget DOM renders full-cell block element with table block class', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>A</mi></mrow></math>',
        2,
        40,
        false, // isInline = false
        'math-word',
        true // isBlockInTable = true
      );

      const dom = widget.toDOM({} as any);
      expect(dom.classList.contains('word-equation-block')).toBe(true);
      expect(dom.classList.contains('word-equation-table-block')).toBe(true);
      expect(dom.style.width).toBe('100%');
      expect(dom.style.height).toBe('100%');
      expect(dom.style.display).toBe('flex');
      expect(dom.style.alignItems).toBe('center');
      expect(dom.style.justifyContent).toBe('center');

      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.width).toBe('100%');
      expect(mathBox.style.minHeight).toBe('100%');
      expect(['0', '0px']).toContain(mathBox.style.borderRadius);
    });

    it('2.3: Inline equation in table cell retains inline pill styling without full-cell expansion', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math> /weq_inline';

      processor(td);

      const inlineEl = td.querySelector('.word-equation-inline') as HTMLElement;
      expect(inlineEl).not.toBeNull();
      expect(inlineEl.classList.contains('word-equation-table-block')).toBe(false);
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 3: IMMEDIATE CARET ENTRY INTO BLOCK EQUATIONS IN TABLE CELLS
  // =========================================================================
  describe('3. Immediate Caret Entry into Block Equations in Table Cells', () => {
    it('3.1: ArrowRight entering table cell containing block equation immediately activates equation editor with caret |', () => {
      const doc = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>Q</mi></mrow></math><br> | Cell 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor at line 3 start (at the opening pipe `|`)
      const line3 = view.state.doc.line(3);
      view.dispatch({ selection: { anchor: line3.from } });

      // ArrowRight into the cell
      pressKey(view, 'ArrowRight');

      // The equation must immediately be focused with an active visual caret
      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      const caretEl = container.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('3.2: ArrowLeft entering table cell containing block equation from next cell immediately activates equation editor', () => {
      const doc = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>Q</mi></mrow></math><br> | Cell 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor right after the block equation cell (at the divider pipe `|`)
      const line3 = view.state.doc.line(3);
      const decs = view.state.field(wordEquationStateField, false);
      let eqTo = line3.from;
      decs?.between(line3.from, line3.to, (f, t) => { eqTo = t; });

      // Position cursor at or right after eqTo
      view.dispatch({ selection: { anchor: eqTo } });

      // ArrowLeft into the cell
      pressKey(view, 'ArrowLeft');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      const caretEl = container.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('3.3: ArrowDown from row above into table block equation cell immediately activates equation editor with caret |', () => {
      const doc = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>Q</mi></mrow></math><br> | Cell 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor on line 2 (the delimiter row `| --- | --- |`) at column 3 (within col 1)
      const line2 = view.state.doc.line(2);
      view.dispatch({ selection: { anchor: line2.from + 3 } });

      // ArrowDown into line 3
      pressKey(view, 'ArrowDown');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      const caretEl = container.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('3.4: ArrowUp from row below into table block equation cell immediately activates equation editor with caret |', () => {
      const doc = [
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>Q</mi></mrow></math><br> | Cell 2 |',
        '| Row 2 Col 1 | Row 2 Col 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor on line 2 at column 3 (within col 1)
      const line2 = view.state.doc.line(2);
      view.dispatch({ selection: { anchor: line2.from + 3 } });

      // ArrowUp into line 1
      pressKey(view, 'ArrowUp');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      const caretEl = container.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('3.5: Mouse click on table cell containing block equation immediately activates equation editor with caret |', () => {
      const doc = '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>Z</mi></mrow></math><br> | Next |';
      const { view, container } = createMockEditor(doc);

      const blockEl = container.querySelector('.word-equation-block') as HTMLElement;
      expect(blockEl).not.toBeNull();

      // Click on the block wrapper
      blockEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      const caretEl = container.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('3.6: Selection update landing in table block equation cell immediately mounts active equation editor', () => {
      const doc = '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>W</mi></mrow></math><br> | End |';
      const { view, container } = createMockEditor(doc);

      // Dispatch selection directly inside the block equation cell range
      view.dispatch({ selection: { anchor: 4 } });

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      const caretEl = container.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // SUITE 4: CLEAN NAVIGATION EXITS & TABLE INTEGRITY
  // =========================================================================
  describe('4. Clean Navigation Exits & Table Integrity', () => {
    it('4.1: ArrowRight exiting block equation in table cell lands in next cell without inserting newlines', () => {
      const doc = '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>X</mi></mrow></math><br> | NextCell |';
      const { view, container } = createMockEditor(doc);

      // Enter equation
      view.dispatch({ selection: { anchor: 0 } });
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);

      // Step right past the tokens to trigger exit forward
      for (let i = 0; i < 10 && getActiveEquationState(); i++) {
        pressKey(view, 'ArrowRight');
      }

      // Equation should be exited
      expect(getActiveEquationState()).toBeNull();

      // Crucial: document lines count must remain 1 (no spurious newline inserted into table row)
      expect(view.state.doc.lines).toBe(1);

      // Caret is positioned after the equation in the table row
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(doc.indexOf('| NextCell'));

      view.destroy();
      container.remove();
    });

    it('4.2: ArrowLeft exiting block equation in table cell lands in previous position without inserting newlines', () => {
      const doc = '| Col 1 | math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>Y</mi></mrow></math><br> |';
      const { view, container } = createMockEditor(doc);

      // Enter equation from start via ArrowRight from divider pipe
      const dividerPipe = doc.indexOf('| math-word');
      view.dispatch({ selection: { anchor: dividerPipe } });
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);

      // ArrowLeft at offset 0 exits backward
      pressKey(view, 'ArrowLeft');

      expect(getActiveEquationState()).toBeNull();
      expect(view.state.doc.lines).toBe(1);

      view.destroy();
      container.remove();
    });

    it('4.3: Heterogeneous 2x2 table preserves all equations across multiple processor calls', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');
      const tr1 = document.createElement('tr');
      const td1_1 = document.createElement('td');
      td1_1.textContent = '\\weq_inline $\\frac{1}{2}$ \\weq_inline';
      const td1_2 = document.createElement('td');
      td1_2.textContent = 'math-word<br>$\\sqrt{5}$<br>';
      tr1.appendChild(td1_1);
      tr1.appendChild(td1_2);

      const tr2 = document.createElement('tr');
      const td2_1 = document.createElement('td');
      td2_1.textContent = 'Normal text';
      const td2_2 = document.createElement('td');
      td2_2.textContent = '/weq_inline $x^3$ /weq_inline';
      tr2.appendChild(td2_1);
      tr2.appendChild(td2_2);

      table.appendChild(tr1);
      table.appendChild(tr2);

      // Pass 1
      processor(table);
      expect(td1_1.querySelectorAll('.word-equation-math').length).toBe(1);
      expect(td1_2.querySelectorAll('.word-equation-math').length).toBe(1);
      expect(td2_2.querySelectorAll('.word-equation-math').length).toBe(1);
      expect(td1_1.textContent).not.toContain('\\weq_inline');
      expect(td1_2.textContent).not.toContain('math-word');
      expect(td2_2.textContent).not.toContain('/weq_inline');

      // Pass 2 (idempotent)
      processor(table);
      expect(td1_1.querySelectorAll('.word-equation-math').length).toBe(1);
      expect(td1_2.querySelectorAll('.word-equation-math').length).toBe(1);
      expect(td2_2.querySelectorAll('.word-equation-math').length).toBe(1);
    });
  });
});
