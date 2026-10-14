/**
 * Gen 63 Acceptance Test Suite
 * Comprehensive verification for 4 Bug Fixes and 2 Features:
 * - Bug 1: Settings Math Block Ctrl+A / Cmd+A select-all and Delete/Backspace selection deletion.
 * - Bug 2: Equations in Markdown tables reverting to source code (support <br> linebreaks,
 *          force inline decoration in table rows, pipe character protection, $Equation$, $$Equation$$, raw MathML).
 * - Bug 3: Layered double highlights on matrix and nested structures (universal child highlight suppression in CSS,
 *          skipping descendant highlight classes in selection DOM).
 * - Bug 4: Matrix selection deletion via Shift+Arrow from first cell (Delete handler dissolving parent structure,
 *          deleteSelection pruning fully encompassed composite nodes).
 * - Feature 1: Settings 4th column for expansion scope ('inline' vs 'block') in catalog,
 *              settings tab, main plugin, and shortcut engine.
 * - Feature 2: Complete MathML coverage in Gallery (integrals, sums/large operators/limits,
 *              universal MathML elements, AST nodes, parser, renderer, serializer, and snippet insertion).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorState, Text } from '@codemirror/state';
import { App, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import {
  wordEquationStateField,
  buildEquationDecorations,
  isInsideTableRow,
  protectPipesInTableXml,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import {
  updatePartialSelectionDom,
  deleteSelection,
} from '../../src/editor/selection';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';
import { DomRenderer } from '../../src/editor/dom-renderer';
import {
  createSlot,
  createMatrix,
  createToken,
  createEnclosed,
  createPhantom,
  createSpace,
  createMultiscripts,
  resetIdCounter,
} from '../../src/core/ast';
import { GALLERY_CATEGORIES } from '../../src/gallery/gallery-view';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import {
  setCustomShortcuts,
  getCustomShortcuts,
  CustomShortcut,
} from '../../src/shortcuts/catalog';
import { expandShortcutInMarkdown } from '../../src/shortcuts/engine';
import { DEFAULT_SETTINGS } from '../../src/main';

describe('Gen 63 Acceptance Suite: 4 Bug Fixes and 2 Features', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const cssPath = path.resolve(__dirname, '../../styles.css');
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      styleEl = document.createElement('style');
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
  // BUG 1 ACCEPTANCE TESTS: Settings Math Block Ctrl+A and Deletion
  // =========================================================================
  describe('Bug 1: Settings Math Block Ctrl+A Select-All and Deletion', () => {
    let boxContainer: HTMLElement;
    let box: InteractiveEquationBox;

    beforeEach(() => {
      boxContainer = document.createElement('div');
      container.appendChild(boxContainer);
      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: '<math><mi>x</mi><mo>+</mo><mi>y</mi></math>',
        onChange: () => {},
      });
    });

    afterEach(() => {
      box.destroy();
      boxContainer.remove();
    });

    it('Scenario 1.1: Ctrl+A and Cmd+A selects all children in the root slot', () => {
      box.isFocused = true;
      box.selection = null;

      // 1. Dispatch Ctrl+A
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })
      );

      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.slotId).toBe(box.ast.id);
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.slotId).toBe(box.ast.id);
      expect(box.selection!.head.offset).toBe(3); // 'x', '+', 'y'

      // 2. Dispatch Cmd+A (Meta+A on Mac)
      box.selection = null;
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true })
      );

      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(3);
    });

    it('Scenario 1.2: Backspace after Ctrl+A deletes entire selection and leaves empty placeholder', () => {
      box.isFocused = true;

      // Select all
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })
      );
      expect(box.selection).not.toBeNull();

      // Press Backspace
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
      );

      // Entire content must be removed
      expect(box.ast.children.length).toBe(0);
      expect(box.caret.slotId).toBe(box.ast.id);
      expect(box.caret.offset).toBe(0);
      expect(box.selection).toBeNull();

      // Placeholder element must be rendered
      const placeholder = box.dom.querySelector('.eq-placeholder');
      expect(placeholder).not.toBeNull();
    });

    it('Scenario 1.3: Delete after Ctrl+A deletes entire selection cleanly', () => {
      box.isFocused = true;

      // Select all
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })
      );

      // Press Delete
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
      );

      expect(box.ast.children.length).toBe(0);
      expect(box.caret.slotId).toBe(box.ast.id);
      expect(box.caret.offset).toBe(0);
      expect(box.selection).toBeNull();
    });

    it('Scenario 1.4: Backspace and Delete clear highlightedSlotId without errors', () => {
      box.isFocused = true;
      const fracXml = '<math><mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac></math>';
      box.setContent(fracXml);

      const numSlot = (box.ast.children[0] as any)?.numerator;
      expect(numSlot).toBeDefined();

      // Set highlightedSlotId to numerator slot
      box.highlightedSlotId = numSlot.id;

      // Press Backspace on highlighted slot
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
      );

      // Numerator should now be empty and highlightedSlotId cleared
      const updatedNumSlot = (box.ast.children[0] as any)?.numerator;
      expect(updatedNumSlot.children.length).toBe(0);
      expect(box.highlightedSlotId).toBeNull();
      expect(box.caret.slotId).toBe(numSlot.id);
      expect(box.caret.offset).toBe(0);
    });

    it('Scenario 1.5: Partial selection deletion via Backspace in InteractiveEquationBox', () => {
      box.isFocused = true;
      // Select '+' operator (index 1 to 2)
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 1 },
        head: { slotId: box.ast.id, offset: 2 },
      };

      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
      );

      expect(box.ast.children.length).toBe(2);
      expect((box.ast.children[0] as any).text).toBe('x');
      expect((box.ast.children[1] as any).text).toBe('y');
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(1);
    });
  });

  // =========================================================================
  // BUG 2 ACCEPTANCE TESTS: Equations in Markdown Tables
  // =========================================================================
  describe('Bug 2: Equations in Markdown Tables Reverting to Source Code', () => {
    it('Scenario 2.1: isInsideTableRow correctly identifies Markdown table rows', () => {
      const doc = Text.of([
        '# Header',
        '| Column 1 | Column 2 |',
        '| --- | --- |',
        '| cell 1 | cell 2 |',
        'Regular paragraph line',
        '| incomplete table row |',
      ]);

      expect(isInsideTableRow(doc, doc.line(1).from)).toBe(false);
      expect(isInsideTableRow(doc, doc.line(2).from)).toBe(true);
      expect(isInsideTableRow(doc, doc.line(3).from)).toBe(true);
      expect(isInsideTableRow(doc, doc.line(4).from)).toBe(true);
      expect(isInsideTableRow(doc, doc.line(5).from)).toBe(false);
      expect(isInsideTableRow(doc, doc.line(6).from)).toBe(true);
    });

    it('Scenario 2.2: protectPipesInTableXml escapes pipes inside MathML mo elements', () => {
      const xmlWithPipe = '<math><mo>|</mo><mi>x</mi><mo>|</mo></math>';
      const protectedXml = protectPipesInTableXml(xmlWithPipe);

      expect(protectedXml).toContain('&#124;');
      expect(protectedXml).not.toContain('<mo>|</mo>');
    });

    it('Scenario 2.3: Fenced block equations with <br> linebreaks inside table rows receive inline decorations (block: false)', () => {
      const tableContent =
        '| Name | Equation |\n' +
        '| --- | --- |\n' +
        '| Test | ```math-word<br><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math><br>``` |';

      const state = EditorState.create({
        doc: tableContent,
      });

      const decorations = buildEquationDecorations(state);
      let foundWidget: WordEquationWidget | null = null;
      let isBlockDecoration = true;

      decorations.between(0, state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = w;
          isBlockDecoration = Boolean((dec.spec as any)?.block);
        }
      });

      expect(foundWidget).not.toBeNull();
      // Must NOT be a block decoration to prevent breaking CodeMirror Markdown table rows
      expect(isBlockDecoration).toBe(false);
    });

    it('Scenario 2.4: $Equation$ and $$Equation$$ inside table cells are decorated as inline', () => {
      const tableContent =
        '| Col 1 | Col 2 |\n' +
        '|---|---|\n' +
        '| $x^2$ | $$y^2$$ |';

      const state = EditorState.create({
        doc: tableContent,
      });

      const decorations = buildEquationDecorations(state);
      const widgets: WordEquationWidget[] = [];
      const blockFlags: boolean[] = [];

      decorations.between(0, state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widgets.push(w);
          blockFlags.push(Boolean((dec.spec as any)?.block));
        }
      });

      expect(widgets.length).toBe(2);
      expect(blockFlags[0]).toBe(false);
      expect(blockFlags[1]).toBe(false);
    });

    it('Scenario 2.5: Raw <math> elements inside table cells are converted and decorated as inline', () => {
      const tableContent =
        '| Feature | Symbol |\n' +
        '|---|---|\n' +
        '| MathML | <math><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math> |';

      const state = EditorState.create({
        doc: tableContent,
      });

      const decorations = buildEquationDecorations(state);
      let foundWidget = false;
      let isBlock = true;

      decorations.between(0, state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          foundWidget = true;
          isBlock = Boolean((dec.spec as any)?.block);
        }
      });

      expect(foundWidget).toBe(true);
      expect(isBlock).toBe(false);
    });
  });

  // =========================================================================
  // BUG 3 ACCEPTANCE TESTS: Layered Double Highlights on Matrix and Nested Structures
  // =========================================================================
  describe('Bug 3: Layered Double Highlights on Matrix and Nested Structures', () => {
    it('Scenario 3.1: styles.css contains universal child highlight suppression rules for .eq-selected-structure', () => {
      const cssPath = path.resolve(__dirname, '../../styles.css');
      expect(fs.existsSync(cssPath)).toBe(true);
      const css = fs.readFileSync(cssPath, 'utf-8');

      // Verify universal suppression rules exist in CSS
      expect(css).toMatch(/\.eq-selected-structure\s+\*/);
      expect(css).toMatch(/background-color:\s*transparent\s*!important/);
      expect(css).toMatch(/box-shadow:\s*none\s*!important/);
    });

    it('Scenario 3.2: updatePartialSelectionDom applies .eq-selected-structure without injecting child .eq-selected classes', () => {
      // Create a 2x2 matrix
      const matrixNode = createMatrix([
        [createSlot('cell', []), createSlot('cell', [])],
        [createSlot('cell', []), createSlot('cell', [])],
      ]);
      const rootSlot = createSlot('root', [matrixNode]);
      const renderer = new DomRenderer();
      const renderedDom = renderer.render(rootSlot);
      container.appendChild(renderedDom);

      const tableEl = renderedDom.querySelector('.eq-matrix') as HTMLElement;
      expect(tableEl).not.toBeNull();

      // Select the matrix structure (from index 0 to 1 in root)
      const selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(renderedDom, rootSlot, selection, null);

      // Matrix container must have .eq-selected-structure
      expect(tableEl.classList.contains('eq-selected-structure')).toBe(true);

      // Child cells and slots must NOT have individual .eq-selected-token or .eq-selected classes
      const childSelectedTokens = tableEl.querySelectorAll('.eq-selected-token');
      const childSelectedSlots = tableEl.querySelectorAll('.eq-selected-slot, .eq-partial-selected');
      expect(childSelectedTokens.length).toBe(0);
      expect(childSelectedSlots.length).toBe(0);
    });

    it('Scenario 3.3: Pre-existing child selection classes are pruned when parent structure becomes selected', () => {
      const matrixNode = createMatrix([
        [createSlot('cell', []), createSlot('cell', [])],
        [createSlot('cell', []), createSlot('cell', [])],
      ]);
      const rootSlot = createSlot('root', [matrixNode]);
      const renderer = new DomRenderer();
      const renderedDom = renderer.render(rootSlot);
      container.appendChild(renderedDom);

      const tableEl = renderedDom.querySelector('.eq-matrix') as HTMLElement;
      const firstCell = tableEl.querySelector('.eq-slot') as HTMLElement;
      firstCell.classList.add('eq-selected-token', 'eq-selected-slot');

      // Now parent structure is selected
      const selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(renderedDom, rootSlot, selection, null);

      expect(tableEl.classList.contains('eq-selected-structure')).toBe(true);
      expect(firstCell.classList.contains('eq-selected-token')).toBe(false);
      expect(firstCell.classList.contains('eq-selected-slot')).toBe(false);
    });
  });

  // =========================================================================
  // BUG 4 ACCEPTANCE TESTS: Matrix Selection Deletion via Shift+Arrow
  // =========================================================================
  describe('Bug 4: Matrix Selection Deletion via Shift+Arrow from First Cell', () => {
    it('Scenario 4.1: Delete dissolves parent matrix when highlightedSlotId is set on first cell', () => {
      const docStr = '```math-word\n<math><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);

      const firstCell = (widget!.ast.children[0] as any).rows[0][0];
      widget!.caret = { slotId: firstCell.id, offset: 0 };

      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);

      // Simulate Shift+ArrowLeft on the first cell -> sets highlightedSlotId
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));

      // Now press Delete
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // Matrix must be dissolved / deleted
      const updatedMatrix = widget!.ast.children.find((c) => c.type === 'matrix');
      expect(updatedMatrix).toBeUndefined();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.2: Backspace dissolves parent matrix when highlightedSlotId is set on first cell', () => {
      const docStr = '```math-word\n<math><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);
      const firstCell = (widget!.ast.children[0] as any).rows[0][0];
      widget!.caret = { slotId: firstCell.id, offset: 0 };

      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);

      // Simulate Shift+ArrowLeft on first cell
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));

      // Press Backspace
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      const updatedMatrix = widget!.ast.children.find((c) => c.type === 'matrix');
      expect(updatedMatrix).toBeUndefined();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.3: deleteSelection prunes composite structure when all slots are encompassed', () => {
      const matrix = createMatrix([
        [createSlot('cell', []), createSlot('cell', [])],
        [createSlot('cell', []), createSlot('cell', [])],
      ]);
      const rootSlot = createSlot('root', [matrix]);

      // Selection encompassing the matrix inside root slot
      const selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      const result = deleteSelection(rootSlot, selection);
      expect(result.root.children.length).toBe(0);
      expect(result.caret.slotId).toBe(rootSlot.id);
      expect(result.caret.offset).toBe(0);
    });
  });

  // =========================================================================
  // FEATURE 1 ACCEPTANCE TESTS: Settings 4th Column for Expansion Scope
  // =========================================================================
  describe('Feature 1: Settings 4th Column for Expansion Scope (inline vs block)', () => {
    let mockApp: any;
    let mockPlugin: any;

    beforeEach(() => {
      mockApp = new App();
      mockPlugin = {
        app: mockApp,
        manifest: { id: 'obsidian-word-equation' },
        settings: {
          ...DEFAULT_SETTINGS,
          customShortcuts: [
            { trigger: '\\inline_test', expansion: '<mi>α</mi>', scope: 'inline' },
            { trigger: '\\block_test', expansion: '<mfrac><mn>1</mn><mn>2</mn></mfrac>', scope: 'block' },
          ],
        },
        saveSettings: vi.fn(async () => {
          setCustomShortcuts(mockPlugin.settings.customShortcuts);
        }),
      };
      setCustomShortcuts(mockPlugin.settings.customShortcuts);
    });

    it('Scenario 1.1: CustomShortcut supports scope property defaulting to inline', () => {
      const shortcuts: CustomShortcut[] = [
        { trigger: '\\foo', expansion: '<mi>x</mi>' },
        { trigger: '\\bar', expansion: '<mi>y</mi>', scope: 'block' },
      ];
      setCustomShortcuts(shortcuts);

      const loaded = getCustomShortcuts();
      expect(loaded.find((s) => s.trigger === '\\foo')?.scope).toBe('inline');
      expect(loaded.find((s) => s.trigger === '\\bar')?.scope).toBe('block');
    });

    it('Scenario 1.2: WordEquationSettingTab renders 4 columns including Expansion Mode with .weq-select-scope dropdowns', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin as any);
      tab.display();

      const table = tab.containerEl.querySelector('table.weq-shortcuts-table');
      expect(table).not.toBeNull();

      // Check table headers
      const headers = Array.from(table!.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
      expect(headers.length).toBe(4);
      expect(headers).toContain('Expansion Mode');

      // Check dropdowns in body rows
      const scopeSelects = table!.querySelectorAll('tbody select.weq-select-scope');
      expect(scopeSelects.length).toBe(2);

      const firstSelect = scopeSelects[0] as HTMLSelectElement;
      expect(firstSelect.value).toBe('inline');

      const secondSelect = scopeSelects[1] as HTMLSelectElement;
      expect(secondSelect.value).toBe('block');
    });

    it('Scenario 1.3: Changing scope dropdown updates shortcut setting and calls saveSettings', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin as any);
      tab.display();

      const table = tab.containerEl.querySelector('table.weq-shortcuts-table')!;
      const firstSelect = table.querySelectorAll('tbody select.weq-select-scope')[0] as HTMLSelectElement;

      // Change from 'inline' to 'block'
      firstSelect.value = 'block';
      firstSelect.dispatchEvent(new Event('change', { bubbles: true }));

      expect(mockPlugin.settings.customShortcuts[0].scope).toBe('block');
      expect(mockPlugin.saveSettings).toHaveBeenCalled();
    });

    it('Scenario 1.4: expandShortcutInMarkdown formats replacement based on scope', () => {
      setCustomShortcuts([
        { trigger: '\\inline_eq', expansion: '<mi>a</mi>', scope: 'inline' },
        { trigger: '\\block_eq', expansion: '<mi>b</mi>', scope: 'block' },
      ]);

      // 1. Expand inline shortcut
      const inlineRes = expandShortcutInMarkdown('\\inline_eq', 'math-word');
      expect(inlineRes).not.toBeNull();
      expect(inlineRes!.matched).toBe(true);
      expect(inlineRes!.replacement).toContain('/weq_inline');
      expect(inlineRes!.replacement).toContain('display="inline"');

      // 2. Expand block shortcut
      const blockRes = expandShortcutInMarkdown('\\block_eq', 'math-word');
      expect(blockRes).not.toBeNull();
      expect(blockRes!.matched).toBe(true);
      expect(blockRes!.replacement).toContain('```math-word');
      expect(blockRes!.replacement).toContain('display="block"');
    });
  });

  // =========================================================================
  // FEATURE 2 ACCEPTANCE TESTS: Complete MathML Coverage in Gallery & AST
  // =========================================================================
  describe('Feature 2: Complete MathML Coverage in Gallery & Core AST', () => {
    it('Scenario 2.1: GALLERY_CATEGORIES contains all required categories with comprehensive items', () => {
      const catIds = GALLERY_CATEGORIES.map((c) => c.id);
      expect(catIds).toContain('fractions');
      expect(catIds).toContain('radicals');
      expect(catIds).toContain('scripts');
      expect(catIds).toContain('operators');
      expect(catIds).toContain('greek');
      expect(catIds).toContain('matrices');
      expect(catIds).toContain('integrals');
      expect(catIds).toContain('large-operators');
      expect(catIds).toContain('universal-mathml');
      expect(catIds).toContain('enclosed');
      expect(catIds).toContain('delimiters');

      // Verify integrals category
      const intCat = GALLERY_CATEGORIES.find((c) => c.id === 'integrals')!;
      expect(intCat.items.some((i) => i.id === 'int-2slot')).toBe(true);
      expect(intCat.items.some((i) => i.id === 'int-4slot')).toBe(true);

      // Verify large operators category
      const opCat = GALLERY_CATEGORIES.find((c) => c.id === 'large-operators')!;
      expect(opCat.items.some((i) => i.id === 'sum-1slot')).toBe(true);
      expect(opCat.items.some((i) => i.id === 'sum-3slot')).toBe(true);
      expect(opCat.items.some((i) => i.id === 'lim-expr')).toBe(true);

      // Verify universal mathml category
      const uniCat = GALLERY_CATEGORIES.find((c) => c.id === 'universal-mathml')!;
      expect(uniCat.items.some((i) => i.id === 'elem-menclose')).toBe(true);
      expect(uniCat.items.some((i) => i.id === 'elem-mphantom')).toBe(true);
      expect(uniCat.items.some((i) => i.id === 'elem-mspace')).toBe(true);
      expect(uniCat.items.some((i) => i.id === 'elem-mmultiscripts')).toBe(true);
    });

    it('Scenario 2.2: MathML parser accurately parses enclosed, phantom, space, and multiscripts', () => {
      // 1. menclose
      const enclosedAst = parseMathML('<menclose notation="box"><mi>x</mi></menclose>');
      const encNode = enclosedAst.children[0] as any;
      expect(encNode.type).toBe('enclosed');
      expect(encNode.notation).toBe('box');
      expect(encNode.content.children[0].text).toBe('x');

      // 2. mphantom
      const phantomAst = parseMathML('<mphantom><mi>y</mi></mphantom>');
      const phNode = phantomAst.children[0] as any;
      expect(phNode.type).toBe('phantom');
      expect(phNode.content.children[0].text).toBe('y');

      // 3. mspace
      const spaceAst = parseMathML('<mspace width="2em"/>');
      const spNode = spaceAst.children[0] as any;
      expect(spNode.type).toBe('space');
      expect(spNode.width).toBe('2em');

      // 4. mmultiscripts
      const multiAst = parseMathML('<mmultiscripts><mi>X</mi><mn>1</mn><mn>2</mn><mprescripts/><mn>3</mn><mn>4</mn></mmultiscripts>');
      const mNode = multiAst.children[0] as any;
      expect(mNode.type).toBe('multiscripts');
      expect(mNode.base.children[0].text).toBe('X');
    });

    it('Scenario 2.3: MathML serializer correctly serializes new AST node types back to valid XML', () => {
      // 1. Enclosed
      const encNode = createEnclosed(createSlot('enclosed', [createToken('z', 'mi')]), 'circle');
      const root1 = createSlot('root', [encNode]);
      const xml1 = serializeMathML(root1);
      expect(xml1).toContain('<menclose notation="circle">');
      expect(xml1).toContain('<mi>z</mi>');

      // 2. Phantom
      const phNode = createPhantom(createSlot('phantom', [createToken('w', 'mi')]));
      const root2 = createSlot('root', [phNode]);
      const xml2 = serializeMathML(root2);
      expect(xml2).toContain('<mphantom>');

      // 3. Space
      const spNode = createSpace('1.5em');
      const root3 = createSlot('root', [spNode]);
      const xml3 = serializeMathML(root3);
      expect(xml3).toContain('<mspace width="1.5em"/>');

      // 4. Multiscripts
      const multiNode = createMultiscripts(
        createSlot('base', [createToken('A', 'mi')]),
        createSlot('sub', [createToken('1', 'mn')]),
        createSlot('sup', [createToken('2', 'mn')]),
        createSlot('presub', [createToken('3', 'mn')]),
        createSlot('presup', [createToken('4', 'mn')])
      );
      const root4 = createSlot('root', [multiNode]);
      const xml4 = serializeMathML(root4);
      expect(xml4).toContain('<mmultiscripts>');
      expect(xml4).toContain('<mprescripts/>');
    });

    it('Scenario 2.4: DOM renderer produces appropriate classes for new AST node types', () => {
      const renderer = new DomRenderer();

      const encNode = createEnclosed(createSlot('enclosed', [createToken('x', 'mi')]), 'roundedbox');
      const dom1 = renderer.render(createSlot('root', [encNode]));
      const enclosedEl = dom1.querySelector('.eq-enclosed');
      expect(enclosedEl).not.toBeNull();
      expect(enclosedEl?.getAttribute('data-notation')).toBe('roundedbox');

      const phNode = createPhantom(createSlot('phantom', [createToken('y', 'mi')]));
      const dom2 = renderer.render(createSlot('root', [phNode]));
      expect(dom2.querySelector('.eq-phantom')).not.toBeNull();

      const spNode = createSpace('1em');
      const dom3 = renderer.render(createSlot('root', [spNode]));
      expect(dom3.querySelector('.eq-space')).not.toBeNull();
    });

    it('Scenario 2.5: Inserting gallery snippet into active equation places caret in first empty slot', () => {
      const docStr = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // Insert stacked fraction snippet from gallery
      const fracSnippet = '<mfrac><mrow></mrow><mrow></mrow></mfrac>';
      widget!.insertMathSnippet(fracSnippet, view);

      // The fraction should be inserted
      const fracNode = widget!.ast.children.find((c) => c.type === 'fraction') as any;
      expect(fracNode).toBeDefined();

      // Caret must land in numerator (the first empty slot)
      expect(widget!.caret.slotId).toBe(fracNode.numerator.id);
      expect(widget!.caret.offset).toBe(0);

      view.destroy();
      c.remove();
    });
  });
});
