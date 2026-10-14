import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App, WorkspaceLeaf, Menu } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import {
  EquationGalleryView,
  calculateCellSpan,
} from '../../src/gallery/gallery-view';
import {
  GalleryCell,
  GallerySection,
  GalleryTab,
} from '../../src/gallery/gallery-types';
import { PRESET_GALLERY_TABS } from '../../src/gallery/gallery-presets';
import { clearActiveEquationState } from '../../src/editor/active-session';

describe('Phase 2 Track B: Gallery Defects Remediation (Bugs 1, 5, 6, 7, 8, 9, 10)', () => {
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
  // BUG 1: Cell context menu Delete & Tab/Section context menus (Rename & Delete)
  // =========================================================================
  describe('Bug 1: Gallery Right-Click Context Menus (Cell Delete, Tab/Section Rename & Delete)', () => {
    it('cell context menu includes Delete option which removes cell and updates state', async () => {
      await gallery.onOpen();
      const currentTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const targetSection = currentTab.sections[0];
      const initialCellCount = targetSection.cells.length;
      const targetCell = targetSection.cells[0];

      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-item="${targetCell.id}"]`) as HTMLElement;
      expect(cellEl).not.toBeNull();

      cellEl.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 200,
        })
      );

      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      expect(menu).not.toBeNull();

      // Check all 6 actions including Delete
      const items = Array.from(menu.querySelectorAll('.menu-item-title, .weq-gallery-menu-item')).map((el) =>
        el.textContent?.trim()
      );
      expect(items).toContain('Copy MathML');
      expect(items).toContain('Copy LaTeX');
      expect(items).toContain('Activate / Insert');
      expect(items).toContain('Create Shortcut');
      expect(items).toContain('Edit');
      expect(items).toContain('Delete');

      // Click Delete
      const deleteItem = Array.from(menu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Delete')
      ) as HTMLElement;
      expect(deleteItem).not.toBeNull();

      deleteItem.click();
      await new Promise((r) => setTimeout(r, 20));

      // Cell should be removed from targetSection
      expect(targetSection.cells.length).toBe(initialCellCount - 1);
      expect(targetSection.cells.some((c) => c.id === targetCell.id)).toBe(false);
      // staticRenderCache should no longer contain targetCell.id
      expect(gallery.staticRenderCache.has(targetCell.id)).toBe(false);
    });

    it('tab button right-click context menu includes Rename and Delete', async () => {
      await gallery.onOpen();
      const initialTabCount = gallery.tabs.length;
      const targetTab = gallery.tabs[0];

      const tabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${targetTab.id}"]`
      ) as HTMLElement;
      expect(tabBtn).not.toBeNull();

      tabBtn.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 50,
          clientY: 50,
        })
      );

      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      expect(menu).not.toBeNull();

      const items = Array.from(menu.querySelectorAll('.menu-item-title, .weq-gallery-menu-item')).map((el) =>
        el.textContent?.trim()
      );
      expect(items).toContain('Rename');
      expect(items).toContain('Delete');

      // Test Rename option activates inline rename
      const renameItem = Array.from(menu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Rename')
      ) as HTMLElement;
      expect(renameItem).not.toBeNull();
      renameItem.click();

      const renameInput = tabBtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      expect(renameInput.value).toBe(targetTab.name);

      // Cancel rename
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // Now test Delete option
      tabBtn.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 50,
          clientY: 50,
        })
      );
      const newMenu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      const deleteItem = Array.from(newMenu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Delete')
      ) as HTMLElement;
      deleteItem.click();
      await new Promise((r) => setTimeout(r, 20));

      expect(gallery.tabs.length).toBe(initialTabCount - 1);
      expect(gallery.tabs.some((t) => t.id === targetTab.id)).toBe(false);
    });

    it('section header right-click context menu includes Rename and Delete', async () => {
      await gallery.onOpen();
      const currentTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const initialSecCount = currentTab.sections.length;
      const targetSection = currentTab.sections[0];

      const secEl = gallery.contentEl.querySelector(
        `.weq-gallery-section[data-section-id="${targetSection.id}"]`
      ) as HTMLElement;
      const secHeader = secEl.querySelector('.weq-gallery-section-header') as HTMLElement;
      expect(secHeader).not.toBeNull();

      secHeader.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        })
      );

      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      expect(menu).not.toBeNull();

      const items = Array.from(menu.querySelectorAll('.menu-item-title, .weq-gallery-menu-item')).map((el) =>
        el.textContent?.trim()
      );
      expect(items).toContain('Rename');
      expect(items).toContain('Delete');

      // Test Rename option activates inline rename on section title
      const renameItem = Array.from(menu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Rename')
      ) as HTMLElement;
      expect(renameItem).not.toBeNull();
      renameItem.click();

      const secTitleEl = secHeader.querySelector('.weq-gallery-section-title') as HTMLElement;
      const renameInput = secTitleEl.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      expect(renameInput.value).toBe(targetSection.name);

      // Cancel rename
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // Test Delete option
      secHeader.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        })
      );
      const newMenu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      const deleteItem = Array.from(newMenu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Delete')
      ) as HTMLElement;
      deleteItem.click();
      await new Promise((r) => setTimeout(r, 20));

      expect(currentTab.sections.length).toBe(initialSecCount - 1);
      expect(currentTab.sections.some((s) => s.id === targetSection.id)).toBe(false);
    });
  });

  // =========================================================================
  // BUG 5: In-Cell Editing Container Padding Visual Bug
  // =========================================================================
  describe('Bug 5: Gallery Cell Editing — Padding Visual Bug', () => {
    it('in-cell editor container applies 4px 6px padding and border-box sizing', async () => {
      await gallery.onOpen();
      const cell: GalleryCell = { id: 'test-cell', name: 'Test Cell', mathml: '<mi>x</mi>' };
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell') as HTMLElement;

      gallery.startEditingCell(cell, cellEl);
      const editorContainer = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
      expect(editorContainer).not.toBeNull();
      expect(editorContainer.style.padding).toBe('4px 6px');
      expect(editorContainer.style.boxSizing).toBe('border-box');

      // Verify styles.css specifies padding: 4px 6px !important and box-sizing: border-box !important
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor\s*\{[\s\S]*?padding:\s*4px 6px !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor\s*\{[\s\S]*?box-sizing:\s*border-box !important;/);
    });
  });

  // =========================================================================
  // BUG 6: Gallery Cell Placeholder Misorientation (Vertical Centering)
  // =========================================================================
  describe('Bug 6: Gallery Cell Placeholder Misorientation', () => {
    it('del-norm and fenced structures have flex centering and vertical-align in styles.css', async () => {
      await gallery.onOpen();
      const normCell: GalleryCell = {
        id: 'del-norm',
        name: 'Norm',
        mathml: '<mfenced open="‖" close="‖"><mrow></mrow></mfenced>',
      };

      const dom = gallery.createStaticCellDom(normCell);
      expect(dom).not.toBeNull();
      const fenced = dom.querySelector('.eq-fenced');
      expect(fenced).not.toBeNull();
      expect(fenced?.querySelector('.eq-fence-open')).not.toBeNull();
      expect(fenced?.querySelector('.eq-fence-close')).not.toBeNull();
      expect(fenced?.querySelector('.eq-placeholder')).not.toBeNull();

      // Verify styles.css contains vertical-align: middle and line-height: 1 rules
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.eq-fenced\s*\{[\s\S]*?display:\s*inline-flex;/);
      expect(cssContent).toMatch(/\.eq-fenced\s*\{[\s\S]*?vertical-align:\s*middle;/);
      expect(cssContent).toMatch(/\.eq-fence-open,\s*\.eq-fence-close\s*\{[\s\S]*?vertical-align:\s*middle;/);
      expect(cssContent).toMatch(/\.eq-placeholder\s*\{[\s\S]*?vertical-align:\s*middle;/);
      expect(cssContent).toMatch(/\.eq-placeholder\s*\{[\s\S]*?line-height:\s*1;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell \.eq-placeholder\s*\{[\s\S]*?vertical-align:\s*middle !important;/);
    });
  });

  // =========================================================================
  // BUG 7: Tab Rename Carries Over Name to Other Tabs
  // =========================================================================
  describe('Bug 7: Tab Rename Carries Over Name to Other Tabs', () => {
    it('creating a new tab then double-clicking another tab pre-fills with clicked tab own name', async () => {
      await gallery.onOpen();
      const firstTab = gallery.tabs[0]; // e.g. 'Letters & Alphabets'

      // 1. Create a new tab (gets default name 'New Tab')
      const newTab = gallery.createTabWithName('New Tab');
      expect(newTab.name).toBe('New Tab');

      // 2. Switch back to the first tab
      gallery.setActiveTab(firstTab.id);

      // 3. Double-click the first tab's button in the sidebar
      const firstTabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${firstTab.id}"]`
      ) as HTMLElement;
      expect(firstTabBtn).not.toBeNull();
      firstTabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      // 4. Assert inline rename input is pre-filled with firstTab's actual name, NOT 'New Tab'
      const renameInput = firstTabBtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      expect(renameInput.value).toBe(firstTab.name);
      expect(renameInput.value).not.toBe('New Tab');

      // 5. Commit a rename on firstTab
      renameInput.value = 'Greek & Hebrew';
      renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      // 6. Assert firstTab is updated, while newTab remains 'New Tab'
      expect(firstTab.name).toBe('Greek & Hebrew');
      expect(newTab.name).toBe('New Tab');
    });

    it('active rename cleanup commits or cancels when switching tabs', async () => {
      await gallery.onOpen();
      const tab1 = gallery.tabs[0];
      const tab2 = gallery.tabs[1];

      // Double-click tab1 to start rename
      const tab1Btn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${tab1.id}"]`
      ) as HTMLElement;
      tab1Btn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      const renameInput = tab1Btn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(renameInput).not.toBeNull();
      renameInput.value = 'Changed Tab 1';

      // Switching tabs activates activeRenameCleanup
      gallery.setActiveTab(tab2.id);

      // Renaming is committed and input is removed
      expect(tab1.name).toBe('Changed Tab 1');
      expect(tab1Btn.querySelector('.weq-gallery-rename-input')).toBeNull();
    });
  });

  // =========================================================================
  // BUG 8: Remove Tab Name from Gallery Panel Header Area
  // =========================================================================
  describe('Bug 8: Remove Tab Name from Gallery Panel Header', () => {
    it('tab title subtitle is not rendered in header area', async () => {
      await gallery.onOpen();

      // Main header title exists
      const titleEl = gallery.contentEl.querySelector('.weq-gallery-tab-header .weq-gallery-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl?.textContent).toBe('Equation Gallery');

      // Subtitle .weq-gallery-active-tab-title is removed
      const activeSubtitle = gallery.contentEl.querySelector('.weq-gallery-active-tab-title');
      expect(activeSubtitle).toBeNull();

      // Tab names appear solely on sidebar buttons
      const sidebarLabels = gallery.contentEl.querySelectorAll('.weq-gallery-tab-sidebar .weq-gallery-tab-label');
      expect(sidebarLabels.length).toBe(gallery.tabs.length);
      expect(sidebarLabels[0].textContent).toBe(gallery.tabs[0].name);

      // Switching tabs does not re-add active title to header
      if (gallery.tabs.length > 1) {
        gallery.setActiveTab(gallery.tabs[1].id);
        expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();
      }
    });
  });

  // =========================================================================
  // BUG 9: Tab Rename Input Width Matches Tab Button Width
  // =========================================================================
  describe('Bug 9: Tab Rename Input Width Sizing', () => {
    it('rename input inside sidebar tab button is styled to fit button bounds', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const tabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`
      ) as HTMLElement;

      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const labelSpan = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;
      const renameInput = labelSpan.querySelector('.weq-gallery-rename-input') as HTMLInputElement;

      expect(renameInput).not.toBeNull();
      expect(labelSpan.style.width).toBe('100%');
      expect(labelSpan.style.boxSizing).toBe('border-box');

      // Verify styles.css scopes .weq-gallery-tab-btn .weq-gallery-rename-input
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn \.weq-gallery-rename-input\s*\{[\s\S]*?width:\s*100% !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn \.weq-gallery-rename-input\s*\{[\s\S]*?max-width:\s*100% !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn \.weq-gallery-rename-input\s*\{[\s\S]*?box-sizing:\s*border-box !important;/);
    });
  });

  // =========================================================================
  // BUG 10: Gallery Cell X-Expansion for Piecewise Functions (3-4 Columns)
  // =========================================================================
  describe('Bug 10: Gallery Cell X-Expansion (Piecewise Functions & .weq-span-4x2)', () => {
    it('calculates 4 columns for piecewise function preset and honors cell.spanX', () => {
      const piecewise = PRESET_GALLERY_TABS.flatMap((t) => t.sections)
        .flatMap((s) => s.cells)
        .find((c) => c.id === 'piecewise-fn')!;
      expect(piecewise).toBeDefined();

      const span = calculateCellSpan(piecewise);
      expect(span.spanX).toBe(4);
      expect(span.spanY).toBe(2);
    });

    it('expands multi-definition tables with mtext condition strings to at least 3-4 columns', () => {
      const customPiecewise: GalleryCell = {
        id: 'custom-piecewise-fn',
        name: 'Custom Piecewise',
        mathml: '<mfenced open="{" close=""><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mtext>if x &gt; 0</mtext></mtd></mtr><mtr><mtd><mn>0</mn></mtd><mtd><mtext>otherwise</mtext></mtd></mtr></mtable></mfenced>',
      };

      const span = calculateCellSpan(customPiecewise);
      expect(span.spanX).toBeGreaterThanOrEqual(4);
      expect(span.spanY).toBe(2);
    });

    it('styles.css contains .weq-gallery-cell.weq-span-4x2 rule', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(
        /\.weq-gallery-cell\.weq-span-4x2\s*\{[\s\S]*?grid-column:\s*span 4;\s*grid-row:\s*span 2;/
      );
    });

    it('finishEditingCell computes span before clearing DOM and updates classes', () => {
      const cell: GalleryCell = {
        id: 'piecewise-fn',
        name: 'Piecewise Function',
        mathml: '<mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo><mfenced open="{" close=""><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow><mtext>if </mtext><mrow></mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow><mtext>otherwise</mtext></mrow></mtd></mtr></mtable></mfenced></mrow>',
        spanX: 4,
        spanY: 2,
      };

      const cellEl = document.createElement('button');
      cellEl.className = 'weq-gallery-cell is-editing';
      const editorDiv = document.createElement('div');
      editorDiv.className = 'weq-gallery-cell-editor';
      cellEl.appendChild(editorDiv);

      gallery.finishEditingCell(cell, cellEl);

      expect(cell.spanX).toBe(4);
      expect(cell.spanY).toBe(2);
      expect(cellEl.getAttribute('data-span-x')).toBe('4');
      expect(cellEl.getAttribute('data-span-y')).toBe('2');
      expect(cellEl.classList.contains('weq-span-x-4')).toBe(true);
      expect(cellEl.classList.contains('weq-span-4x2')).toBe(true);
    });
  });
});
