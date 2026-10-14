import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App, WorkspaceLeaf } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import {
  EquationGalleryView,
  calculateCellSpan,
  computeOptimalSectionPacking,
  packSectionGrid,
} from '../../src/gallery/gallery-view';
import {
  GalleryCell,
  GallerySection,
} from '../../src/gallery/gallery-types';
import { clearActiveEquationState } from '../../src/editor/active-session';

describe('Gen69 Gallery Bug Fixes (Bugs 3, 4, 6, 7)', () => {
  let app: any;
  let plugin: WordEquationPlugin;
  let gallery: EquationGalleryView;

  beforeEach(() => {
    clearActiveEquationState();
    document.body.innerHTML = '';
    app = new App();
    plugin = new WordEquationPlugin(app, {} as any);
    plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    const leaf = new (WorkspaceLeaf as any)(app);
    gallery = new EquationGalleryView(leaf, plugin);
  });

  // =========================================================================
  // BUG 3: Extra Divider Line in Gallery Header
  // =========================================================================
  describe('Bug 3: Gallery Header Divider Line Deduplication', () => {
    it('styles.css removes border-bottom, margin-bottom, and padding-bottom from title inside .weq-gallery-tab-header', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');

      // The tab header container has the single separator
      expect(cssContent).toMatch(
        /\.weq-gallery-tab-header\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--background-modifier-border\);/
      );

      // The child title inside .weq-gallery-tab-header has border-bottom: none !important
      expect(cssContent).toMatch(
        /\.weq-gallery-tab-header\s+\.weq-gallery-title[\s\S]*?border-bottom:\s*none !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-tab-header\s+\.weq-gallery-title[\s\S]*?margin-bottom:\s*0 !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-tab-header\s+\.weq-gallery-title[\s\S]*?padding-bottom:\s*0 !important;/
      );
    });

    it('gallery DOM mounts title inside header with clean structure for single separator', async () => {
      await gallery.onOpen();

      const tabHeader = gallery.contentEl.querySelector('.weq-gallery-tab-header') as HTMLElement;
      expect(tabHeader).not.toBeNull();

      const title = tabHeader.querySelector('.weq-gallery-title') as HTMLElement;
      expect(title).not.toBeNull();
      expect(title.textContent).toBe('Equation Gallery');

      // Ensure no secondary duplicate header or subtitle exists in header
      const extraSeparators = tabHeader.querySelectorAll('hr, .weq-gallery-divider, .weq-gallery-active-tab-title');
      expect(extraSeparators.length).toBe(0);
    });
  });

  // =========================================================================
  // BUG 4: Tab Renaming Input Box Too Small for Text
  // =========================================================================
  describe('Bug 4: Sidebar Tab Renaming Input Sizing & Popout Expansion', () => {
    it('styles.css contains rules for expanded tab rename popout with min-width and horizontal layout', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');

      expect(cssContent).toMatch(
        /\.weq-gallery-tab-sidebar:has\(\.weq-gallery-rename-input\)[^}]*overflow:\s*visible !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-tab-btn\s+\.weq-gallery-tab-label:has\(\.weq-gallery-rename-input\)[\s\S]*?writing-mode:\s*horizontal-tb !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-tab-btn\s+\.weq-gallery-tab-label\s+\.weq-gallery-rename-input[\s\S]*?position:\s*absolute !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-tab-btn\s+\.weq-gallery-tab-label\s+\.weq-gallery-rename-input[\s\S]*?min-width:\s*120px !important;/
      );
    });

    it('mounting rename input on tab label expands horizontally and prevents text clipping', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const tabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`
      ) as HTMLElement;
      expect(tabBtn).not.toBeNull();

      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;
      expect(labelSpan).not.toBeNull();

      // Start inline rename
      const longTabName = 'Advanced Calculus & Analysis';
      const input = gallery.startInlineRename(labelSpan, longTabName, () => {});

      expect(input).not.toBeNull();
      expect(input.value).toBe(longTabName);
      expect(input.classList.contains('weq-rename-expanded')).toBe(true);

      // Label span switched to horizontal mode with visible overflow
      expect(labelSpan.style.writingMode).toBe('horizontal-tb');
      expect(labelSpan.style.overflow).toBe('visible');

      // Input has absolute popout positioning and minimum width of at least 120px
      expect(input.style.position).toBe('absolute');
      expect(['0', '0px']).toContain(input.style.right);
      expect(input.style.minWidth).toBe('120px');
      expect(input.size).toBeGreaterThanOrEqual(longTabName.length);

      // Typing more characters expands input.size dynamically
      input.value = 'Even Longer Specialized Mathematics Field Name';
      input.dispatchEvent(new Event('input'));
      expect(input.size).toBeGreaterThanOrEqual(30);

      // Committing via Enter restores original styles on labelSpan
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(labelSpan.querySelector('.weq-gallery-rename-input')).toBeNull();
      expect(labelSpan.style.writingMode).toBe('');
      expect(labelSpan.textContent).toBe('Even Longer Specialized Mathematics Field Name');
    });
  });

  // =========================================================================
  // BUG 6: Cell Editing Horizontal Padding Breathing Room Before Expansion
  // =========================================================================
  describe('Bug 6: Cell Editing Horizontal Padding Breathing Room Threshold', () => {
    it('calculateCellSpan expands to spanX: 2 early (at ~4 chars / 34px) with P_breathing threshold', () => {
      const cell: GalleryCell = {
        id: 'test-cell-breathing',
        name: 'Breathing Cell',
        mathml: '<mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo></mrow>',
      };

      const cellEl = document.createElement('button');
      cellEl.className = 'weq-gallery-cell is-editing';
      const editorDiv = document.createElement('div');
      editorDiv.className = 'weq-gallery-cell-editor';
      const inner = document.createElement('div');
      inner.className = 'word-equation-math';
      editorDiv.appendChild(inner);
      cellEl.appendChild(editorDiv);

      // ~3 characters: scrollWidth = 26px -> (26 + 16 = 42 <= 48) -> stays span 1
      Object.defineProperty(inner, 'scrollWidth', { value: 26, configurable: true });
      Object.defineProperty(inner, 'scrollHeight', { value: 30, configurable: true });
      const span3Chars = calculateCellSpan(cell, cellEl);
      expect(span3Chars.spanX).toBe(1);

      // ~4 characters: scrollWidth = 34px -> (34 + 16 = 50 > 48) -> expands early to span 2!
      Object.defineProperty(inner, 'scrollWidth', { value: 34, configurable: true });
      const span4Chars = calculateCellSpan(cell, cellEl);
      expect(span4Chars.spanX).toBe(2);

      // ~7 characters: scrollWidth = 60px -> still span 2 (fits comfortably with breathing room)
      Object.defineProperty(inner, 'scrollWidth', { value: 60, configurable: true });
      const span7Chars = calculateCellSpan(cell, cellEl);
      expect(span7Chars.spanX).toBe(2);

      // Deleting characters back to 26px reduces spanX back to 1
      Object.defineProperty(inner, 'scrollWidth', { value: 26, configurable: true });
      const shrunk = calculateCellSpan(cell, cellEl);
      expect(shrunk.spanX).toBe(1);
    });

    it('updateCellSpanLive applies breathing room expansion during interactive editing', () => {
      const cell: GalleryCell = {
        id: 'test-live-breathing',
        name: 'Live Cell',
        mathml: '<mrow><mi>x</mi></mrow>',
        spanX: 1,
        spanY: 1,
      };

      const cellEl = document.createElement('button');
      cellEl.className = 'weq-gallery-cell is-editing';
      const editorDiv = document.createElement('div');
      editorDiv.className = 'weq-gallery-cell-editor';
      const inner = document.createElement('div');
      inner.className = 'word-equation-math';
      editorDiv.appendChild(inner);
      cellEl.appendChild(editorDiv);

      // Simulate 4 characters typed
      Object.defineProperty(inner, 'scrollWidth', { value: 34, configurable: true });
      Object.defineProperty(inner, 'scrollHeight', { value: 30, configurable: true });

      gallery.updateCellSpanLive(cell, cellEl, '<mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo></mrow>');

      expect(cell.spanX).toBe(2);
      expect(cellEl.getAttribute('data-span-x')).toBe('2');
      expect(cellEl.style.gridColumn).toBe('span 2');
      expect(cellEl.classList.contains('weq-span-x-2')).toBe(true);
    });
  });

  // =========================================================================
  // BUG 7: Optimal Gallery Grid Packing & Layout Arrangement
  // =========================================================================
  describe('Bug 7: Optimal 2D Grid Packing & Last-Row Add-Cell Placement', () => {
    it('computeOptimalSectionPacking packs mixed multi-span cells into minimal rows and fills earlier rows first', () => {
      // Test case from BUG_REPORT_7: mixed spans [2x2, 3x3, 1x1, 1x1, 1x1, 2x2, 1x1]
      const cells: GalleryCell[] = [
        { id: 'c-2x2-a', name: '2x2 A', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>' },
        { id: 'c-3x3', name: '3x3', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>' },
        { id: 'c-1x1-a', name: '1x1 A', mathml: '<mi>a</mi>' },
        { id: 'c-1x1-b', name: '1x1 B', mathml: '<mi>b</mi>' },
        { id: 'c-1x1-c', name: '1x1 C', mathml: '<mi>c</mi>' },
        { id: 'c-2x2-b', name: '2x2 B', mathml: '<mtable><mtr><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd></mtr></mtable>' },
        { id: 'c-1x1-d', name: '1x1 D', mathml: '<mi>d</mi>' },
      ];

      const packing = computeOptimalSectionPacking(cells, 4);

      // Total rows must be minimized (6 rows)
      expect(packing.totalRows).toBe(6);

      // Verify all rows before the last row (Rows 1..5) are 100% full with 0 gaps
      const occupied: boolean[][] = [];
      for (const p of packing.placements) {
        for (let dr = 0; dr < p.spanY; dr++) {
          const r = p.row + dr;
          if (!occupied[r]) occupied[r] = [];
          for (let dc = 0; dc < p.spanX; dc++) {
            const c = p.col + dc;
            occupied[r][c] = true;
          }
        }
      }

      for (let r = 1; r < packing.totalRows; r++) {
        for (let c = 1; c <= 4; c++) {
          expect(occupied[r]?.[c]).toBe(true);
        }
      }

      // Add Cell button strictly placed on the last row
      expect(packing.addBtnRow).toBe(6);
      expect(packing.addBtnCol).toBeGreaterThanOrEqual(1);
      expect(packing.addBtnCol).toBeLessThanOrEqual(4);
    });

    it('strictly positions Add Cell button on the last row in Determinants section (2x2 and 3x3)', () => {
      // Determinants section case from BUG_REPORT_7: det2x2 (2x2) and det3x3 (3x3)
      const cells: GalleryCell[] = [
        { id: 'det2x2', name: 'Det 2x2', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>' },
        { id: 'det3x3', name: 'Det 3x3', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>' },
      ];

      const packing = computeOptimalSectionPacking(cells, 4);

      // 3x3 takes rows 1..3, 2x2 takes rows 4..5 -> maxRow = 5
      expect(packing.totalRows).toBe(5);

      // Add cell button MUST be on the last row (Row 5), NEVER on Row 1 or 2
      expect(packing.addBtnRow).toBe(5);
      expect(packing.addBtnRow).not.toBe(1);
      expect(packing.addBtnRow).not.toBe(2);
    });

    it('packSectionGrid updates DOM order and anchors addCellBtn styles to the last row', () => {
      const grid = document.createElement('div');
      grid.className = 'equation-gallery-grid weq-gallery-cell-grid';

      const cells: GalleryCell[] = [
        { id: 'mat2x2', name: 'Matrix 2x2', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>' },
        { id: 'mat3x3', name: 'Matrix 3x3', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>' },
      ];

      for (const cell of cells) {
        const btn = document.createElement('button');
        btn.className = `weq-gallery-cell weq-gallery-${cell.id}`;
        btn.setAttribute('data-cell-id', cell.id);
        grid.appendChild(btn);
      }

      const addBtn = document.createElement('button');
      addBtn.className = 'weq-gallery-add-cell-btn';
      grid.appendChild(addBtn);

      const result = packSectionGrid(cells, grid, addBtn, 4);

      expect(result.addBtnRow).toBe(5);
      expect(addBtn.style.gridRowStart).toBe('5');
      expect(addBtn.style.gridColumnStart).toBe(String(result.addBtnCol));
      expect(grid.lastElementChild).toBe(addBtn);
    });

    it('styles.css uses grid-auto-flow: row for deterministic sequential placement', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-cell-grid\s*\{[\s\S]*?grid-auto-flow:\s*row;/);
    });
  });
});
