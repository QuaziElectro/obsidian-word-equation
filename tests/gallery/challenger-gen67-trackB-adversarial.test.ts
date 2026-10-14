/**
 * Challenger Gen67 Track B Adversarial Stress Testing Suite
 *
 * Target Scope: Equation Gallery Subsystem
 * Bugs Tested: 4, 5, 6, 7, 9, 12, 13, 14, 15, 16, 17, 18, 19
 *
 * Scenarios:
 * 1. Bug 4: Button dimensions vs cell dimensions exact match (48px x 44px base grid invariants across multiple sections).
 * 2. Bug 5 & 12: Content oscillation stress cycles (1x1 -> 3x3 -> 1x1 -> 2x2 -> 4x3 -> 1x1) verifying dynamic span adjustments without clipping or stale class accumulation, plus tall matrix/fraction spanning.
 * 3. Bug 6: Strict DOM boundary check; zero double borders, zero nested outline box-shadows.
 * 4. Bug 7: Rapid click bursts, focus churn, and outside clicking; ensure gallery does not close prematurely during edit operations.
 * 5. Bug 13: Multi-cycle serialize/deserialize persistence stress test across view lifecycles and plugin restarts.
 * 6. Bug 15 & 19: Non-modal creation and rapid inline rename handling (Enter, Escape, blur, whitespace-only names, dblclick churn).
 * 7. Bug 16 & 17: Empty cell '<mrow></mrow>' and empty tab invariants under repetitive additions.
 * 8. Bug 9, 14, 18: Static hover cursor, consecutive edit centering consistency, and unified '+' icon styling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App, WorkspaceLeaf, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS, VIEW_TYPE_EQUATION_GALLERY } from '../../src/main';
import { EquationGalleryView, calculateCellSpan } from '../../src/gallery/gallery-view';
import { GalleryCell, GallerySection, GalleryTab } from '../../src/gallery/gallery-types';
import { clearActiveEquationState } from '../../src/editor/active-session';

describe('Challenger Gen67 Adversarial: Track B Gallery Subsystem (Bugs 4-19)', () => {
  let app: any;
  let plugin: WordEquationPlugin;
  let leaf: any;
  let gallery: EquationGalleryView;

  beforeEach(() => {
    clearActiveEquationState();
    (Notice as any).notices = [];
    app = new App();
    plugin = new WordEquationPlugin(app, { id: 'obsidian-word-equation' } as any);
    plugin.settings = { ...DEFAULT_SETTINGS, customShortcuts: [], autoShowGallery: true };
    leaf = new (WorkspaceLeaf as any)(app);
    gallery = new EquationGalleryView(leaf, plugin);
  });

  afterEach(async () => {
    if (gallery) {
      await gallery.onClose();
    }
    document
      .querySelectorAll('.menu, .weq-gallery-context-menu, .modal-container')
      .forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. BUG 4: + Add Cell Button Dimensions vs Cell Dimensions Invariant
  // =========================================================================
  describe('Bug 4: Dimensional Parity & Grid Invariants', () => {
    it('enforces exact dimension variables in styles.css and identical base rules', () => {
      const cssPath = path.resolve(__dirname, '../../styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Base grid variables
      expect(cssContent).toMatch(/--weq-cell-base-width:\s*48px;/);
      expect(cssContent).toMatch(/--weq-cell-base-height:\s*44px;/);
      expect(cssContent).toMatch(/--weq-grid-gap:\s*6px;/);

      // Add cell button dimensions must directly reference base cell variables
      expect(cssContent).toMatch(
        /\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-height:\s*var\(--weq-cell-base-height,\s*44px\);/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-width:\s*var\(--weq-cell-base-width,\s*48px\);/
      );

      // Cell dimensions must directly reference base cell variables
      expect(cssContent).toMatch(
        /\.weq-gallery-cell\s*\{[\s\S]*?min-height:\s*var\(--weq-cell-base-height,\s*44px\);/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-cell\s*\{[\s\S]*?min-width:\s*var\(--weq-cell-base-width,\s*48px\);/
      );
    });

    it('guarantees data-span-x="1" and data-span-y="1" on all Add Cell buttons across 10 dynamically created sections', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;

      // Add 10 sections with mixed cells
      for (let i = 0; i < 10; i++) {
        const sec = gallery.createSectionWithName(activeTab, `Adversarial Sec ${i}`);
        // Add 1x1, 2x2, and 3x3 cells into the section
        sec.cells.push({
          id: `cell-1x1-${i}`,
          name: 'Scalar',
          mathml: '<mrow><mi>x</mi></mrow>',
          spanX: 1,
          spanY: 1,
        });
        sec.cells.push({
          id: `cell-2x2-${i}`,
          name: 'Matrix 2x2',
          mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>',
          spanX: 2,
          spanY: 2,
        });
      }

      await gallery.onOpen();

      const addCellBtns = gallery.contentEl.querySelectorAll('.weq-gallery-add-cell-btn');
      expect(addCellBtns.length).toBeGreaterThanOrEqual(10);

      addCellBtns.forEach((btn) => {
        expect(btn.getAttribute('data-span-x')).toBe('1');
        expect(btn.getAttribute('data-span-y')).toBe('1');
        const icon = btn.querySelector('.weq-gallery-add-cell-icon');
        expect(icon).not.toBeNull();
        expect(icon?.textContent).toBe('+');
      });
    });
  });

  // =========================================================================
  // 2. BUG 5 & 12: Content Oscillation Cycles & Tall Matrix Spanning Stress
  // =========================================================================
  describe('Bug 5 & 12: Content Oscillation Cycles (1x1 -> 3x3 -> 1x1 -> 2x2) and Vertical Spanning', () => {
    it('executes 10 oscillating cycles of growth and reduction without span drift or stale classes', async () => {
      await gallery.onOpen();
      const cell: GalleryCell = {
        id: 'oscillating-cell',
        name: 'Oscillating Formula',
        mathml: '<mrow><mi>x</mi></mrow>',
        spanX: 1,
        spanY: 1,
      };

      const grid = gallery.contentEl.querySelector('.weq-gallery-cell-grid') as HTMLElement;
      const section = gallery.tabs[0].sections[0];
      const cellEl = (gallery as any).renderCell(cell, grid, section);

      const scalarXml = '<mrow><mi>x</mi></mrow>';
      const matrix3x3Xml =
        '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>';
      const matrix2x2Xml =
        '<mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable>';
      const matrix4x3Xml =
        '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr><mtr><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd></mtr><mtr><mtd><mn>9</mn></mtd><mtd><mn>10</mn></mtd><mtd><mn>11</mn></mtd><mtd><mn>12</mn></mtd></mtr></mtable>';

      // Run 10 full oscillation cycles
      for (let cycle = 1; cycle <= 10; cycle++) {
        // Step A: Grow to 3x3
        gallery.updateCellSpanLive(cell, cellEl, matrix3x3Xml);
        expect(cellEl.getAttribute('data-span-x')).toBe('3');
        expect(cellEl.getAttribute('data-span-y')).toBe('3');
        expect(cellEl.style.gridColumn).toBe('span 3');
        expect(cellEl.style.gridRow).toBe('span 3');
        expect(cellEl.classList.contains('weq-span-3x3')).toBe(true);
        expect(cellEl.classList.contains('weq-span-2x2')).toBe(false);

        // Step B: Shrink back to 1x1 scalar
        gallery.updateCellSpanLive(cell, cellEl, scalarXml);
        expect(cellEl.getAttribute('data-span-x')).toBe('1');
        expect(cellEl.getAttribute('data-span-y')).toBe('1');
        expect(cellEl.style.gridColumn).toBe('span 1');
        expect(cellEl.style.gridRow).toBe('span 1');
        expect(cellEl.classList.contains('weq-span-3x3')).toBe(false);
        expect(cellEl.classList.contains('weq-span-x-3')).toBe(false);
        expect(cellEl.classList.contains('weq-span-y-3')).toBe(false);
        expect(cellEl.classList.contains('weq-span-x-1')).toBe(true);
        expect(cellEl.classList.contains('weq-span-y-1')).toBe(true);

        // Step C: Grow to 2x2
        gallery.updateCellSpanLive(cell, cellEl, matrix2x2Xml);
        expect(cellEl.getAttribute('data-span-x')).toBe('2');
        expect(cellEl.getAttribute('data-span-y')).toBe('2');
        expect(cellEl.style.gridColumn).toBe('span 2');
        expect(cellEl.style.gridRow).toBe('span 2');
        expect(cellEl.classList.contains('weq-span-2x2')).toBe(true);
        expect(cellEl.classList.contains('weq-span-3x3')).toBe(false);

        // Step D: Grow to 4x3
        gallery.updateCellSpanLive(cell, cellEl, matrix4x3Xml);
        expect(cellEl.getAttribute('data-span-x')).toBe('4');
        expect(cellEl.getAttribute('data-span-y')).toBe('3');
        expect(cellEl.classList.contains('weq-span-4x3')).toBe(true);
        expect(cellEl.classList.contains('weq-span-2x2')).toBe(false);

        // Step E: Shrink back to 1x1 empty formula
        gallery.updateCellSpanLive(cell, cellEl, '<mrow></mrow>');
        expect(cellEl.getAttribute('data-span-x')).toBe('1');
        expect(cellEl.getAttribute('data-span-y')).toBe('1');
        expect(cellEl.classList.contains('weq-span-4x3')).toBe(false);
        expect(cellEl.classList.contains('weq-span-x-1')).toBe(true);
      }
    });

    it('accurately computes vertical Y-spans for tall fractions, vertical vectors, and stacked operators', () => {
      // 1-column, 4-row vertical vector
      const tallVector: GalleryCell = {
        id: 'tall-vector',
        name: 'Tall Vector',
        mathml:
          '<mtable><mtr><mtd><mn>1</mn></mtd></mtr><mtr><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd></mtr></mtable>',
      };
      const vectorSpan = calculateCellSpan(tallVector);
      expect(vectorSpan.spanX).toBe(1);
      expect(vectorSpan.spanY).toBe(4);

      // Multi-nested fraction (>= 2 nested fractions)
      const nestedFrac: GalleryCell = {
        id: 'nested-frac',
        name: 'Nested Fraction',
        mathml: '<mfrac><mfrac><mi>a</mi><mi>b</mi></mfrac><mfrac><mi>c</mi><mi>d</mi></mfrac></mfrac>',
      };
      const nestedFracSpan = calculateCellSpan(nestedFrac);
      expect(nestedFracSpan.spanY).toBeGreaterThanOrEqual(3);

      // Stacked munderover limits
      const munderoverCell: GalleryCell = {
        id: 'munderover-cell',
        name: 'Integral Limits',
        mathml: '<munderover><mo>&int;</mo><mn>0</mn><mi>&infin;</mi></munderover>',
      };
      const munderoverSpan = calculateCellSpan(munderoverCell);
      expect(munderoverSpan.spanY).toBe(2);
    });
  });

  // =========================================================================
  // 3. BUG 6: Strict Single Clean Boundary Check (Zero Double Borders)
  // =========================================================================
  describe('Bug 6: Single Clean Boundary Invariant', () => {
    it('verifies CSS rules mandate zero border, zero background, zero box-shadow inside gallery cells', () => {
      const cssPath = path.resolve(__dirname, '../../styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      expect(cssContent).toMatch(
        /\.weq-gallery-cell \.word-equation-math[\s\S]*?border:\s*none !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-cell \.word-equation-math[\s\S]*?background:\s*transparent !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-cell \.word-equation-math[\s\S]*?box-shadow:\s*none !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-cell \.word-equation-math[\s\S]*?padding:\s*0 !important;/
      );
    });

    it('asserts across all rendered cells that inner math containers have zero borders and no duplicate framing', async () => {
      await gallery.onOpen();

      const cells = gallery.contentEl.querySelectorAll('.weq-gallery-cell');
      expect(cells.length).toBeGreaterThan(0);

      cells.forEach((cellEl) => {
        // Outer cell container has single boundary
        expect(cellEl.classList.contains('weq-gallery-cell')).toBe(true);

        // Inner math element must not have an outline or border style set directly
        const mathEl = cellEl.querySelector('.word-equation-math') as HTMLElement;
        if (mathEl) {
          expect(mathEl.style.border).toBe('');
          expect(mathEl.style.boxShadow).toBe('');
        }
      });
    });
  });

  // =========================================================================
  // 4. BUG 7: Rapid Click Bursts, Focus Churn & Auto-Hide Guard
  // =========================================================================
  describe('Bug 7: Rapid Clicks and Focus Churn Without Auto-Hide Closure', () => {
    it('survives a barrage of 50 blur/focus churn events during active cell editing without closing', async () => {
      vi.useFakeTimers();
      try {
        await plugin.onload();
        plugin.settings.autoShowGallery = true;

        const hideSpy = vi.spyOn(plugin, 'hideGalleryView');
        await gallery.onOpen();

        const activeSec = gallery.tabs[0].sections[0];
        const cell = activeSec.cells[0];
        const cellEl = gallery.contentEl.querySelector(
          `.weq-gallery-cell[data-cell-id="${cell.id}"]`
        ) as HTMLElement;
        expect(cellEl).not.toBeNull();

        // Start cell editing
        gallery.startEditingCell(cell, cellEl);
        expect(gallery.editingCellId).toBe(cell.id);
        expect(cellEl.classList.contains('is-editing')).toBe(true);

        // Simulate 50 rapid focus churn & equation change triggers
        for (let i = 0; i < 50; i++) {
          clearActiveEquationState();
          (plugin as any).onActiveEquationChange?.(null);
          // Advance partial debounce timer
          vi.advanceTimersByTime(20);
        }

        // Full debounce timer expired
        vi.advanceTimersByTime(500);

        // Gallery MUST NOT have closed
        expect(hideSpy).not.toHaveBeenCalled();
        expect(gallery.editingCellId).toBe(cell.id);
        expect(cellEl.classList.contains('is-editing')).toBe(true);

        // Finishing the edit releases the lock
        gallery.finishEditingCell(cell, cellEl);
        expect(gallery.editingCellId).toBeNull();
        expect(cellEl.classList.contains('is-editing')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancels pending hideGalleryTimeout when startEditingCell is invoked', () => {
      plugin.hideGalleryTimeout = setTimeout(() => {}, 500);
      expect(plugin.hideGalleryTimeout).not.toBeNull();

      const cell = gallery.tabs[0].sections[0].cells[0];
      const dummyEl = document.createElement('div');
      gallery.startEditingCell(cell, dummyEl);

      expect(plugin.hideGalleryTimeout).toBeNull();
    });
  });

  // =========================================================================
  // 5. BUG 13: Multi-Cycle State Persistence Stress Across View Lifecycles
  // =========================================================================
  describe('Bug 13: Multi-Cycle State Persistence Stress Test', () => {
    it('persists complex modifications across 5 consecutive serialize/deserialize reload cycles', async () => {
      const saveSpy = vi.spyOn(plugin, 'saveSettings').mockResolvedValue();

      // Cycle 1: Create custom tab, 2 sections, 3 cells
      await gallery.onOpen();
      const tab1 = gallery.createTabWithName('Relativity');
      const sec1 = gallery.createSectionWithName(tab1, 'Special Relativity');
      const sec2 = gallery.createSectionWithName(tab1, 'General Relativity');

      sec1.cells.push({
        id: 'cell-sr-1',
        name: 'Lorentz Factor',
        mathml: '<mrow><mi>&gamma;</mi><mo>=</mo><mfrac><mn>1</mn><msqrt><mn>1</mn><mo>-</mo><msup><mi>v</mi><mn>2</mn></msup></msqrt></mfrac></mrow>',
        spanX: 2,
        spanY: 2,
        isCustom: true,
      });

      sec2.cells.push({
        id: 'cell-gr-1',
        name: 'Field Equations',
        mathml: '<mrow><msub><mi>G</mi><mrow><mi>&mu;</mi><mi>&nu;</mi></mrow></msub></mrow>',
        spanX: 1,
        spanY: 1,
        isCustom: true,
      });

      await gallery.saveGalleryState();
      expect(saveSpy).toHaveBeenCalled();
      expect(plugin.settings.galleryTabs).toBeDefined();

      // Cycle 2: Fresh view instance loads and verifies
      const view2 = new EquationGalleryView(leaf, plugin);
      const reloadedTab2 = view2.tabs.find((t) => t.name === 'Relativity');
      expect(reloadedTab2).toBeDefined();
      expect(reloadedTab2!.sections.length).toBe(2);
      expect(reloadedTab2!.sections[0].cells[0].mathml).toContain('&gamma;');

      // Mutate in view 2: modify formula & rename section
      reloadedTab2!.sections[0].cells[0].mathml = '<mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow>';
      reloadedTab2!.sections[1].name = 'Cosmology';
      await view2.saveGalleryState();

      // Cycle 3: Full JSON stringify/parse simulation (Obsidian data.json disk persistence)
      const diskJson = JSON.stringify(plugin.settings);
      const reloadedSettings = JSON.parse(diskJson);
      const freshPlugin = new WordEquationPlugin(app, { id: 'obsidian-word-equation' } as any);
      freshPlugin.settings = reloadedSettings;

      const view3 = new EquationGalleryView(leaf, freshPlugin);
      const reloadedTab3 = view3.tabs.find((t) => t.name === 'Relativity');
      expect(reloadedTab3).toBeDefined();
      expect(reloadedTab3!.sections[0].cells[0].mathml).toBe('<mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow>');
      expect(reloadedTab3!.sections[1].name).toBe('Cosmology');

      // Cycle 4: Delete cell, add another cell
      reloadedTab3!.sections[0].cells.pop();
      reloadedTab3!.sections[0].cells.push({
        id: 'cell-new-sr',
        name: 'Momentum',
        mathml: '<mrow><mi>p</mi><mo>=</mo><mi>&gamma;</mi><mi>m</mi><mi>v</mi></mrow>',
      });
      await view3.saveGalleryState();

      // Cycle 5: Re-verify in fresh view
      const view5 = new EquationGalleryView(leaf, freshPlugin);
      const reloadedTab5 = view5.tabs.find((t) => t.name === 'Relativity');
      expect(reloadedTab5!.sections[0].cells.length).toBe(1);
      expect(reloadedTab5!.sections[0].cells[0].id).toBe('cell-new-sr');
    });

    it('safely handles 25 rapid concurrent calls to saveGalleryState without data corruption', async () => {
      vi.spyOn(plugin, 'saveSettings').mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      await gallery.onOpen();
      const initialTabCount = gallery.tabs.length;

      // Dispatch 25 concurrent saves while mutating tabs
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 25; i++) {
        gallery.tabs[0].name = `Tab Rename ${i}`;
        promises.push(gallery.saveGalleryState());
      }

      await Promise.all(promises);

      expect(plugin.settings.galleryTabs).toBeDefined();
      expect(plugin.settings.galleryTabs!.length).toBe(initialTabCount);
      expect(plugin.settings.galleryTabs![0].name).toBe('Tab Rename 24');
    });
  });

  // =========================================================================
  // 6. BUG 15 & 19: Non-Modal Creation & Inline Rename Stress
  // =========================================================================
  describe('Bug 15 & 19: Non-Modal Creation and Inline Rename Stress', () => {
    it('promptAddTab creates immediately with inline rename without modal and handles Enter, Escape, whitespace', async () => {
      await gallery.onOpen();
      const initialCount = gallery.tabs.length;

      // 1. Add tab immediately via + Add Tab button click
      const addTabBtn = gallery.contentEl.querySelector('.weq-gallery-add-tab-btn') as HTMLElement;
      expect(addTabBtn).not.toBeNull();
      addTabBtn.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(document.querySelector('.modal-container')).toBeNull();
      expect(gallery.tabs.length).toBe(initialCount + 1);

      const newTab = gallery.tabs[gallery.tabs.length - 1];
      expect(newTab.name).toBe('New Tab');

      // Active title is removed from header (Bug 8), rename input is on sidebar tab button label
      expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();
      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${newTab.id}"]`) as HTMLElement;
      expect(tabBtn).not.toBeNull();
      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;
      expect(labelSpan).not.toBeNull();
      let renameInput = labelSpan.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();

      // Enter key commits new name
      renameInput.value = 'Thermodynamics';
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(newTab.name).toBe('Thermodynamics');
      expect(labelSpan.textContent).toBe('Thermodynamics');

      // 2. Double-click to rename again, test Escape
      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      renameInput = labelSpan.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();

      renameInput.value = 'Discarded Name';
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(newTab.name).toBe('Thermodynamics');
      expect(labelSpan.textContent).toBe('Thermodynamics');

      // 3. Double-click to rename again, test whitespace-only value fallback
      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      renameInput = labelSpan.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();

      renameInput.value = '   ';
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      // Must fall back to previous valid name without becoming empty
      expect(newTab.name).toBe('Thermodynamics');
      expect(labelSpan.textContent).toBe('Thermodynamics');
    });

    it('promptAddSection creates immediately with inline rename and ignores rapid dblclick churn', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const initialSecCount = activeTab.sections.length;

      const addSecBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-panel[data-tab-id="${activeTab.id}"] .weq-gallery-add-section-btn`
      ) as HTMLElement;
      expect(addSecBtn).not.toBeNull();
      addSecBtn.click();
      await new Promise((r) => setTimeout(r, 50));

      expect(document.querySelector('.modal-container')).toBeNull();
      expect(activeTab.sections.length).toBe(initialSecCount + 1);

      const newSec = activeTab.sections[activeTab.sections.length - 1];
      expect(newSec.name).toBe('New Section');

      const secEl = gallery.contentEl.querySelector(`.weq-gallery-section[data-section-id="${newSec.id}"]`) as HTMLElement;
      const secHeader = secEl.querySelector('.weq-gallery-section-header') as HTMLElement;

      // Blur commits the change
      const renameInput = secEl.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      renameInput.value = 'Statistical Mechanics';
      renameInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      expect(newSec.name).toBe('Statistical Mechanics');

      // Rapid double clicks must not mount multiple inputs
      for (let i = 0; i < 10; i++) {
        secHeader.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }

      const inputs = secHeader.querySelectorAll('.weq-gallery-rename-input');
      expect(inputs.length).toBe(1);
    });
  });

  // =========================================================================
  // 7. BUG 16 & 17: Empty Cell and Empty Tab Invariants Under Repetitive Additions
  // =========================================================================
  describe('Bug 16 & 17: Empty Cell and Empty Tab Invariants', () => {
    it('guarantees 15 consecutively added cells are initialized with strictly empty <mrow></mrow> and 1x1 spans', async () => {
      await gallery.onOpen();
      const sec = gallery.tabs[0].sections[0];
      const startingCount = sec.cells.length;

      for (let i = 0; i < 15; i++) {
        gallery.promptAddCell(sec);
      }

      expect(sec.cells.length).toBe(startingCount + 15);

      const addedCells = sec.cells.slice(startingCount);
      addedCells.forEach((c) => {
        expect(c.mathml).toBe('<mrow></mrow>');
        expect(c.mathml).not.toContain('x');
        expect(c.mathml).not.toContain('<mi>');
        expect(c.spanX).toBe(1);
        expect(c.spanY).toBe(1);
        expect(c.isCustom).toBe(true);
      });
    });

    it('guarantees 10 consecutively created tabs are initialized with sections: [] and only a + Add Section button', async () => {
      await gallery.onOpen();

      for (let i = 1; i <= 10; i++) {
        const newTab = gallery.createTabWithName(`Clean Tab ${i}`);
        expect(newTab.sections).toEqual([]);
        expect(newTab.sections.length).toBe(0);

        const panel = gallery.contentEl.querySelector(
          `.weq-gallery-tab-panel[data-tab-id="${newTab.id}"]`
        ) as HTMLElement;
        expect(panel).not.toBeNull();
        expect(panel.querySelectorAll('.weq-gallery-section').length).toBe(0);
        expect(panel.querySelectorAll('.weq-gallery-cell').length).toBe(0);
        expect(panel.querySelector('.weq-gallery-add-section-btn')).not.toBeNull();
      }
    });
  });

  // =========================================================================
  // 8. BUG 9, 14, 18: Polish Invariants (Cursor, Centering, Section Icon)
  // =========================================================================
  describe('Bug 9, 14, 18: Polish Invariants', () => {
    it('Bug 9: verifies cursor pointer on static cells and text cursor only during editing', () => {
      const cssPath = path.resolve(__dirname, '../../styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      expect(cssContent).toMatch(
        /\.weq-gallery-cell:not\(\.is-editing\)[\s\S]*?cursor:\s*pointer !important;/
      );
      expect(cssContent).toMatch(
        /\.weq-gallery-cell\.is-editing[\s\S]*?cursor:\s*text !important;/
      );
    });

    it('Bug 14: guarantees perfect flex centering across 5 repeated edits of the same cell', async () => {
      await gallery.onOpen();
      const cell = gallery.tabs[0].sections[0].cells[0];
      const cellEl = gallery.contentEl.querySelector(
        `.weq-gallery-cell[data-cell-id="${cell.id}"]`
      ) as HTMLElement;

      for (let edit = 1; edit <= 5; edit++) {
        gallery.startEditingCell(cell, cellEl);
        const editor = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
        expect(editor).not.toBeNull();
        expect(editor.style.display).toBe('flex');
        expect(editor.style.alignItems).toBe('center');
        expect(editor.style.justifyContent).toBe('center');
        gallery.finishEditingCell(cell, cellEl);
      }
    });

    it('Bug 18: Add Section button has unified "+" icon and no text label', async () => {
      await gallery.onOpen();
      const addSectionBtn = gallery.contentEl.querySelector('.weq-gallery-add-section-btn') as HTMLElement;
      expect(addSectionBtn).not.toBeNull();

      const icon = addSectionBtn.querySelector('.weq-gallery-add-section-icon');
      expect(icon).not.toBeNull();
      expect(icon?.textContent).toBe('+');

      const textLabel = addSectionBtn.querySelector('.weq-gallery-add-section-text');
      expect(textLabel).toBeNull();
    });
  });
});
