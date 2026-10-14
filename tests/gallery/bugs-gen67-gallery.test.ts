/**
 * Test Suite: Resolution of Bugs 4, 5, 6, 7, 9, 12, 13, 14, 15, 16, 17, 18, 19 in Equation Gallery (Gen67)
 *
 * Covers:
 * - Bug 4: + Add Cell Button Sizing (exact same dimensions as default gallery cells: 48px × 44px)
 * - Bug 5: Gallery Cell Shrink on Content Reduction (dynamic shrink as well as grow in real time during editing)
 * - Bug 6: Double Boundary Visual Bug in Gallery Cells (only single clean cell boundary, inner math box resets borders)
 * - Bug 7: Gallery Closes on Cell Edit (gallery remains open when selecting "Edit" on a cell, cancels hide timeout)
 * - Bug 9: Gallery Cell Cursor Should Not Be I-Beam (cursor pointer/default on hover, text cursor only when editing)
 * - Bug 12: Y-Expanding Gallery Cells Clipped (vertical span in calculateCellSpan for 2x2 matrices/fractions)
 * - Bug 13: Gallery Does NOT Persist Changes (persists edits, new tabs, new sections, added cells across close/reopen)
 * - Bug 14: Gallery Cell Edit — Text Not Centered on Subsequent Edits (consistent text centering on all edits)
 * - Bug 15: Double-Click Tab/Section Header to Rename (inline rename input mounted on dblclick)
 * - Bug 16: New Gallery Cell Should Be Empty (blank mathml '<mrow></mrow>', no 'x' placeholder)
 * - Bug 17: New Tab Should Be Empty (empty tab containing only '+ Add Section' button)
 * - Bug 18: Add Section Button Design (unified '+' icon button design, no redundant text label)
 * - Bug 19: Add Section/Tab — No Modal Dialog (immediate creation with inline rename, no modal dialog)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App, WorkspaceLeaf, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS, VIEW_TYPE_EQUATION_GALLERY } from '../../src/main';
import { EquationGalleryView, calculateCellSpan } from '../../src/gallery/gallery-view';
import { GalleryCell, GalleryTab } from '../../src/gallery/gallery-types';
import { clearActiveEquationState, setActiveEquationState } from '../../src/editor/active-session';

describe('Equation Gallery Gen67 Bug Resolutions (Bugs 4-19)', () => {
  let app: any;
  let plugin: WordEquationPlugin;
  let leaf: any;
  let gallery: EquationGalleryView;

  beforeEach(() => {
    (Notice as any).notices = [];
    app = new App();
    plugin = new WordEquationPlugin(app, { id: 'obsidian-word-equation' } as any);
    plugin.settings = { ...DEFAULT_SETTINGS, customShortcuts: [] };
    leaf = new (WorkspaceLeaf as any)(app);
    gallery = new EquationGalleryView(leaf, plugin);
  });

  afterEach(async () => {
    if (gallery) {
      await gallery.onClose();
    }
    document.querySelectorAll('.menu, .weq-gallery-context-menu, .modal-container').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  // =========================================================================
  // BUG 4: + Add Cell Button Sizing
  // =========================================================================
  describe('Bug 4: + Add Cell Button Sizing', () => {
    it('applies identical dimension variables and sizing rules to default cells and + Add Cell button', async () => {
      await gallery.onOpen();

      const addCellBtn = gallery.contentEl.querySelector('.weq-gallery-add-cell-btn') as HTMLElement;
      expect(addCellBtn).not.toBeNull();
      expect(addCellBtn.getAttribute('data-span-x')).toBe('1');
      expect(addCellBtn.getAttribute('data-span-y')).toBe('1');

      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      // Standard cells and Add Cell button must share the exact same base sizing
      expect(cssContent).toMatch(/\.weq-gallery-cell-grid\s*\{[\s\S]*?--weq-cell-base-width:\s*48px;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-grid\s*\{[\s\S]*?--weq-cell-base-height:\s*44px;/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-height:\s*var\(--weq-cell-base-height,\s*44px\);/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-width:\s*var\(--weq-cell-base-width,\s*48px\);/);
      expect(cssContent).toMatch(/\.weq-gallery-cell\s*\{[\s\S]*?min-height:\s*var\(--weq-cell-base-height,\s*44px\);/);
      expect(cssContent).toMatch(/\.weq-gallery-cell\s*\{[\s\S]*?min-width:\s*var\(--weq-cell-base-width,\s*48px\);/);
    });
  });

  // =========================================================================
  // BUG 5: Gallery Cell Shrink on Content Reduction
  // =========================================================================
  describe('Bug 5: Gallery Cell Shrink on Content Reduction', () => {
    it('dynamically shrinks cell span back to 1x1 when multi-row matrix content is reduced', () => {
      const cell: GalleryCell = {
        id: 'matrix-shrink-test',
        name: 'Matrix Cell',
        mathml: '<mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd><mtd><mi>c</mi></mtd></mtr><mtr><mtd><mi>d</mi></mtd><mtd><mi>e</mi></mtd><mtd><mi>f</mi></mtd></mtr><mtr><mtd><mi>g</mi></mtd><mtd><mi>h</mi></mtd><mtd><mi>i</mi></mtd></mtr></mtable>',
      };

      // Initially 3x3 matrix
      const expandedSpan = calculateCellSpan(cell);
      expect(expandedSpan).toEqual({ spanX: 3, spanY: 3 });

      // User reduces equation content to a 1x1 scalar
      cell.mathml = '<mrow><mi>x</mi></mrow>';
      const shrunkSpan = calculateCellSpan(cell);
      expect(shrunkSpan).toEqual({ spanX: 1, spanY: 1 });
    });

    it('updateCellSpanLive dynamically removes expanded classes and restores 1x1 on content shrink', async () => {
      await gallery.onOpen();
      const cell: GalleryCell = {
        id: 'test-shrink-dom',
        name: 'Dynamic Cell',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>',
      };
      const grid = gallery.contentEl.querySelector('.weq-gallery-cell-grid') as HTMLElement;
      const section = gallery.tabs[0].sections[0];
      const cellEl = (gallery as any).renderCell(cell, grid, section);

      // Verify cell element initially has 2x2 spans
      expect(cellEl.getAttribute('data-span-x')).toBe('2');
      expect(cellEl.getAttribute('data-span-y')).toBe('2');
      expect(cellEl.classList.contains('weq-span-2x2')).toBe(true);

      // Dynamically shrink content to single symbol
      gallery.updateCellSpanLive(cell, cellEl, '<mrow><mi>y</mi></mrow>');

      expect(cellEl.getAttribute('data-span-x')).toBe('1');
      expect(cellEl.getAttribute('data-span-y')).toBe('1');
      expect(cellEl.style.gridColumn).toBe('span 1');
      expect(cellEl.style.gridRow).toBe('span 1');
      expect(cellEl.classList.contains('weq-span-2x2')).toBe(false);
      expect(cellEl.classList.contains('weq-span-x-1')).toBe(true);
      expect(cellEl.classList.contains('weq-span-y-1')).toBe(true);
    });
  });

  // =========================================================================
  // BUG 6: Double Boundary Visual Bug in Gallery Cells
  // =========================================================================
  describe('Bug 6: Double Boundary Visual Bug in Gallery Cells', () => {
    it('suppresses nested inner borders, shadows, and backgrounds on equations inside gallery cells', async () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-cell \.word-equation-math[\s\S]*?border:\s*none !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell \.word-equation-math[\s\S]*?background:\s*transparent !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell \.word-equation-math[\s\S]*?box-shadow:\s*none !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell \.word-equation-math[\s\S]*?padding:\s*0 !important;/);
    });
  });

  // =========================================================================
  // BUG 7: Gallery Closes on Cell Edit
  // =========================================================================
  describe('Bug 7: Gallery Closes on Cell Edit', () => {
    it('keeps gallery open and transitions cell to inline edit mode when editing cell', async () => {
      vi.useFakeTimers();
      try {
        await plugin.onload();
        plugin.settings.autoShowGallery = true;

        const hideSpy = vi.spyOn(plugin, 'hideGalleryView');
        await gallery.onOpen();

        const activeSec = gallery.tabs[0].sections[0];
        const cell = activeSec.cells[0];
        const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;
        expect(cellEl).not.toBeNull();

        // Note editor blur triggers focus loss
        clearActiveEquationState();

        // User starts editing gallery cell
        gallery.startEditingCell(cell, cellEl);

        // Advance debounce timers
        vi.advanceTimersByTime(200);

        // Gallery must NOT have been closed
        expect(hideSpy).not.toHaveBeenCalled();
        expect(cellEl.classList.contains('is-editing')).toBe(true);
        expect(gallery.editingCellId).toBe(cell.id);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancels pending hideGalleryTimeout when Edit is selected from context menu', () => {
      plugin.hideGalleryTimeout = setTimeout(() => {}, 1000);
      expect(plugin.hideGalleryTimeout).not.toBeNull();

      plugin.cancelHideGalleryTimeout();
      expect(plugin.hideGalleryTimeout).toBeNull();
    });
  });

  // =========================================================================
  // BUG 9: Gallery Cell Cursor Should Not Be I-Beam
  // =========================================================================
  describe('Bug 9: Gallery Cell Cursor Should Not Be I-Beam', () => {
    it('enforces cursor pointer on static cells and pointer-events none on static previews', async () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');

      // Static preview passes pointer events through and exhibits pointer cursor
      expect(cssContent).toMatch(/\.weq-gallery-static-preview[\s\S]*?pointer-events:\s*none !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-static-preview[\s\S]*?cursor:\s*pointer !important;/);

      // Cell in non-editing state has cursor pointer
      expect(cssContent).toMatch(/\.weq-gallery-cell:not\(\.is-editing\)[\s\S]*?cursor:\s*pointer !important;/);

      // In-cell editor restores text cursor when editing
      expect(cssContent).toMatch(/\.weq-gallery-cell\.is-editing[\s\S]*?cursor:\s*text !important;/);
    });
  });

  // =========================================================================
  // BUG 12: Y-Expanding Gallery Cells Clipped
  // =========================================================================
  describe('Bug 12: Y-Expanding Gallery Cells Clipped', () => {
    it('calculates Y-span >= 2 for 2x2 matrices and tall fractions to avoid vertical clipping', () => {
      const mat2x2: GalleryCell = {
        id: 'm2x2',
        name: '2x2 Matrix',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>0</mn></mtd></mtr><mtr><mtd><mn>0</mn></mtd><mtd><mn>1</mn></mtd></mtr></mtable>',
      };
      const span2x2 = calculateCellSpan(mat2x2);
      expect(span2x2.spanY).toBe(2);
      expect(span2x2.spanX).toBe(2);

      const mat3x3: GalleryCell = {
        id: 'm3x3',
        name: '3x3 Matrix',
        mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>',
      };
      const span3x3 = calculateCellSpan(mat3x3);
      expect(span3x3.spanY).toBe(3);
      expect(span3x3.spanX).toBe(3);

      const frac: GalleryCell = {
        id: 'frac',
        name: 'Fraction',
        mathml: '<mfrac><mi>a</mi><mi>b</mi></mfrac>',
      };
      const fracSpan = calculateCellSpan(frac);
      expect(fracSpan.spanY).toBe(2);
    });

    it('defines explicit min-height calculations for Y-spanning classes in styles.css', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-cell\.weq-span-y-2[\s\S]*?min-height:\s*calc\(var\(--weq-cell-base-height,\s*44px\)\s*\* 2/);
      expect(cssContent).toMatch(/\.weq-gallery-cell\.weq-span-y-3[\s\S]*?min-height:\s*calc\(var\(--weq-cell-base-height,\s*44px\)\s*\* 3/);
    });
  });

  // =========================================================================
  // BUG 13: Gallery Does NOT Persist Changes
  // =========================================================================
  describe('Bug 13: Gallery Does NOT Persist Changes', () => {
    it('persists cell edits across gallery view re-openings via plugin.settings.galleryTabs', async () => {
      const saveSpy = vi.spyOn(plugin, 'saveSettings').mockResolvedValue();

      await gallery.onOpen();
      const firstTab = gallery.tabs[0];
      const firstSec = firstTab.sections[0];
      const targetCell = firstSec.cells[0];

      // Edit cell formula
      targetCell.mathml = '<mrow><mi>&alpha;</mi><mo>+</mo><mi>&beta;</mi></mrow>';
      await gallery.saveGalleryState();

      expect(saveSpy).toHaveBeenCalled();
      expect(plugin.settings.galleryTabs).toBeDefined();
      expect(plugin.settings.galleryTabs![0].sections[0].cells[0].mathml).toBe(
        '<mrow><mi>&alpha;</mi><mo>+</mo><mi>&beta;</mi></mrow>'
      );

      // Reopen gallery in a fresh view instance
      const newGallery = new EquationGalleryView(leaf, plugin);
      expect(newGallery.tabs[0].sections[0].cells[0].mathml).toBe(
        '<mrow><mi>&alpha;</mi><mo>+</mo><mi>&beta;</mi></mrow>'
      );
    });

    it('persists new tabs, new sections, and new cells across reopenings', async () => {
      const saveSpy = vi.spyOn(plugin, 'saveSettings').mockResolvedValue();
      await gallery.onOpen();

      const customTab = gallery.createTabWithName('Astrophysics');
      const customSec = gallery.createSectionWithName(customTab, 'Orbital Mechanics');
      gallery.promptAddCell(customSec);
      await gallery.saveGalleryState();

      expect(saveSpy).toHaveBeenCalled();
      expect(plugin.settings.galleryTabs).toBeDefined();

      const persistedTab = plugin.settings.galleryTabs!.find((t) => t.name === 'Astrophysics');
      expect(persistedTab).toBeDefined();
      expect(persistedTab!.sections.length).toBe(1);
      expect(persistedTab!.sections[0].name).toBe('Orbital Mechanics');
      expect(persistedTab!.sections[0].cells.length).toBe(1);

      // Reopen gallery view
      const freshGallery = new EquationGalleryView(leaf, plugin);
      const reloadedTab = freshGallery.tabs.find((t) => t.name === 'Astrophysics');
      expect(reloadedTab).toBeDefined();
      expect(reloadedTab!.sections[0].name).toBe('Orbital Mechanics');
    });
  });

  // =========================================================================
  // BUG 14: Gallery Cell Edit — Text Not Centered on Subsequent Edits
  // =========================================================================
  describe('Bug 14: Gallery Cell Edit — Text Not Centered on Subsequent Edits', () => {
    it('maintains consistent centering flex rules on editor container and root slot for every edit', async () => {
      await gallery.onOpen();
      const cell = gallery.tabs[0].sections[0].cells[0];
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;

      // First edit
      gallery.startEditingCell(cell, cellEl);
      const editorContainer1 = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
      expect(editorContainer1.style.display).toBe('flex');
      expect(editorContainer1.style.alignItems).toBe('center');
      expect(editorContainer1.style.justifyContent).toBe('center');
      gallery.finishEditingCell(cell, cellEl);

      // Subsequent edit of the same cell
      gallery.startEditingCell(cell, cellEl);
      const editorContainer2 = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
      expect(editorContainer2.style.display).toBe('flex');
      expect(editorContainer2.style.alignItems).toBe('center');
      expect(editorContainer2.style.justifyContent).toBe('center');
      gallery.finishEditingCell(cell, cellEl);

      // Stylesheet rules enforce centering
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-cell\.is-editing\s*\{[\s\S]*?justify-content:\s*center !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor \.word-equation-math[\s\S]*?margin:\s*0 auto !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor \.eq-slot\[data-slot-role="root"\][\s\S]*?margin:\s*0 auto !important;/);
    });
  });

  // =========================================================================
  // BUG 15: Double-Click Tab/Section Header to Rename
  // =========================================================================
  describe('Bug 15: Double-Click Tab/Section Header to Rename', () => {
    it('double-clicking a section header mounts inline rename input and commits on Enter', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs[0];
      const section = activeTab.sections[0];
      const secHeader = gallery.contentEl.querySelector(`.weq-gallery-section[data-section-id="${section.id}"] .weq-gallery-section-header`) as HTMLElement;
      expect(secHeader).not.toBeNull();

      // Dispatch dblclick
      secHeader.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

      const renameInput = secHeader.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      expect(renameInput.value).toBe(section.name);

      // Modify name and press Enter
      renameInput.value = 'Renamed Section';
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(section.name).toBe('Renamed Section');
      const titleEl = secHeader.querySelector('.weq-gallery-section-title') as HTMLElement;
      expect(titleEl.textContent).toBe('Renamed Section');
    });

    it('double-clicking active tab title in sidebar mounts inline rename input and cancels on Escape', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs[0];
      const originalName = activeTab.name;
      // Bug 8: active tab title subtitle is removed from header
      expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();

      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${activeTab.id}"]`) as HTMLElement;
      expect(tabBtn).not.toBeNull();
      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;
      expect(labelSpan).not.toBeNull();

      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      const renameInput = labelSpan.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();

      renameInput.value = 'Temporary Name';
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // Name remains unchanged on Escape
      expect(activeTab.name).toBe(originalName);
      expect(labelSpan.textContent).toBe(originalName);
    });
  });

  // =========================================================================
  // BUG 16: New Gallery Cell Should Be Empty
  // =========================================================================
  describe('Bug 16: New Gallery Cell Should Be Empty', () => {
    it('creates new gallery cell with empty <mrow></mrow> instead of "x" placeholder', async () => {
      await gallery.onOpen();
      const section = gallery.tabs[0].sections[0];
      gallery.promptAddCell(section);

      const newCell = section.cells[section.cells.length - 1];
      expect(newCell.mathml).toBe('<mrow></mrow>');
      expect(newCell.mathml).not.toContain('<mi>x</mi>');
    });
  });

  // =========================================================================
  // BUG 17: New Tab Should Be Empty
  // =========================================================================
  describe('Bug 17: New Tab Should Be Empty', () => {
    it('creates new tab with empty sections array containing only + Add Section button', async () => {
      await gallery.onOpen();
      const newTab = gallery.createTabWithName('Clean New Tab');

      expect(newTab.sections.length).toBe(0);

      const panel = gallery.contentEl.querySelector(`.weq-gallery-tab-panel[data-tab-id="${newTab.id}"]`) as HTMLElement;
      expect(panel).not.toBeNull();
      expect(panel.querySelectorAll('.weq-gallery-section').length).toBe(0);
      expect(panel.querySelectorAll('.weq-gallery-cell').length).toBe(0);
      expect(panel.querySelector('.weq-gallery-add-section-btn')).not.toBeNull();
    });
  });

  // =========================================================================
  // BUG 18: Add Section Button Design
  // =========================================================================
  describe('Bug 18: Add Section Button Design', () => {
    it('renders Add Section button with unified "+" icon and no redundant text label', async () => {
      await gallery.onOpen();
      const addSectionBtn = gallery.contentEl.querySelector('.weq-gallery-add-section-btn') as HTMLElement;
      expect(addSectionBtn).not.toBeNull();

      const icon = addSectionBtn.querySelector('.weq-gallery-add-section-icon');
      expect(icon).not.toBeNull();
      expect(icon?.textContent).toBe('+');

      const textLabel = addSectionBtn.querySelector('.weq-gallery-add-section-text');
      expect(textLabel).toBeNull();
    });

    it('styles Add Section button with compact square dimensions matching Add Tab button', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-add-section-btn\s*\{[\s\S]*?width:\s*36px;/);
      expect(cssContent).toMatch(/\.weq-gallery-add-section-btn\s*\{[\s\S]*?height:\s*36px;/);
    });
  });

  // =========================================================================
  // BUG 19: Add Section/Tab — No Modal Dialog
  // =========================================================================
  describe('Bug 19: Add Section/Tab — No Modal Dialog', () => {
    it('clicking + Add Tab immediately creates "New Tab" with inline rename without opening any modal dialog', async () => {
      await gallery.onOpen();
      const initialTabCount = gallery.tabs.length;

      const addTabBtn = gallery.contentEl.querySelector('.weq-gallery-add-tab-btn') as HTMLElement;
      expect(addTabBtn).not.toBeNull();
      addTabBtn.click();
      await new Promise((r) => setTimeout(r, 20));

      // No modal dialog opened
      expect(document.querySelector('.modal-container')).toBeNull();
      expect(gallery.tabs.length).toBe(initialTabCount + 1);

      const newTab = gallery.tabs[gallery.tabs.length - 1];
      expect(newTab.name).toBe('New Tab');

      // Inline rename input is active on sidebar tab button label (Bug 8)
      expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();
      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${newTab.id}"]`) as HTMLElement;
      expect(tabBtn).not.toBeNull();
      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;
      expect(labelSpan).not.toBeNull();
      const renameInput = labelSpan.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      expect(renameInput.value).toBe('New Tab');
    });

    it('clicking + Add Section immediately creates "New Section" with inline rename without opening any modal dialog', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const initialSecCount = activeTab.sections.length;

      const addSecBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-panel[data-tab-id="${activeTab.id}"] .weq-gallery-add-section-btn`) as HTMLElement;
      expect(addSecBtn).not.toBeNull();
      addSecBtn.click();
      await new Promise((r) => setTimeout(r, 20));

      // No modal dialog opened
      expect(document.querySelector('.modal-container')).toBeNull();
      expect(activeTab.sections.length).toBe(initialSecCount + 1);

      const newSec = activeTab.sections[activeTab.sections.length - 1];
      expect(newSec.name).toBe('New Section');

      const secEl = gallery.contentEl.querySelector(`.weq-gallery-section[data-section-id="${newSec.id}"]`);
      const renameInput = secEl?.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      expect(renameInput.value).toBe('New Section');
    });
  });
});
