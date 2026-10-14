/**
 * Acceptance Test Suite: Gen67 Track A (Caret Navigation & Table Equations)
 *
 * Covers:
 * - Bug 1: Full-Line Math Block at Start of Note — Caret Respawn
 * - Bug 2: Table Equation Delimiter Leaks & Inside/Outside Size Disparity
 * - Bug 3: Full Page Math Block (displayMode: 'full-page')
 * - Bug 8: Ctrl+A in Normal Note Equations
 * - Bug 10: Weird Deletion/Resurrection Bug
 * - Bug 11: Fraction Top Part — Gallery Insert Moves Caret Down
 * - Bug 20: Caret Return After Gallery Cell Edit
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { createEquationNavigationExtension } from '../../src/editor/navigation-extension';
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
import { FractionNode, SlotNode } from '../../src/core/types';

describe('Gen67 Track A Acceptance Test Suite: Caret Navigation & Table Equations', () => {
  let app: any;
  let plugin: WordEquationPlugin;

  beforeEach(() => {
    clearActiveEquationState();
    (Notice as any).notices = [];
    app = new App();
    plugin = new WordEquationPlugin(app, {} as any);
    plugin.settings = { ...DEFAULT_SETTINGS };
  });

  // =========================================================================
  // BUG 1 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 1: Full-Line Math Block at Start of Note — Caret Respawn', () => {
    it('exiting leftward from block equation at line 1 inserts collapsed-gap pseudo-line before equation', () => {
      const doc = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mrow><mi>x</mi></mrow>',
        '</math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>x</mi></mrow></math>',
        0,
        doc.length,
        false,
        'math-word'
      );

      // Enter from start: caret is at root offset 0
      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Press ArrowLeft to exit leftward
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);

      // Document must now have an implicit empty line 1 before the equation
      const updatedDoc = view.state.doc.toString();
      const lines = updatedDoc.split('\n');
      expect(lines[0]).toBe('');
      expect(lines[1]).toBe('```math-word');

      // Selection must be anchored at pos 0 on line 1
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.doc.line(1).length).toBe(0);

      // Verify buildCollapsedGapDecorations marks line 1 with word-equation-collapsed-gap
      const decSet = buildCollapsedGapDecorations(view.state);
      let foundCollapsedGap = false;
      decSet.between(0, 0, (from, to, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') {
          foundCollapsedGap = true;
        }
      });
      expect(foundCollapsedGap).toBe(true);
    });

    it('typing on line 1 pseudo-line expands it and deleting text collapses it back', () => {
      // Document with empty line 1 and block equation on line 2
      const doc = [
        '',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mrow><mi>x</mi></mrow>',
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

      // User types 'Hello' at line 1
      view.dispatch({
        changes: { from: 0, insert: 'Hello' },
        selection: { anchor: 5 },
      });

      // Line 1 now has text: collapsed gap must NOT be present
      decSet = buildCollapsedGapDecorations(view.state);
      let hasGapAfterTyping = false;
      decSet.between(0, 0, (f, t, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') hasGapAfterTyping = true;
      });
      expect(hasGapAfterTyping).toBe(false);

      // User deletes 'Hello' (backspaces all characters)
      view.dispatch({
        changes: { from: 0, to: 5, insert: '' },
        selection: { anchor: 0 },
      });

      // Line 1 is empty again: collapsed gap must be restored
      decSet = buildCollapsedGapDecorations(view.state);
      let hasGapAfterDelete = false;
      decSet.between(0, 0, (f, t, dec) => {
        if ((dec.spec as any)?.class === 'word-equation-collapsed-gap') hasGapAfterDelete = true;
      });
      expect(hasGapAfterDelete).toBe(true);
    });
  });

  // =========================================================================
  // BUG 2 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 2: Table Equation Delimiter Leaks & Inside/Outside Size Disparity', () => {
    it('table post-processor strips raw \\weq_inline delimiters without leaking text into table cell', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      // Create fragmented DOM matching Obsidian Markdown table parsing:
      // TextNode prefix with delimiter, math ElementNode, TextNode suffix with delimiter
      const prefixText = document.createTextNode('\\weq_inline ');
      const mathEl = document.createElement('math');
      mathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      mathEl.innerHTML = '<mi>s</mi><mo>∑</mo><mo>∑</mo>';
      const suffixText = document.createTextNode(' \\weq_inline');

      td.appendChild(prefixText);
      td.appendChild(mathEl);
      td.appendChild(suffixText);

      processor(td);

      // Verify zero occurrences of \weq_inline or /weq_inline
      expect(td.textContent).not.toContain('\\weq_inline');
      expect(td.textContent).not.toContain('/weq_inline');

      // Verify rendered equation widget exists
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      expect(td.textContent).toContain('s');
    });

    it('table post-processor strips math-word<br> block delimiters without leaking text into table cell', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');

      const prefixText = document.createTextNode('math-word');
      const brEl1 = document.createElement('br');
      const mathEl = document.createElement('math');
      mathEl.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      mathEl.setAttribute('display', 'block');
      mathEl.innerHTML = '<mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup>';
      const brEl2 = document.createElement('br');

      td.appendChild(prefixText);
      td.appendChild(brEl1);
      td.appendChild(mathEl);
      td.appendChild(brEl2);

      processor(td);

      // Verify zero occurrences of math-word delimiter text
      expect(td.textContent).not.toContain('math-word');
      const widget = td.querySelector('.word-equation-table-block');
      expect(widget).not.toBeNull();
    });

    it('table block equation inside table receives word-equation-table-block styling', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
        10,
        50,
        false,
        'math-word',
        true // isBlockInTable
      );

      const dom = (widget as any).renderCurrentDom();
      expect(dom.classList.contains('word-equation-table-block')).toBe(true);
      expect(dom.style.width).toBe('100%');
      expect(dom.style.display).toBe('flex');
    });
  });

  // =========================================================================
  // BUG 3 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 3: NEW CONCEPT — Full Page Math Block', () => {
    it('buildEquationDecorations matches math-page and weq-page fences and sets displayMode full-page', () => {
      const doc = '| col 1 | prefix ```math-page<br><math display="full-page"><mi>X</mi></math><br>``` suffix | col 3 |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundFullPage = false;
      let replacedCell = false;

      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget && w.displayMode === 'full-page') {
          foundFullPage = true;
          // In table cell, replacement range covers entire cell between pipes
          const textCovered = doc.slice(from, to);
          if (textCovered.includes('prefix') && textCovered.includes('suffix')) {
            replacedCell = true;
          }
        }
      });

      expect(foundFullPage).toBe(true);
      expect(replacedCell).toBe(true);
    });

    it('full-page widget renders with word-equation-full-page and eq-full-page classes', () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>Z</mi></math>',
        5,
        40,
        false,
        'math-page',
        false,
        'full-page'
      );

      const dom = (widget as any).renderCurrentDom();
      expect(dom.classList.contains('word-equation-full-page')).toBe(true);
      expect(dom.style.width).toBe('100%');
      expect(dom.style.height).toBe('100%');

      const mathBox = dom.querySelector('.word-equation-math');
      expect(mathBox?.classList.contains('eq-full-page')).toBe(true);
    });

    it('caret navigation traps caret inside full-page equation within cell boundary', () => {
      const doc = '| ```math-page<br><math display="full-page"><mi>A</mi></math><br>``` |';
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>A</mi></math>',
        2,
        doc.length - 2,
        false,
        'math-page',
        false,
        'full-page'
      );

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // When attempting to exit leftward from the only cell in row, caret stays trapped at root offset 0
      widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);
    });
  });

  // =========================================================================
  // BUG 8 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 8: Ctrl+A in Normal Note Equations', () => {
    it('Ctrl+A in note equation selects entire root slot contents and prevents event propagation', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>=</mo><mi>c</mi></mrow></math>\n```';
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>=</mo><mi>c</mi></mrow></math>',
        0,
        doc.length,
        false,
        'math-word'
      );

      const dom = widget.toDOM(view);
      document.body.appendChild(dom);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Create Ctrl+A keydown event
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

      // Selection must span entire root slot
      expect(widget.selection).not.toBeNull();
      expect(widget.selection?.anchor.slotId).toBe(widget.ast.id);
      expect(widget.selection?.anchor.offset).toBe(0);
      expect(widget.selection?.head.slotId).toBe(widget.ast.id);
      expect(widget.selection?.head.offset).toBe(widget.ast.children.length);

      // Caret must be at end of selection
      expect(widget.caret.offset).toBe(widget.ast.children.length);

      document.body.removeChild(dom);
    });
  });

  // =========================================================================
  // BUG 10 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 10: Weird Deletion/Resurrection Bug', () => {
    it('deleting equation text and inserting gallery snippet never resurrects deleted text', () => {
      const initialXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>+</mo><mi>c</mi><mo>=</mo><mn>10</mn></mrow></math>';
      const doc = `$$ ${initialXml} $$`;
      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const widget = new WordEquationWidget(initialXml, 3, doc.length - 3, true, '$weq');
      widget.enterFromStart(view);

      // Clear all children (simulate complete deletion)
      widget.ast.children = [];
      widget.caret = { slotId: widget.ast.id, offset: 0 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Insert gallery snippet
      widget.insertMathSnippet('<mi>α</mi>', view);

      // Verify AST contains ONLY alpha, no resurrected a, b, c, 10
      expect(widget.ast.children.length).toBe(1);
      const token = widget.ast.children[0] as any;
      expect(token.text).toBe('α');

      const xml = widget.code;
      expect(xml).not.toContain('<mn>10</mn>');
      expect(xml).not.toContain('<mi>a</mi>');
      expect(xml).not.toContain('<mi>b</mi>');
      expect(xml).not.toContain('<mi>c</mi>');
    });
  });

  // =========================================================================
  // BUG 11 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 11: Fraction Top Part — Gallery Insert Moves Caret Down', () => {
    it('inserting snippet into fraction numerator keeps caret in numerator and does not jump to denominator', () => {
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

      // Insert symbol into numerator
      widget.insertMathSnippet('<mi>x</mi>', view);

      // Caret must remain in numerator at offset 1, NOT jump to denominator
      expect(widget.caret.slotId).toBe(numerator.id);
      expect(widget.caret.offset).toBe(1);
      expect(widget.caret.slotId).not.toBe(denominator.id);
    });
  });

  // =========================================================================
  // BUG 20 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 20: Caret Return After Gallery Cell Edit', () => {
    it('restores document editor cursor position after gallery cell editing finishes', async () => {
      let focused = false;
      let setCursorPos: any = null;

      const mockEditor = {
        focus: vi.fn(() => {
          focused = true;
        }),
        getCursor: vi.fn(() => ({ line: 3, ch: 12 })),
        setCursor: vi.fn((pos: any) => {
          setCursorPos = pos;
        }),
      };

      const mockView = {
        editor: mockEditor,
      };

      app.workspace = {
        getActiveViewOfType: vi.fn((type: any) => mockView),
        getMostRecentLeaf: vi.fn(() => ({ view: mockView })),
      };

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const cell = {
        id: 'test_cell_1',
        name: 'Cell 1',
        mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
        spanX: 1,
        spanY: 1,
      };

      const cellEl = document.createElement('div');
      cellEl.setAttribute('data-cell-id', cell.id);
      gallery.contentEl.appendChild(cellEl);

      // Start editing cell: captures document context
      gallery.startEditingCell(cell, cellEl);
      expect(cellEl.classList.contains('is-editing')).toBe(true);

      // Finish editing cell
      gallery.finishEditingCell(cell, cellEl);
      expect(cellEl.classList.contains('is-editing')).toBe(false);

      // Verify editor focus and setCursor were restored
      expect(mockEditor.focus).toHaveBeenCalled();
      expect(mockEditor.setCursor).toHaveBeenCalledWith({ line: 3, ch: 12 });
      expect(setCursorPos).toEqual({ line: 3, ch: 12 });
    });

    it('restores active equation widget caret after gallery cell editing finishes', async () => {
      const widget = new WordEquationWidget(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math>',
        10,
        30,
        true,
        '$weq'
      );
      widget.caret = { slotId: widget.ast.id, offset: 1 };
      widget.isFocused = true;

      const focusSpy = vi.spyOn(widget, 'focus');
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
        id: 'test_cell_2',
        name: 'Cell 2',
        mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi></math>',
        spanX: 1,
        spanY: 1,
      };
      const cellEl = document.createElement('div');
      gallery.contentEl.appendChild(cellEl);

      gallery.startEditingCell(cell, cellEl);
      gallery.finishEditingCell(cell, cellEl);

      expect(restoreCaretSpy).toHaveBeenCalledWith({ slotId: widget.ast.id, offset: 1 });
    });

    it('gallery insertMath does not disrupt saved document context', () => {
      const insertedSnippet: string[] = [];
      plugin.insertMathFromGallery = (snippet: string) => {
        insertedSnippet.push(snippet);
      };

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);

      gallery.insertMath('<mi>θ</mi>');
      expect(insertedSnippet).toContain('<mi>θ</mi>');
    });
  });
});
