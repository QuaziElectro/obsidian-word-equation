/**
 * Challenger Adversarial Test Suite: Gen66 Bug 1
 *
 * Scope: Adversarial Verification of Bug 1 (Table Equation Delimiters, Full-Cell Sizing, Caret Entry)
 *
 * Scenarios Tested:
 * 1. Complex tables with multiple rows, columns, and mixed inline and block equations.
 * 2. Various delimiter encodings (\weq_inline, /weq_inline, math-word<br>, markdown breaks, extra whitespace, dollar signs).
 * 3. Rapid arrow navigation across table cell boundaries from all directions (ArrowRight, ArrowLeft, ArrowUp, ArrowDown).
 * 4. Mouse click simulations on table cells containing block equations.
 * 5. Verification that no delimiter leaks occur and full-cell flex sizing is maintained.
 * 6. Document structure invariants: zero spurious newlines, table integrity maintained.
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

describe('Challenger Gen66 Adversarial: Bug 1 (Table Equation Delimiters, Full-Cell Sizing, Caret Entry)', () => {
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
  // SUITE 1: COMPLEX MULTI-ROW / MULTI-COLUMN TABLES & MIXED EQUATIONS
  // =========================================================================
  describe('1. Complex Tables with Mixed Inline and Block Equations', () => {
    it('1.1: 4x4 matrix table with mixed headers, inline equations, block equations, plain text, and empty cells', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');

      // Thead
      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      const th1 = document.createElement('th');
      th1.textContent = 'Column A';
      const th2 = document.createElement('th');
      th2.textContent = '\\weq_inline $\\sigma_x$ \\weq_inline';
      const th3 = document.createElement('th');
      th3.textContent = '/weq_inline $\\sigma_y$ /weq_inline';
      const th4 = document.createElement('th');
      th4.textContent = 'Notes';
      trHead.append(th1, th2, th3, th4);
      thead.appendChild(trHead);
      table.appendChild(thead);

      // Tbody
      const tbody = document.createElement('tbody');

      // Row 1: Block equation, plain text, inline equation, empty
      const tr1 = document.createElement('tr');
      const td1_1 = document.createElement('td');
      td1_1.textContent = 'math-word<br>$\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$<br>';
      const td1_2 = document.createElement('td');
      td1_2.textContent = 'Identity Matrix';
      const td1_3 = document.createElement('td');
      td1_3.textContent = 'Prefix \\weq_inline $\\lambda_1 = 1$ \\weq_inline Postfix';
      const td1_4 = document.createElement('td');
      td1_4.textContent = '';
      tr1.append(td1_1, td1_2, td1_3, td1_4);

      // Row 2: Plain text, fenced block equation, dollar math, block MathML
      const tr2 = document.createElement('tr');
      const td2_1 = document.createElement('td');
      td2_1.textContent = 'Pauli X';
      const td2_2 = document.createElement('td');
      td2_2.textContent = '```math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><msub><mi>σ</mi><mi>x</mi></msub></mrow></math><br>```<br>';
      const td2_3 = document.createElement('td');
      td2_3.textContent = '$$E = mc^2$$';
      const td2_4 = document.createElement('td');
      td2_4.textContent = 'math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>H</mi><mi>ψ</mi><mo>=</mo><mi>E</mi><mi>ψ</mi></math><br>';
      tr2.append(td2_1, td2_2, td2_3, td2_4);

      // Row 3: Mixed forward and backslash inline equations with double dollar
      const tr3 = document.createElement('tr');
      const td3_1 = document.createElement('td');
      td3_1.textContent = '\\weq_inline $$\\int_0^\\infty e^{-x^2} dx$$ \\weq_inline';
      const td3_2 = document.createElement('td');
      td3_2.textContent = '/weq_inline $$\\frac{\\sqrt{\\pi}}{2}$$ /weq_inline';
      const td3_3 = document.createElement('td');
      td3_3.textContent = 'math-word<br>$\\lim_{n \\to \\infty} (1 + \\frac{1}{n})^n = e$<br>';
      const td3_4 = document.createElement('td');
      td3_4.textContent = 'Final Cell';
      tr3.append(td3_1, td3_2, td3_3, td3_4);

      tbody.append(tr1, tr2, tr3);
      table.appendChild(tbody);

      // Run post-processor
      processor(table);

      // Assert zero delimiter leakages anywhere in the table textContent
      const fullText = table.textContent || '';
      expect(fullText).not.toContain('\\weq_inline');
      expect(fullText).not.toContain('/weq_inline');
      expect(fullText).not.toContain('math-word');
      expect(fullText).not.toContain('<br>');
      expect(fullText).not.toContain('```');

      // Assert equations rendered in designated cells
      expect(th2.querySelector('.word-equation-math')).not.toBeNull();
      expect(th3.querySelector('.word-equation-math')).not.toBeNull();
      expect(td1_1.querySelector('.word-equation-math')).not.toBeNull();
      expect(td1_3.querySelector('.word-equation-math')).not.toBeNull();
      expect(td2_2.querySelector('.word-equation-math')).not.toBeNull();
      expect(td2_3.querySelector('.word-equation-math')).not.toBeNull();
      expect(td2_4.querySelector('.word-equation-math')).not.toBeNull();
      expect(td3_1.querySelector('.word-equation-math')).not.toBeNull();
      expect(td3_2.querySelector('.word-equation-math')).not.toBeNull();
      expect(td3_3.querySelector('.word-equation-math')).not.toBeNull();

      // Check block equation cell sizing invariants
      const blockCells = [td1_1, td2_2, td2_4, td3_3];
      for (const cell of blockCells) {
        expect(cell.classList.contains('table-cell-has-block-equation')).toBe(true);
        expect(cell.style.padding).toBe('0px');
        const blockEl = cell.querySelector('.word-equation-table-block') as HTMLElement;
        expect(blockEl).not.toBeNull();
        expect(blockEl.style.width).toBe('100%');
        expect(blockEl.style.height).toBe('100%');
        expect(blockEl.style.minHeight).toBe('100%');
      }

      // Check inline cells keep standard inline display
      const inlineCells = [th2, th3, td1_3, td3_1, td3_2];
      for (const cell of inlineCells) {
        expect(cell.classList.contains('table-cell-has-block-equation')).toBe(false);
        expect(cell.querySelector('.word-equation-inline')).not.toBeNull();
      }
    });

    it('1.2: Multiple equations inside the exact same table cell process sequentially without delimiter leakage', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'Start \\weq_inline $\\alpha$ \\weq_inline middle /weq_inline $\\beta$ /weq_inline end';

      processor(td);

      expect(td.textContent).not.toContain('\\weq_inline');
      expect(td.textContent).not.toContain('/weq_inline');
      expect(td.textContent).toContain('Start');
      expect(td.textContent).toContain('middle');
      expect(td.textContent).toContain('end');

      const mathBoxes = td.querySelectorAll('.word-equation-math');
      expect(mathBoxes.length).toBe(2);
    });

    it('1.3: Deeply nested math structures (fraction inside radical inside fraction) in table block equation', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'math-word<br>$\\frac{\\sqrt{\\frac{a+b}{c-d}}}{2}$<br>';

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('<br>');
      expect(td.querySelector('.eq-fraction')).not.toBeNull();
      expect(td.querySelector('.eq-radical')).not.toBeNull();
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 2: DELIMITER ENCODING PERMUTATIONS & CODE MIRROR LIVE PREVIEW
  // =========================================================================
  describe('2. Delimiter Encoding Permutations and Live Preview Coverage', () => {
    it('2.1: Strips backslash inline with extra whitespace and double dollar: `\\weq_inline   $$E=mc^2$$   \\weq_inline`', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '\\weq_inline   $$E=mc^2$$   \\weq_inline';

      processor(td);

      expect(td.textContent).not.toContain('\\weq_inline');
      expect(td.textContent).not.toContain('$$');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
    });

    it('2.2: Strips forward slash inline with extra spaces and single dollar: `/weq_inline   $F=ma$   /weq_inline`', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '/weq_inline   $F=ma$   /weq_inline';

      processor(td);

      expect(td.textContent).not.toContain('/weq_inline');
      expect(td.textContent).not.toContain('$');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
    });

    it('2.3: Handles Windows CRLF breaks in unfenced block equations: `math-word<br>\\r\\n$\\sum x$\\r\\n<br>`', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'math-word<br>\r\n$\\sum_{i=1}^n x_i$\r\n<br>';

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('<br>');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);
    });

    it('2.3b: Handles Unix LF breaks in unfenced block equations: `math-word<br>\\n$\\sum x$\\n<br>`', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'math-word<br>\n$\\sum_{i=1}^n x_i$\n<br>';

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('<br>');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);
    });

    it('2.3c: Handles whitespace after `<br>` in unfenced block equations: `math-word<br> $\\sum x$ <br>`', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'math-word<br> $\\sum_{i=1}^n x_i$ <br>';

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('<br>');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);
    });

    it('2.4: Handles HTML-escaped entities: `math-word<br>&lt;math&gt;&lt;mi&gt;Z&lt;/mi&gt;&lt;/math&gt;<br>`', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = 'math-word<br>&lt;math xmlns="http://www.w3.org/1998/Math/MathML" display="block"&gt;&lt;mi&gt;Z&lt;/mi&gt;&lt;/math&gt;<br>';

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('&lt;');
      expect(td.textContent).not.toContain('&gt;');
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
    });

    it('2.5: Live Preview decorations cover exact bounds of backslash inline equation without prefix/suffix leak', () => {
      const doc = '| Head 1 | Head 2 |\n| --- | --- |\n| \\weq_inline $x+y=z$ \\weq_inline | Next |';
      const state = EditorState.create({ doc });
      const decs = buildEquationDecorations(state);

      let found = false;
      decs.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          found = true;
          const covered = doc.slice(from, to);
          expect(covered).toBe('\\weq_inline $x+y=z$ \\weq_inline');
          expect(w.isInline).toBe(true);
        }
      });
      expect(found).toBe(true);
    });

    it('2.6: Live Preview decorations cover exact bounds of unfenced table block equation with br linebreaks', () => {
      const doc = '| Head 1 | Head 2 |\n| --- | --- |\n| math-word<br>$$\\int f(x) dx$$<br> | Next |';
      const state = EditorState.create({ doc });
      const decs = buildEquationDecorations(state);

      let found = false;
      decs.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget && w.isBlockInTable) {
          found = true;
          const covered = doc.slice(from, to);
          expect(covered).toBe('math-word<br>$$\\int f(x) dx$$<br>');
          expect(w.isInline).toBe(false);
          expect(w.isBlockInTable).toBe(true);
        }
      });
      expect(found).toBe(true);
    });

    it('2.7: Live Preview handles table row where equation touches pipe directly without spaces: `|\\weq_inline $p$ \\weq_inline|`', () => {
      const doc = '|\\weq_inline $p$ \\weq_inline|col2|';
      const state = EditorState.create({ doc });
      const decs = buildEquationDecorations(state);

      let matched = false;
      decs.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          matched = true;
          expect(from).toBe(1); // Right after leading pipe `|`
          expect(doc.slice(from, to)).toBe('\\weq_inline $p$ \\weq_inline');
        }
      });
      expect(matched).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 3: FULL-CELL FLEX SIZING & LAYOUT INVARIANTS
  // =========================================================================
  describe('3. Full-Cell Flex Sizing & Layout Invariants', () => {
    it('3.1: Post-processor applies 100% dimensions, flex centering, border-radius 0, and 0 padding to table block cell', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.textContent = 'math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>T</mi></mrow></math><br>';
      tr.appendChild(td);
      table.appendChild(tr);

      processor(table);

      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);
      expect(td.style.padding).toBe('0px');

      const blockEl = td.querySelector('.word-equation-table-block') as HTMLElement;
      expect(blockEl).not.toBeNull();
      expect(blockEl.style.width).toBe('100%');
      expect(blockEl.style.height).toBe('100%');
      expect(blockEl.style.minHeight).toBe('100%');
      expect(blockEl.style.display).toBe('flex');
      expect(blockEl.style.alignItems).toBe('center');
      expect(blockEl.style.justifyContent).toBe('center');

      const mathBox = blockEl.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.width).toBe('100%');
      expect(mathBox.style.height).toBe('100%');
      expect(mathBox.style.minHeight).toBe('100%');
      expect(mathBox.style.display).toBe('flex');
      expect(mathBox.style.alignItems).toBe('center');
      expect(mathBox.style.justifyContent).toBe('center');
      expect(['0', '0px']).toContain(mathBox.style.borderRadius);
    });

    it('3.2: Live Preview WordEquationWidget toDOM produces full-cell flex container for isBlockInTable', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>K</mi></mrow></math>',
        10,
        50,
        false, // isInline = false
        'math-word',
        true // isBlockInTable = true
      );

      const dom = widget.toDOM({} as any);

      expect(dom.classList.contains('word-equation-block')).toBe(true);
      expect(dom.classList.contains('word-equation-table-block')).toBe(true);
      expect(dom.style.width).toBe('100%');
      expect(dom.style.height).toBe('100%');
      expect(dom.style.minHeight).toBe('100%');
      expect(dom.style.display).toBe('flex');
      expect(dom.style.alignItems).toBe('center');
      expect(dom.style.justifyContent).toBe('center');

      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.style.width).toBe('100%');
      expect(mathBox.style.minHeight).toBe('100%');
      expect(['0', '0px']).toContain(mathBox.style.borderRadius);
    });

    it('3.3: Inline equation inside table cell does NOT receive full-cell block class or 0 cell padding', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '\\weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>w</mi></math> \\weq_inline';

      processor(td);

      expect(td.classList.contains('table-cell-has-block-equation')).toBe(false);
      expect(td.querySelector('.word-equation-table-block')).toBeNull();
      const inlineEl = td.querySelector('.word-equation-inline');
      expect(inlineEl).not.toBeNull();
    });

    it('3.4: Re-processing already styled table is idempotent and maintains exact dimensions', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.textContent = 'math-word<br>$\\Omega$<br>';
      tr.appendChild(td);
      table.appendChild(tr);

      // Pass 1
      processor(table);
      expect(td.querySelectorAll('.word-equation-math').length).toBe(1);
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);

      // Pass 2
      processor(table);
      expect(td.querySelectorAll('.word-equation-math').length).toBe(1);
      expect(td.classList.contains('table-cell-has-block-equation')).toBe(true);
      expect(td.style.padding).toBe('0px');
    });
  });

  // =========================================================================
  // SUITE 4: RAPID ARROW NAVIGATION ACROSS CELL BOUNDARIES FROM ALL DIRECTIONS
  // =========================================================================
  describe('4. Rapid Arrow Navigation Across Cell Boundaries', () => {
    it('4.1: ArrowRight horizontal traversal across multiple cells enters equation and exits without newline insertion', () => {
      const doc = [
        '| Col 1 | Col 2 | Col 3 |',
        '| --- | --- | --- |',
        '| Pre | math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>A</mi></mrow></math><br> | Post |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const line3 = view.state.doc.line(3);

      // Place cursor at divider pipe right before Col 2 block equation
      const dividerPipePos = line3.from + doc.split('\n')[2].indexOf('| math-word');
      view.dispatch({ selection: { anchor: dividerPipePos } });

      // ArrowRight into the block equation cell
      pressKey(view, 'ArrowRight');

      // Caret enters equation immediately
      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);
      expect(container.querySelector('.eq-caret')).not.toBeNull();

      // Step right past the token to trigger forward exit
      for (let i = 0; i < 8 && getActiveEquationState(); i++) {
        pressKey(view, 'ArrowRight');
      }

      // Equation exited
      expect(getActiveEquationState()).toBeNull();

      // Critical invariant: line count must remain 3 (no spurious newlines breaking the table)
      expect(view.state.doc.lines).toBe(3);

      view.destroy();
      container.remove();
    });

    it('4.2: ArrowLeft reverse horizontal traversal from next cell enters equation from end with active caret |', () => {
      const doc = [
        '| Col 1 | Col 2 | Col 3 |',
        '| --- | --- | --- |',
        '| Pre | math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>B</mi></mrow></math><br> | Post |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);
      const line3 = view.state.doc.line(3);

      // Place cursor right after the block equation cell at divider pipe `| Post`
      const dividerPipeAfterPos = line3.from + doc.split('\n')[2].indexOf('| Post');
      view.dispatch({ selection: { anchor: dividerPipeAfterPos } });

      // ArrowLeft into Col 2 block equation
      pressKey(view, 'ArrowLeft');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);
      expect(container.querySelector('.eq-caret')).not.toBeNull();

      // ArrowLeft to exit backward
      pressKey(view, 'ArrowLeft');
      pressKey(view, 'ArrowLeft');

      expect(getActiveEquationState()).toBeNull();
      expect(view.state.doc.lines).toBe(3);

      view.destroy();
      container.remove();
    });

    it('4.3: ArrowDown vertical navigation enters block equation cell immediately from header/divider row', () => {
      const doc = [
        '| Header 1 | Header 2 |',
        '| --- | --- |',
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>D</mi></mrow></math><br> | Val 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor on line 2 (divider row) within Col 1
      const line2 = view.state.doc.line(2);
      view.dispatch({ selection: { anchor: line2.from + 2 } });

      // Press ArrowDown into line 3
      pressKey(view, 'ArrowDown');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);
      expect(container.querySelector('.eq-caret')).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('4.4: ArrowUp vertical navigation enters block equation cell immediately from row below', () => {
      const doc = [
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>U</mi></mrow></math><br> | Top 2 |',
        '| Below 1 | Below 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Place cursor on line 2 within Col 1
      const line2 = view.state.doc.line(2);
      view.dispatch({ selection: { anchor: line2.from + 3 } });

      // Press ArrowUp into line 1
      pressKey(view, 'ArrowUp');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);
      expect(container.querySelector('.eq-caret')).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('4.5: ArrowDown between consecutive table rows with block equations transitions cleanly', () => {
      const doc = [
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>R</mi><mn>1</mn></mrow></math><br> | Other |',
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>R</mi><mn>2</mn></mrow></math><br> | Other |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Enter row 1 equation
      view.dispatch({ selection: { anchor: 0 } });
      pressKey(view, 'ArrowRight');

      expect(getActiveEquationState()?.isFocused).toBe(true);
      const row1ActiveFrom = getActiveEquationState()?.from;

      // ArrowDown from row 1 equation into row 2
      pressKey(view, 'ArrowDown');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);
      // It should now be in the row 2 equation (different `from` position)
      expect(activeState?.from).not.toBe(row1ActiveFrom);

      expect(view.state.doc.lines).toBe(2);

      view.destroy();
      container.remove();
    });

    it('4.5b: ArrowUp between consecutive table rows with block equations transitions cleanly', () => {
      const doc = [
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>R</mi><mn>1</mn></mrow></math><br> | Other |',
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>R</mi><mn>2</mn></mrow></math><br> | Other |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Enter row 2 equation
      const line2 = view.state.doc.line(2);
      view.dispatch({ selection: { anchor: line2.from } });
      pressKey(view, 'ArrowRight');

      expect(getActiveEquationState()?.isFocused).toBe(true);
      const row2ActiveFrom = getActiveEquationState()?.from;

      // ArrowUp from row 2 equation into row 1
      pressKey(view, 'ArrowUp');

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);
      expect(activeState?.from).not.toBe(row2ActiveFrom);

      expect(view.state.doc.lines).toBe(2);

      view.destroy();
      container.remove();
    });

    it('4.6: Rapid arrow keypress sequence does not throw or desync state machine', () => {
      const doc = [
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>X</mi></mrow></math><br> | Next |',
        '| Row 2 Col 1 | Row 2 Col 2 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      // Rapidly burst arrows in multiple directions
      const keys: Array<'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp'> = [
        'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'
      ];

      expect(() => {
        for (const k of keys) {
          pressKey(view, k);
        }
      }).not.toThrow();

      expect(view.state.doc.lines).toBe(2);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // SUITE 5: MOUSE CLICK & POINTER ACTIVATION ON TABLE CELLS
  // =========================================================================
  describe('5. Mouse Click Simulations on Table Cells Containing Block Equations', () => {
    it('5.1: Pointerdown click on .word-equation-table-block immediately focuses equation with active caret |', () => {
      const doc = '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>M</mi><mn>1</mn></mrow></math><br> | Col 2 |';
      const { view, container } = createMockEditor(doc);

      const blockEl = container.querySelector('.word-equation-table-block') as HTMLElement;
      expect(blockEl).not.toBeNull();

      // Dispatch pointerdown
      blockEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      const caretEl = container.querySelector('.eq-caret');
      expect(caretEl).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('5.2: Pointerdown click on inner .word-equation-math inside table cell activates equation editor', () => {
      const doc = '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>M</mi><mn>2</mn></mrow></math><br> | Col 2 |';
      const { view, container } = createMockEditor(doc);

      const mathEl = container.querySelector('.word-equation-table-block .word-equation-math') as HTMLElement;
      expect(mathEl).not.toBeNull();

      mathEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      expect(container.querySelector('.eq-caret')).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('5.3: Successive clicking between adjacent table cells switches focus smoothly', () => {
      const doc = [
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>A</mi></mrow></math><br> | math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>B</mi></mrow></math><br> |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      const blocks = container.querySelectorAll('.word-equation-table-block');
      expect(blocks.length).toBe(2);

      // Click cell 1
      blocks[0].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      const cell1From = getActiveEquationState()?.from;

      // Click cell 2
      blocks[1].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      const cell2From = getActiveEquationState()?.from;

      expect(cell2From).not.toBe(cell1From);
      expect(container.querySelector('.eq-caret')).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('5.4: Click into table block equation followed by ArrowRight navigates within equation without markdown mutation', () => {
      const doc = '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></math><br> | Col 2 |';
      const { view, container } = createMockEditor(doc);

      const blockEl = container.querySelector('.word-equation-table-block') as HTMLElement;
      blockEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      expect(getActiveEquationState()?.isFocused).toBe(true);

      // Navigate right within equation
      pressKey(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);

      // Document lines remain unchanged
      expect(view.state.doc.lines).toBe(1);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // SUITE 6: TABLE INTEGRITY & ZERO DELIMITER LEAK SUMMARY
  // =========================================================================
  describe('6. Table Document Integrity & Zero Leaks Under Stress', () => {
    it('6.1: Complex 3x3 table maintains exact markdown row integrity across 20 rapid enter/exit operations', () => {
      const doc = [
        '| Col A | Col B | Col C |',
        '| --- | --- | --- |',
        '| math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>X</mi></mrow></math><br> | Val 2 | Val 3 |',
      ].join('\n');

      const { view, container } = createMockEditor(doc);

      for (let cycle = 0; cycle < 5; cycle++) {
        // Enter from start
        view.dispatch({ selection: { anchor: 0 } });
        pressKey(view, 'ArrowRight');
        pressKey(view, 'ArrowRight');

        // Step through and exit
        for (let s = 0; s < 6 && getActiveEquationState(); s++) {
          pressKey(view, 'ArrowRight');
        }
      }

      // Final invariant check
      expect(view.state.doc.lines).toBe(3);
      expect(view.state.doc.line(1).text).toContain('| Col A | Col B | Col C |');
      expect(view.state.doc.line(2).text).toContain('| --- | --- | --- |');
      expect(view.state.doc.line(3).text).toContain('| math-word<br>');

      view.destroy();
      container.remove();
    });
  });
});
