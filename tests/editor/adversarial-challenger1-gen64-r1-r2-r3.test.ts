import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { App, Setting } from '../mocks/obsidian';
import { getDebugLogger } from '../../src/debug/debug-logger';

describe('Adversarial Challenger 1 (Gen 64): Empirical Verification for R1, R2, and R3', () => {
  let mockApp: any;
  let mockPlugin: WordEquationPlugin;

  beforeEach(() => {
    mockApp = new App();
    mockPlugin = new WordEquationPlugin(mockApp, {
      id: 'word-equation',
      name: 'Word Equation',
      version: '1.0.0',
      minAppVersion: '1.7.2',
      description: 'Microsoft Word-like visual equation editing with native MathML.',
      author: 'QuaziElectro',
    } as any);
    mockPlugin.settings = Object.assign({}, DEFAULT_SETTINGS, {
      customShortcuts: [
        { trigger: '\\alpha', expansion: 'α' },
        { trigger: '\\beta', expansion: 'β' },
      ],
    });
    getDebugLogger().resetForTesting();
  });

  afterEach(() => {
    getDebugLogger().resetForTesting();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // REQUIREMENT R1: Settings Tab Headings Compliance
  // =========================================================================
  describe('Requirement R1: Settings Tab Headings Compliance', () => {
    it('empirical check: no heading in settings tab contains substring "settings" or "setting" (case-insensitive)', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin);
      tab.display();

      const container = tab.containerEl;

      // 1. Check all elements with class 'setting-item-heading'
      const headingItems = Array.from(container.querySelectorAll('.setting-item-heading'));
      expect(headingItems.length).toBeGreaterThan(0);

      for (const item of headingItems) {
        const nameEl = item.querySelector('.setting-item-name') || item;
        const text = (nameEl.textContent || '').trim();
        expect(text.toLowerCase()).not.toContain('settings');
        expect(text.toLowerCase()).not.toContain('setting');
      }

      // 2. Check any raw HTML heading tags (h1 - h6)
      const rawHeadings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      for (const h of rawHeadings) {
        const text = (h.textContent || '').trim();
        expect(text.toLowerCase()).not.toContain('settings');
      }
    });

    it('empirical check: exactly "General" and "Custom Math Shortcuts" headings are rendered', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin);
      tab.display();

      const headingItems = Array.from(tab.containerEl.querySelectorAll('.setting-item-heading'));
      const headingTexts = headingItems.map((el) => {
        const nameEl = el.querySelector('.setting-item-name') || el;
        return (nameEl.textContent || '').trim();
      });

      expect(headingTexts).toContain('General');
      expect(headingTexts).toContain('Custom Math Shortcuts');
      expect(headingTexts).toEqual(['General', 'Custom Math Shortcuts']);
    });

    it('adversarial check: heading compliance persists across dynamic re-renders and settings modifications', async () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin);
      tab.display();

      // Add a shortcut to trigger re-display
      const addBtn = Array.from(tab.containerEl.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Shortcut')
      );
      expect(addBtn).toBeDefined();
      addBtn?.click();
      await new Promise((r) => setTimeout(r, 20));

      // Check headings after add
      let headingItems = Array.from(tab.containerEl.querySelectorAll('.setting-item-heading'));
      let headingTexts = headingItems.map((el) => {
        const nameEl = el.querySelector('.setting-item-name') || el;
        return (nameEl.textContent || '').trim();
      });
      expect(headingTexts).toEqual(['General', 'Custom Math Shortcuts']);
      for (const t of headingTexts) {
        expect(t.toLowerCase()).not.toContain('settings');
      }

      // Delete a shortcut to trigger re-display
      const delBtn = tab.containerEl.querySelector('.weq-btn-delete') as HTMLElement;
      expect(delBtn).not.toBeNull();
      delBtn?.click();
      await new Promise((r) => setTimeout(r, 20));

      headingItems = Array.from(tab.containerEl.querySelectorAll('.setting-item-heading'));
      headingTexts = headingItems.map((el) => {
        const nameEl = el.querySelector('.setting-item-name') || el;
        return (nameEl.textContent || '').trim();
      });
      expect(headingTexts).toEqual(['General', 'Custom Math Shortcuts']);
      for (const t of headingTexts) {
        expect(t.toLowerCase()).not.toContain('settings');
      }
    });

    it('static analysis oracle: src/settings/settings-tab.ts source code has zero headings containing "settings"', () => {
      const filePath = path.resolve(__dirname, '../../src/settings/settings-tab.ts');
      const code = fs.readFileSync(filePath, 'utf-8');

      // Match all .setName(...) that are followed by .setHeading()
      const headingRegex = /\.setName\((['"`])(.*?)\1\)\s*\.setHeading\(\)/g;
      let match: RegExpExecArray | null;
      const capturedHeadings: string[] = [];

      while ((match = headingRegex.exec(code)) !== null) {
        capturedHeadings.push(match[2]);
      }

      expect(capturedHeadings.length).toBe(2);
      for (const h of capturedHeadings) {
        expect(h.toLowerCase()).not.toContain('settings');
        expect(h.toLowerCase()).not.toContain('setting');
      }
      expect(capturedHeadings).toEqual(['General', 'Custom Math Shortcuts']);
    });
  });

  // =========================================================================
  // REQUIREMENT R2: ButtonComponent API & minAppVersion Compatibility
  // =========================================================================
  describe('Requirement R2: ButtonComponent API & minAppVersion Compatibility', () => {
    it('static oracle: zero invocations of .setDestructive() exist in the src/ codebase', () => {
      const srcDir = path.resolve(__dirname, '../../src');
      const checkDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            expect(content).not.toContain('setDestructive()');
            expect(content).not.toContain('.setDestructive');
          }
        }
      };
      checkDir(srcDir);
    });

    it('empirical check: "Clear Debug Log" button uses .setClass("mod-destructive") on native button element', () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin);
      tab.display();

      const clearLogItem = Array.from(tab.containerEl.querySelectorAll('.setting-item')).find((el) =>
        el.textContent?.includes('Clear Debug Log')
      );
      expect(clearLogItem).toBeDefined();

      const button = clearLogItem?.querySelector('button');
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe('Clear Log');
      expect(button?.classList.contains('mod-destructive')).toBe(true);
    });

    it('empirical check: clicking the destructive button triggers getDebugLogger().clear()', async () => {
      const tab = new WordEquationSettingTab(mockApp, mockPlugin);
      tab.display();

      const clearLogItem = Array.from(tab.containerEl.querySelectorAll('.setting-item')).find((el) =>
        el.textContent?.includes('Clear Debug Log')
      );
      const button = clearLogItem?.querySelector('button');
      expect(button).not.toBeNull();

      const logger = getDebugLogger();
      const clearSpy = vi.spyOn(logger, 'clear').mockResolvedValue(undefined);

      button?.click();
      await new Promise((r) => setTimeout(r, 20));

      expect(clearSpy).toHaveBeenCalled();
    });

    it('adversarial simulation: settings tab renders without throwing in Obsidian 1.7.2 environment where setDestructive is absent', () => {
      // Simulate Obsidian 1.7.2 where ButtonComponent lacks setDestructive
      const originalAddButton = Setting.prototype.addButton;
      try {
        Setting.prototype.addButton = function (cb: (btn: any) => any): any {
          const buttonEl = document.createElement('button');
          this.controlEl.appendChild(buttonEl);
          const btn172 = {
            buttonEl,
            setButtonText: (t: string) => {
              buttonEl.textContent = t;
              return btn172;
            },
            setCta: () => {
              buttonEl.classList.add('mod-cta');
              return btn172;
            },
            setWarning: () => {
              buttonEl.classList.add('mod-warning');
              return btn172;
            },
            // setDestructive is intentionally undefined to mimic Obsidian 1.7.2!
            setDestructive: undefined,
            setClass: (cls: string) => {
              buttonEl.classList.add(cls);
              return btn172;
            },
            onClick: (fn: () => any) => {
              buttonEl.addEventListener('click', fn);
              return btn172;
            },
          };
          cb(btn172);
          return this;
        };

        const tab = new WordEquationSettingTab(mockApp, mockPlugin);
        expect(() => tab.display()).not.toThrow();

        const clearBtn = tab.containerEl.querySelector('button.mod-destructive');
        expect(clearBtn).not.toBeNull();
        expect(clearBtn?.classList.contains('mod-destructive')).toBe(true);
      } finally {
        Setting.prototype.addButton = originalAddButton;
      }
    });
  });

  // =========================================================================
  // REQUIREMENT R3: Command ID & Synchronous onunload Lifecycle
  // =========================================================================
  describe('Requirement R3: Command ID & Synchronous onunload Lifecycle', () => {
    it('empirical check: "convert-selection" command is registered without "word-equation" in its id', async () => {
      await mockPlugin.onload();

      const registeredCmds: any[] = (mockPlugin as any)._commands;
      const convertCmd = registeredCmds.find((c: any) => c.id === 'convert-selection');
      expect(convertCmd).toBeDefined();
      expect(convertCmd?.name).toBe('Convert Linear Selection to Equation');

      // Verify that old id does NOT exist
      const oldCmd = registeredCmds.find((c: any) => c.id === 'convert-selection-to-word-equation');
      expect(oldCmd).toBeUndefined();

      // Check all registered command IDs on the plugin: NONE contains 'word-equation'
      for (const cmd of registeredCmds) {
        expect(cmd.id).not.toContain('word-equation');
      }
    });

    it('empirical check: "convert-selection" editorCallback converts linear math into configured MathML block', async () => {
      await mockPlugin.onload();

      const registeredCmds: any[] = (mockPlugin as any)._commands;
      const convertCmd = registeredCmds.find((c: any) => c.id === 'convert-selection');
      expect(convertCmd).toBeDefined();
      expect(typeof convertCmd?.editorCallback).toBe('function');

      let replacedText = '';
      const mockEditor: any = {
        getSelection: () => '1/2 + 3/4',
        replaceSelection: (val: string) => {
          replacedText = val;
        },
      };

      convertCmd.editorCallback(mockEditor);

      expect(replacedText).toContain('```math-word');
      expect(replacedText).toContain('<mfrac>');
      expect(replacedText).toContain('<mn>1</mn>');
      expect(replacedText).toContain('<mn>2</mn>');
      expect(replacedText).toContain('```');
    });

    it('empirical check: plugin.onunload() is strictly synchronous and returns void (undefined)', async () => {
      await mockPlugin.onload();

      // Verify return value is void (undefined) and NOT a Promise
      const ret: any = mockPlugin.onunload();
      expect(ret).toBeUndefined();
      expect(ret instanceof Promise).toBe(false);
      expect(typeof ret?.then).toBe('undefined');
    });

    it('empirical check: getDebugLogger().flush() and destroy() execute cleanly during onunload()', async () => {
      await mockPlugin.onload();

      const logger = getDebugLogger();
      const flushSpy = vi.spyOn(logger, 'flush');
      const destroySpy = vi.spyOn(logger, 'destroy');

      const ret = mockPlugin.onunload();
      expect(ret).toBeUndefined();
      expect(flushSpy).toHaveBeenCalled();
      expect(destroySpy).toHaveBeenCalled();
    });

    it('adversarial check: multiple consecutive onunload() invocations are idempotent and safe', async () => {
      await mockPlugin.onload();

      expect(() => {
        mockPlugin.onunload();
        mockPlugin.onunload();
        mockPlugin.onunload();
      }).not.toThrow();
    });
  });
});
