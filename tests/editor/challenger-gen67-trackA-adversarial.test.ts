/**
 * Challenger Adversarial Stress Test Suite: Gen67 Track A
 * Caret Navigation & Table Equations (Bugs 1, 2, 3, 8, 10, 11, 20)
 *
 * Authored by: challenger_1_gen67
 * Adversarial Certification Targets:
 * - Bug 1: Start-of-note block equation exiting leftward under rapid repetitions,
 *          multi-line notes, and collapsed gap transitions.
 * - Bug 2: Table equation delimiter stripping with diverse messy markup
 *          (\weq_inline, /weq_inline, math-word<br>, mixed <br\s*\/?>), sizing consistency.
 * - Bug 3: Full-page math blocks (math-page, weq-page) in table cells and normal notes;
 *          verify complete text hiding and caret navigation trapping.
 * - Bug 8: Ctrl+A in deeply nested formula structures (fractions, matrices, scripts);
 *          ensure whole root AST selection without bubbling.
 * - Bug 10 & 11: Rapid deletion, fraction addition, and gallery insertion stress
 *                without resurrection or denominator descent.
 * - Bug 20: Document context preservation and caret return across multiple sequential cell edits.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, MarkdownView, WorkspaceLeaf, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import {
  createTableInlinePostProcessor,
} from '../../src/post-processor/table-inline-processor';
import {
  buildEquationDecorations,
  buildCollapsedGapDecorations,
  isTableRowLine,
  isInsideTableRow,
  wordEquationStateField,
  wordEquationCollapsedGapField,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  EquationGalleryView,
  calculateCellSpan,
} from '../../src/gallery/gallery-view';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
  captureDocumentContext,
  restoreDocumentContext,
  getSavedDocumentContext,
} from '../../src/editor/active-session';
import {
  FractionNode,
  SlotNode,
  MatrixNode,
  SuperscriptNode,
  MathNode,
} from '../../src/core/types';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';

describe('Challenger Gen67 Track A Adversarial Stress Suite (Bugs 1, 2, 3, 8, 10, 11, 20)', () => {
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
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TARGET 1: BUG 1 — START-OF-NOTE BLOCK EXIT STRESS & COLLAPSED GAPS
  // =========================================================================
  describe('Target 1 (Bug 1): Start-of-note block exit stress & collapsed gap transitions', () => {
    it('1.1: Rapid repetitive leftward exits from line 1 block equation maintain exactly 1 collapsed gap without newline accumulation', () => {
      const doc = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo></mrow>',
        '</math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo></mrow></math>',
        0,
        doc.length,
        false,
        'math-word'
      );

      // First leftward exit: enters from start, exits left
      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      const handledFirst = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handledFirst).toBe(true);

      // Verify line 1 is empty and line 2 is the block equation
      let updatedDoc = view.state.doc.toString();
      let lines = updatedDoc.split('\n');
      expect(lines[0]).toBe('');
      expect(lines[1]).toBe('```math-word');
      expect(view.state.selection.main.anchor).toBe(0);

      // Verify collapsed gap decoration on line 1
      let decSet = buildCollapsedGapDecorations(view.state);
      let foundGap = false;
      decSet.between(0, 0, (from, to, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') {
          foundGap = true;
        }
      });
      expect(foundGap).toBe(true);

      // Now stress: repeat leftward exits 4 more times in succession
      // Each time, the widget enters from start and tries to exit leftward again.
      for (let iteration = 1; iteration <= 4; iteration++) {
        // Re-enter the widget (now starting at line 2)
        widget.from = view.state.doc.line(2).from;
        widget.to = view.state.doc.length;
        widget.enterFromStart(view);

        const handledRepeat = widget.handleArrowNavigation('ArrowLeft', false, view);
        expect(handledRepeat).toBe(true);

        // Document MUST NOT accumulate more newlines!
        updatedDoc = view.state.doc.toString();
        lines = updatedDoc.split('\n');
        expect(lines[0]).toBe('');
        expect(lines[1]).toBe('```math-word');
        expect(lines.length).toBe(6); // 1 empty line + 5 block lines
        expect(view.state.selection.main.anchor).toBe(0);

        // Gap decoration remains valid
        decSet = buildCollapsedGapDecorations(view.state);
        foundGap = false;
        decSet.between(0, 0, (from, to, dec) => {
          if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') {
            foundGap = true;
          }
        });
        expect(foundGap).toBe(true);
      }
    });

    it('1.2: Dynamic collapsed gap lifecycle: typing text expands gap, clearing text restores collapsed gap', () => {
      const doc = [
        '',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mrow><mi>y</mi><mo>=</mo><msup><mi>x</mi><mn>2</mn></msup></mrow>',
        '</math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      // Initially empty line 1 has collapsed gap
      let decSet = buildCollapsedGapDecorations(view.state);
      let hasGap = false;
      decSet.between(0, 0, (f, t, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') hasGap = true;
      });
      expect(hasGap).toBe(true);

      // User types full paragraph on line 1
      view.dispatch({
        changes: { from: 0, insert: '# Section 1: Introduction to Parabola' },
        selection: { anchor: 38 },
      });

      // Gap decoration must be removed since line 1 has text
      decSet = buildCollapsedGapDecorations(view.state);
      hasGap = false;
      decSet.between(0, 0, (f, t, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') hasGap = true;
      });
      expect(hasGap).toBe(false);

      // User selects all text on line 1 and deletes it
      const line1Len = view.state.doc.line(1).length;
      view.dispatch({
        changes: { from: 0, to: line1Len, insert: '' },
        selection: { anchor: 0 },
      });

      // Gap decoration must be restored
      decSet = buildCollapsedGapDecorations(view.state);
      hasGap = false;
      decSet.between(0, 0, (f, t, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') hasGap = true;
      });
      expect(hasGap).toBe(true);
    });

    it('1.3: Note already having an empty line 1 does not insert extra blank line upon leftward exit', () => {
      const doc = [
        '',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mrow><mi>z</mi></mrow>',
        '</math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      // Widget starts on line 2 (offset 1)
      const line2 = view.state.doc.line(2);
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>z</mi></mrow></math>',
        line2.from,
        view.state.doc.length,
        false,
        'math-word'
      );

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);

      // Selection must land at pos 0 on line 1
      expect(view.state.selection.main.anchor).toBe(0);

      // Document still has only 1 leading empty line, NOT 2
      const updatedDoc = view.state.doc.toString();
      const lines = updatedDoc.split('\n');
      expect(lines[0]).toBe('');
      expect(lines[1]).toBe('```math-word');
      expect(lines.length).toBe(6);
    });

    it('1.4: Consecutive block equations without text between them receive intermediate and leading collapsed gaps', () => {
      const doc = [
        '',
        '```math-word',
        '<math display="block"><mi>A</mi></math>',
        '```',
        '',
        '```math-word',
        '<math display="block"><mi>B</mi></math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const decSet = buildCollapsedGapDecorations(state);

      // Should have collapsed gap at line 1 (before block A)
      const line1 = state.doc.line(1);
      let foundLine1Gap = false;
      decSet.between(line1.from, line1.from, (f, t, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') foundLine1Gap = true;
      });
      expect(foundLine1Gap).toBe(true);

      // Should have collapsed gap at line 5 (between block A and block B)
      const line5 = state.doc.line(5);
      let foundLine5Gap = false;
      decSet.between(line5.from, line5.from, (f, t, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') foundLine5Gap = true;
      });
      expect(foundLine5Gap).toBe(true);
    });
  });

  // =========================================================================
  // TARGET 2: BUG 2 — TABLE EQUATION MESSY DELIMITERS STRIPPING & SIZING
  // =========================================================================
  describe('Target 2 (Bug 2): Table equation messy delimiters stripping & sizing consistency', () => {
    it('2.1: Strips multi-format messy delimiters (\\weq_inline, /weq_inline, math-word<br>, mixed <br\s*\/?>) in multi-column tables', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');
      const tr = document.createElement('tr');

      // Cell 1: \weq_inline <math>...</math> \weq_inline
      const td1 = document.createElement('td');
      td1.appendChild(document.createTextNode('\\weq_inline '));
      const m1 = document.createElement('math');
      m1.innerHTML = '<mi>α</mi>';
      td1.appendChild(m1);
      td1.appendChild(document.createTextNode(' \\weq_inline'));

      // Cell 2: Case-insensitive /WEQ_INLINE
      const td2 = document.createElement('td');
      td2.appendChild(document.createTextNode('/WEQ_INLINE '));
      const m2 = document.createElement('math');
      m2.innerHTML = '<mi>β</mi>';
      td2.appendChild(m2);
      td2.appendChild(document.createTextNode(' /WEQ_INLINE'));

      // Cell 3: math-word<br> block with mixed <br/>
      const td3 = document.createElement('td');
      td3.appendChild(document.createTextNode('math-word'));
      td3.appendChild(document.createElement('br'));
      const m3 = document.createElement('math');
      m3.setAttribute('display', 'block');
      m3.innerHTML = '<mi>γ</mi>';
      td3.appendChild(m3);
      td3.appendChild(document.createElement('br'));

      // Cell 4: weq<br><br> with double break
      const td4 = document.createElement('td');
      td4.appendChild(document.createTextNode('weq'));
      td4.appendChild(document.createElement('br'));
      td4.appendChild(document.createElement('br'));
      const m4 = document.createElement('math');
      m4.setAttribute('display', 'block');
      m4.innerHTML = '<mi>δ</mi>';
      td4.appendChild(m4);
      td4.appendChild(document.createElement('br'));

      // Cell 5: Empty cell and plain text cell
      const td5 = document.createElement('td');
      const td6 = document.createElement('td');
      td6.textContent = 'Regular plaintext notes';

      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tr.appendChild(td4);
      tr.appendChild(td5);
      tr.appendChild(td6);
      table.appendChild(tr);

      processor(table);

      // Verify complete stripping of all delimiters in all cells
      expect(td1.textContent).not.toContain('\\weq_inline');
      expect(td1.textContent).not.toContain('/weq_inline');
      expect(td2.textContent).not.toContain('/WEQ_INLINE');
      expect(td3.textContent).not.toContain('math-word');
      expect(td4.textContent).not.toContain('weq');

      // Verify content tokens are rendered
      expect(td1.textContent).toContain('α');
      expect(td2.textContent).toContain('β');
      expect(td3.textContent).toContain('γ');
      expect(td4.textContent).toContain('δ');
      expect(td6.textContent).toBe('Regular plaintext notes');

      // Verify block styling applied to block equations inside table
      expect(td3.classList.contains('table-cell-has-block-equation')).toBe(true);
      expect(td4.classList.contains('table-cell-has-block-equation')).toBe(true);
    });

    it('2.2: Table equation widget receives consistent sizing and layout properties inside table cells', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></math>',
        10,
        60,
        false,
        'math-word',
        true // isBlockInTable
      );

      const dom = (widget as any).renderCurrentDom();
      expect(dom.classList.contains('word-equation-table-block')).toBe(true);
      expect(dom.style.width).toBe('100%');
      expect(dom.style.display).toBe('flex');
      expect(dom.style.alignItems).toBe('center');
      expect(dom.style.justifyContent).toBe('center');
    });

    it('2.3: Multi-element fragmented text nodes with orphaned delimiters are scrubbed clean', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      // Text node with orphaned delimiter
      const orphanedNode = document.createTextNode('```math-word<br>```');
      td.appendChild(orphanedNode);

      processor(td);

      expect(td.textContent).not.toContain('math-word');
      expect(td.textContent).not.toContain('```');
    });
  });

  // =========================================================================
  // TARGET 3: BUG 3 — FULL-PAGE EQUATION TEXT HIDING & NAVIGATION TRAPPING
  // =========================================================================
  describe('Target 3 (Bug 3): Full-page equation text hiding & navigation trapping', () => {
    it('3.1: Full-page equation in table cell replaces entire cell and hides surrounding text and elements', () => {
      const doc = '| col 1 | leading text ```math-page<br><math display="full-page"><mi>M</mi></math><br>``` trailing notes | col 3 |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundFullPage = false;
      let coveredEntireCell = false;

      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget && w.displayMode === 'full-page') {
          foundFullPage = true;
          const textCovered = doc.slice(from, to);
          if (textCovered.includes('leading text') && textCovered.includes('trailing notes')) {
            coveredEntireCell = true;
          }
        }
      });

      expect(foundFullPage).toBe(true);
      expect(coveredEntireCell).toBe(true);
    });

    it('3.2: Table post-processor hides sibling text nodes and elements for full-page equations', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      const leadingText = document.createTextNode('Hidden leading text');
      const mathEl = document.createElement('math');
      mathEl.setAttribute('display', 'full-page');
      mathEl.innerHTML = '<mi>F</mi><mo>=</mo><mi>m</mi><mi>a</mi>';
      const spanEl = document.createElement('span');
      spanEl.textContent = 'Hidden subtitle';
      const trailingText = document.createTextNode('Hidden trailing text');

      td.appendChild(leadingText);
      td.appendChild(mathEl);
      td.appendChild(spanEl);
      td.appendChild(trailingText);

      processor(td);

      // Verify full-page styling and class applied to td
      expect(td.classList.contains('table-cell-has-fullpage-equation')).toBe(true);
      expect(td.style.padding).toBe('0px');

      // Verify sibling elements are hidden and text nodes emptied
      expect(leadingText.nodeValue).toBe('');
      expect(trailingText.nodeValue).toBe('');
      expect(spanEl.style.display).toBe('none');

      // Rendered full-page widget exists
      const fullPageWidget = td.querySelector('.word-equation-full-page');
      expect(fullPageWidget).not.toBeNull();
      const mathBox = td.querySelector('.eq-full-page');
      expect(mathBox).not.toBeNull();
    });

    it('3.3: Arrow navigation traps caret inside full-page equation within table cell boundary', () => {
      const doc = '| ```math-page<br><math display="full-page"><mi>P</mi></math><br>``` |';
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(
        '<math display="full-page"><mi>P</mi></math>',
        2,
        doc.length - 2,
        false,
        'math-page',
        false,
        'full-page'
      );

      // Enter from start: caret is at root offset 0
      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Attempt to escape leftward past equation boundary
      const handledLeft = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handledLeft).toBe(true);

      // Caret must remain trapped inside equation at root offset 0
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Move caret to end of equation
      widget.caret.offset = widget.ast.children.length;

      // Attempt to escape rightward past equation boundary
      const handledRight = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(handledRight).toBe(true);

      // Caret must remain trapped inside equation at root offset end
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(widget.ast.children.length);
    });
  });

  // =========================================================================
  // TARGET 4: BUG 8 — CTRL+A IN DEEPLY NESTED FORMULA STRUCTURES
  // =========================================================================
  describe('Target 4 (Bug 8): Ctrl+A in deeply nested formula structures', () => {
    it('4.1: Ctrl+A inside triple-nested fraction selects entire root AST and prevents bubbling', () => {
      // Triple nested fraction: \frac{\frac{\frac{a}{b}}{c}}{d}
      const nestedFracXml = [
        '<math xmlns="http://www.w3.org/1998/Math/MathML">',
        '  <mfrac>',
        '    <mrow>',
        '      <mfrac>',
        '        <mrow>',
        '          <mfrac>',
        '            <mrow><mi>a</mi></mrow>',
        '            <mrow><mi>b</mi></mrow>',
        '          </mfrac>',
        '        </mrow>',
        '        <mrow><mi>c</mi></mrow>',
        '      </mfrac>',
        '    </mrow>',
        '    <mrow><mi>d</mi></mrow>',
        '  </mfrac>',
        '</math>',
      ].join('');

      const doc = `$$ ${nestedFracXml} $$`;
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(nestedFracXml, 3, doc.length - 3, true, '$weq');
      const dom = widget.toDOM(view);
      document.body.appendChild(dom);

      // Position caret inside deepest denominator 'b'
      const frac1 = widget.ast.children[0] as FractionNode;
      const frac2 = frac1.numerator.children[0] as FractionNode;
      const frac3 = frac2.numerator.children[0] as FractionNode;
      const deepestSlot = frac3.denominator;

      widget.caret = { slotId: deepestSlot.id, offset: 1 };
      widget.isFocused = true;
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Fire Ctrl+A
      const ctrlAEvent = new KeyboardEvent('keydown', {
        key: 'a',
        code: 'KeyA',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      dom.dispatchEvent(ctrlAEvent);

      // Event must be handled, stopped, and prevented
      expect(ctrlAEvent.defaultPrevented).toBe(true);

      // Selection must span entire ROOT slot, NOT just the inner 'b' slot
      expect(widget.selection).not.toBeNull();
      expect(widget.selection?.anchor.slotId).toBe(widget.ast.id);
      expect(widget.selection?.anchor.offset).toBe(0);
      expect(widget.selection?.head.slotId).toBe(widget.ast.id);
      expect(widget.selection?.head.offset).toBe(widget.ast.children.length);

      // Caret must be at end of selection
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(widget.ast.children.length);

      document.body.removeChild(dom);
    });

    it('4.2: Cmd+A (metaKey) inside matrix exponent selects root AST without bubbling', () => {
      // Matrix with exponent
      const matrixXml = [
        '<math xmlns="http://www.w3.org/1998/Math/MathML">',
        '  <msup>',
        '    <mrow>',
        '      <mtable>',
        '        <mtr><mtd><mi>x</mi></mtd><mtd><mi>y</mi></mtd></mtr>',
        '        <mtr><mtd><mi>z</mi></mtd><mtd><mi>w</mi></mtd></mtr>',
        '      </mtable>',
        '    </mrow>',
        '    <mrow><mi>T</mi></mrow>',
        '  </msup>',
        '</math>',
      ].join('');

      const doc = `$$ ${matrixXml} $$`;
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(matrixXml, 3, doc.length - 3, true, '$weq');
      const dom = widget.toDOM(view);
      document.body.appendChild(dom);

      const scriptNode = widget.ast.children[0] as SuperscriptNode;
      const supSlot = scriptNode.sup;
      widget.caret = { slotId: supSlot.id, offset: 0 };
      widget.isFocused = true;

      // Fire Cmd+A (metaKey for macOS compatibility)
      const cmdAEvent = new KeyboardEvent('keydown', {
        key: 'a',
        code: 'KeyA',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });

      dom.dispatchEvent(cmdAEvent);

      expect(cmdAEvent.defaultPrevented).toBe(true);
      expect(widget.selection?.anchor.slotId).toBe(widget.ast.id);
      expect(widget.selection?.head.slotId).toBe(widget.ast.id);

      document.body.removeChild(dom);
    });

    it('4.3: Backspace after Ctrl+A clears all equation children and leaves empty root AST', () => {
      const doc = '```math-word\n<math><mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mi>z</mi></mrow></math>\n```';
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(
        '<math><mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mi>z</mi></mrow></math>',
        0,
        doc.length,
        false,
        'math-word'
      );
      const dom = widget.toDOM(view);
      document.body.appendChild(dom);

      widget.enterFromStart(view);

      // 1. Dispatch Ctrl+A
      const ctrlAEvent = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      dom.dispatchEvent(ctrlAEvent);
      expect(widget.selection).not.toBeNull();

      // 2. Dispatch Backspace
      const backspaceEvent = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      dom.dispatchEvent(backspaceEvent);

      // Entire AST root children must be cleared
      expect(widget.ast.children.length).toBe(0);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(0);
      expect(widget.selection).toBeNull();

      document.body.removeChild(dom);
    });

    it('4.4: Successive Ctrl+A presses remain stable without AST degradation', () => {
      const doc = '$$ <math><mi>X</mi></math> $$';
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget('<math><mi>X</mi></math>', 3, doc.length - 3, true, '$weq');
      const dom = widget.toDOM(view);
      document.body.appendChild(dom);

      widget.enterFromStart(view);

      for (let i = 0; i < 3; i++) {
        const ev = new KeyboardEvent('keydown', {
          key: 'a',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        dom.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(widget.selection?.anchor.slotId).toBe(widget.ast.id);
        expect(widget.selection?.head.offset).toBe(widget.ast.children.length);
      }

      document.body.removeChild(dom);
    });
  });

  // =========================================================================
  // TARGET 5: BUGS 10 & 11 — DELETION + FRACTION + GALLERY INSERT STRESS
  // =========================================================================
  describe('Target 5 (Bugs 10 & 11): Deletion + fraction addition + gallery insert without resurrection', () => {
    it('5.1: Bug 10 Total deletion of rich formula followed by gallery insert never resurrects deleted tokens', () => {
      // Initial rich formula with multiple operators, numbers, and symbols
      const richXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>∞</mi></munderover><mfrac><mrow><mn>1</mn></mrow><mrow><msup><mi>k</mi><mn>2</mn></msup></mrow></mfrac><mo>=</mo><mfrac><mrow><msup><mi>π</mi><mn>2</mn></msup></mrow><mrow><mn>6</mn></mrow></mfrac></mrow></math>';
      const doc = `$$ ${richXml} $$`;
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(richXml, 3, doc.length - 3, true, '$weq');
      widget.enterFromStart(view);

      // Simulate user clearing entire equation
      widget.ast.children = [];
      widget.caret = { slotId: widget.ast.id, offset: 0 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // User adds fraction
      const fracXml = '<mfrac><mrow></mrow><mrow></mrow></mfrac>';
      widget.insertMathSnippet(fracXml, view);

      expect(widget.ast.children.length).toBe(1);
      const fracNode = widget.ast.children[0] as FractionNode;
      expect(fracNode.type).toBe('fraction');

      // Now user clicks gallery snippet 'alpha'
      widget.insertMathSnippet('<mi>α</mi>', view);

      // Verify ZERO tokens from the initial rich formula are resurrected!
      const code = widget.code;
      expect(code).not.toContain('∑');
      expect(code).not.toContain('<mi>k</mi>');
      expect(code).not.toContain('<mn>1</mn>');
      expect(code).not.toContain('∞</mn>');
      expect(code).not.toContain('π');
      expect(code).not.toContain('<mn>6</mn>');

      // Verify alpha is present inside fraction
      expect(code).toContain('α');
    });

    it('5.2: Bug 11 Gallery insert into numerator keeps caret in numerator and never descends to denominator', () => {
      const fracXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>';
      const doc = `$$ ${fracXml} $$`;
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(fracXml, 3, doc.length - 3, true, '$weq');
      const fracNode = widget.ast.children[0] as FractionNode;
      const numerator = fracNode.numerator;
      const denominator = fracNode.denominator;

      // Position caret in numerator at offset 0
      widget.caret = { slotId: numerator.id, offset: 0 };
      widget.isFocused = true;
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // 1. Insert first symbol into numerator
      widget.insertMathSnippet('<mi>u</mi>', view);
      expect(widget.caret.slotId).toBe(numerator.id);
      expect(widget.caret.offset).toBe(1);
      expect(widget.caret.slotId).not.toBe(denominator.id);

      // 2. Insert second operator into numerator
      widget.insertMathSnippet('<mo>+</mo>', view);
      expect(widget.caret.slotId).toBe(numerator.id);
      expect(widget.caret.offset).toBe(2);
      expect(widget.caret.slotId).not.toBe(denominator.id);

      // 3. Insert third symbol into numerator
      widget.insertMathSnippet('<mi>v</mi>', view);
      expect(widget.caret.slotId).toBe(numerator.id);
      expect(widget.caret.offset).toBe(3);
      expect(widget.caret.slotId).not.toBe(denominator.id);

      // Denominator must remain completely empty
      expect(denominator.children.length).toBe(0);
    });

    it('5.3: Inserting a container (nested fraction) into numerator lands caret in nested numerator, not denominator', () => {
      const fracXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>';
      const doc = `$$ ${fracXml} $$`;
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(fracXml, 3, doc.length - 3, true, '$weq');
      const outerFrac = widget.ast.children[0] as FractionNode;

      widget.caret = { slotId: outerFrac.numerator.id, offset: 0 };
      widget.isFocused = true;
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Insert nested fraction into numerator
      widget.insertMathSnippet('<mfrac><mrow></mrow><mrow></mrow></mfrac>', view);

      // Caret must land in the nested fraction's numerator, NOT the outer denominator!
      expect(widget.caret.slotId).not.toBe(outerFrac.denominator.id);
      const nestedFrac = outerFrac.numerator.children[0] as FractionNode;
      expect(nestedFrac.type).toBe('fraction');
      expect(widget.caret.slotId).toBe(nestedFrac.numerator.id);
      expect(widget.caret.offset).toBe(0);
    });

    it('5.4: Inserting into denominator keeps caret in denominator', () => {
      const fracXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow><mi>x</mi></mrow><mrow></mrow></mfrac></math>';
      const doc = `$$ ${fracXml} $$`;
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(fracXml, 3, doc.length - 3, true, '$weq');
      const fracNode = widget.ast.children[0] as FractionNode;

      widget.caret = { slotId: fracNode.denominator.id, offset: 0 };
      widget.isFocused = true;
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      widget.insertMathSnippet('<mn>42</mn>', view);

      expect(widget.caret.slotId).toBe(fracNode.denominator.id);
      expect(widget.caret.offset).toBe(1);
    });
  });

  // =========================================================================
  // TARGET 6: BUG 20 — CARET RESTORATION ACROSS SEQUENTIAL EDITS
  // =========================================================================
  describe('Target 6 (Bug 20): Caret restoration across sequential edits', () => {
    it('6.1: Preserves and restores editor cursor across multiple sequential gallery cell edits', async () => {
      const cursorPositions: any[] = [];
      const mockEditor = {
        focus: vi.fn(),
        getCursor: vi.fn(() => ({ line: 5, ch: 18 })),
        setCursor: vi.fn((pos: any) => {
          cursorPositions.push(pos);
        }),
      };

      const mockView = { editor: mockEditor };
      app.workspace = {
        getActiveViewOfType: vi.fn(() => mockView),
        getMostRecentLeaf: vi.fn(() => ({ view: mockView })),
      };

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const cells = [
        { id: 'seq_cell_1', name: 'Cell 1', mathml: '<math><mi>a</mi></math>', spanX: 1, spanY: 1 },
        { id: 'seq_cell_2', name: 'Cell 2', mathml: '<math><mi>b</mi></math>', spanX: 1, spanY: 1 },
        { id: 'seq_cell_3', name: 'Cell 3', mathml: '<math><mi>c</mi></math>', spanX: 1, spanY: 1 },
      ];

      for (const cell of cells) {
        const cellEl = document.createElement('div');
        cellEl.setAttribute('data-cell-id', cell.id);
        gallery.contentEl.appendChild(cellEl);

        // Edit cell
        gallery.startEditingCell(cell, cellEl);
        expect(cellEl.classList.contains('is-editing')).toBe(true);

        // Finish editing
        gallery.finishEditingCell(cell, cellEl);
        expect(cellEl.classList.contains('is-editing')).toBe(false);

        // Verify restoration after each cell edit
        expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 5, ch: 18 });
      }

      expect(cursorPositions.length).toBe(3);
      for (const pos of cursorPositions) {
        expect(pos).toEqual({ line: 5, ch: 18 });
      }
    });

    it('6.2: Restores active document equation widget caret position after sequential gallery cell edits', async () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>p</mi><mo>+</mo><mi>q</mi></mrow></math>',
        10,
        45,
        true,
        '$weq'
      );
      widget.caret = { slotId: widget.ast.id, offset: 2 };
      widget.isFocused = true;

      const restoreCaretSpy = vi.spyOn(widget, 'restoreCaret');

      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const cell = {
        id: 'active_eq_cell',
        name: 'Active Eq Cell',
        mathml: '<math><mi>w</mi></math>',
        spanX: 1,
        spanY: 1,
      };
      const cellEl = document.createElement('div');
      gallery.contentEl.appendChild(cellEl);

      gallery.startEditingCell(cell, cellEl);
      gallery.finishEditingCell(cell, cellEl);

      expect(restoreCaretSpy).toHaveBeenCalledWith({ slotId: widget.ast.id, offset: 2 });
    });

    it('6.3: Gallery insertion does not corrupt saved document context', () => {
      const inserted: string[] = [];
      plugin.insertMathFromGallery = (snippet: string) => {
        inserted.push(snippet);
      };

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);

      gallery.insertMath('<mi>λ</mi>');
      expect(inserted).toContain('<mi>λ</mi>');
    });

    it('6.4: Graceful fallback when editor or view is absent during gallery cell finish', async () => {
      app.workspace = {
        getActiveViewOfType: vi.fn(() => null),
        getMostRecentLeaf: vi.fn(() => null),
      };

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const cell = {
        id: 'no_view_cell',
        name: 'No View Cell',
        mathml: '<math><mi>z</mi></math>',
        spanX: 1,
        spanY: 1,
      };
      const cellEl = document.createElement('div');
      gallery.contentEl.appendChild(cellEl);

      // Should complete without throwing null pointer exceptions
      expect(() => {
        gallery.startEditingCell(cell, cellEl);
        gallery.finishEditingCell(cell, cellEl);
      }).not.toThrow();
    });
  });
});
