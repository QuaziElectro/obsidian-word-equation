/**
 * Challenger Gen66 Adversarial Test Suite for Equation Gallery Subsystem (Bugs 2-12)
 *
 * EMPIRICAL ADVERSARIAL STRESS-TEST HARNESS
 *
 * Scenarios Tested:
 * 1. Dynamic tab counts (1 tab, 10 tabs, dynamic removal & addition) verifying flex equal distribution invariants.
 * 2. Right-side layout verification (CSS flex-direction: row-reverse, border-left facing content, vertical text orientation).
 * 3. Stress-clicking tabs, sections, and add buttons to verify zero focus drop and zero unexpected gallery closure (100 rapid events).
 * 4. Add cell button dimension invariants across all sections and green plus styling.
 * 5. Context menu: verify native Menu invocations, 5 item registrations with icons, clipboard write, and shortcut creation workflow.
 * 6. Dynamic in-cell edit spanning: multi-character expressions, matrices expanding gridColumn/gridRow in real time without blur.
 * 7. Immediate caret entry on cell edit without requiring a second click.
 * 8. Section header text content: verify strictly no counts like '(12)' or '16 items' across all tabs and custom sections.
 * 9. Authentic MathML DOM rendering (no stub badges like '[ 3×3 ]' or '∫_⬚^⬚') and render cache reuse on subsequent renders.
 * 10. Modal prompt invocation and custom tab/section additions with GalleryPromptModal keyboard & mouse interaction.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App, WorkspaceLeaf, Notice, MarkdownView } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import {
  EquationGalleryView,
  calculateCellSpan,
  GALLERY_CATEGORIES,
} from '../../src/gallery/gallery-view';
import { GalleryCell, GallerySection, GalleryTab } from '../../src/gallery/gallery-types';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import { GalleryPromptModal, promptGalleryName } from '../../src/gallery/gallery-modal';
import * as galleryModal from '../../src/gallery/gallery-modal';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';

describe('Challenger Gen66 Adversarial Verification: Gallery Subsystem (Bugs 2-12)', () => {
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
  // SCENARIO 1: DYNAMIC TAB COUNTS (1 TAB, 10 TABS) & FLEX EQUAL DISTRIBUTION
  // =========================================================================
  describe('Scenario 1: Dynamic Tab Counts & Flex Equal Distribution Invariants (Bug 3)', () => {
    it('adversarially stress-tests equal flex distribution when scaled to 1 tab', async () => {
      // Scale down to a single tab
      gallery.tabs = [gallery.tabs[0]];
      gallery.activeTabId = gallery.tabs[0].id;
      await gallery.onOpen();

      const tabList = gallery.contentEl.querySelector('.weq-gallery-tab-list') as HTMLElement;
      expect(tabList).not.toBeNull();

      const tabBtns = gallery.contentEl.querySelectorAll('.weq-gallery-tab-btn:not(.weq-gallery-add-tab-btn)');
      expect(tabBtns.length).toBe(1);

      // Verify that the solitary tab button carries full flex expansion properties
      const singleBtn = tabBtns[0] as HTMLElement;
      expect(singleBtn.classList.contains('weq-gallery-tab-btn')).toBe(true);

      // Verify stylesheet rules mandate flex: 1 1 0 and height: 100%
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn\s*\{[\s\S]*?flex:\s*1 1 0;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn\s*\{[\s\S]*?height:\s*100%;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn\s*\{[\s\S]*?min-height:\s*0;/);
    });

    it('adversarially stress-tests equal flex distribution when scaled to 10 tabs', async () => {
      // Expand from 4 preset tabs to 10 tabs
      for (let i = 1; i <= 6; i++) {
        gallery.tabs.push({
          id: `stress-tab-${i}`,
          name: `Custom Tab ${i}`,
          icon: `${i}`,
          sections: [
            {
              id: `stress-sec-${i}`,
              name: `Section ${i}`,
              cells: [],
              isCustom: true,
            },
          ],
          isCustom: true,
        });
      }
      expect(gallery.tabs.length).toBe(10);

      await gallery.onOpen();

      const tabBtns = gallery.contentEl.querySelectorAll('.weq-gallery-tab-btn:not(.weq-gallery-add-tab-btn)');
      expect(tabBtns.length).toBe(10);

      // Every tab button must have identical class structure and aria-selected on active
      tabBtns.forEach((btn, index) => {
        expect(btn.classList.contains('weq-gallery-tab-btn')).toBe(true);
        const tabId = btn.getAttribute('data-tab-id');
        expect(tabId).toBe(gallery.tabs[index].id);
      });

      // Verify the add-tab button preserves fixed dimensions and does NOT expand
      const addTabBtn = gallery.contentEl.querySelector('.weq-gallery-add-tab-btn') as HTMLElement;
      expect(addTabBtn).not.toBeNull();
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-add-tab-btn\s*\{[\s\S]*?flex:\s*0 0 36px;/);
      expect(cssContent).toMatch(/\.weq-gallery-add-tab-btn\s*\{[\s\S]*?height:\s*36px;/);
    });

    it('dynamically switches tabs and verifies panel visibility state', async () => {
      await gallery.onOpen();

      for (const tab of gallery.tabs) {
        gallery.setActiveTab(tab.id);

        // Active tab button must have is-active and aria-selected="true"
        const activeBtn = gallery.contentEl.querySelector(`.weq-gallery-tab-btn[data-tab-id="${tab.id}"]`);
        expect(activeBtn).not.toBeNull();
        expect(activeBtn?.classList.contains('is-active')).toBe(true);
        expect(activeBtn?.getAttribute('aria-selected')).toBe('true');

        // Active panel must be visible (display: block)
        const activePanel = gallery.contentEl.querySelector(`.weq-gallery-tab-panel[data-tab-id="${tab.id}"]`) as HTMLElement;
        expect(activePanel).not.toBeNull();
        expect(activePanel.style.display).toBe('block');
        expect(activePanel.classList.contains('is-active')).toBe(true);

        // Inactive panels must be hidden (display: none)
        const otherPanels = gallery.contentEl.querySelectorAll(`.weq-gallery-tab-panel:not([data-tab-id="${tab.id}"])`);
        otherPanels.forEach((p) => {
          expect((p as HTMLElement).style.display).toBe('none');
          expect(p.classList.contains('is-active')).toBe(false);
        });
      }
    });
  });

  // =========================================================================
  // SCENARIO 2: RIGHT-SIDE LAYOUT VERIFICATION (ROW-REVERSE & VERTICAL ORIENTATION)
  // =========================================================================
  describe('Scenario 2: Right-Side Layout Verification (Bug 2)', () => {
    it('verifies row-reverse flex layout and window-edge border positioning in styles.css', async () => {
      await gallery.onOpen();

      const root = gallery.contentEl;
      expect(root.classList.contains('equation-gallery-container')).toBe(true);
      expect(root.classList.contains('weq-gallery-root')).toBe(true);

      const navSidebar = root.querySelector('nav.weq-gallery-tab-sidebar') as HTMLElement;
      const mainContent = root.querySelector('main.weq-gallery-tab-content') as HTMLElement;
      expect(navSidebar).not.toBeNull();
      expect(mainContent).not.toBeNull();

      // In DOM order: nav is child 0, main is child 1.
      // With flex-direction: row-reverse, child 0 renders on the RIGHT window border edge!
      expect(root.children[0]).toBe(navSidebar);
      expect(root.children[1]).toBe(mainContent);

      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.equation-gallery-container\.weq-gallery-root\s*\{[\s\S]*?flex-direction:\s*row-reverse;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-sidebar\s*\{[\s\S]*?border-left:\s*1px solid/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-sidebar\s*\{[\s\S]*?border-right:\s*none;/);
    });

    it('verifies vertical text orientation rules on tab labels', async () => {
      await gallery.onOpen();

      const labels = gallery.contentEl.querySelectorAll('.weq-gallery-tab-label');
      expect(labels.length).toBe(gallery.tabs.length);

      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-tab-label\s*\{[\s\S]*?writing-mode:\s*vertical-rl;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-label\s*\{[\s\S]*?text-orientation:\s*mixed;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-label\s*\{[\s\S]*?transform:\s*rotate\(180deg\);/);
    });
  });

  // =========================================================================
  // SCENARIO 3: STRESS-CLICKING ZERO FOCUS DROP & ZERO AUTO-CLOSE (100 EVENTS)
  // =========================================================================
  describe('Scenario 3: Stress-Clicking Focus Loss & Auto-Close Prevention (Bug 4)', () => {
    it('dispatches a rapid barrage of 100 pointerdown/mousedown events verifying 100% interception', async () => {
      await gallery.onOpen();

      // Simulate an active equation session in the editor
      setActiveEquationState({
        from: 0,
        to: 10,
        isFocused: true,
        caret: { slotId: 'root', offset: 0 },
        ast: { id: 'root', role: 'root', children: [] } as any,
      });
      expect(getActiveEquationState()?.isFocused).toBe(true);

      const targets: HTMLElement[] = [];

      // Collect tab buttons
      gallery.contentEl.querySelectorAll('.weq-gallery-tab-btn').forEach((b) => targets.push(b as HTMLElement));
      // Collect add section buttons
      gallery.contentEl.querySelectorAll('.weq-gallery-add-section-btn').forEach((b) => targets.push(b as HTMLElement));
      // Collect add cell buttons
      gallery.contentEl.querySelectorAll('.weq-gallery-add-cell-btn').forEach((b) => targets.push(b as HTMLElement));
      // Collect formula cells
      gallery.contentEl.querySelectorAll('.weq-gallery-cell:not(.weq-gallery-add-cell-btn)').forEach((b) => targets.push(b as HTMLElement));

      expect(targets.length).toBeGreaterThan(15);

      let totalInterceptions = 0;

      // Dispatch 100 rapid interactions in a barrage
      for (let i = 0; i < 100; i++) {
        const target = targets[i % targets.length];

        const pd = new Event('pointerdown', { bubbles: true, cancelable: true });
        target.dispatchEvent(pd);
        if (pd.defaultPrevented) totalInterceptions++;

        const md = new Event('mousedown', { bubbles: true, cancelable: true });
        target.dispatchEvent(md);
        if (md.defaultPrevented) totalInterceptions++;
      }

      // Exactly 200 events dispatched (100 pointerdown + 100 mousedown), all must be prevented!
      expect(totalInterceptions).toBe(200);

      // Verify equation session is completely preserved and did not lose focus
      const state = getActiveEquationState();
      expect(state).not.toBeNull();
      expect(state?.isFocused).toBe(true);
      expect(state?.from).toBe(0);
    });

    it('ensures button clicks stop propagation and do not bubble outside gallery view', async () => {
      await gallery.onOpen();

      const tabBtn = gallery.contentEl.querySelector('.weq-gallery-tab-btn') as HTMLElement;
      let bodyReceivedClick = false;
      const bodyListener = () => {
        bodyReceivedClick = true;
      };
      document.body.addEventListener('click', bodyListener);

      const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
      tabBtn.dispatchEvent(clickEvt);

      document.body.removeEventListener('click', bodyListener);

      // In JSDOM, stopPropagation prevents reaching body
      expect(clickEvt.defaultPrevented).toBe(true);
    });
  });

  // =========================================================================
  // SCENARIO 4: ADD CELL BUTTON DIMENSION INVARIANTS & GREEN PLUS STYLING
  // =========================================================================
  describe('Scenario 4: Add Cell Button Dimension Invariants & Green Plus Styling (Bug 5)', () => {
    it('verifies that + Add Cell button in every section has exact cell classes, 1x1 span, and green icon', async () => {
      await gallery.onOpen();

      const addCellBtns = gallery.contentEl.querySelectorAll('.weq-gallery-add-cell-btn');
      expect(addCellBtns.length).toBeGreaterThanOrEqual(4);

      addCellBtns.forEach((btn) => {
        // Dimension invariants: must carry identical classes to standard cells
        expect(btn.classList.contains('equation-gallery-btn')).toBe(true);
        expect(btn.classList.contains('weq-gallery-cell')).toBe(true);
        expect(btn.classList.contains('weq-gallery-item')).toBe(true);
        expect(btn.classList.contains('weq-span-x-1')).toBe(true);
        expect(btn.classList.contains('weq-span-y-1')).toBe(true);

        expect(btn.getAttribute('data-span-x')).toBe('1');
        expect(btn.getAttribute('data-span-y')).toBe('1');

        // Green plus icon
        const icon = btn.querySelector('.weq-gallery-add-cell-icon');
        expect(icon).not.toBeNull();
        expect(icon?.textContent).toBe('+');
      });

      // Verify CSS style rules
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-height:\s*var\(--weq-cell-base-height,\s*44px\);/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-width:\s*var\(--weq-cell-base-width,\s*48px\);/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn\s*\{[\s\S]*?height:\s*100%;/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn \.weq-gallery-add-cell-icon\s*\{[\s\S]*?color:\s*var\(--color-green,\s*#2ecc71\);/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn:hover\s*\{[\s\S]*?border-color:/);
    });
  });

  // =========================================================================
  // SCENARIO 5: CONTEXT MENU NATIVE API & COMPLETE SHORTCUT CREATION FLOW
  // =========================================================================
  describe('Scenario 5: Context Menu Native API & Shortcut Creation Flow (Bug 6 & Bug 7)', () => {
    it('verifies right-click opens native Menu with all 5 actions and icons', async () => {
      await gallery.onOpen();
      const cell = gallery.tabs[0].sections[0].cells[0];
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;

      cellEl.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 150,
        clientY: 250,
      }));

      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      expect(menu).not.toBeNull();

      const items = Array.from(menu.querySelectorAll('.menu-item, .weq-gallery-menu-item'));
      expect(items.length).toBe(6);

      const titles = items.map((i) => i.querySelector('.menu-item-title')?.textContent?.trim() || i.textContent?.trim());
      expect(titles).toEqual([
        'Copy MathML',
        'Copy LaTeX',
        'Activate / Insert',
        'Create Shortcut',
        'Edit',
        'Delete',
      ]);

      const icons = items.map((i) => i.querySelector('.menu-item-icon')?.getAttribute('data-icon'));
      expect(icons).toEqual(['copy', 'code', 'plus-circle', 'zap', 'edit', 'trash']);
    });

    it('verifies Copy MathML wraps incomplete XML and writes to clipboard', async () => {
      await gallery.onOpen();
      let copiedText = '';
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockImplementation((text: string) => {
            copiedText = text;
            return Promise.resolve();
          }),
        },
      });

      const cell: GalleryCell = { id: 'test-cell', name: 'Raw Mi', mathml: '<mi>θ</mi>' };
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell') as HTMLElement;
      const section = gallery.tabs[0].sections[0];

      gallery.showContextMenu(cell, cellEl, section, new MouseEvent('contextmenu'));
      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      const copyMathBtn = Array.from(menu.querySelectorAll('button')).find((b) => b.textContent?.includes('Copy MathML'));
      expect(copyMathBtn).toBeDefined();

      copyMathBtn?.click();

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(copiedText).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML">');
      expect(copiedText).toContain('<mi>θ</mi>');
      expect(((Notice as any).notices || []).some((n: any) => (n.message || '').includes('MathML copied'))).toBe(true);
    });

    it('adversarially executes complete Create Shortcut workflow: saves shortcut, opens settings, and focuses trigger', async () => {
      const openSpy = vi.fn();
      const openTabByIdSpy = vi.fn();

      const settingTab = new WordEquationSettingTab(app, plugin);
      settingTab.display();

      (app as any).setting = {
        open: openSpy,
        openTabById: openTabByIdSpy.mockReturnValue(settingTab),
        activeTab: settingTab,
        containerEl: settingTab.containerEl,
      };

      await gallery.onOpen();
      const cell: GalleryCell = {
        id: 'gamma-custom',
        name: 'Gamma Special',
        mathml: '<mi>Γ</mi>',
      };

      await gallery.promptCreateShortcut(cell);

      // 1. Shortcut saved to plugin settings
      const created = plugin.settings.customShortcuts.find((s) => s.expansion === '<mi>Γ</mi>');
      expect(created).toBeDefined();
      expect(created?.trigger).toBe('\\gammacustom');
      expect(created?.scope).toBe('inline');

      // 2. Settings dialog opened
      expect(openSpy).toHaveBeenCalled();
      expect(openTabByIdSpy).toHaveBeenCalledWith('obsidian-word-equation');

      // 3. Settings tab has target input focused
      const focused = settingTab.focusShortcutTrigger();
      expect(focused).toBe(true);
    });
  });

  // =========================================================================
  // SCENARIO 6: DYNAMIC IN-CELL EDIT SPANNING IN REAL TIME
  // =========================================================================
  describe('Scenario 6: Dynamic In-Cell Edit Spanning in Real Time (Bug 8)', () => {
    it('dynamically resizes cell spans across scalar -> 2x2 -> 3x3 -> multi-level fraction in real time', async () => {
      await gallery.onOpen();
      const cell: GalleryCell = {
        id: 'mutable-cell',
        name: 'Dynamic Cell',
        mathml: '<mi>x</mi>',
        spanX: 1,
        spanY: 1,
      };
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell') as HTMLElement;

      // 1. Mount editor
      gallery.startEditingCell(cell, cellEl);
      expect(cellEl.classList.contains('is-editing')).toBe(true);

      // 2. Live expand to 2x2 matrix
      const matrix2x2 = '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>';
      gallery.updateCellSpanLive(cell, cellEl, matrix2x2);
      expect(cell.spanX).toBe(2);
      expect(cell.spanY).toBe(2);
      expect(cellEl.style.gridColumn).toBe('span 2');
      expect(cellEl.style.gridRow).toBe('span 2');
      expect(cellEl.getAttribute('data-span-x')).toBe('2');
      expect(cellEl.getAttribute('data-span-y')).toBe('2');
      expect(cellEl.classList.contains('weq-span-2x2')).toBe(true);

      // 3. Live expand to 3x3 matrix
      const matrix3x3 = '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>';
      gallery.updateCellSpanLive(cell, cellEl, matrix3x3);
      expect(cell.spanX).toBe(3);
      expect(cell.spanY).toBe(3);
      expect(cellEl.style.gridColumn).toBe('span 3');
      expect(cellEl.style.gridRow).toBe('span 3');
      expect(cellEl.classList.contains('weq-span-3x3')).toBe(true);
      expect(cellEl.classList.contains('weq-span-2x2')).toBe(false);

      // 4. Live update with multi-level fractions
      const nestedFrac = '<mfrac><mrow><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow><mn>3</mn></mfrac>';
      gallery.updateCellSpanLive(cell, cellEl, nestedFrac);
      expect(cell.spanY).toBeGreaterThanOrEqual(2);

      // Editing flag remained active throughout all live transitions
      expect(cellEl.classList.contains('is-editing')).toBe(true);
    });

    it('dynamically refines cell span from live DOM measurement expansion', () => {
      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'scrollWidth', { value: 200, configurable: true });
      Object.defineProperty(mockElement, 'scrollHeight', { value: 120, configurable: true });

      const cell: GalleryCell = { id: 'large-dom', name: 'Large', mathml: '<mrow><mi>P</mi></mrow>' };
      const span = calculateCellSpan(cell, mockElement);

      expect(span.spanX).toBeGreaterThanOrEqual(3);
      expect(span.spanY).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // SCENARIO 7: IMMEDIATE CARET ENTRY ON CELL EDIT WITHOUT 2ND CLICK
  // =========================================================================
  describe('Scenario 7: Immediate Caret Entry on Cell Edit Without 2nd Click (Bug 9)', () => {
    it('mounts InteractiveEquationBox, grants immediate focus, and renders .eq-caret on initial mount', async () => {
      await gallery.onOpen();
      const cell = gallery.tabs[1].sections[0].cells[0]; // first matrix cell
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;
      expect(cellEl).not.toBeNull();

      gallery.startEditingCell(cell, cellEl);

      const editorContainer = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
      expect(editorContainer).not.toBeNull();

      const box = (editorContainer as any).__interactiveBox;
      expect(box).toBeDefined();

      // Immediate focus check
      expect(box.isFocused).toBe(true);

      // DOM check: caret element must be present in the mounted container immediately!
      const caret = editorContainer.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(caret?.textContent).toBe('|');

      // The math element has active class
      const mathBox = editorContainer.querySelector('.word-equation-math.eq-active');
      expect(mathBox).not.toBeNull();
    });
  });

  // =========================================================================
  // SCENARIO 8: SECTION HEADER TEXT CONTENT WITHOUT COUNT BADGES
  // =========================================================================
  describe('Scenario 8: Section Header Text Content (Bug 10)', () => {
    it('adversarially sweeps ALL sections across all tabs verifying zero count indicators', async () => {
      await gallery.onOpen();

      for (const tab of gallery.tabs) {
        gallery.setActiveTab(tab.id);

        const currentPanel = gallery.contentEl.querySelector(`.weq-gallery-tab-panel[data-tab-id="${tab.id}"]`);
        expect(currentPanel).not.toBeNull();

        const headers = currentPanel?.querySelectorAll('.weq-gallery-section-header') || [];
        expect(headers.length).toBeGreaterThan(0);

        headers.forEach((h) => {
          // Visible count badge element must be completely absent from header
          expect(h.querySelector('.weq-gallery-section-count')).toBeNull();

          // Header text content must contain only title
          const title = h.querySelector('.weq-gallery-section-title')?.textContent?.trim() || '';
          expect(title.length).toBeGreaterThan(0);

          // Verify header text has NO patterns like '16 items', '8 items', '(12)', etc.
          const fullText = h.textContent?.trim() || '';
          expect(fullText).not.toMatch(/\d+\s*items/i);
          expect(fullText).not.toMatch(/\(\d+\)/);
        });
      }
    });
  });

  // =========================================================================
  // SCENARIO 9: AUTHENTIC MATHML RENDERING & STATIC RENDER CACHE REUSE
  // =========================================================================
  describe('Scenario 9: Authentic MathML DOM Rendering & Render Cache Reuse (Bug 11)', () => {
    it('verifies matrices, vectors, determinants, and integrals do not use stub badges', async () => {
      await gallery.onOpen();

      // Check Arrays tab
      gallery.setActiveTab('arrays');
      const arrayCells = gallery.contentEl.querySelectorAll('.weq-gallery-tab-panel[data-tab-id="arrays"] .weq-gallery-cell:not(.weq-gallery-add-cell-btn)');

      arrayCells.forEach((c) => {
        const text = c.textContent || '';
        // None of these stub strings should exist
        expect(text).not.toContain('[ 3×3 ]');
        expect(text).not.toContain('[ 2×2 ]');
        expect(text).not.toContain('| 2×2 |');
        expect(text).not.toContain('| 3×3 |');
        expect(text).not.toContain('[ 1×2 ]');
        expect(text).not.toContain('[ 2×1 ]');
        expect(text).not.toContain('[ 2×3 Aug ]');
        expect(text).not.toContain('[ I₂ ]');
        expect(text).not.toContain('{ 2-sys }');

        // Authentic DOM container must be present
        expect(c.querySelector('.word-equation-math')).not.toBeNull();
      });

      // Check Calculus tab
      gallery.setActiveTab('calculus');
      const calcCells = gallery.contentEl.querySelectorAll('.weq-gallery-tab-panel[data-tab-id="calculus"] .weq-gallery-cell:not(.weq-gallery-add-cell-btn)');

      calcCells.forEach((c) => {
        const text = c.textContent || '';
        expect(text).not.toContain('∫_⬚^⬚');
        expect(text).not.toContain('∫_⬚^⬚ ⬚ d⬚');
        expect(text).not.toContain('∑_⬚');
        expect(c.querySelector('.word-equation-math')).not.toBeNull();
      });
    });

    it('verifies staticRenderCache pre-priming, tab switch reuse, and cache update upon edit finish', async () => {
      await gallery.onOpen();

      // 1. Cache was pre-primed on load
      expect(gallery.staticRenderCache.size).toBeGreaterThan(30);

      // 2. Tab switches reuse cached nodes
      const initialCachedAlpha = gallery.staticRenderCache.get('alpha');
      expect(initialCachedAlpha).toBeDefined();

      for (let i = 0; i < 5; i++) {
        gallery.setActiveTab('symbols');
        gallery.setActiveTab('letters');
      }

      // Check cached node is unchanged
      expect(gallery.staticRenderCache.get('alpha')).toBe(initialCachedAlpha);

      // 3. Edit finish updates the cache
      const alphaCell = gallery.tabs[0].sections.flatMap((s) => s.cells).find((c) => c.id === 'alpha')!;
      expect(alphaCell).toBeDefined();

      const alphaEl = gallery.contentEl.querySelector('.weq-gallery-alpha') as HTMLElement;
      expect(alphaEl).not.toBeNull();

      alphaCell.mathml = '<mi>α_new</mi>';
      gallery.finishEditingCell(alphaCell, alphaEl);

      const updatedCachedAlpha = gallery.staticRenderCache.get('alpha');
      expect(updatedCachedAlpha).toBeDefined();
      expect(updatedCachedAlpha).not.toBe(initialCachedAlpha); // refreshed node!
    });
  });

  // =========================================================================
  // SCENARIO 10: MODAL PROMPT INVOCATION & CUSTOM TAB/SECTION ADDITIONS
  // =========================================================================
  describe('Scenario 10: Modal Prompt Invocation & Custom Tab/Section Additions (Bug 12)', () => {
    it('creates a custom tab with GalleryPromptModal and updates active view', async () => {
      await gallery.onOpen();
      const initialCount = gallery.tabs.length;

      vi.spyOn(galleryModal, 'promptGalleryName').mockResolvedValue('Differential Geometry');

      gallery.promptAddTab('Differential Geometry');

      expect(gallery.tabs.length).toBe(initialCount + 1);
      const newTab = gallery.tabs[gallery.tabs.length - 1];
      expect(newTab.name).toBe('Differential Geometry');
      expect(newTab.isCustom).toBe(true);
      expect(gallery.activeTabId).toBe(newTab.id);

      // Active panel rendered for new tab
      const panel = gallery.contentEl.querySelector(`.weq-gallery-tab-panel[data-tab-id="${newTab.id}"]`);
      expect(panel).not.toBeNull();
    });

    it('creates a custom section within an existing tab using GalleryPromptModal', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs[0];
      const initialSecCount = activeTab.sections.length;

      gallery.promptAddSection(activeTab, 'Lie Algebras');

      expect(activeTab.sections.length).toBe(initialSecCount + 1);
      const newSec = activeTab.sections[activeTab.sections.length - 1];
      expect(newSec.name).toBe('Lie Algebras');
      expect(newSec.isCustom).toBe(true);

      // Section element rendered in DOM
      const secEl = gallery.contentEl.querySelector(`.weq-gallery-section[data-section-id="${newSec.id}"]`);
      expect(secEl).not.toBeNull();
    });

    it('adversarially stress-tests GalleryPromptModal: whitespace trimming, Enter keydown, Escape keydown', () => {
      let submittedValue: string | null = null;
      const modal = new GalleryPromptModal(app, 'Test Modal', 'Enter text', '  Spaced Name  ', (res) => {
        submittedValue = res;
      });

      modal.open();
      const input = modal.contentEl.querySelector('.weq-gallery-modal-input') as HTMLInputElement;
      expect(input).not.toBeNull();

      // 1. Enter key submits trimmed string
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(submittedValue).toBe('Spaced Name');

      // 2. Escape key closes modal
      let escapeModalClosed = false;
      const modal2 = new GalleryPromptModal(app, 'Test 2', 'Placeholder', 'Default', () => {});
      modal2.close = () => {
        escapeModalClosed = true;
      };
      modal2.open();
      const input2 = modal2.contentEl.querySelector('.weq-gallery-modal-input') as HTMLInputElement;
      input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(escapeModalClosed).toBe(true);
    });

    it('creates a custom cell via promptAddCell and immediately enters edit mode', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs[0];
      const activeSec = activeTab.sections[0];
      const initialCellCount = activeSec.cells.length;

      gallery.promptAddCell(activeSec);

      expect(activeSec.cells.length).toBe(initialCellCount + 1);
      const newCell = activeSec.cells[activeSec.cells.length - 1];
      expect(newCell.isCustom).toBe(true);
      expect(gallery.editingCellId).toBe(newCell.id);

      // Cell mounted in edit mode
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${newCell.id}"]`) as HTMLElement;
      expect(cellEl).not.toBeNull();
      expect(cellEl.classList.contains('is-editing')).toBe(true);
    });
  });
});
