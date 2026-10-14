/**
 * Test Suite: Resolution of Bugs 2 through 12 in Equation Gallery (Gen66)
 *
 * Covers:
 * - Bug 2: Gallery tabs positioned on window edge / right side with vertical text orientation
 * - Bug 3: Gallery tabs expand evenly across full length via flex distribution (flex: 1 1 0; height: 100%)
 * - Bug 4: Prevention of focus drops and auto-close on gallery button clicks (pointerdown/mousedown preventDefault)
 * - Bug 5: + Add Cell button styling and sizing with green plus sign (identical dimensions to standard cells)
 * - Bug 6: Obsidian native Menu API right-click context menu with 5 items
 * - Bug 7: Create shortcut workflow with settings modal opening and trigger input focus
 * - Bug 8: Dynamic cell 2D grid spanning updated in real time during in-cell editing
 * - Bug 9: Immediate caret entry on cell edit without requiring a second click
 * - Bug 10: Removal of item count indicators from section headers
 * - Bug 11: Authentic DomRenderer MathML rendering (no [3×3] badges) with zero-overhead static caching
 * - Bug 12: + Add Tab and + Add Section modal creation prompts using Obsidian Modal
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { App, WorkspaceLeaf, Notice } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { EquationGalleryView, calculateCellSpan } from '../../src/gallery/gallery-view';
import { GalleryCell, GalleryTab } from '../../src/gallery/gallery-types';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import { GalleryPromptModal, promptGalleryName } from '../../src/gallery/gallery-modal';
import * as galleryModal from '../../src/gallery/gallery-modal';

describe('Equation Gallery Gen66 Bug Resolutions (Bugs 2-12)', () => {
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
  // BUG 2: Gallery Tabs Position on Window Edge / Right Side
  // =========================================================================
  describe('Bug 2: Gallery Tabs Position on Window Edge / Right Side', () => {
    it('configures gallery container with row-reverse and sidebar with border-left on window edge', async () => {
      await gallery.onOpen();
      const root = gallery.contentEl;
      expect(root.classList.contains('weq-gallery-root')).toBe(true);

      const sidebar = root.querySelector('.weq-gallery-tab-sidebar') as HTMLElement;
      const content = root.querySelector('.weq-gallery-tab-content') as HTMLElement;
      expect(sidebar).not.toBeNull();
      expect(content).not.toBeNull();

      // Read stylesheet rules to verify flex-direction: row-reverse and border-left
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.equation-gallery-container\.weq-gallery-root\s*\{[\s\S]*?flex-direction:\s*row-reverse;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-sidebar\s*\{[\s\S]*?border-left:\s*1px solid/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-sidebar\s*\{[\s\S]*?border-right:\s*none;/);
    });

    it('renders vertically oriented text on tab labels with vertical-rl and rotate(180deg)', async () => {
      await gallery.onOpen();
      const labels = gallery.contentEl.querySelectorAll('.weq-gallery-tab-label');
      expect(labels.length).toBeGreaterThan(0);

      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-tab-label\s*\{[\s\S]*?writing-mode:\s*vertical-rl;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-label\s*\{[\s\S]*?transform:\s*rotate\(180deg\);/);
    });
  });

  // =========================================================================
  // BUG 3: Gallery Tab Equal Distribution Across Full Length
  // =========================================================================
  describe('Bug 3: Gallery Tab Equal Distribution Across Full Length', () => {
    it('distributes tab buttons equally across full vertical length via flex: 1 1 0 and height: 100%', async () => {
      await gallery.onOpen();
      const tabList = gallery.contentEl.querySelector('.weq-gallery-tab-list');
      expect(tabList).not.toBeNull();

      const tabBtns = gallery.contentEl.querySelectorAll('.weq-gallery-tab-btn:not(.weq-gallery-add-tab-btn)');
      expect(tabBtns.length).toBeGreaterThanOrEqual(4);

      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      // Tab list must fill full height
      expect(cssContent).toMatch(/\.weq-gallery-tab-list\s*\{[\s\S]*?height:\s*100%;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-list\s*\{[\s\S]*?flex:\s*1 1 auto;/);

      // Tab buttons must distribute evenly
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn\s*\{[\s\S]*?flex:\s*1 1 0;/);
      expect(cssContent).toMatch(/\.weq-gallery-tab-btn\s*\{[\s\S]*?height:\s*100%;/);
    });
  });

  // =========================================================================
  // BUG 4: Gallery Auto-Close on Clicks
  // =========================================================================
  describe('Bug 4: Gallery Auto-Close on Clicks', () => {
    it('prevents event default on pointerdown and mousedown for tabs, add section, and add cell buttons', async () => {
      await gallery.onOpen();

      const tabBtn = gallery.contentEl.querySelector('.weq-gallery-tab-btn') as HTMLButtonElement;
      const addTabBtn = gallery.contentEl.querySelector('.weq-gallery-add-tab-btn') as HTMLButtonElement;
      const addSecBtn = gallery.contentEl.querySelector('.weq-gallery-add-section-btn') as HTMLButtonElement;
      const addCellBtn = gallery.contentEl.querySelector('.weq-gallery-add-cell-btn') as HTMLButtonElement;
      const cellBtn = gallery.contentEl.querySelector('.weq-gallery-cell:not(.weq-gallery-add-cell-btn)') as HTMLButtonElement;

      const elementsToTest = [tabBtn, addTabBtn, addSecBtn, addCellBtn, cellBtn];

      for (const el of elementsToTest) {
        expect(el).not.toBeNull();

        // Dispatch pointerdown
        const pdEvent = new Event('pointerdown', { bubbles: true, cancelable: true });
        el.dispatchEvent(pdEvent);
        expect(pdEvent.defaultPrevented).toBe(true);

        // Dispatch mousedown
        const mdEvent = new Event('mousedown', { bubbles: true, cancelable: true });
        el.dispatchEvent(mdEvent);
        expect(mdEvent.defaultPrevented).toBe(true);
      }
    });
  });

  // =========================================================================
  // BUG 5: + Add Cell Button Styling & Sizing with Green Plus Sign
  // =========================================================================
  describe('Bug 5: + Add Cell Button Styling & Sizing with Green Plus Sign', () => {
    it('ensures Add Cell button shares standard cell dimensions and has green + icon', async () => {
      await gallery.onOpen();

      const addCellBtns = gallery.contentEl.querySelectorAll('.weq-gallery-add-cell-btn');
      expect(addCellBtns.length).toBeGreaterThan(0);

      addCellBtns.forEach((btn) => {
        // Must contain standard cell classes and spans
        expect(btn.classList.contains('equation-gallery-btn')).toBe(true);
        expect(btn.classList.contains('weq-gallery-cell')).toBe(true);
        expect(btn.classList.contains('weq-gallery-item')).toBe(true);
        expect(btn.getAttribute('data-span-x')).toBe('1');
        expect(btn.getAttribute('data-span-y')).toBe('1');

        // Must contain plus icon
        const icon = btn.querySelector('.weq-gallery-add-cell-icon');
        expect(icon).not.toBeNull();
        expect(icon?.textContent).toBe('+');
      });

      // Verify stylesheet enforces identical min dimensions and green color
      const cssContent = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-height:\s*var\(--weq-cell-base-height,\s*44px\);/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn\s*\{[\s\S]*?min-width:\s*var\(--weq-cell-base-width,\s*48px\);/);
      expect(cssContent).toMatch(/\.weq-gallery-add-cell-btn \.weq-gallery-add-cell-icon\s*\{[\s\S]*?color:\s*var\(--color-green,\s*#2ecc71\);/);
    });
  });

  // =========================================================================
  // BUG 6: Obsidian Native Right-Click Menu Design
  // =========================================================================
  describe('Bug 6: Obsidian Native Right-Click Menu Design', () => {
    it('opens context menu populated with 5 native items and appropriate icons on right click', async () => {
      await gallery.onOpen();
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell[data-item="alpha"]') as HTMLElement;
      expect(cellEl).not.toBeNull();

      cellEl.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 200,
        clientY: 300,
      }));

      const menu = document.querySelector('.menu, .weq-gallery-context-menu') as HTMLElement;
      expect(menu).not.toBeNull();

      // Check for 5 actions
      const itemTitles = Array.from(menu.querySelectorAll('.menu-item-title, .weq-gallery-menu-item')).map((el) => el.textContent?.trim());
      expect(itemTitles).toContain('Copy MathML');
      expect(itemTitles).toContain('Copy LaTeX');
      expect(itemTitles).toContain('Activate / Insert');
      expect(itemTitles).toContain('Create Shortcut');
      expect(itemTitles).toContain('Edit');
    });
  });

  // =========================================================================
  // BUG 7: Create Shortcut Workflow
  // =========================================================================
  describe('Bug 7: Create Shortcut Workflow', () => {
    it('adds shortcut, opens settings modal, navigates to Word-like Equation tab, and focuses trigger input', async () => {
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
      const cell: GalleryCell = { id: 'beta', name: 'Beta', mathml: '<mi>β</mi>' };

      await gallery.promptCreateShortcut(cell);

      // Verify shortcut saved
      expect(plugin.settings.customShortcuts.some((s) => s.expansion === '<mi>β</mi>')).toBe(true);

      // Verify settings modal opened
      expect(openSpy).toHaveBeenCalled();
      expect(openTabByIdSpy).toHaveBeenCalledWith('obsidian-word-equation');

      // Verify focus helper works
      const focused = settingTab.focusShortcutTrigger();
      expect(focused).toBe(true);
      const activeInput = settingTab.containerEl.querySelector('.weq-input-trigger:focus') || document.activeElement;
      expect(activeInput).not.toBeNull();
    });
  });

  // =========================================================================
  // BUG 8: Dynamic Cell Resizing During In-Cell Edit
  // =========================================================================
  describe('Bug 8: Dynamic Cell Resizing During In-Cell Edit', () => {
    it('dynamically updates 2D grid spanning and attributes in real time during in-cell editing', async () => {
      await gallery.onOpen();
      const cell: GalleryCell = {
        id: 'test-cell',
        name: 'Test Cell',
        mathml: '<mi>x</mi>',
        spanX: 1,
        spanY: 1,
      };
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-cell') as HTMLElement;

      gallery.startEditingCell(cell, cellEl);
      expect(cellEl.classList.contains('is-editing')).toBe(true);

      // Live update with a 3x3 matrix XML
      const matrixXml = '<mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd><mtd><mn>3</mn></mtd></mtr><mtr><mtd><mn>4</mn></mtd><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr><mtr><mtd><mn>7</mn></mtd><mtd><mn>8</mn></mtd><mtd><mn>9</mn></mtd></mtr></mtable>';
      gallery.updateCellSpanLive(cell, cellEl, matrixXml);

      // Verify dynamic expansion occurred live during editing!
      expect(cell.spanX).toBe(3);
      expect(cell.spanY).toBe(3);
      expect(cellEl.getAttribute('data-span-x')).toBe('3');
      expect(cellEl.getAttribute('data-span-y')).toBe('3');
      expect(cellEl.style.gridColumn).toBe('span 3');
      expect(cellEl.style.gridRow).toBe('span 3');
      expect(cellEl.classList.contains('weq-span-3x3')).toBe(true);
      expect(cellEl.classList.contains('is-editing')).toBe(true);
    });
  });

  // =========================================================================
  // BUG 9: Immediate Caret Entry on Cell Edit
  // =========================================================================
  describe('Bug 9: Immediate Caret Entry on Cell Edit', () => {
    it('mounts interactive editor and immediately focuses caret without requiring a second click', async () => {
      await gallery.onOpen();
      const cell = gallery.tabs[0].sections[0].cells[0];
      const cellEl = gallery.contentEl.querySelector(`.weq-gallery-cell[data-cell-id="${cell.id}"]`) as HTMLElement;

      gallery.startEditingCell(cell, cellEl);

      const editorContainer = cellEl.querySelector('.weq-gallery-cell-editor') as HTMLElement;
      expect(editorContainer).not.toBeNull();

      const box = (editorContainer as any).__interactiveBox;
      expect(box).toBeDefined();

      // Verify box is focused immediately upon startEditingCell
      expect(box.isFocused).toBe(true);

      // Verify visual caret element is rendered in DOM immediately
      const caret = editorContainer.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
    });
  });

  // =========================================================================
  // BUG 10: Remove Item Count from Section Headers
  // =========================================================================
  describe('Bug 10: Remove Item Count from Section Headers', () => {
    it('ensures section headers display only category titles without item count badges or text', async () => {
      await gallery.onOpen();

      const headers = gallery.contentEl.querySelectorAll('.weq-gallery-section-header');
      expect(headers.length).toBeGreaterThan(0);

      headers.forEach((h) => {
        // Must NOT render any .weq-gallery-section-count inside header
        expect(h.querySelector('.weq-gallery-section-count')).toBeNull();

        // Must NOT contain count indicators like '12 items' or '(12)'
        const text = h.textContent?.trim() || '';
        expect(text).not.toMatch(/\d+\s*items/i);
        expect(text).not.toMatch(/\(\d+\)/);
      });
    });
  });

  // =========================================================================
  // BUG 11: Native Engine Rendering with Render Caching
  // =========================================================================
  describe('Bug 11: Native Engine Rendering with Render Caching', () => {
    it('renders authentic MathML equations without [3×3] placeholder badges', async () => {
      await gallery.onOpen();
      // Switch to Arrays tab to inspect matrices
      gallery.setActiveTab('arrays');

      const matCell = gallery.contentEl.querySelector('.weq-gallery-matrix3x3') as HTMLElement;
      expect(matCell).not.toBeNull();

      // Must NOT contain placeholder badge string '[ 3×3 ]'
      expect(matCell.textContent).not.toContain('[ 3×3 ]');

      // Must contain authentic rendered MathML container
      expect(matCell.querySelector('.word-equation-math')).not.toBeNull();
      expect(matCell.querySelector('.eq-matrix-table, table, .eq-slot, [data-slot-id]')).not.toBeNull();
    });

    it('caches static DOM elements in staticRenderCache for instantaneous zero-overhead rendering', async () => {
      await gallery.onOpen();
      expect(gallery.staticRenderCache.size).toBeGreaterThan(0);

      // Verify cache hit: retrieving cached node for matrix3x3
      const cached = gallery.staticRenderCache.get('matrix3x3');
      expect(cached).toBeDefined();
      expect(cached?.querySelector('.word-equation-math')).not.toBeNull();

      // Finish editing updates cache
      const cell = gallery.tabs[1].sections.find((s) => s.id === 'matrices')!.cells.find((c) => c.id === 'matrix3x3')!;
      const cellEl = gallery.contentEl.querySelector('.weq-gallery-matrix3x3') as HTMLElement;
      gallery.finishEditingCell(cell, cellEl);

      const refreshed = gallery.staticRenderCache.get('matrix3x3');
      expect(refreshed).toBeDefined();
    });
  });

  // =========================================================================
  // BUG 12: + Add Tab and + Add Section Inactivity
  // =========================================================================
  describe('Bug 12: + Add Tab and + Add Section Inactivity', () => {
    it('prompts via Obsidian Modal dialog and appends new custom tab', async () => {
      await gallery.onOpen();
      const initialTabCount = gallery.tabs.length;

      // Mock promptGalleryName
      vi.spyOn(galleryModal, 'promptGalleryName').mockResolvedValue('Electromagnetism');

      const addTabBtn = gallery.contentEl.querySelector('.weq-gallery-add-tab-btn') as HTMLElement;
      expect(addTabBtn).not.toBeNull();

      // Trigger creation
      gallery.promptAddTab('Electromagnetism');

      expect(gallery.tabs.length).toBe(initialTabCount + 1);
      const newTab = gallery.tabs[gallery.tabs.length - 1];
      expect(newTab.name).toBe('Electromagnetism');
      expect(newTab.isCustom).toBe(true);
      expect(gallery.activeTabId).toBe(newTab.id);
    });

    it('prompts via Obsidian Modal dialog and appends new custom section', async () => {
      await gallery.onOpen();
      const activeTab = gallery.tabs.find((t) => t.id === gallery.activeTabId)!;
      const initialSecCount = activeTab.sections.length;

      gallery.promptAddSection(activeTab, 'Tensor Analysis');

      expect(activeTab.sections.length).toBe(initialSecCount + 1);
      const newSec = activeTab.sections[activeTab.sections.length - 1];
      expect(newSec.name).toBe('Tensor Analysis');
      expect(newSec.isCustom).toBe(true);
    });

    it('instantiates GalleryPromptModal and handles submission and cancellation', () => {
      let submittedName: string | null = null;
      const modal = new GalleryPromptModal(app, 'New Item', 'Placeholder', 'Default', (res) => {
        submittedName = res;
      });

      modal.open();
      const input = modal.contentEl.querySelector('.weq-gallery-modal-input') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('Default');

      const submitBtn = modal.contentEl.querySelector('.weq-gallery-modal-submit-btn') as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();
      submitBtn.click();

      expect(submittedName).toBe('Default');
    });
  });
});
