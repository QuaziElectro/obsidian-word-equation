/**
 * Challenger Gen65 Adversarial Test Suite for Feature 1 Modular Gallery Overhaul
 *
 * Stress-tests:
 * 1. Dynamic 2D multi-cell spanning across X, Y, and composite dimensions with overflow and edge conditions
 * 2. Two-tier spanning: Static AST analysis + Dynamic DOM measurement refinement and upper bound clamping
 * 3. Extensibility: Hierarchical '+' creation buttons (Tabs -> Sections -> Cells) with UI synchronization
 * 4. In-cell editing lifecycle via InteractiveEquationBox: mount, input, AST serialization, blur, and span updates
 * 5. Full Context Menu interaction suite (5 actions: MathML copy, LaTeX copy, Insert, Shortcut create, Edit)
 * 6. Presets catalog integrity: All 4 tabs, all curated sections, valid MathML AST parsing across all cells
 * 7. Backward compatibility invariants and legacy test protections
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, MarkdownView, WorkspaceLeaf, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS, VIEW_TYPE_EQUATION_GALLERY } from '../../src/main';
import {
  EquationGalleryView,
  calculateCellSpan,
  GALLERY_CATEGORIES,
} from '../../src/gallery/gallery-view';
import * as galleryModal from '../../src/gallery/gallery-modal';
import { PRESET_GALLERY_TABS } from '../../src/gallery/gallery-presets';
import { GalleryCell, GallerySection, GalleryTab } from '../../src/gallery/gallery-types';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';

describe('Challenger Gen65 Adversarial Suite: Modular Gallery Overhaul', () => {
  let app: any;
  let plugin: WordEquationPlugin;
  let leaf: any;
  let gallery: EquationGalleryView;

  beforeEach(() => {
    clearActiveEquationState();
    (Notice as any).notices = [];
    app = new App();
    plugin = new WordEquationPlugin(app, {} as any);
    plugin.settings = { ...DEFAULT_SETTINGS, customShortcuts: [] };
    leaf = new (WorkspaceLeaf as any)(app);
    gallery = new EquationGalleryView(leaf, plugin);
  });

  afterEach(async () => {
    if (gallery) {
      await gallery.onClose();
    }
    // Clean up any lingering context menus in body
    document.querySelectorAll('.weq-gallery-context-menu').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. ADVERSARIAL DYNAMIC 2D MULTI-CELL SPANNING
  // =========================================================================
  describe('1. Adversarial Dynamic 2D Multi-Cell Spanning', () => {
    it('accurately calculates static spans for scalar, row vectors, col vectors, and square matrices', () => {
      // 1x1 scalar
      const scalar: GalleryCell = { id: 's1', name: 'Scalar', mathml: '<mi>x</mi>' };
      expect(calculateCellSpan(scalar)).toEqual({ spanX: 1, spanY: 1 });

      // 1x2 row vector (1 row, 2 cols)
      const rowVec2: GalleryCell = {
        id: 'rv2',
        name: 'Row 1x2',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr></mtable>',
      };
      expect(calculateCellSpan(rowVec2)).toEqual({ spanX: 2, spanY: 1 });

      // 1x3 row vector
      const rowVec3: GalleryCell = {
        id: 'rv3',
        name: 'Row 1x3',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr></mtable>',
      };
      expect(calculateCellSpan(rowVec3)).toEqual({ spanX: 3, spanY: 1 });

      // 2x1 col vector
      const colVec2: GalleryCell = {
        id: 'cv2',
        name: 'Col 2x1',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd></mtr><mtr><mtd><mn>2</mn></mtd></mtr></mtable>',
      };
      expect(calculateCellSpan(colVec2)).toEqual({ spanX: 1, spanY: 2 });

      // 3x1 col vector
      const colVec3: GalleryCell = {
        id: 'cv3',
        name: 'Col 3x1',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd></mtr><mtr><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd></mtr></mtable>',
      };
      expect(calculateCellSpan(colVec3)).toEqual({ spanX: 1, spanY: 3 });

      // 2x2 matrix
      const mat2x2: GalleryCell = {
        id: 'm22',
        name: 'Mat 2x2',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>',
      };
      expect(calculateCellSpan(mat2x2)).toEqual({ spanX: 2, spanY: 2 });

      // 3x3 matrix
      const mat3x3: GalleryCell = {
        id: 'm33',
        name: 'Mat 3x3',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>',
      };
      expect(calculateCellSpan(mat3x3)).toEqual({ spanX: 3, spanY: 3 });
    });

    it('enforces upper bound clamping (max 6 cols, max 4 rows) on oversized matrices', () => {
      // 8x5 matrix: should be clamped to spanX: 6 (max), spanY: 4 (max)
      const oversizedMatXml = `
        <mtable>
          <mtr>${'<mtd><mn>0</mn></mtd>'.repeat(8)}</mtr>
          <mtr>${'<mtd><mn>0</mn></mtd>'.repeat(8)}</mtr>
          <mtr>${'<mtd><mn>0</mn></mtd>'.repeat(8)}</mtr>
          <mtr>${'<mtd><mn>0</mn></mtd>'.repeat(8)}</mtr>
          <mtr>${'<mtd><mn>0</mn></mtd>'.repeat(8)}</mtr>
        </mtable>
      `;
      const oversizedCell: GalleryCell = {
        id: 'over',
        name: 'Oversized 8x5 Matrix',
        mathml: oversizedMatXml,
      };
      const span = calculateCellSpan(oversizedCell);
      expect(span.spanX).toBe(6);
      expect(span.spanY).toBe(4);
    });

    it('handles nested fractions with progressive vertical expansion and clamping at 4', () => {
      // Depth 1 fraction (1 <mfrac>) -> default spanY 1 or explicit spanY
      const frac1: GalleryCell = {
        id: 'f1',
        name: 'Frac 1',
        mathml: '<mfrac><mi>a</mi><mi>b</mi></mfrac>',
        spanY: 2,
      };
      expect(calculateCellSpan(frac1).spanY).toBe(2);

      // Depth 2 fraction (2 <mfrac>s) -> spanY: min(4, 2 + 1) = 3
      const frac2: GalleryCell = {
        id: 'f2',
        name: 'Frac 2',
        mathml: '<mfrac><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow><mi>c</mi></mfrac>',
      };
      expect(calculateCellSpan(frac2).spanY).toBe(3);

      // Depth 3 fraction (3 <mfrac>s) -> spanY: min(4, 3 + 1) = 4
      const frac3: GalleryCell = {
        id: 'f3',
        name: 'Frac 3',
        mathml: '<mfrac><mrow><mfrac><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow><mi>c</mi></mfrac></mrow><mi>d</mi></mfrac>',
      };
      expect(calculateCellSpan(frac3).spanY).toBe(4);

      // Depth 5 fraction (5 <mfrac>s) -> clamped at spanY: 4
      const frac5: GalleryCell = {
        id: 'f5',
        name: 'Frac 5',
        mathml: '<mfrac><mrow><mfrac><mrow><mfrac><mrow><mfrac><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow><mi>c</mi></mfrac></mrow><mi>d</mi></mfrac></mrow><mi>e</mi></mfrac></mrow><mi>f</mi></mfrac>',
      };
      expect(calculateCellSpan(frac5).spanY).toBe(4);
    });

    it('allocates vertical spanY >= 2 for munderover and msubsup limits/integrals', () => {
      const underoverCell: GalleryCell = {
        id: 'uo',
        name: 'Under-Over Sum',
        mathml: '<munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover>',
      };
      expect(calculateCellSpan(underoverCell).spanY).toBeGreaterThanOrEqual(2);

      const subsupCell: GalleryCell = {
        id: 'ss',
        name: 'Sub-Sup Integral',
        mathml: '<msubsup><mo>∫</mo><mn>0</mn><mi>∞</mi></msubsup>',
      };
      expect(calculateCellSpan(subsupCell).spanY).toBeGreaterThanOrEqual(2);
    });

    it('applies dynamic DOM measurement refinement when attached element overflows base dimensions', () => {
      const baseCell: GalleryCell = {
        id: 'dom-test',
        name: 'Dynamic Meas',
        mathml: '<mrow><mi>x</mi></mrow>',
      };

      const mockEl = document.createElement('div');

      // Case A: Within base bounds (scrollWidth <= 48 * 1.25 = 60, scrollHeight <= 44 * 1.25 = 55)
      Object.defineProperty(mockEl, 'scrollWidth', { value: 50, configurable: true });
      Object.defineProperty(mockEl, 'scrollHeight', { value: 45, configurable: true });
      expect(calculateCellSpan(baseCell, mockEl)).toEqual({ spanX: 1, spanY: 1 });

      // Case B: Wide overflow (scrollWidth = 120 -> ceil(120 / 54) = 3)
      Object.defineProperty(mockEl, 'scrollWidth', { value: 120, configurable: true });
      Object.defineProperty(mockEl, 'scrollHeight', { value: 45, configurable: true });
      expect(calculateCellSpan(baseCell, mockEl)).toEqual({ spanX: 3, spanY: 1 });

      // Case C: Tall overflow (scrollHeight = 110 -> ceil(110 / 50) = 3)
      Object.defineProperty(mockEl, 'scrollWidth', { value: 50, configurable: true });
      Object.defineProperty(mockEl, 'scrollHeight', { value: 110, configurable: true });
      expect(calculateCellSpan(baseCell, mockEl)).toEqual({ spanX: 1, spanY: 3 });

      // Case D: Massive 2D overflow -> Clamped to max spanX: 6, max spanY: 4
      Object.defineProperty(mockEl, 'scrollWidth', { value: 800, configurable: true });
      Object.defineProperty(mockEl, 'scrollHeight', { value: 500, configurable: true });
      expect(calculateCellSpan(baseCell, mockEl)).toEqual({ spanX: 6, spanY: 4 });
    });

    it('renders correct CSS classes, data attributes, and gridColumn/gridRow styles on DOM elements', async () => {
      await gallery.onOpen();

      // Check a 2x2 matrix cell (e.g., matrix2x2 in linear-algebra tab)
      gallery.setActiveTab('linear-algebra');
      const mat2x2El = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="matrix2x2"]') as HTMLElement;
      expect(mat2x2El).not.toBeNull();
      expect(mat2x2El.getAttribute('data-span-x')).toBe('2');
      expect(mat2x2El.getAttribute('data-span-y')).toBe('2');
      expect(mat2x2El.style.gridColumn).toBe('span 2');
      expect(mat2x2El.style.gridRow).toBe('span 2');
      expect(mat2x2El.classList.contains('weq-span-x-2')).toBe(true);
      expect(mat2x2El.classList.contains('weq-span-y-2')).toBe(true);
      expect(mat2x2El.classList.contains('weq-span-2x2')).toBe(true);

      // Check a 3x3 determinant cell (det3x3)
      const det3x3El = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="det3x3"]') as HTMLElement;
      expect(det3x3El).not.toBeNull();
      expect(det3x3El.getAttribute('data-span-x')).toBe('3');
      expect(det3x3El.getAttribute('data-span-y')).toBe('3');
      expect(det3x3El.style.gridColumn).toBe('span 3');
      expect(det3x3El.style.gridRow).toBe('span 3');
      expect(det3x3El.classList.contains('weq-span-3x3')).toBe(true);
    });
  });

  // =========================================================================
  // 2. EXTENSIBILITY & HIERARCHY '+' CREATION INTERACTIONS
  // =========================================================================
  describe('2. Extensibility & Hierarchy ("+" Creation Buttons)', () => {
    it('creates and mounts a new Tab via "+" button immediately with default name and inline rename (Bug 19, Bug 17)', async () => {
      await gallery.onOpen();
      const initialTabCount = gallery.tabs.length;

      const addTabBtn = gallery.contentEl.querySelector('.weq-gallery-add-tab-btn') as HTMLButtonElement;
      expect(addTabBtn).not.toBeNull();
      addTabBtn.click();
      await new Promise((r) => setTimeout(r, 10));

      // Verify tab was added immediately with default name 'New Tab'
      expect(gallery.tabs.length).toBe(initialTabCount + 1);
      const newTab = gallery.tabs[gallery.tabs.length - 1];
      expect(newTab.name).toBe('New Tab');
      expect(newTab.icon).toBe('N');
      expect(gallery.activeTabId).toBe(newTab.id);

      // Verify UI updated: new tab button is active in sidebar
      const activeTabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${newTab.id}"]`);
      expect(activeTabBtn).not.toBeNull();
      expect(activeTabBtn?.classList.contains('is-active')).toBe(true);
      expect(activeTabBtn?.getAttribute('aria-selected')).toBe('true');

      // Bug 17: Verify new tab panel is empty containing only + Add Section button (no pre-populated General section)
      const activePanel = gallery.contentEl.querySelector(`.weq-gallery-tab-panel[data-tab-id="${newTab.id}"]`) as HTMLElement;
      expect(activePanel).not.toBeNull();
      expect(activePanel.style.display).toBe('block');
      expect(activePanel.querySelectorAll('.weq-gallery-section').length).toBe(0);
      expect(activePanel.querySelector('.weq-gallery-add-section-btn')).not.toBeNull();
    });

    it('creates a custom tab with explicit name via promptAddTab(customName)', async () => {
      await gallery.onOpen();
      const initialTabCount = gallery.tabs.length;

      gallery.promptAddTab('Quantum Mechanics');
      await new Promise((r) => setTimeout(r, 10));

      expect(gallery.tabs.length).toBe(initialTabCount + 1);
      const newTab = gallery.tabs[gallery.tabs.length - 1];
      expect(newTab.name).toBe('Quantum Mechanics');
    });

    it('creates and mounts a new Section via "+" button in active tab immediately with default name (Bug 19)', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const initialSecCount = activeTab.sections.length;

      const addSecBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-panel[data-tab-id="${activeTab.id}"] .weq-gallery-add-section-btn`) as HTMLButtonElement;
      expect(addSecBtn).not.toBeNull();
      addSecBtn.click();
      await new Promise((r) => setTimeout(r, 10));

      expect(activeTab.sections.length).toBe(initialSecCount + 1);
      const newSec = activeTab.sections[activeTab.sections.length - 1];
      expect(newSec.name).toBe('New Section');

      // Verify UI updated with new section header and active rename input
      const newSecEl = gallery.contentEl.querySelector(`section.weq-gallery-section[data-section-id="${newSec.id}"]`);
      expect(newSecEl).not.toBeNull();
      const renameInput = newSecEl?.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      expect(renameInput.value).toBe('New Section');
      expect(newSecEl?.textContent).toContain('0 items');
    });

    it('creates a new Cell via "+" button and immediately initiates in-cell editing', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const targetSec = activeTab.sections[0];
      const initialCellCount = targetSec.cells.length;

      const addCellBtn = gallery.contentEl.querySelector(`section[data-section-id="${targetSec.id}"] .weq-gallery-add-cell-btn`) as HTMLButtonElement;
      expect(addCellBtn).not.toBeNull();
      addCellBtn.click();

      // Cell is appended
      expect(targetSec.cells.length).toBe(initialCellCount + 1);
      const createdCell = targetSec.cells[targetSec.cells.length - 1];
      expect(createdCell.name).toBe('Custom Formula');

      // Gallery enters editing mode for this cell
      expect(gallery.editingCellId).toBe(createdCell.id);

      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${createdCell.id}"]`) as HTMLElement;
      expect(cellEl).not.toBeNull();
      expect(cellEl.classList.contains('is-editing')).toBe(true);
      expect(cellEl.querySelector('.weq-gallery-cell-editor')).not.toBeNull();
    });
  });

  // =========================================================================
  // 3. IN-CELL EDITING LIFECYCLE VIA InteractiveEquationBox
  // =========================================================================
  describe('3. In-cell Editing Lifecycle via InteractiveEquationBox', () => {
    it('prevents single-click document insertion while a cell is in editing state', async () => {
      await plugin.onload();
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });
      const widget = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      await gallery.onOpen();
      const cell = gallery.tabs[0].sections[0].cells[0];
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;

      // Start editing
      gallery.startEditingCell(cell, cellEl);
      expect(gallery.editingCellId).toBe(cell.id);

      // Record AST child count before click
      const prevCount = widget.ast.children.length;

      // Click the cell while editing
      cellEl.click();

      // Must NOT have inserted anything into active equation
      expect(widget.ast.children.length).toBe(prevCount);
    });

    it('starting edit on a second cell cleanly finishes editing on the first cell', async () => {
      await gallery.onOpen();
      const cell1 = gallery.tabs[0].sections[0].cells[0];
      const cell2 = gallery.tabs[0].sections[0].cells[1];
      const cellEl1 = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell1.id}"]`) as HTMLElement;
      const cellEl2 = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell2.id}"]`) as HTMLElement;

      gallery.startEditingCell(cell1, cellEl1);
      expect(gallery.editingCellId).toBe(cell1.id);
      expect(cellEl1.classList.contains('is-editing')).toBe(true);

      // Start editing cell 2
      gallery.startEditingCell(cell2, cellEl2);
      expect(gallery.editingCellId).toBe(cell2.id);
      expect(cellEl1.classList.contains('is-editing')).toBe(false);
      expect(cellEl2.classList.contains('is-editing')).toBe(true);
    });

    it('commits edits, recalculates 2D dynamic span, and restores preview upon Enter keypress', async () => {
      await gallery.onOpen();
      const cell = gallery.tabs[0].sections[0].cells[0];
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;

      gallery.startEditingCell(cell, cellEl);
      expect(cellEl.classList.contains('is-editing')).toBe(true);

      // Use the mounted InteractiveEquationBox to update the content to a 3x3 matrix
      const editorContainer = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
      const box = (editorContainer as any).__interactiveBox;
      expect(box).toBeDefined();
      box.setContent('<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>');

      // Dispatch Enter key event on the editor container
      editorContainer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      // Verify edit committed
      expect(gallery.editingCellId).toBeNull();
      expect(cellEl.classList.contains('is-editing')).toBe(false);

      // Verify dynamic spanning updated from 1x1 to 3x3!
      expect(cell.spanX).toBe(3);
      expect(cell.spanY).toBe(3);
      expect(cellEl.getAttribute('data-span-x')).toBe('3');
      expect(cellEl.getAttribute('data-span-y')).toBe('3');
      expect(cellEl.style.gridColumn).toBe('span 3');
      expect(cellEl.style.gridRow).toBe('span 3');
      expect(cellEl.classList.contains('weq-span-3x3')).toBe(true);
    });

    it('commits edits cleanly upon focusout (blur) event outside editor container', async () => {
      await gallery.onOpen();
      const cell = gallery.tabs[0].sections[0].cells[0];
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;

      gallery.startEditingCell(cell, cellEl);
      expect(gallery.editingCellId).toBe(cell.id);

      const editorContainer = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;

      // Dispatch focusout with relatedTarget outside editorContainer
      const dummyOutsideTarget = document.createElement('div');
      editorContainer.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: dummyOutsideTarget }));

      expect(gallery.editingCellId).toBeNull();
      expect(cellEl.classList.contains('is-editing')).toBe(false);
    });
  });

  // =========================================================================
  // 4. CONTEXT MENU ACTIONS ADVERSARIAL VERIFICATION
  // =========================================================================
  describe('4. Context Menu Actions Adversarial Verification', () => {
    it('right-click context menu opens at click coordinates and dismisses on outside click', async () => {
      await gallery.onOpen();
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell') as HTMLElement;

      // Trigger contextmenu
      cellEl.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 250,
        clientY: 320,
      }));

      const menu = document.querySelector('.weq-gallery-context-menu') as HTMLElement;
      expect(menu).not.toBeNull();
      expect(menu.style.left).toBe('250px');
      expect(menu.style.top).toBe('320px');

      // Click outside menu
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.querySelector('.weq-gallery-context-menu')).toBeNull();
    });

    it('Copy MathML action wraps bare snippet in xmlns root and writes to clipboard', async () => {
      await gallery.onOpen();
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="delta-upper"]') as HTMLElement;

      const clipboardSpy = vi.fn();
      (navigator as any).clipboard = { writeText: clipboardSpy };

      cellEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const menu = document.querySelector('.weq-gallery-context-menu') as HTMLElement;
      const copyMathBtn = Array.from(menu.querySelectorAll('.weq-gallery-menu-item')).find((b) => b.textContent === 'Copy MathML') as HTMLButtonElement;
      expect(copyMathBtn).toBeDefined();
      copyMathBtn.click();

      expect(clipboardSpy).toHaveBeenCalled();
      const copiedPayload = clipboardSpy.mock.calls[0][0];
      expect(copiedPayload).toMatch(/^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML">.*<\/math>$/);
      expect(copiedPayload).toContain('<mi>Δ</mi>');
      expect(((Notice as any).notices || []).some((n: any) => n.message?.includes('MathML copied'))).toBe(true);
    });

    it('Copy LaTeX action converts snippet to LaTeX and writes to clipboard', async () => {
      await gallery.onOpen();
      // Alpha cell: mathml '<mi>α</mi>'
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="alpha"]') as HTMLElement;

      const clipboardSpy = vi.fn();
      (navigator as any).clipboard = { writeText: clipboardSpy };

      cellEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const menu = document.querySelector('.weq-gallery-context-menu') as HTMLElement;
      const copyLatexBtn = Array.from(menu.querySelectorAll('.weq-gallery-menu-item')).find((b) => b.textContent === 'Copy LaTeX') as HTMLButtonElement;
      expect(copyLatexBtn).toBeDefined();
      copyLatexBtn.click();

      expect(clipboardSpy).toHaveBeenCalled();
      const copiedLatex = clipboardSpy.mock.calls[0][0];
      expect(copiedLatex).toContain('\\alpha');
      expect(((Notice as any).notices || []).some((n: any) => n.message?.includes('LaTeX copied'))).toBe(true);
    });

    it('Activate / Insert action triggers math insertion into document', async () => {
      await plugin.onload();
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });
      const widget = new WordEquationWidget('<math><mrow></mrow></math>', 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      await gallery.onOpen();
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="pi"]') as HTMLElement;

      cellEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const menu = document.querySelector('.weq-gallery-context-menu') as HTMLElement;
      const insertBtn = Array.from(menu.querySelectorAll('.weq-gallery-menu-item')).find((b) => b.textContent === 'Activate / Insert') as HTMLButtonElement;
      expect(insertBtn).toBeDefined();
      insertBtn.click();

      // Pi symbol was inserted into active widget
      expect(widget.ast.children.length).toBe(1);
      expect((widget.ast.children[0] as any).text).toBe('π');
    });

    it('Create Shortcut action prompts trigger and saves shortcut with inline scope', async () => {
      await plugin.onload();
      await gallery.onOpen();

      const saveSettingsSpy = vi.spyOn(plugin, 'saveSettings');

      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="gamma-upper"]') as HTMLElement;
      cellEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      const menu = document.querySelector('.weq-gallery-context-menu') as HTMLElement;
      const shortcutBtn = Array.from(menu.querySelectorAll('.weq-gallery-menu-item')).find((b) => b.textContent === 'Create Shortcut') as HTMLButtonElement;
      expect(shortcutBtn).toBeDefined();
      shortcutBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(saveSettingsSpy).toHaveBeenCalled();
      const createdShortcut = plugin.settings.customShortcuts.find((s) => s.expansion === '<mi>Γ</mi>');
      expect(createdShortcut).toBeDefined();
      expect(createdShortcut?.trigger).toBe('\\gammaupper');
      expect(createdShortcut?.scope).toBe('inline');
      expect(((Notice as any).notices || []).some((n: any) => n.message?.includes('Shortcut created: \\gammaupper'))).toBe(true);
    });
  });

  // =========================================================================
  // 5. PRESET CATALOG & MATHML AST INTEGRITY
  // =========================================================================
  describe('5. Preset Catalog & MathML AST Integrity', () => {
    it('verifies all 4 preset tabs have required sections and no empty categories', () => {
      expect(PRESET_GALLERY_TABS.map((t) => t.id)).toEqual([
        'letters',
        'linear-algebra',
        'calculus',
        'symbols',
      ]);

      for (const tab of PRESET_GALLERY_TABS) {
        expect(tab.name.length).toBeGreaterThan(0);
        expect(tab.sections.length).toBeGreaterThan(0);
        for (const sec of tab.sections) {
          expect(sec.name.length).toBeGreaterThan(0);
          expect(sec.cells.length).toBeGreaterThan(0);
        }
      }
    });

    it('validates every single cell across all tabs parses into a valid MathML AST', () => {
      let totalCells = 0;
      for (const tab of PRESET_GALLERY_TABS) {
        for (const sec of tab.sections) {
          for (const cell of sec.cells) {
            totalCells++;
            expect(cell.mathml).toBeDefined();
            expect(cell.mathml.trim().length).toBeGreaterThan(0);

            // Must parse without throwing syntax errors
            expect(() => {
              const fullXml = cell.mathml.includes('<math')
                ? cell.mathml
                : `<math xmlns="http://www.w3.org/1998/Math/MathML">${cell.mathml}</math>`;
              const ast = parseMathML(fullXml);
              expect(ast).toBeDefined();
            }).not.toThrow();
          }
        }
      }
      // Ensure massive coverage (> 100 mathematical structures)
      expect(totalCells).toBeGreaterThan(120);
    });

    it('covers advanced linear algebra constructs: determinants, augmented matrices, systems of equations', () => {
      const laTab = PRESET_GALLERY_TABS.find((t) => t.id === 'linear-algebra')!;
      const secMap = new Map(laTab.sections.map((s) => [s.id, s]));

      expect(secMap.has('vectors')).toBe(true);
      expect(secMap.has('matrices')).toBe(true);
      expect(secMap.has('determinants')).toBe(true);
      expect(secMap.has('systems-of-equations')).toBe(true);

      const detSec = secMap.get('determinants')!;
      expect(detSec.cells.some((c) => c.id === 'det2x2' && c.spanX === 2 && c.spanY === 2)).toBe(true);
      expect(detSec.cells.some((c) => c.id === 'det3x3' && c.spanX === 3 && c.spanY === 3)).toBe(true);

      const sysSec = secMap.get('systems-of-equations')!;
      expect(sysSec.cells.some((c) => c.id === 'system-2eq' && c.spanX === 3 && c.spanY === 2)).toBe(true);
      expect(sysSec.cells.some((c) => c.id === 'system-3eq' && c.spanX === 3 && c.spanY === 3)).toBe(true);
      expect(sysSec.cells.some((c) => c.id === 'piecewise-fn' && c.spanX === 4 && c.spanY === 2)).toBe(true);
    });

    it('covers all required calculus integrals and multi-slot operators', () => {
      const calcTab = PRESET_GALLERY_TABS.find((t) => t.id === 'calculus')!;
      const intSec = calcTab.sections.find((s) => s.id === 'integrals')!;

      // 2-slot and 4-slot integrals
      expect(intSec.cells.some((c) => c.id === 'int-2slot')).toBe(true);
      expect(intSec.cells.some((c) => c.id === 'int-2slot-diff')).toBe(true);
      expect(intSec.cells.some((c) => c.id === 'int-4slot')).toBe(true);
      expect(intSec.cells.some((c) => c.id === 'int-4slot-underover')).toBe(true);

      // Multiple integrals through quadruple
      expect(intSec.cells.some((c) => c.id === 'double-int')).toBe(true);
      expect(intSec.cells.some((c) => c.id === 'triple-int')).toBe(true);
      expect(intSec.cells.some((c) => c.id === 'quad-int')).toBe(true);

      // Contour integrals
      expect(intSec.cells.some((c) => c.id === 'oint')).toBe(true);
      expect(intSec.cells.some((c) => c.id === 'oiint')).toBe(true);
      expect(intSec.cells.some((c) => c.id === 'oiiint')).toBe(true);
    });
  });

  // =========================================================================
  // 6. BACKWARD COMPATIBILITY INVARIANTS
  // =========================================================================
  describe('6. Backward Compatibility Invariants', () => {
    it('maintains GALLERY_CATEGORIES export with all 11 required categories', () => {
      const catIds = GALLERY_CATEGORIES.map((c) => c.id);
      expect(catIds).toContain('fractions');
      expect(catIds).toContain('radicals');
      expect(catIds).toContain('scripts');
      expect(catIds).toContain('operators');
      expect(catIds).toContain('greek');
      expect(catIds).toContain('matrices');
      expect(catIds).toContain('integrals');
      expect(catIds).toContain('large-operators');
      expect(catIds).toContain('delimiters');
      expect(catIds).toContain('enclosed');
      expect(catIds).toContain('universal-mathml');
    });

    it('renders legacy category classes and buttons alongside overhauled structure', async () => {
      await gallery.onOpen();
      const legacyCats = gallery.contentEl.querySelectorAll('.equation-gallery-category');
      expect(legacyCats.length).toBeGreaterThanOrEqual(6);

      const legacyBtns = gallery.contentEl.querySelectorAll('.equation-gallery-btn');
      expect(legacyBtns.length).toBeGreaterThanOrEqual(80);
    });

    it('supports insertItem legacy method without regressions', async () => {
      const insertMathSpy = vi.spyOn(gallery, 'insertMath');
      const legacyItem = {
        id: 'leg1',
        name: 'Legacy Frac',
        mathml: '<mfrac><mi>a</mi><mi>b</mi></mfrac>',
        previewText: 'a/b',
      };

      gallery.insertItem(legacyItem);
      expect(insertMathSpy).toHaveBeenCalledWith('<mfrac><mi>a</mi><mi>b</mi></mfrac>');
    });
  });
});
