import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App, WorkspaceLeaf } from 'obsidian';
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

describe('Adversarial Challenger Gen68: Track B Stress Tests (Bugs 1, 5, 6, 7, 8, 9, 10)', () => {
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
  // 1. ADVERSARIAL STRESS: BUG 1 (Context Menus & Deletion Robustness)
  // =========================================================================
  describe('Adversarial Stress: Bug 1 & 8 Context Menus & Lifecycle', () => {
    it('rapid successive right-clicks replace active context menu without leaking DOM nodes', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const sec = tab.sections[0];
      const cell1 = sec.cells[0];
      const cell2 = sec.cells[1];

      const cell1El = gallery.contentEl.querySelector(`.weq-gallery-cell[data-item="${cell1.id}"]`) as HTMLElement;
      const cell2El = gallery.contentEl.querySelector(`.weq-gallery-cell[data-item="${cell2.id}"]`) as HTMLElement;

      // First right click
      cell1El.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
      const menus1 = document.querySelectorAll('.menu, .weq-gallery-context-menu');
      expect(menus1.length).toBe(1);

      // Second right click on another cell
      cell2El.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      const menus2 = document.querySelectorAll('.menu, .weq-gallery-context-menu');
      expect(menus2.length).toBe(1);

      // Outside click dismisses menu
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(gallery.activeContextMenu).toBeNull();
    });

    it('deleting the last remaining cell in a section leaves section empty with functional Add Cell button', async () => {
      await gallery.onOpen();
      const customTab = gallery.createTabWithName('Solo Tab');
      const customSec = gallery.createSectionWithName(customTab, 'Solo Section');
      const cell: GalleryCell = { id: 'solo-cell-1', name: 'Solo', mathml: '<mi>z</mi>' };
      customSec.cells.push(cell);
      await gallery.onOpen();

      expect(customSec.cells.length).toBe(1);
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-item="solo-cell-1"]`) as HTMLElement;
      expect(cellEl).not.toBeNull();

      // Right click and Delete
      cellEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      const deleteItem = Array.from(menu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Delete')
      ) as HTMLElement;
      deleteItem.click();
      await new Promise((r) => setTimeout(r, 20));

      expect(customSec.cells.length).toBe(0);
      expect(gallery.staticRenderCache.has('solo-cell-1')).toBe(false);

      // Verify Add Cell (+) button is still present in the empty section
      const secEl = gallery.contentEl.querySelector(`.weq-gallery-section[data-section-id="${customSec.id}"]`);
      const addBtn = secEl?.querySelector('.weq-gallery-add-cell-btn') as HTMLElement;
      expect(addBtn).not.toBeNull();

      // Click Add Cell to ensure recovery works
      addBtn.click();
      expect(customSec.cells.length).toBe(1);
    });

    it('deleting the active tab shifts activeTabId to an available tab and maintains view integrity', async () => {
      await gallery.onOpen();
      const initialTabCount = gallery.tabs.length;
      const tabToDelete = gallery.tabs[0];
      const nextTab = gallery.tabs[1];
      gallery.setActiveTab(tabToDelete.id);

      const tabBtn = gallery.contentEl.querySelector(
        `.weq-gallery-tab-btn[data-tab-id="${tabToDelete.id}"]`
      ) as HTMLElement;

      tabBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      const deleteItem = Array.from(menu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Delete')
      ) as HTMLElement;
      deleteItem.click();
      await new Promise((r) => setTimeout(r, 20));

      expect(gallery.tabs.length).toBe(initialTabCount - 1);
      expect(gallery.tabs.some((t) => t.id === tabToDelete.id)).toBe(false);
      // Active tab shifted away from deleted tab
      expect(gallery.activeTabId).toBe(nextTab.id);
      expect(gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${nextTab.id}"].is-active`)).not.toBeNull();
    });

    it('deleting all tabs down to zero does not crash onOpen and Add Tab button remains functional', async () => {
      await gallery.onOpen();
      gallery.tabs = [];
      gallery.activeTabId = '';
      await expect(gallery.onOpen()).resolves.not.toThrow();

      const addTabBtn = gallery.contentEl.querySelector('.weq-gallery-add-tab-btn') as HTMLElement;
      expect(addTabBtn).not.toBeNull();

      // Add a new tab from zero state
      addTabBtn.click();
      expect(gallery.tabs.length).toBe(1);
      expect(gallery.activeTabId).toBe(gallery.tabs[0].id);
    });

    it('section header context menu Delete removes section and updates storage', async () => {
      await gallery.onOpen();
      const currentTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const initialSecCount = currentTab.sections.length;
      const secToDelete = currentTab.sections[0];

      const secEl = gallery.contentEl.querySelector(
        `.weq-gallery-section[data-section-id="${secToDelete.id}"]`
      ) as HTMLElement;
      const secHeader = secEl.querySelector('.weq-gallery-section-header') as HTMLElement;

      secHeader.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      const deleteItem = Array.from(menu.querySelectorAll('.menu-item, .weq-gallery-menu-item')).find((el) =>
        el.textContent?.includes('Delete')
      ) as HTMLElement;
      deleteItem.click();
      await new Promise((r) => setTimeout(r, 20));

      expect(currentTab.sections.length).toBe(initialSecCount - 1);
      expect(currentTab.sections.some((s) => s.id === secToDelete.id)).toBe(false);
      expect(plugin.settings.galleryTabs).toBeDefined();
    });
  });

  // =========================================================================
  // 2. ADVERSARIAL STRESS: BUG 5 (In-Cell Editing Padding & Insets)
  // =========================================================================
  describe('Adversarial Stress: Bug 5 Cell Editing Padding', () => {
    it('editing cells of varied spans (1x1, 2x1, 3x2, 4x2) all enforce 4px 6px padding and border-box', async () => {
      await gallery.onOpen();
      const testCells: GalleryCell[] = [
        { id: 'cell-1x1', name: '1x1 Cell', mathml: '<mi>a</mi>', spanX: 1, spanY: 1 },
        { id: 'cell-2x1', name: '2x1 Cell', mathml: '<mfrac><mi>a</mi><mi>b</mi></mfrac>', spanX: 2, spanY: 1 },
        { id: 'cell-3x2', name: '3x2 Cell', mathml: '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr></mtable>', spanX: 3, spanY: 2 },
        { id: 'cell-4x2', name: '4x2 Cell', mathml: '<mtable><mtr><mtd><mtext>if x &gt; 0</mtext></mtd></mtr></mtable>', spanX: 4, spanY: 2 },
      ];

      for (const cell of testCells) {
        const cellEl = document.createElement('button');
        gallery.contentEl.appendChild(cellEl);

        gallery.startEditingCell(cell, cellEl);
        const editor = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
        expect(editor).not.toBeNull();
        expect(editor.style.padding).toBe('4px 6px');
        expect(editor.style.boxSizing).toBe('border-box');
        expect(cellEl.classList.contains('is-editing')).toBe(true);

        gallery.finishEditingCell(cell, cellEl);
        expect(cellEl.classList.contains('is-editing')).toBe(false);
      }
    });

    it('styles.css contains strict rules for editor padding and zero inner math border', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor\s*\{[\s\S]*?padding:\s*4px 6px !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor\s*\{[\s\S]*?box-sizing:\s*border-box !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor\s*\{[\s\S]*?display:\s*flex !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor\s*\{[\s\S]*?align-items:\s*center !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell-editor\s*\{[\s\S]*?justify-content:\s*center !important;/);
    });
  });

  // =========================================================================
  // 3. ADVERSARIAL STRESS: BUG 6 (Placeholder Centering Invariants)
  // =========================================================================
  describe('Adversarial Stress: Bug 6 Placeholder Centering Invariants', () => {
    it('all delimiter constructs and empty placeholder structures render with correct DOM hierarchy', async () => {
      await gallery.onOpen();
      const testCases: GalleryCell[] = [
        { id: 'del-norm', name: 'Norm', mathml: '<mfenced open="‖" close="‖"><mrow></mrow></mfenced>' },
        { id: 'del-abs', name: 'Abs', mathml: '<mfenced open="|" close="|"><mrow></mrow></mfenced>' },
        { id: 'del-bracket', name: 'Bracket', mathml: '<mfenced open="[" close="]"><mrow></mrow></mfenced>' },
        { id: 'del-brace', name: 'Brace', mathml: '<mfenced open="{" close="}"><mrow></mrow></mfenced>' },
        { id: 'mat-empty', name: 'Matrix 1x2', mathml: '<mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable>' },
      ];

      for (const tc of testCases) {
        const dom = gallery.createStaticCellDom(tc);
        expect(dom).not.toBeNull();
        const placeholders = dom.querySelectorAll('.eq-placeholder');
        expect(placeholders.length).toBeGreaterThan(0);
        placeholders.forEach((ph) => {
          expect(ph.textContent).toBe('⬚');
        });
      }
    });

    it('styles.css guarantees vertical-align: middle and line-height: 1 across placeholders, fences, and slots', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.eq-fenced\s*\{[\s\S]*?vertical-align:\s*middle;/);
      expect(cssContent).toMatch(/\.eq-fence-open,\s*\.eq-fence-close\s*\{[\s\S]*?vertical-align:\s*middle;/);
      expect(cssContent).toMatch(/\.eq-fence-open,\s*\.eq-fence-close\s*\{[\s\S]*?line-height:\s*1;/);
      expect(cssContent).toMatch(/\.eq-placeholder\s*\{[\s\S]*?vertical-align:\s*middle;/);
      expect(cssContent).toMatch(/\.eq-placeholder\s*\{[\s\S]*?line-height:\s*1;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell \.eq-placeholder\s*\{[\s\S]*?vertical-align:\s*middle !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell \.eq-placeholder\s*\{[\s\S]*?line-height:\s*1 !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-cell \.eq-placeholder\s*\{[\s\S]*?align-self:\s*center !important;/);
    });
  });

  // =========================================================================
  // 4. ADVERSARIAL STRESS: BUG 7 (Tab Rename Lifecycle & Stale Closures)
  // =========================================================================
  describe('Adversarial Stress: Bug 7 Tab Rename Lifecycle & No Stale Names', () => {
    it('chained tab additions and cross-tab switching always pre-fills clicked tab own name', async () => {
      await gallery.onOpen();
      const tabA = gallery.createTabWithName('Tab Alpha');
      const tabB = gallery.createTabWithName('Tab Beta');
      const tabC = gallery.createTabWithName('Tab Gamma');

      // Click tabA and start rename
      gallery.setActiveTab(tabA.id);
      const tabABtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tabA.id}"]`) as HTMLElement;
      tabABtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      let input = tabABtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(input.value).toBe('Tab Alpha');

      // Type partial edit on tabA but switch to tabC without pressing Enter
      input.value = 'Tab Alpha Edited';
      gallery.setActiveTab(tabC.id);

      // Verify tabA was cleanly committed via activeRenameCleanup
      expect(tabA.name).toBe('Tab Alpha Edited');
      expect(tabABtn.querySelector('.weq-gallery-rename-input')).toBeNull();

      // Double-click tabC button
      const tabCBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tabC.id}"]`) as HTMLElement;
      tabCBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      input = tabCBtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      expect(input).not.toBeNull();
      // Must be 'Tab Gamma', NEVER 'Tab Alpha Edited' or 'New Tab'
      expect(input.value).toBe('Tab Gamma');
    });

    it('cancelling rename via Escape leaves tab name unchanged', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const originalName = tab.name;

      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`) as HTMLElement;
      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      const input = tabBtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      input.value = 'Accidental Keystroke';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(tab.name).toBe(originalName);
      expect(tabBtn.querySelector('.weq-gallery-rename-input')).toBeNull();
    });

    it('empty or whitespace input during rename falls back to original name', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const originalName = tab.name;

      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`) as HTMLElement;
      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      const input = tabBtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      input.value = '   ';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(tab.name).toBe(originalName);
    });

    it('closing view (onClose) cleanly commits any in-flight rename', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];

      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`) as HTMLElement;
      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      const input = tabBtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      input.value = 'Cleanly Committed On Close';

      await gallery.onClose();
      expect(tab.name).toBe('Cleanly Committed On Close');
      expect(gallery.activeRenameCleanup).toBeNull();
    });
  });

  // =========================================================================
  // 5. ADVERSARIAL STRESS: BUG 8 (Header Subtitle Invariant)
  // =========================================================================
  describe('Adversarial Stress: Bug 8 Header Redundancy Elimination', () => {
    it('under all tab switching, creation, and deletion sequences, active-tab-title is NEVER in DOM', async () => {
      await gallery.onOpen();

      for (let i = 0; i < gallery.tabs.length; i++) {
        gallery.setActiveTab(gallery.tabs[i].id);
        expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();
      }

      // Add 3 tabs
      const t1 = gallery.createTabWithName('T1');
      const t2 = gallery.createTabWithName('T2');
      const t3 = gallery.createTabWithName('T3');

      expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();

      gallery.setActiveTab(t2.id);
      expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();

      // Delete t1
      gallery.tabs = gallery.tabs.filter((t) => t.id !== t1.id);
      await gallery.onOpen();
      expect(gallery.contentEl.querySelector('.weq-gallery-active-tab-title')).toBeNull();

      // Header contains ONLY the main title
      const header = gallery.contentEl.querySelector('.weq-gallery-tab-header');
      expect(header).not.toBeNull();
      expect(header?.children.length).toBe(1);
      expect(header?.firstElementChild?.textContent).toBe('Equation Gallery');
    });
  });

  // =========================================================================
  // 6. ADVERSARIAL STRESS: BUG 9 (Tab Rename Input Sizing)
  // =========================================================================
  describe('Adversarial Stress: Bug 9 Tab Rename Input Sizing', () => {
    it('rename input inside 36px tab button enforces flex container and 100% width box-sizing', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`) as HTMLElement;

      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const label = tabBtn.querySelector('.weq-gallery-tab-label') as HTMLElement;
      const input = label.querySelector('.weq-gallery-rename-input') as HTMLInputElement;

      expect(label.style.width).toBe('100%');
      expect(label.style.boxSizing).toBe('border-box');
      expect(label.style.display).toBe('flex');
      expect(label.style.justifyContent).toBe('center');
      expect(label.style.alignItems).toBe('center');

      // Check scoped CSS rules in styles.css
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn \.weq-gallery-rename-input\s*\{[\s\S]*?width:\s*100% !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn \.weq-gallery-rename-input\s*\{[\s\S]*?max-width:\s*100% !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn \.weq-gallery-rename-input\s*\{[\s\S]*?box-sizing:\s*border-box !important;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn \.weq-gallery-rename-input\s*\{[\s\S]*?min-width:\s*0 !important;/);
    });

    it('long names (100 characters) fit cleanly inside input without breaking tab button container', async () => {
      await gallery.onOpen();
      const tab = gallery.tabs[0];
      const tabBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`) as HTMLElement;

      tabBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const input = tabBtn.querySelector('.weq-gallery-rename-input') as HTMLInputElement;
      input.value = 'A'.repeat(100);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(tab.name).toBe('A'.repeat(100));
      expect(tabBtn.querySelector('.weq-gallery-rename-input')).toBeNull();
    });
  });

  // =========================================================================
  // 7. ADVERSARIAL STRESS: BUG 10 (Piecewise Function X-Expansion & Shrinking)
  // =========================================================================
  describe('Adversarial Stress: Bug 10 Piecewise Function X-Expansion', () => {
    it('piecewise function preset resolves to 4 columns and 2 rows', () => {
      const piecewiseCell = PRESET_GALLERY_TABS.flatMap((t) => t.sections)
        .flatMap((s) => s.cells)
        .find((c) => c.id === 'piecewise-fn');
      expect(piecewiseCell).toBeDefined();

      const span = calculateCellSpan(piecewiseCell!);
      expect(span.spanX).toBe(4);
      expect(span.spanY).toBe(2);
    });

    it('piecewise function with short conditions resolves to at least 3 columns', () => {
      const shortPiecewise: GalleryCell = {
        id: 'short-piecewise',
        name: 'Short Piecewise',
        mathml: '<mfenced open="{" close=""><mtable><mtr><mtd><mi>x</mi></mtd><mtd><mi>c</mi></mtd></mtr><mtr><mtd><mi>y</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable></mfenced>',
      };

      const span = calculateCellSpan(shortPiecewise);
      expect(span.spanX).toBeGreaterThanOrEqual(3);
      expect(span.spanY).toBe(2);
    });

    it('piecewise function with mtext condition string resolves to 4 columns', () => {
      const longPiecewise: GalleryCell = {
        id: 'cell-piecewise-text',
        name: 'Piecewise Text',
        mathml: '<mfenced open="{" close=""><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mtext>if x &gt; 0</mtext></mtd></mtr><mtr><mtd><mn>0</mn></mtd><mtd><mtext>otherwise</mtext></mtd></mtr></mtable></mfenced>',
      };

      const span = calculateCellSpan(longPiecewise);
      expect(span.spanX).toBe(4);
      expect(span.spanY).toBe(2);
    });

    it('editing a 4x2 piecewise cell into a scalar formula shrinks it back to 1x1 bidirectionally', () => {
      const cell: GalleryCell = {
        id: 'piecewise-fn',
        name: 'Piecewise Function',
        mathml: '<mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo><mo>=</mo><mfenced open="{" close=""><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow><mtext>if </mtext><mrow></mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow><mtext>otherwise</mtext></mrow></mtd></mtr></mtable></mfenced></mrow>',
        spanX: 4,
        spanY: 2,
      };

      const cellEl = document.createElement('button');
      cellEl.className = 'equation-gallery-btn weq-gallery-cell weq-gallery-item weq-span-x-4 weq-span-y-2 weq-span-4x2';

      // Live update editing to scalar <mi>x</mi>
      gallery.updateCellSpanLive(cell, cellEl, '<mi>x</mi>');

      expect(cell.spanX).toBe(1);
      expect(cell.spanY).toBe(1);
      expect(cellEl.getAttribute('data-span-x')).toBe('1');
      expect(cellEl.getAttribute('data-span-y')).toBe('1');
      expect(cellEl.classList.contains('weq-span-x-1')).toBe(true);
      expect(cellEl.classList.contains('weq-span-y-1')).toBe(true);
      expect(cellEl.classList.contains('weq-span-4x2')).toBe(false);
      expect(cellEl.classList.contains('weq-span-x-4')).toBe(false);
    });

    it('styles.css defines .weq-gallery-cell.weq-span-4x2 with grid-column span 4 and grid-row span 2', () => {
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(
        /\.weq-gallery-cell\.weq-span-4x2\s*\{[\s\S]*?grid-column:\s*span 4;\s*grid-row:\s*span 2;/
      );
    });
  });
});
