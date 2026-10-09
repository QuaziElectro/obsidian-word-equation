import { describe, it, expect, beforeEach } from 'vitest';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import {
  setCustomShortcuts,
  getCustomShortcuts,
  CustomShortcut,
} from '../../src/shortcuts/catalog';
import {
  expandShortcutInMarkdown,
  expandShortcutInSlot,
} from '../../src/shortcuts/engine';
import { createSlot, createToken, resetIdCounter } from '../../src/core/ast';
import { createMockEditor } from '../helpers/cm6-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import { App, Plugin } from '../mocks/obsidian';

describe('R3 Acceptance Criteria: Customizable Settings Tab Test Suite', () => {
  let mockPlugin: any;
  let tab: WordEquationSettingTab;

  beforeEach(() => {
    resetIdCounter();
    mockPlugin = {
      app: new App(),
      manifest: { id: 'obsidian-word-equation' },
      settings: {
        autoExpandShortcuts: true,
        defaultDelimiter: 'math-word',
        autoShowGallery: false,
        debugMode: false,
        customShortcuts: [
          { trigger: '\\tensor', expansion: '⊗' },
          { trigger: '\\approxeq', expansion: '≊' },
        ],
      },
      saveSettings: async () => {
        setCustomShortcuts(mockPlugin.settings.customShortcuts);
      },
      loadData: async () => ({}),
      saveData: async () => {},
    };

    setCustomShortcuts(mockPlugin.settings.customShortcuts);
    tab = new WordEquationSettingTab(mockPlugin.app, mockPlugin as any);
  });

  describe('Settings Tab Table Rendering (R3 Acceptance Criterion 1)', () => {
    it('renders a table with at least two columns: trigger and expansion', () => {
      tab.display();
      const container = tab.containerEl;

      const table = container.querySelector('table.weq-shortcuts-table');
      expect(table).not.toBeNull();

      // Verify header columns
      const headers = Array.from(table!.querySelectorAll('thead th')).map(
        (th) => th.textContent?.trim()
      );
      expect(headers.length).toBeGreaterThanOrEqual(2);
      expect(headers[0]).toBe('Trigger Shortcut');
      expect(headers[1]).toBe('MathML / Expansion Result');

      // Verify column 1 and column 2 exist in each data row
      const rows = Array.from(table!.querySelectorAll('tbody tr'));
      expect(rows.length).toBe(2);

      for (const row of rows) {
        const tdTrigger = row.querySelector('.weq-col-trigger');
        const tdExpansion = row.querySelector('.weq-col-expansion');
        expect(tdTrigger).not.toBeNull();
        expect(tdExpansion).not.toBeNull();

        const inputTrigger = tdTrigger!.querySelector('input.weq-input-trigger') as HTMLInputElement;
        const inputExpansion = tdExpansion!.querySelector('input.weq-input-expansion') as HTMLInputElement;
        expect(inputTrigger).not.toBeNull();
        expect(inputExpansion).not.toBeNull();
        expect(inputTrigger.value).toBeTruthy();
        expect(inputExpansion.value).toBeTruthy();
      }
    });

    it('allows adding a new shortcut row via the "Add Shortcut" button', async () => {
      tab.display();
      const container = tab.containerEl;

      const addBtn = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.includes('Add Shortcut')
      );
      expect(addBtn).toBeDefined();

      // Click Add Shortcut
      addBtn!.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Confirms a new row is added
      expect(mockPlugin.settings.customShortcuts.length).toBe(3);
      const rows = tab.containerEl.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);

      const lastRow = rows[2];
      const triggerInput = lastRow.querySelector('.weq-input-trigger') as HTMLInputElement;
      expect(triggerInput.value).toBe('\\');
    });

    it('allows deleting a shortcut row via the "Delete" button', async () => {
      tab.display();
      const initialCount = mockPlugin.settings.customShortcuts.length;

      const deleteBtns = tab.containerEl.querySelectorAll('.weq-btn-delete');
      expect(deleteBtns.length).toBe(initialCount);

      // Delete the first shortcut
      (deleteBtns[0] as HTMLElement).click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlugin.settings.customShortcuts.length).toBe(initialCount - 1);
      expect(mockPlugin.settings.customShortcuts[0].trigger).toBe('\\approxeq');
      const rows = tab.containerEl.querySelectorAll('tbody tr');
      expect(rows.length).toBe(initialCount - 1);
    });
  });

  describe('Custom Shortcut Expansion in Markdown & Equation Blocks (R3 Acceptance Criterion 2)', () => {
    it('custom shortcut added via settings table expands in standard markdown', async () => {
      tab.display();

      // Add custom shortcut: \mycross -> ⨯
      mockPlugin.settings.customShortcuts.push({
        trigger: '\\mycross',
        expansion: '⨯',
      });
      await mockPlugin.saveSettings();

      // Test markdown shortcut expansion engine
      const res = expandShortcutInMarkdown('Vectors \\mycross');
      expect(res).not.toBeNull();
      expect(res!.matched).toBe(true);
      expect(res!.replacement).toBe('⨯');
      expect(res!.triggerLength).toBe(8);

      // Test end-to-end markdown typing transaction in CodeMirror editor
      const { view, container } = createMockEditor('Compute \\mycross', [], true);
      view.dispatch({ selection: { anchor: view.state.doc.length } });

      // Press Space via KeyboardEvent on view.contentDOM
      const spaceEvent = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(spaceEvent);

      expect(view.state.doc.toString()).toBe('Compute ⨯');

      view.destroy();
      container.remove();
    });

    it('custom shortcut added via settings table expands within equation blocks', async () => {
      tab.display();

      // Add custom symbol shortcut: \norm -> ‖
      mockPlugin.settings.customShortcuts.push({
        trigger: '\\norm',
        expansion: '‖',
      });
      await mockPlugin.saveSettings();

      // Test slot expansion in AST
      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('n', 'mi'),
        createToken('o', 'mi'),
        createToken('r', 'mi'),
        createToken('m', 'mi'),
      ]);

      const expRes = expandShortcutInSlot(slot, 5, ' ');
      expect(expRes.expanded).toBe(true);
      expect(expRes.newSlot?.children.length).toBe(1);
      expect((expRes.newSlot?.children[0] as any).text).toBe('‖');

      // Test interactive WordEquationWidget keyboard input expansion
      const initialDoc = '```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container } = createMockEditor(initialDoc, [], true);
      const widget = new WordEquationWidget(
        '<math><mrow></mrow></math>',
        0,
        initialDoc.length,
        false,
        'math-word'
      );
      const dom = widget.toDOM(view);

      // Focus and enter widget
      widget.enterFromStart(view);

      // Type \norm followed by space inside widget
      for (const char of ['\\', 'n', 'o', 'r', 'm', ' ']) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: char }));
      }

      // Confirms custom shortcut expanded into symbol token inside equation widget
      expect(widget.ast.children.length).toBe(1);
      expect((widget.ast.children[0] as any).text).toBe('‖');

      view.destroy();
      container.remove();
    });

    it('custom MathML structural shortcut added via settings expands into structural boxes in both environments', async () => {
      tab.display();

      // Add custom MathML shortcut: \half -> <mfrac><mn>1</mn><mn>2</mn></mfrac>
      mockPlugin.settings.customShortcuts.push({
        trigger: '\\half',
        expansion: '<mfrac><mn>1</mn><mn>2</mn></mfrac>',
      });
      await mockPlugin.saveSettings();

      // 1. In standard Markdown: expands to Word Equation fenced block
      const mdRes = expandShortcutInMarkdown('Fraction \\half');
      expect(mdRes).not.toBeNull();
      expect(mdRes!.matched).toBe(true);
      expect(mdRes!.replacement).toContain('```math-word');
      expect(mdRes!.replacement).toContain('<mfrac><mn>1</mn><mn>2</mn></mfrac>');

      // 2. Within equation blocks: expands to fraction structural AST node
      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('h', 'mi'),
        createToken('a', 'mi'),
        createToken('l', 'mi'),
        createToken('f', 'mi'),
      ]);

      const slotRes = expandShortcutInSlot(slot, 5, ' ');
      expect(slotRes.expanded).toBe(true);
      expect(slotRes.newSlot?.children.length).toBe(1);
      const fracNode = slotRes.newSlot?.children[0] as any;
      expect(fracNode.type).toBe('fraction');
      expect(fracNode.numerator.children[0].text).toBe('1');
      expect(fracNode.denominator.children[0].text).toBe('2');
    });

    it('editing a shortcut trigger or expansion in the table inputs dynamically updates expansion behavior', async () => {
      tab.display();
      const rows = tab.containerEl.querySelectorAll('tbody tr');
      const firstRow = rows[0];

      const triggerInput = firstRow.querySelector('.weq-input-trigger') as HTMLInputElement;
      const expansionInput = firstRow.querySelector('.weq-input-expansion') as HTMLInputElement;

      // Update trigger to \customtensor and expansion to ⨂
      triggerInput.value = '\\customtensor';
      triggerInput.dispatchEvent(new Event('input'));

      expansionInput.value = '⨂';
      expansionInput.dispatchEvent(new Event('input'));

      // Old trigger should no longer expand
      expect(expandShortcutInMarkdown('Prefix \\tensor')).toBeNull();

      // New trigger must expand to updated symbol
      const newRes = expandShortcutInMarkdown('Prefix \\customtensor');
      expect(newRes).not.toBeNull();
      expect(newRes!.matched).toBe(true);
      expect(newRes!.replacement).toBe('⨂');
    });
  });

  describe('Debug Mode Settings (Milestone 1)', () => {
    it('renders "Enable Debug Mode" toggle and "Clear Debug Log" button', () => {
      tab.display();
      const container = tab.containerEl;

      const settingItems = Array.from(container.querySelectorAll('.setting-item'));
      const debugToggle = settingItems.find((el) =>
        el.textContent?.includes('Enable Debug Mode')
      );
      const clearLogBtn = settingItems.find((el) =>
        el.textContent?.includes('Clear Debug Log')
      );

      expect(debugToggle).toBeDefined();
      expect(clearLogBtn).toBeDefined();
      expect(clearLogBtn?.querySelector('button')?.textContent).toBe('Clear Log');
    });
  });
});
