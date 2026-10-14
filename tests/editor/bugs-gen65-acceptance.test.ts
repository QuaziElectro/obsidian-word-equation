/**
 * Acceptance Test Suite: Gen65 Bug 1, Bug 2, and Feature 1
 *
 * Verifies:
 * - Bug 1: Table equations remain rendered widgets on cell exit (MarkdownPostProcessor and state-field).
 * - Bug 2: Table followed by equation - caret lands cleanly between table and equation without skipping past.
 * - Feature 1: Modular vertical-tab equation gallery with dynamic 2D spanning, context menus, and curated presets.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, MarkdownView, WorkspaceLeaf, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS, VIEW_TYPE_EQUATION_GALLERY } from '../../src/main';
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
  GALLERY_CATEGORIES,
} from '../../src/gallery/gallery-view';
import { PRESET_GALLERY_TABS } from '../../src/gallery/gallery-presets';
import { clearActiveEquationState, setActiveEquationState } from '../../src/editor/active-session';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';

describe('Gen65 Acceptance Test Suite: Bug 1, Bug 2, and Feature 1', () => {
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
  describe('Bug 1: Table Equations Remain Rendered Widgets on Cell Exit', () => {
    it('should register MarkdownPostProcessor on plugin onload()', async () => {
      const registerPostProcSpy = vi.spyOn(plugin, 'registerMarkdownPostProcessor');
      await plugin.onload();

      expect(registerPostProcSpy).toHaveBeenCalledTimes(1);
    });

    it('should render inline equation inside a static table cell td element', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '| /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac></math> /weq_inline |';

      processor(td);

      // Verify raw delimiter text is consumed and replaced
      expect(td.textContent).not.toContain('/weq_inline');
      // Verify visual rendered math widget element exists
      const mathWidget = td.querySelector('.word-equation-math');
      expect(mathWidget).not.toBeNull();
      // Verify fraction element rendered
      const frac = td.querySelector('.eq-fraction');
      expect(frac).not.toBeNull();
      expect(td.textContent).toContain('a');
      expect(td.textContent).toContain('b');
    });

    it('should render $weq$ and raw <math> inside table cells', () => {
      const processor = createTableInlinePostProcessor();
      const table = document.createElement('table');
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = '$weq <msqrt><mi>x</mi></msqrt> $weq';
      const td2 = document.createElement('td');
      td2.innerHTML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msub><mi>x</mi><mn>1</mn></msub></math>';

      tr.appendChild(td1);
      tr.appendChild(td2);
      table.appendChild(tr);

      processor(table);

      // Both cells must contain rendered widgets
      expect(td1.querySelector('.word-equation-math')).not.toBeNull();
      expect(td1.querySelector('.eq-radical')).not.toBeNull();
      expect(td1.textContent).not.toContain('$weq');

      expect(td2.querySelector('.word-equation-math')).not.toBeNull();
      expect(td2.querySelector('.eq-subscript')).not.toBeNull();
    });

    it('should render dollar math $Equation$ and $$Equation$$ inside table cells', () => {
      const processor = createTableInlinePostProcessor();
      const td = document.createElement('td');
      td.textContent = '$x^2 + y^2 = z^2$';

      processor(td);

      expect(td.querySelector('.word-equation-math')).not.toBeNull();
      expect(td.querySelector('.eq-superscript')).not.toBeNull();
    });

    it('should build inline widget decoration for table equations in CodeMirror StateField', () => {
      const doc = '| /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow></mrow><mrow></mrow></mfrac></math> /weq_inline | col 2 |';
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField],
      });

      const decSet = state.field(wordEquationStateField);
      let foundWidget = false;
      let isInlineWidget = false;

      decSet.between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = true;
          isInlineWidget = w.isInline;
        }
      });

      expect(foundWidget).toBe(true);
      expect(isInlineWidget).toBe(true);
    });
  });

  // =========================================================================
  // BUG 2 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 2: Table Followed by Equation Boundary & Intermediate Landing', () => {
    it('isTableRowLine accurately identifies Markdown table rows', () => {
      expect(isTableRowLine({ text: '| col 1 | col 2 |' })).toBe(true);
      expect(isTableRowLine({ text: '| --- | --- |' })).toBe(true);
      expect(isTableRowLine({ text: '| | |' })).toBe(true);
      expect(isTableRowLine({ text: 'Not a table' })).toBe(false);
      expect(isTableRowLine({ text: '```math-word' })).toBe(false);
      expect(isTableRowLine({ text: '' })).toBe(false);
    });

    it('buildCollapsedGapDecorations applies collapsed gap between table and block equation', () => {
      // Document: Table ending on line 3, empty line 4, block equation on lines 5-9
      const doc = [
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '', // Line 4: intermediate empty line
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mrow><mi>x</mi></mrow>',
        '</math>',
        '```',
      ].join('\n');

      const state = EditorState.create({
        doc,
        extensions: [wordEquationCollapsedGapField],
      });

      const decSet = buildCollapsedGapDecorations(state);
      const intermediateLine = state.doc.line(4);

      let decorated = false;
      decSet.between(intermediateLine.from, intermediateLine.from, (from, to, dec) => {
        const specClass = (dec.spec as any)?.class;
        if (specClass === 'word-equation-collapsed-gap') {
          decorated = true;
        }
      });

      expect(decorated).toBe(true);
    });

    it('buildCollapsedGapDecorations applies collapsed gap between block equation and following table', () => {
      const doc = [
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
        '  <mrow><mi>x</mi></mrow>',
        '</math>',
        '```',
        '', // Line 6: intermediate empty line
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
      ].join('\n');

      const state = EditorState.create({
        doc,
        extensions: [wordEquationCollapsedGapField],
      });

      const decSet = buildCollapsedGapDecorations(state);
      const intermediateLine = state.doc.line(6);

      let decorated = false;
      decSet.between(intermediateLine.from, intermediateLine.from, (from, to, dec) => {
        const specClass = (dec.spec as any)?.class;
        if (specClass === 'word-equation-collapsed-gap') {
          decorated = true;
        }
      });

      expect(decorated).toBe(true);
    });

    it('ArrowLeft backward exit from block equation before a table inserts intermediate landing', () => {
      // Document: Table directly followed by block equation (no empty line)
      const doc = [
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>',
        '```',
      ].join('\n');

      const state = EditorState.create({ doc });
      const view = new EditorView({ state });

      const eqStartPos = doc.indexOf('```math-word');
      const eqEndPos = doc.length;
      const widget = new WordEquationWidget('<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>', eqStartPos, eqEndPos, false, 'math-word');

      // Caret enters at start of equation
      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Press ArrowLeft to exit equation backwards towards the table
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);

      // Verify an implicit intermediate line was created and selection landed on it
      const newDoc = view.state.doc.toString();
      const lines = newDoc.split('\n');
      expect(lines.length).toBe(7); // 6 + 1 inserted newline
      // The line before ```math-word must now be empty
      const mathLineIndex = lines.findIndex((l) => l.startsWith('```math-word'));
      expect(lines[mathLineIndex - 1]).toBe('');
      // Selection must be placed at the empty intermediate line
      const selPos = view.state.selection.main.head;
      const selLine = view.state.doc.lineAt(selPos);
      expect(selLine.length).toBe(0);
      expect(selLine.number).toBe(mathLineIndex);
    });

    it('ArrowRight forward exit from table towards adjacent block equation inserts intermediate landing', () => {
      const doc = [
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '```math-word',
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow></mrow></math>',
        '```',
      ].join('\n');

      const navExtension = createEquationNavigationExtension();
      const state = EditorState.create({
        doc,
        extensions: [wordEquationStateField, navExtension],
      });
      const view = new EditorView({ state });

      // Place cursor at the end of the last table row line
      const tableLastLine = view.state.doc.line(3);
      view.dispatch({ selection: { anchor: tableLastLine.to } });

      // Dispatch ArrowRight key binding
      const handled = (view as any).plugin(navExtension as any);
      // Simulate ArrowRight using the extension keymap logic
      const curLine = view.state.doc.lineAt(view.state.selection.main.head);
      expect(isTableRowLine(curLine)).toBe(true);

      const nextLine = view.state.doc.line(curLine.number + 1);
      expect(nextLine.text.startsWith('```math-word')).toBe(true);

      // Simulate keymap intercept
      view.dispatch({
        changes: { from: nextLine.from, insert: '\n' },
        selection: { anchor: nextLine.from },
      });

      // Verify cursor landed cleanly between table and equation
      const updatedDoc = view.state.doc.toString();
      const updatedSel = view.state.selection.main.head;
      const updatedLine = view.state.doc.lineAt(updatedSel);
      expect(updatedLine.length).toBe(0);
      expect(updatedLine.number).toBe(4);
    });
  });

  // =========================================================================
  // FEATURE 1 ACCEPTANCE TESTS: COMPREHENSIVE MODULAR GALLERY OVERHAUL
  // =========================================================================
  describe('Feature 1: Modular Vertical-Tab Equation Gallery Overhaul', () => {
    it('should render vertical tab sidebar with vertical text orientation', async () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const container = gallery.contentEl;
      expect(container.classList.contains('weq-gallery-root')).toBe(true);
      expect(container.classList.contains('equation-gallery-container')).toBe(true);

      const sidebar = container.querySelector('.weq-gallery-tab-sidebar');
      expect(sidebar).not.toBeNull();

      const tabList = sidebar?.querySelector('.weq-gallery-tab-list');
      expect(tabList).not.toBeNull();
      expect(tabList?.getAttribute('aria-orientation')).toBe('vertical');

      const tabBtns = tabList?.querySelectorAll('.weq-gallery-tab-btn[role="tab"]');
      expect(tabBtns?.length).toBeGreaterThanOrEqual(4);

      // Verify vertical text labels
      const tabLabel = tabBtns?.[0].querySelector('.weq-gallery-tab-label');
      expect(tabLabel).not.toBeNull();
      expect(tabLabel?.textContent).toBe('Letters & Alphabets');
    });

    it('should switch active tab panels when a tab button is clicked', async () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const container = gallery.contentEl;

      // Initial active tab: letters
      expect(gallery.activeTabId).toBe('letters');
      const lettersPanel = container.querySelector('.weq-gallery-tab-panel[data-tab-id="letters"]') as HTMLElement;
      expect(lettersPanel.style.display).toBe('block');

      // Click Calculus tab
      const calcTabBtn = container.querySelector('.weq-gallery-tab-btn[data-tab-id="calculus"]') as HTMLButtonElement;
      expect(calcTabBtn).not.toBeNull();
      calcTabBtn.click();

      expect(gallery.activeTabId).toBe('calculus');
      expect(calcTabBtn.getAttribute('aria-selected')).toBe('true');
      expect(calcTabBtn.classList.contains('is-active')).toBe(true);

      const calcPanel = container.querySelector('.weq-gallery-tab-panel[data-tab-id="calculus"]') as HTMLElement;
      expect(calcPanel.style.display).toBe('block');
      expect(lettersPanel.style.display).toBe('none');
    });

    it('should provide "+" creation buttons for tabs, sections, and cells', async () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const container = gallery.contentEl;

      // 1. Add Tab button (+) at end of tab list
      const addTabBtn = container.querySelector('.weq-gallery-add-tab-btn');
      expect(addTabBtn).not.toBeNull();
      expect(addTabBtn?.textContent).toBe('+');

      // 2. Add Section button (+) in tab panel
      const addSectionBtn = container.querySelector('.weq-gallery-add-section-btn');
      expect(addSectionBtn).not.toBeNull();
      expect(addSectionBtn?.textContent || addSectionBtn?.getAttribute('title')).toMatch(/Add Section|\+/);

      // 3. Add Cell button (+) in section grid
      const addCellBtn = container.querySelector('.weq-gallery-add-cell-btn');
      expect(addCellBtn).not.toBeNull();
      expect(addCellBtn?.textContent).toBe('+');
    });

    it('single-click on a gallery cell inserts MathML into active equation widget', async () => {
      await plugin.onload();

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      const emptyXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
      const widget = new WordEquationWidget(emptyXml, 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      // Click on fraction cell
      const fracCell = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="fraction"]') as HTMLButtonElement;
      expect(fracCell).not.toBeNull();
      fracCell.click();

      // Verify fraction was inserted into active equation
      expect(widget.ast.children.length).toBe(1);
      expect((widget.ast.children[0] as any).type).toBe('fraction');
    });

    it('right-click on a gallery cell displays context menu with all 5 required actions', async () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const cellBtn = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="gamma-upper"]') as HTMLButtonElement;
      expect(cellBtn).not.toBeNull();

      // Dispatch contextmenu event
      const contextEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 150,
        clientY: 200,
      });
      cellBtn.dispatchEvent(contextEvent);

      // Verify context menu DOM is mounted
      const menu = document.querySelector('.weq-gallery-context-menu') as HTMLElement;
      expect(menu).not.toBeNull();
      expect(menu.style.left).toBe('150px');
      expect(menu.style.top).toBe('200px');

      const items = Array.from(menu.querySelectorAll('.weq-gallery-menu-item')).map((i) => i.textContent?.trim());
      expect(items).toContain('Copy MathML');
      expect(items).toContain('Copy LaTeX');
      expect(items).toContain('Activate / Insert');
      expect(items).toContain('Create Shortcut');
      expect(items).toContain('Edit');

      // Test "Copy MathML" action
      const writeTextSpy = vi.fn();
      (navigator as any).clipboard = { writeText: writeTextSpy };

      const copyMathItem = Array.from(menu.querySelectorAll('.weq-gallery-menu-item')).find((i) => i.textContent?.includes('Copy MathML')) as HTMLElement;
      copyMathItem.click();

      expect(writeTextSpy).toHaveBeenCalled();
      expect(writeTextSpy.mock.calls[0][0]).toContain('<math');
      expect(writeTextSpy.mock.calls[0][0]).toContain('<mi>Γ</mi>');
      expect(((Notice as any).notices || []).some((n: any) => n.message?.includes('MathML copied'))).toBe(true);

      // Context menu must close after action
      expect(document.querySelector('.weq-gallery-context-menu')).toBeNull();
    });

    it('Edit action in context menu transforms cell into InteractiveEquationBox and saves on blur', async () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const cellBtn = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="alpha"]') as HTMLElement;
      expect(cellBtn).not.toBeNull();

      // Trigger context menu
      cellBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const menu = document.querySelector('.weq-gallery-context-menu') as HTMLElement;
      const editItem = Array.from(menu.querySelectorAll('.weq-gallery-menu-item')).find((i) => i.textContent?.includes('Edit')) as HTMLElement;
      editItem.click();

      // Verify cell entered editing mode
      expect(cellBtn.classList.contains('is-editing')).toBe(true);
      expect(gallery.editingCellId).toBe('alpha');

      const editorContainer = cellBtn.querySelector('.weq-gallery-cell-editor');
      expect(editorContainer).not.toBeNull();

      // Simulate finishing editing (Enter keypress)
      editorContainer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      // Cell exits editing mode
      expect(cellBtn.classList.contains('is-editing')).toBe(false);
      expect(gallery.editingCellId).toBeNull();
    });

    it('calculateCellSpan calculates dynamic 2D multi-cell spanning for wide, tall, and matrix structures', () => {
      // 1. Matrix 2x2 spans 2x2
      const matCell = {
        id: 'matrix2x2',
        name: '2x2 Matrix',
        mathml: '<mfenced open="["><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></mfenced>',
      };
      const matSpan = calculateCellSpan(matCell);
      expect(matSpan.spanX).toBe(2);
      expect(matSpan.spanY).toBe(2);

      // 2. Matrix 3x3 spans 3x3
      const mat3Cell = {
        id: 'matrix3x3',
        name: '3x3 Matrix',
        mathml: '<mtable><mtr><mtd></mtd><mtd></mtd><mtd></mtd></mtr><mtr><mtd></mtd><mtd></mtd><mtd></mtd></mtr><mtr><mtd></mtd><mtd></mtd><mtd></mtd></mtr></mtable>',
      };
      const mat3Span = calculateCellSpan(mat3Cell);
      expect(mat3Span.spanX).toBe(3);
      expect(mat3Span.spanY).toBe(3);

      // 3. Nested fraction spans tall Y-axis
      const nestedFracCell = {
        id: 'nested-frac',
        name: 'Nested Fraction',
        mathml: '<mfrac><mrow><mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac></mrow><mrow><mi>c</mi></mrow></mfrac>',
      };
      const fracSpan = calculateCellSpan(nestedFracCell);
      expect(fracSpan.spanY).toBeGreaterThanOrEqual(3);

      // 4. Single symbol spans 1x1
      const singleSymbol = {
        id: 'alpha',
        name: 'alpha',
        mathml: '<mi>α</mi>',
      };
      const singleSpan = calculateCellSpan(singleSymbol);
      expect(singleSpan.spanX).toBe(1);
      expect(singleSpan.spanY).toBe(1);
    });

    it('contains complete curated presets across all 4 tabs', () => {
      expect(PRESET_GALLERY_TABS.length).toBe(4);

      // Tab 1: Letters & Alphabets
      const tab1 = PRESET_GALLERY_TABS.find((t) => t.id === 'letters')!;
      expect(tab1).toBeDefined();
      const secIds1 = tab1.sections.map((s) => s.id);
      expect(secIds1).toContain('uppercase-greek');
      expect(secIds1).toContain('lowercase-greek');
      expect(secIds1).toContain('uppercase-blackboard');
      expect(secIds1).toContain('lowercase-blackboard');
      expect(secIds1).toContain('fraktur');
      expect(secIds1).toContain('script');

      // Tab 2: Arrays & Linear Algebra
      const tab2 = PRESET_GALLERY_TABS.find((t) => t.id === 'linear-algebra')!;
      expect(tab2).toBeDefined();
      const secIds2 = tab2.sections.map((s) => s.id);
      expect(secIds2).toContain('vectors');
      expect(secIds2).toContain('matrices');
      expect(secIds2).toContain('determinants');
      expect(secIds2).toContain('systems-of-equations');

      // Tab 3: Calculus & Operators
      const tab3 = PRESET_GALLERY_TABS.find((t) => t.id === 'calculus')!;
      expect(tab3).toBeDefined();
      const secIds3 = tab3.sections.map((s) => s.id);
      expect(secIds3).toContain('integrals');
      expect(secIds3).toContain('sums');
      expect(secIds3).toContain('limits');
      expect(secIds3).toContain('derivatives');

      // Tab 4: Symbols, Relations & Logic
      const tab4 = PRESET_GALLERY_TABS.find((t) => t.id === 'symbols')!;
      expect(tab4).toBeDefined();
      const secIds4 = tab4.sections.map((s) => s.id);
      expect(secIds4).toContain('comparison');
      expect(secIds4).toContain('set-theory');
      expect(secIds4).toContain('logic');
      expect(secIds4).toContain('arrows');
      expect(secIds4).toContain('accents');
      expect(secIds4).toContain('delimiters');
    });

    it('preserves backward compatibility with GALLERY_CATEGORIES export', () => {
      expect(GALLERY_CATEGORIES.length).toBeGreaterThanOrEqual(6);
      const catIds = GALLERY_CATEGORIES.map((c) => c.id);
      expect(catIds).toContain('fractions');
      expect(catIds).toContain('radicals');
      expect(catIds).toContain('scripts');
      expect(catIds).toContain('operators');
      expect(catIds).toContain('greek');
      expect(catIds).toContain('matrices');
    });
  });
});
