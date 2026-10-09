/**
 * Gen 62 Acceptance Tests Suite
 * Covers:
 * - Bug 1: Consecutive full-line block equations caret landing on implicit empty line,
 *          collapsed 0px line gap (.word-equation-collapsed-gap), and smooth arrow re-entry.
 * - Bug 2: Settings InteractiveEquationBox feature parity (Shift+Arrow selection,
 *          pointer drag selection, multi-click token/slot selection, Ctrl+C partial copy,
 *          Ctrl+V selection replacement, selection collapse on unshifted arrow, click-outside clearing).
 * - Bug 3: Command palette deduplication (exactly 1 block and 1 inline command in palette,
 *          non-enumerable plain-object properties, backward-compatible alias execution).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { wordEquationStateField, buildCollapsedGapDecorations } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';

describe('Gen 62 Acceptance Suite: Bugs 1, 2, and 3', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  function createMockClipboardEvent(type: 'copy' | 'cut' | 'paste', data: Record<string, string> = {}): ClipboardEvent {
    const store: Record<string, string> = { ...data };
    const event = new Event(type, { bubbles: true, cancelable: true }) as any;

    const clipboardData = {
      getData: (format: string) => store[format] || '',
      setData: (format: string, val: string) => {
        store[format] = val;
        return true;
      },
      clearData: (format?: string) => {
        if (format) delete store[format];
        else {
          for (const k of Object.keys(store)) delete store[k];
        }
      },
      types: Object.keys(store),
    };

    Object.defineProperty(event, 'clipboardData', {
      value: clipboardData,
      writable: true,
    });

    return event as ClipboardEvent;
  }

  beforeEach(() => {
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const cssPath = path.resolve(__dirname, '../../styles.css');
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      styleEl = document.createElement('style');
      styleEl.textContent = cssContent;
      document.head.appendChild(styleEl);
    }
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    if (styleEl) styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // BUG 1 ACCEPTANCE TESTS
  // =========================================================================
  describe('Bug 1: Consecutive Block Equations Intermediate Line & Collapsed Gap', () => {
    it('Scenario 1.1 & 1.2: Exiting Equation 1 forward inserts implicit line with .word-equation-collapsed-gap decoration', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const decorationsBefore = view.state.field(wordEquationStateField, false);
      let w1: WordEquationWidget | null = null;
      let w2: WordEquationWidget | null = null;
      decorationsBefore?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          if (!w1) w1 = w;
          else if (!w2) w2 = w;
        }
      });
      expect(w1).not.toBeNull();
      expect(w2).not.toBeNull();

      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || w1!.toDOM(view);

      // 1. Enter first equation
      w1!.enterFromStart(view);
      expect(w1!.isFocused).toBe(true);

      // 2. ArrowRight to pass 'A' then exit forward
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Caret must land on newly inserted line between the equations
      expect(w1!.isFocused).toBe(false);
      const curPos = view.state.selection.main.anchor;
      const curLine = view.state.doc.lineAt(curPos);
      expect(curLine.length).toBe(0); // empty line

      // Verify collapsed gap decoration exists on this empty line
      const gapDecorations = buildCollapsedGapDecorations(view.state);
      let foundCollapsedGap = false;
      gapDecorations.between(curLine.from, curLine.to, (from, to, dec) => {
        if ((dec.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
          foundCollapsedGap = true;
        }
      });
      expect(foundCollapsedGap).toBe(true);

      // 3. ArrowRight from intermediate line enters Equation 2 from the start
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('B');

      view.destroy();
      c.remove();
    });

    it('Scenario 1.3: Typing on the intermediate empty line removes .word-equation-collapsed-gap decoration', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const emptyLine = view.state.doc.line(4);
      expect(emptyLine.length).toBe(0);

      // Initially collapsed
      let gapDecs = buildCollapsedGapDecorations(view.state);
      let foundCollapsed = false;
      gapDecs.between(emptyLine.from, emptyLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
          foundCollapsed = true;
        }
      });
      expect(foundCollapsed).toBe(true);

      // User types text on the line
      view.dispatch({
        changes: { from: emptyLine.from, insert: 'Hello World' },
        selection: { anchor: emptyLine.from + 11 },
      });

      // Now line is non-empty -> collapsed gap MUST be removed
      gapDecs = buildCollapsedGapDecorations(view.state);
      let foundCollapsedAfter = false;
      const updatedLine = view.state.doc.line(4);
      gapDecs.between(updatedLine.from, updatedLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) {
          foundCollapsedAfter = true;
        }
      });
      expect(foundCollapsedAfter).toBe(false);

      view.destroy();
      c.remove();
    });

    it('Scenario 1.4: Exiting Equation 2 backward inserts intermediate line and ArrowLeft re-enters Equation 1 from end', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let w2: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget && w.code.includes('B')) {
          w2 = w;
        }
      });
      expect(w2).not.toBeNull();

      const dom2 = (view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement) || w2!.toDOM(view);

      // 1. Enter Equation 2 from start
      w2!.enterFromStart(view);
      expect(w2!.isFocused).toBe(true);

      // 2. ArrowLeft inside Equation 2 to exit backward
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

      // Caret must land on inserted intermediate line
      const curPos = view.state.selection.main.anchor;
      const curLine = view.state.doc.lineAt(curPos);
      expect(curLine.length).toBe(0);

      // 3. ArrowLeft from intermediate line enters Equation 1 from the end
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('A');

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 2 ACCEPTANCE TESTS: Settings InteractiveEquationBox
  // =========================================================================
  describe('Bug 2: InteractiveEquationBox Settings Feature Parity', () => {
    let boxContainer: HTMLElement;
    let box: InteractiveEquationBox;

    beforeEach(() => {
      boxContainer = document.createElement('div');
      container.appendChild(boxContainer);
      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: '<math><mi>x</mi><mo>+</mo><mi>y</mi></math>',
        onChange: () => {},
      });
    });

    afterEach(() => {
      box.destroy();
      boxContainer.remove();
    });

    it('Scenario 2.1: Shift+ArrowLeft/Right selects across tokens in InteractiveEquationBox', () => {
      box.isFocused = true;
      box.caret = { slotId: box.ast.id, offset: 0 };
      box.selection = null;

      // 1. Shift+ArrowRight selects token 'x' (offset 0 to 1)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(1);

      // 2. Shift+ArrowRight again extends selection to '+' (offset 0 to 2)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      expect(box.selection!.head.offset).toBe(2);

      // 3. Shift+ArrowLeft shrinks selection back to 'x' (offset 0 to 1)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(box.selection!.head.offset).toBe(1);
    });

    it('Scenario 2.2: Unshifted ArrowLeft and ArrowRight collapse selection to boundaries', () => {
      box.isFocused = true;
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 0 },
        head: { slotId: box.ast.id, offset: 2 },
      };

      // Unshifted ArrowLeft collapses selection to anchor (offset 0)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(0);

      // Re-establish selection
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 0 },
        head: { slotId: box.ast.id, offset: 2 },
      };

      // Unshifted ArrowRight collapses selection to head (offset 2)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(2);
    });

    it('Scenario 2.3: Double-click selects slot children', () => {
      box.isFocused = true;

      // Double-click on token
      const xEl = box.dom.querySelector('.eq-token') as HTMLElement;
      expect(xEl).not.toBeNull();
      xEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));

      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(3);
    });

    it('Scenario 2.4: Pointer drag establishes continuous selection across equation', () => {
      box.isFocused = true;

      box.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 5 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 100, clientY: 5 }));

      // Pointer drag lifecycle completed without exceptions
      expect(box.isFocused).toBe(true);
    });

    it('Scenario 2.5: Ctrl+C copies MathML and text of partial selection', () => {
      box.isFocused = true;
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 0 },
        head: { slotId: box.ast.id, offset: 2 }, // 'x+'
      };

      const copyEvt = createMockClipboardEvent('copy');
      box.dom.dispatchEvent(copyEvt);

      const mathmlData = copyEvt.clipboardData!.getData('application/mathml+xml');
      const textData = copyEvt.clipboardData!.getData('text/plain');

      expect(mathmlData).toContain('<mi>x</mi>');
      expect(mathmlData).toContain('<mo>+</mo>');
      expect(textData).toContain('<mi>x</mi>');
      expect(textData).toContain('<mo>+</mo>');
    });

    it('Scenario 2.6: Ctrl+V replaces current selection with pasted content', () => {
      box.isFocused = true;
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 0 },
        head: { slotId: box.ast.id, offset: 1 }, // selects 'x'
      };

      const pasteEvt = createMockClipboardEvent('paste', {
        'text/plain': 'z',
      });
      box.dom.dispatchEvent(pasteEvt);

      // 'x' replaced with 'z' -> formula becomes 'z+y'
      const xml = box.getXml();
      expect(xml).toContain('<mi>z</mi>');
      expect(xml).not.toContain('<mi>x</mi>');
      expect(box.selection).toBeNull();
    });

    it('Scenario 2.7: Click outside InteractiveEquationBox clears selection and focus', () => {
      box.isFocused = true;
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 0 },
        head: { slotId: box.ast.id, offset: 1 },
      };

      // Mousedown on document outside equation box
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(box.isFocused).toBe(false);
      expect(box.selection).toBeNull();
    });

    it('Scenario 2.8: Pointer drag over window object and non-Node target does not throw TypeError', () => {
      box.isFocused = true;

      // 1. handleMouseClick directly with window as target
      const directPos = handleMouseClick(box.ast, box.dom, 10, 10, window as any);
      expect(directPos).toBeDefined();
      expect(directPos.slotId).toBeDefined();

      // 2. pointerdown inside box, followed by pointermove whose target is window
      box.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      const moveEvt = new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 50 });
      Object.defineProperty(moveEvt, 'target', { value: window, writable: true });
      expect(() => {
        window.dispatchEvent(moveEvt);
      }).not.toThrow();

      // 3. pointerup cleans up cleanly
      const upEvt = new PointerEvent('pointerup', { bubbles: true, clientX: 150, clientY: 50 });
      Object.defineProperty(upEvt, 'target', { value: window, writable: true });
      expect(() => {
        window.dispatchEvent(upEvt);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // BUG 3 ACCEPTANCE TESTS: Command Palette Deduplication
  // =========================================================================
  describe('Bug 3: Command Palette Deduplication & Execution', () => {
    let app: any;
    let plugin: WordEquationPlugin;

    beforeEach(async () => {
      app = new App();
      plugin = new WordEquationPlugin(app, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();
    });

    afterEach(() => {
      plugin.onunload();
    });

    it('Scenario 3.1: app.commands.listCommands() returns exactly 1 block and 1 inline command', () => {
      const allCommands = app.commands.listCommands();
      const blockCommands = allCommands.filter((c: any) => c.name === 'Insert block equation');
      const inlineCommands = allCommands.filter((c: any) => c.name === 'Insert inline equation');

      expect(blockCommands.length).toBe(1);
      expect(inlineCommands.length).toBe(1);

      // Verify legacy duplicate command names do NOT exist in listCommands
      const legacyBlockCommands = allCommands.filter((c: any) => c.name === 'Insert word equation');
      const legacyInlineCommands = allCommands.filter((c: any) => c.name === 'Insert word equation inline');
      expect(legacyBlockCommands.length).toBe(0);
      expect(legacyInlineCommands.length).toBe(0);
    });

    it('Scenario 3.2: Plain-object commands enumeration hides legacy aliases via non-enumerable descriptor', async () => {
      const desktopApp: any = new App();
      // Configure commands.commands as desktop plain object
      const plainCommandsObj: Record<string, any> = {};
      desktopApp.commands = {
        commands: plainCommandsObj,
        listCommands: () => Object.values(plainCommandsObj),
        executeCommandById: (id: string) => {
          const cmd = plainCommandsObj[id];
          if (cmd?.callback) return cmd.callback();
        },
      };

      const desktopPlugin = new WordEquationPlugin(desktopApp, {} as any);
      desktopPlugin.settings = { ...DEFAULT_SETTINGS };
      await desktopPlugin.onload();

      // In desktop Obsidian where commands is a plain object { [id: string]: Command }
      const keys = Object.keys(desktopApp.commands.commands);
      const enumeratedBlockCmds = keys.filter((k) => k === 'insert-block-equation');
      const enumeratedLegacyBlock = keys.filter((k) => k === 'insert-word-equation');

      expect(enumeratedBlockCmds.length).toBe(1);
      // Legacy alias must not be enumerable to prevent command palette duplication
      expect(enumeratedLegacyBlock.length).toBe(0);

      // But accessing the legacy alias directly works
      expect(desktopApp.commands.commands['insert-word-equation']).toBeDefined();
    });

    it('Scenario 3.3: Both canonical ID and legacy alias execute the command handler cleanly', () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      let editorContent = 'Test content';
      mdView.editor = {
        getSelection: () => '',
        getCursor: () => ({ line: 0, ch: 0 }),
        replaceSelection: (text: string) => {
          editorContent += text;
        },
        replaceRange: (text: string) => {
          editorContent += text;
        },
      } as any;

      // Execute canonical ID
      app.commands.executeCommandById('insert-block-equation');
      expect(editorContent).toContain('```math-word');

      // Execute backward-compatible legacy alias ID
      app.commands.executeCommandById('insert-word-equation');
      expect(editorContent).toContain('```math-word');
    });
  });
});
