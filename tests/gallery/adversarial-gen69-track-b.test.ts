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
  PackedPlacement,
} from '../../src/gallery/gallery-view';
import {
  GalleryCell,
  GallerySection,
  GalleryTab,
} from '../../src/gallery/gallery-types';
import { clearActiveEquationState } from '../../src/editor/active-session';

/**
 * Challenger Gen69 Track B Adversarial Stress Suite
 * Exhaustively stress-tests:
 *  - Bug 3: Gallery Header Divider Line Deduplication
 *  - Bug 4: Tab Renaming Input Box Sizing & Popout Expansion with Extreme Inputs
 *  - Bug 6: Cell Editing Horizontal Padding Breathing Room Threshold (P_breathing = 16px) & Multi-Step Expansion
 *  - Bug 7: Optimal 2D Grid Packing & Last-Row Add-Cell Placement across Diverse Configurations
 */
describe('Gen69 Track B Adversarial Stress Suite (Bugs 3, 4, 6, 7)', () => {
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
  // BUG 3: GALLERY HEADER DIVIDER LINE DEDUPLICATION
  // =========================================================================
  describe('Bug 3: Adversarial Challenge — Gallery Header Single Divider Invariance', () => {
    it('enforces stylesheet invariant: single divider on container, 0 on inner title elements', () => {
      const cssPath = path.resolve(__dirname, '../../styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // 1. Container has the single border
      const containerRule = cssContent.match(/\.weq-gallery-tab-header\s*\{([^}]+)\}/);
      expect(containerRule).not.toBeNull();
      expect(containerRule![1]).toMatch(/border-bottom:\s*1px solid var\(--background-modifier-border\);/);

      // 2. Child title elements inside container have border-bottom: none !important
      const titleOverride = cssContent.match(
        /\.weq-gallery-tab-header\s+\.weq-gallery-title,\s*\.weq-gallery-tab-header\s+\.equation-gallery-title\s*\{([^}]+)\}/
      );
      expect(titleOverride).not.toBeNull();
      expect(titleOverride![1]).toContain('border-bottom: none !important;');
      expect(titleOverride![1]).toContain('margin-bottom: 0 !important;');
      expect(titleOverride![1]).toContain('padding-bottom: 0 !important;');
    });

    it('renders strictly 1 header divider across multiple view opens, resets, and tab switches', async () => {
      // 1. First open
      await gallery.onOpen();

      const verifyHeaderStructure = () => {
        const headers = gallery.contentEl.querySelectorAll('.weq-gallery-tab-header');
        expect(headers.length).toBe(1);

        const tabHeader = headers[0] as HTMLElement;
        const titles = tabHeader.querySelectorAll('.weq-gallery-title');
        expect(titles.length).toBe(1);
        expect(titles[0].textContent).toBe('Equation Gallery');

        // Verify zero divider elements (<hr>, .weq-gallery-divider, secondary borders)
        const dividers = tabHeader.querySelectorAll('hr, .weq-gallery-divider, .equation-gallery-divider');
        expect(dividers.length).toBe(0);

        // Verify active tab title is NOT inside header (Bug 8 interaction check)
        const activeTabInHeader = tabHeader.querySelectorAll('.weq-gallery-active-tab-title');
        expect(activeTabInHeader.length).toBe(0);
      };

      verifyHeaderStructure();

      // 2. Switch tabs across all tabs repeatedly using setActiveTab
      for (const tab of gallery.tabs) {
        gallery.setActiveTab(tab.id);
        verifyHeaderStructure();
      }

      // 3. Reset view / reopen multiple times
      gallery.contentEl.innerHTML = '';
      await gallery.onOpen();
      verifyHeaderStructure();

      // 4. Simulate container height variations (tiny sidebar 120px, massive 1600px, 0px)
      const testHeights = ['120px', '450px', '800px', '1600px', '0px', '100%'];
      for (const h of testHeights) {
        gallery.contentEl.style.height = h;
        verifyHeaderStructure();
      }
    });

    it('ensures DOM tree has no sibling divider lines between header and sections container', async () => {
      await gallery.onOpen();
      const mainContent = gallery.contentEl.querySelector('.weq-gallery-tab-content') as HTMLElement;
      expect(mainContent).not.toBeNull();

      // First child must be header
      const firstChild = mainContent.children[0];
      expect(firstChild.classList.contains('weq-gallery-tab-header')).toBe(true);

      // Subsequent children must be tab panels, never divider elements
      for (let i = 1; i < mainContent.children.length; i++) {
        const child = mainContent.children[i];
        expect(child.classList.contains('weq-gallery-tab-panel')).toBe(true);
        expect(child.tagName.toLowerCase()).not.toBe('hr');
      }
    });
  });

  // =========================================================================
  // BUG 4: TAB RENAMING INPUT BOX SIZING & POPOUT EXPANSION
  // =========================================================================
  describe('Bug 4: Adversarial Challenge — Extreme Tab Names & Popout Sizing', () => {
    it('handles extreme long names, mathematical symbols, unicode, and emojis without clipping or breaking layout', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const tabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`
      ) as HTMLElement;
      expect(tabBtn).not.toBeNull();

      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;
      const tabSidebar = gallery.contentEl.querySelector('.weq-gallery-tab-sidebar') as HTMLElement;

      const extremeCases = [
        {
          desc: 'Ultra-long 120+ character name',
          name: 'Differential Geometry & Pseudo-Riemannian Metric Curvature Tensor Manifold Calculations in Spacetime Physics',
        },
        {
          desc: 'Complex mathematical symbols and operators',
          name: '∑(x_i^2) + ∏(λ_k) ≈ ∫_0^∞ f(x)dx ∇×B=μJ',
        },
        {
          desc: 'Unicode CJK characters',
          name: '高等微积分与泛函分析方程组目录',
        },
        {
          desc: 'Arabic and RTL text',
          name: 'معادلات تفاضلية جزئية متقدمة',
        },
        {
          desc: 'Special ASCII symbols and punctuation',
          name: '`~!@#$%^&*()_+={}:"<>?[];\',./`',
        },
        {
          desc: 'Emojis and math pictographs',
          name: '📐 🧮 ⚛️ 🔬 🌌 🚀 Formulas',
        },
      ];

      for (const testCase of extremeCases) {
        let committedValue = '';
        const input = gallery.startInlineRename(labelSpan, 'Base Tab Name', (val) => {
          committedValue = val;
        });

        // Set input value to the extreme test name and trigger input event
        input.value = testCase.name;
        input.dispatchEvent(new Event('input'));

        // 1. Popout CSS class and positioning
        expect(input.classList.contains('weq-rename-expanded')).toBe(true);
        expect(input.style.position).toBe('absolute');
        expect(['0', '0px']).toContain(input.style.right);
        expect(input.style.minWidth).toBe('120px');
        expect(input.style.maxWidth).toBe('240px');

        // 2. Writing mode switch to horizontal
        expect(labelSpan.style.writingMode).toBe('horizontal-tb');
        expect(labelSpan.style.transform).toBe('none');

        // 3. Overflow visible on parent sidebar and button so popout is never clipped
        expect(tabSidebar.style.overflow).toBe('visible');
        expect(tabBtn.style.overflow).toBe('visible');

        // 4. Input size dynamically expands
        expect(input.size).toBeGreaterThanOrEqual(10);
        expect(input.size).toBeLessThanOrEqual(30);

        // 5. Commit via Enter
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        // 6. Cleanup restores original writing mode and overflow
        expect(labelSpan.querySelector('.weq-gallery-rename-input')).toBeNull();
        expect(labelSpan.style.writingMode).toBe('');
        expect(tabBtn.style.overflow).toBe('');
        expect(tabSidebar.style.overflow).toBe('');
        expect(labelSpan.textContent).toBe(testCase.name);
        expect(committedValue).toBe(testCase.name);
      }
    });

    it('safely handles empty string and whitespace-only renames by falling back to initial value', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const tabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`
      ) as HTMLElement;
      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;

      const initialName = 'Standard Calculus';

      // Test 1: Empty string -> falls back to initialName
      let committed = false;
      let input = gallery.startInlineRename(labelSpan, initialName, () => {
        committed = true;
      });
      input.value = '';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(labelSpan.textContent).toBe(initialName);
      expect(committed).toBe(false); // No onCommit called because name was unchanged

      // Test 2: Whitespace only -> falls back to initialName
      committed = false;
      input = gallery.startInlineRename(labelSpan, initialName, () => {
        committed = true;
      });
      input.value = '     ';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(labelSpan.textContent).toBe(initialName);
      expect(committed).toBe(false);
    });

    it('cancels rename cleanly on Escape key without committing new text', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const tabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`
      ) as HTMLElement;
      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;

      let committed = false;
      const input = gallery.startInlineRename(labelSpan, 'Original Tab', () => {
        committed = true;
      });

      input.value = 'Discarded Temporary Draft';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(committed).toBe(false);
      expect(labelSpan.querySelector('.weq-gallery-rename-input')).toBeNull();
      expect(labelSpan.textContent).toBe('Original Tab');
      expect(labelSpan.style.writingMode).toBe('');
    });

    it('handles concurrent rename triggers: cleanly commits Tab 1 before opening Tab 2', async () => {
      await gallery.onOpen();
      expect(gallery.tabs.length).toBeGreaterThanOrEqual(2);

      const tab1 = gallery.tabs[0];
      const tab2 = gallery.tabs[1];

      const btn1 = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab1.id}"]`) as HTMLElement;
      const btn2 = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab2.id}"]`) as HTMLElement;

      const label1 = btn1.querySelector('.weq-gallery-tab-label') as HTMLElement;
      const label2 = btn2.querySelector('.weq-gallery-tab-label') as HTMLElement;

      let tab1Committed = '';
      const input1 = gallery.startInlineRename(label1, 'Tab 1 Original', (val) => {
        tab1Committed = val;
      });
      input1.value = 'Tab 1 Modified';

      // Trigger rename on Tab 2 before Tab 1 is committed
      let tab2Committed = '';
      const input2 = gallery.startInlineRename(label2, 'Tab 2 Original', (val) => {
        tab2Committed = val;
      });

      // Tab 1 must have been automatically saved & cleaned up!
      expect(label1.querySelector('.weq-gallery-rename-input')).toBeNull();
      expect(label1.textContent).toBe('Tab 1 Modified');
      expect(tab1Committed).toBe('Tab 1 Modified');

      // Tab 2 has active input
      expect(label2.querySelector('.weq-gallery-rename-input')).toBe(input2);

      // Re-triggering rename commits the active one and starts fresh without stacking duplicate inputs
      input2.value = 'Tab 2 Updated';
      const input2Again = gallery.startInlineRename(label2, 'Tab 2 Updated', (val) => {
        tab2Committed = val;
      });
      expect(label2.querySelectorAll('.weq-gallery-rename-input').length).toBe(1);

      // Clean up Tab 2
      input2Again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(label2.querySelector('.weq-gallery-rename-input')).toBeNull();
    });
  });

  // =========================================================================
  // BUG 6: CELL EDITING HORIZONTAL PADDING BREATHING ROOM THRESHOLD
  // =========================================================================
  describe('Bug 6: Adversarial Challenge — Fine-Grained Character Breathing Room & Multi-Step Span Expansion', () => {
    it('rigorously verifies clearance >= 16px at all points during character-by-character continuous ramp (1 -> 2 -> 3 -> 4 -> 5 -> 6)', () => {
      const cell: GalleryCell = {
        id: 'test-adversarial-breathing',
        name: 'Adversarial Cell',
        mathml: '<mi>x</mi>',
      };

      const cellEl = document.createElement('button');
      cellEl.className = 'weq-gallery-cell is-editing';
      const editorDiv = document.createElement('div');
      editorDiv.className = 'weq-gallery-cell-editor';
      const inner = document.createElement('div');
      inner.className = 'word-equation-math';
      editorDiv.appendChild(inner);
      cellEl.appendChild(editorDiv);

      const baseWidth = 48;
      const gridGap = 6;

      // Character-by-character ramp simulation from 0px to 300px
      // For each width, calculate spanX and verify clearance
      for (let width = 10; width <= 280; width += 2) {
        Object.defineProperty(inner, 'scrollWidth', { value: width, configurable: true });
        Object.defineProperty(inner, 'scrollHeight', { value: 30, configurable: true });

        const span = calculateCellSpan(cell, cellEl);
        const currentCellWidth = span.spanX * baseWidth + (span.spanX - 1) * gridGap;
        const clearance = currentCellWidth - width;

        // Clearance invariant:
        // Before hitting max span 6 (at width <= 248), clearance MUST be >= 16px!
        if (width <= 248) {
          expect(clearance).toBeGreaterThanOrEqual(16);
        }

        // Verify exact mathematical step thresholds
        if (width <= 32) {
          expect(span.spanX).toBe(1);
        } else if (width >= 34 && width <= 86) {
          expect(span.spanX).toBe(2);
        } else if (width >= 88 && width <= 140) {
          expect(span.spanX).toBe(3);
        } else if (width >= 142 && width <= 194) {
          expect(span.spanX).toBe(4);
        } else if (width >= 196 && width <= 248) {
          expect(span.spanX).toBe(5);
        } else if (width >= 250) {
          expect(span.spanX).toBe(6);
        }
      }
    });

    it('tests precise boundary transitions: 1->2 (32px vs 34px), 2->3 (86px vs 88px), 3->4 (140px vs 142px)', () => {
      const cell: GalleryCell = { id: 'test-boundary', name: 'Boundary Cell', mathml: '<mi>x</mi>' };
      const cellEl = document.createElement('button');
      cellEl.className = 'weq-gallery-cell is-editing';
      const editorDiv = document.createElement('div');
      editorDiv.className = 'weq-gallery-cell-editor';
      const inner = document.createElement('div');
      inner.className = 'word-equation-math';
      editorDiv.appendChild(inner);
      cellEl.appendChild(editorDiv);
      Object.defineProperty(inner, 'scrollHeight', { value: 30, configurable: true });

      // Step 1 -> 2:
      // At 32px: 32 + 16 = 48 <= 48 -> stays span 1. Clearance = 48 - 32 = 16px.
      Object.defineProperty(inner, 'scrollWidth', { value: 32, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(1);

      // At 33px: 33 + 16 = 49 > 48 -> early expansion to span 2! Clearance = 102 - 33 = 69px!
      Object.defineProperty(inner, 'scrollWidth', { value: 33, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(2);

      // Step 2 -> 3:
      // At 86px: (86 + 16 + 6) / 54 = 108 / 54 = 2 -> stays span 2. Clearance = 102 - 86 = 16px.
      Object.defineProperty(inner, 'scrollWidth', { value: 86, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(2);

      // At 87px: (87 + 16 + 6) / 54 = 109 / 54 = 3 -> expands to span 3! Clearance = 156 - 87 = 69px!
      Object.defineProperty(inner, 'scrollWidth', { value: 87, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(3);

      // Step 3 -> 4:
      // At 140px: (140 + 16 + 6) / 54 = 162 / 54 = 3 -> stays span 3. Clearance = 156 - 140 = 16px.
      Object.defineProperty(inner, 'scrollWidth', { value: 140, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(3);

      // At 141px: (141 + 16 + 6) / 54 = 163 / 54 = 4 -> expands to span 4! Clearance = 210 - 141 = 69px!
      Object.defineProperty(inner, 'scrollWidth', { value: 141, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(4);
    });

    it('verifies smooth reversible shrinking (4 -> 3 -> 2 -> 1) when characters are deleted', () => {
      const cell: GalleryCell = { id: 'test-shrink', name: 'Shrink Cell', mathml: '<mi>x</mi>' };
      const cellEl = document.createElement('button');
      cellEl.className = 'weq-gallery-cell is-editing';
      const editorDiv = document.createElement('div');
      editorDiv.className = 'weq-gallery-cell-editor';
      const inner = document.createElement('div');
      inner.className = 'word-equation-math';
      editorDiv.appendChild(inner);
      cellEl.appendChild(editorDiv);
      Object.defineProperty(inner, 'scrollHeight', { value: 30, configurable: true });

      // Start at span 4 (150px)
      Object.defineProperty(inner, 'scrollWidth', { value: 150, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(4);

      // Delete back to span 3 (100px)
      Object.defineProperty(inner, 'scrollWidth', { value: 100, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(3);

      // Delete back to span 2 (50px)
      Object.defineProperty(inner, 'scrollWidth', { value: 50, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(2);

      // Delete back to span 1 (20px)
      Object.defineProperty(inner, 'scrollWidth', { value: 20, configurable: true });
      expect(calculateCellSpan(cell, cellEl).spanX).toBe(1);
    });
  });

  // =========================================================================
  // BUG 7: EXHAUSTIVE STRESS TESTING OF OPTIMAL 2D GRID PACKING
  // =========================================================================
  describe('Bug 7: Adversarial Challenge — Optimal Section Packing & Last-Row Add-Cell Placement', () => {
    // Helper function to validate core invariants on any packed result
    const validatePackingInvariants = (
      cells: GalleryCell[],
      packing: ReturnType<typeof computeOptimalSectionPacking>,
      numColumns: number
    ) => {
      const cols = Math.max(1, numColumns);
      expect(packing.totalRows).toBeGreaterThanOrEqual(1);

      // Invariant 1: Placements count matches input cell count
      expect(packing.placements.length).toBe(cells.length);

      // Invariant 2: Within column bounds
      for (const p of packing.placements) {
        expect(p.row).toBeGreaterThanOrEqual(1);
        expect(p.col).toBeGreaterThanOrEqual(1);
        expect(p.spanX).toBeGreaterThanOrEqual(1);
        expect(p.spanY).toBeGreaterThanOrEqual(1);
        expect(p.col + p.spanX - 1).toBeLessThanOrEqual(cols);
      }

      // Invariant 3: Zero cell overlaps in 2D space
      const occupied: boolean[][] = [];
      let maxEndRow = 1;
      for (const p of packing.placements) {
        for (let dr = 0; dr < p.spanY; dr++) {
          const r = p.row + dr;
          if (!occupied[r]) occupied[r] = [];
          for (let dc = 0; dc < p.spanX; dc++) {
            const c = p.col + dc;
            // Coordinate (r, c) must not be already occupied!
            expect(occupied[r][c]).toBeFalsy();
            occupied[r][c] = true;
          }
        }
        const endRow = p.row + p.spanY - 1;
        if (endRow > maxEndRow) maxEndRow = endRow;
      }

      // Invariant 4: Add Cell Button strictly placed at the last row
      expect(packing.addBtnRow).toBe(packing.totalRows);
      expect(packing.addBtnRow).toBeGreaterThanOrEqual(maxEndRow);
      expect(packing.addBtnCol).toBeGreaterThanOrEqual(1);
      expect(packing.addBtnCol).toBeLessThanOrEqual(cols);

      // Invariant 5: Add Cell Button slot is not occupied by any cell
      expect(occupied[packing.addBtnRow]?.[packing.addBtnCol]).toBeFalsy();

      // Invariant 6: First rows filled first (compact packing)
      // Any row strictly before totalRows - 1 should not have voids if smaller items exist
      if (cells.length > 0 && packing.totalRows > 1) {
        let row1Occupied = 0;
        for (let c = 1; c <= cols; c++) {
          if (occupied[1]?.[c]) row1Occupied++;
        }
        // Row 1 should have placed cells
        expect(row1Occupied).toBeGreaterThan(0);
      }
    };

    it('handles degenerate cases: empty cell list and single-cell list across columns 2, 3, 4, 5, 6', () => {
      const columnCounts = [2, 3, 4, 5, 6];

      for (const cols of columnCounts) {
        // Empty section
        const emptyPacking = computeOptimalSectionPacking([], cols);
        expect(emptyPacking.placements.length).toBe(0);
        expect(emptyPacking.totalRows).toBe(1);
        expect(emptyPacking.addBtnRow).toBe(1);
        expect(emptyPacking.addBtnCol).toBe(1);

        // Single 1x1 cell
        const singleCell: GalleryCell[] = [{ id: 'single', name: 'Single', mathml: '<mn>1</mn>' }];
        const singlePacking = computeOptimalSectionPacking(singleCell, cols);
        validatePackingInvariants(singleCell, singlePacking, cols);
        expect(singlePacking.totalRows).toBe(1);
        expect(singlePacking.placements[0].row).toBe(1);
        expect(singlePacking.placements[0].col).toBe(1);
        expect(singlePacking.addBtnRow).toBe(1);
        expect(singlePacking.addBtnCol).toBe(2);
      }
    });

    it('packs uniform 1x1 cells across columns (2, 3, 4, 5, 6) with perfect density and minimal rows', () => {
      for (const cols of [2, 3, 4, 5, 6]) {
        for (const numCells of [3, 4, 7, 10, 16, 25]) {
          const cells: GalleryCell[] = Array.from({ length: numCells }, (_, i) => ({
            id: `c-1x1-${i}`,
            name: `Cell ${i}`,
            mathml: `<mn>${i}</mn>`,
          }));

          const packing = computeOptimalSectionPacking(cells, cols);
          validatePackingInvariants(cells, packing, cols);

          // Expected minimal rows for pure 1x1 cells
          const expectedCellRows = Math.ceil(numCells / cols);
          const remainderInLastRow = numCells % cols;
          // If last row has room for addBtn, totalRows = expectedCellRows, else expectedCellRows + 1
          const expectedTotalRows = remainderInLastRow === 0 ? expectedCellRows + 1 : expectedCellRows;

          expect(packing.totalRows).toBe(expectedTotalRows);
          expect(packing.addBtnRow).toBe(expectedTotalRows);
        }
      }
    });

    it('packs heterogeneous multi-span combinations (1x1, 2x1, 3x1, 1x2, 2x2, 3x2, 2x3, 3x3) across columns', () => {
      // Determinants & Matrices realistic preset
      const complexCells: GalleryCell[] = [
        // 3x3 matrix
        { id: 'm3x3', name: '3x3 Matrix', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>' },
        // 2x2 matrix
        { id: 'm2x2', name: '2x2 Matrix', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>' },
        // Wide piecewise function (3x2)
        { id: 'pw3x2', name: 'Piecewise', mathml: '<mrow><mo>{</mo><mtable><mtr><mtd><mi>x</mi></mtd><mtd><mi>x</mi><mo>&gt;</mo><mn>0</mn></mtd></mtr><mtr><mtd><mo>-</mo><mi>x</mi></mtd><mtd><mi>x</mi><mo>≤</mo><mn>0</mn></mtd></mtr></mtable></mrow>' },
        // Tall fraction (1x2)
        { id: 'frac1x2', name: 'Fraction', mathml: '<mfrac><mi>a</mi><mi>b</mi></mfrac>' },
        // Simple 1x1 cells
        { id: 'sim1', name: 'Simple 1', mathml: '<mi>α</mi>' },
        { id: 'sim2', name: 'Simple 2', mathml: '<mi>β</mi>' },
        { id: 'sim3', name: 'Simple 3', mathml: '<mi>γ</mi>' },
        { id: 'sim4', name: 'Simple 4', mathml: '<mi>δ</mi>' },
      ];

      for (const cols of [3, 4, 5, 6]) {
        const packing = computeOptimalSectionPacking(complexCells, cols);
        validatePackingInvariants(complexCells, packing, cols);

        // Verify '+' button is on the final row, never placed in middle rows
        expect(packing.addBtnRow).toBe(packing.totalRows);
      }
    });

    it('stress tests randomized fuzz configurations (50 iterations) with mixed spans across random column counts', () => {
      // Seeded deterministic pseudo-random generator
      let seed = 42;
      const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      for (let iteration = 0; iteration < 50; iteration++) {
        const cols = 2 + Math.floor(rnd() * 5); // 2 to 6 columns
        const cellCount = 3 + Math.floor(rnd() * 15); // 3 to 17 cells

        const cells: GalleryCell[] = [];
        for (let i = 0; i < cellCount; i++) {
          const spanType = Math.floor(rnd() * 5);
          let mathml = '<mi>x</mi>';
          if (spanType === 1) {
            // 2x2 or 2x1
            mathml = '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>';
          } else if (spanType === 2) {
            // Tall fraction
            mathml = '<mfrac><mi>a</mi><mi>b</mi></mfrac>';
          } else if (spanType === 3) {
            // Wide cell
            mathml = '<mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>+</mo><mi>c</mi><mo>+</mo><mi>d</mi><mo>+</mo><mi>e</mi></mrow>';
          }
          cells.push({
            id: `fuzz-${iteration}-${i}`,
            name: `Fuzz Cell ${i}`,
            mathml,
          });
        }

        const packing = computeOptimalSectionPacking(cells, cols);
        validatePackingInvariants(cells, packing, cols);
      }
    });

    it('packSectionGrid updates DOM order, binds CSS gridRowStart/gridColumnStart, and keeps addCellBtn as last element', () => {
      const grid = document.createElement('div');
      grid.className = 'equation-gallery-grid weq-gallery-cell-grid';

      const cells: GalleryCell[] = [
        { id: 'alpha', name: 'Alpha', mathml: '<mi>α</mi>' },
        { id: 'beta', name: 'Beta', mathml: '<mi>β</mi>' },
        { id: 'det', name: 'Det', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>' },
        { id: 'gamma', name: 'Gamma', mathml: '<mi>γ</mi>' },
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

      // Verify DOM structure
      expect(grid.lastElementChild).toBe(addBtn);
      expect(addBtn.style.gridRowStart).toBe(String(result.addBtnRow));
      expect(addBtn.style.gridColumnStart).toBe(String(result.addBtnCol));

      // Verify all cells exist in DOM
      for (const cell of cells) {
        const el = grid.querySelector(`[data-cell-id="${cell.id}"]`);
        expect(el).not.toBeNull();
      }
    });
  });
});
