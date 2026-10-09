/**
 * Test Suite: Requirement R4 - Commands & Word-style Equation Gallery Sidebar
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import WordEquationPlugin, {
  VIEW_TYPE_EQUATION_GALLERY,
  DEFAULT_SETTINGS,
} from '../../src/main';
import {
  EquationGalleryView,
  GALLERY_CATEGORIES,
  EQUATION_GALLERY_VIEW_TYPE,
} from '../../src/gallery/gallery-view';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  setActiveEquationState,
  clearActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
  onActiveEquationChange,
} from '../../src/editor/active-session';
import { parseMathML } from '../../src/core/mathml-parser';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';

describe('Requirement R4: Commands & Equation Gallery Sidebar', () => {
  let app: any;
  let plugin: WordEquationPlugin;

  beforeEach(() => {
    clearActiveEquationState();
    app = new App();
    plugin = new WordEquationPlugin(app, {} as any);
    plugin.settings = { ...DEFAULT_SETTINGS };
  });

  describe('1. Equation Gallery View Structure & Categories', () => {
    it('should have correct view type, display text, and icon', () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);

      expect(gallery.getViewType()).toBe('word-equation-gallery-view');
      expect(gallery.getViewType()).toBe(VIEW_TYPE_EQUATION_GALLERY);
      expect(gallery.getViewType()).toBe(EQUATION_GALLERY_VIEW_TYPE);
      expect(gallery.getDisplayText()).toBe('Equation Gallery');
      expect(gallery.getIcon()).toBe('sigma');
    });

    it('should provide all 6 required categories with expected structures', () => {
      const categoryIds = GALLERY_CATEGORIES.map((c) => c.id);
      expect(categoryIds).toContain('fractions');
      expect(categoryIds).toContain('radicals');
      expect(categoryIds).toContain('scripts');
      expect(categoryIds).toContain('operators');
      expect(categoryIds).toContain('greek');
      expect(categoryIds).toContain('matrices');
      expect(GALLERY_CATEGORIES.length).toBe(6);

      // 1. Fractions category
      const fracCat = GALLERY_CATEGORIES.find((c) => c.id === 'fractions')!;
      expect(fracCat.title).toBe('Fractions');
      expect(fracCat.items.some((i) => i.id === 'fraction' && i.mathml.includes('<mfrac>'))).toBe(true);
      expect(fracCat.items.some((i) => i.id === 'derivative' && i.mathml.includes('d') && i.mathml.includes('y'))).toBe(true);

      // 2. Radicals category
      const radCat = GALLERY_CATEGORIES.find((c) => c.id === 'radicals')!;
      expect(radCat.items.some((i) => i.id === 'sqrt' && i.mathml.includes('<msqrt>'))).toBe(true);
      expect(radCat.items.some((i) => i.id === 'root' && i.mathml.includes('<mroot>'))).toBe(true);

      // 3. Scripts category
      const scriptCat = GALLERY_CATEGORIES.find((c) => c.id === 'scripts')!;
      expect(scriptCat.items.some((i) => i.id === 'superscript' && i.mathml.includes('<msup>'))).toBe(true);
      expect(scriptCat.items.some((i) => i.id === 'subscript' && i.mathml.includes('<msub>'))).toBe(true);
      expect(scriptCat.items.some((i) => i.id === 'subsup' && i.mathml.includes('<msubsup>'))).toBe(true);

      // 4. Basic Math & Operators
      const opCat = GALLERY_CATEGORIES.find((c) => c.id === 'operators')!;
      expect(opCat.items.some((i) => i.id === 'pm' && i.mathml.includes('±'))).toBe(true);
      expect(opCat.items.some((i) => i.id === 'times' && i.mathml.includes('×'))).toBe(true);
      expect(opCat.items.some((i) => i.id === 'sum' && i.mathml.includes('∑'))).toBe(true);
      expect(opCat.items.some((i) => i.id === 'int' && i.mathml.includes('∫'))).toBe(true);

      // 5. Greek Letters
      const greekCat = GALLERY_CATEGORIES.find((c) => c.id === 'greek')!;
      expect(greekCat.items.some((i) => i.id === 'alpha' && i.mathml.includes('α'))).toBe(true);
      expect(greekCat.items.some((i) => i.id === 'pi' && i.mathml.includes('π'))).toBe(true);
      expect(greekCat.items.some((i) => i.id === 'Omega' && i.mathml.includes('Ω'))).toBe(true);

      // 6. Matrices & Parentheses
      const matCat = GALLERY_CATEGORIES.find((c) => c.id === 'matrices')!;
      expect(matCat.items.some((i) => i.id === 'parens' && i.mathml.includes('<mfenced'))).toBe(true);
      expect(matCat.items.some((i) => i.id === 'matrix2x2' && i.mathml.includes('<mtable>'))).toBe(true);
    });

    it('should render DOM sections, grid, and buttons on onOpen()', async () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const container = gallery.contentEl;
      expect(container.classList.contains('equation-gallery-container')).toBe(true);

      const titleEl = container.querySelector('.equation-gallery-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl?.textContent).toBe('Equation Gallery');

      const sections = container.querySelectorAll('.equation-gallery-category');
      expect(sections.length).toBe(6);

      const buttons = container.querySelectorAll('.equation-gallery-btn');
      expect(buttons.length).toBeGreaterThan(30);

      const fracBtn = container.querySelector('.equation-gallery-btn[data-item="fraction"]');
      expect(fracBtn).not.toBeNull();
      expect(fracBtn?.textContent).toBe('⬚/⬚');
    });

    it('should prevent default on pointerdown and mousedown to prevent focus loss', async () => {
      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      const btn = gallery.contentEl.querySelector('.equation-gallery-btn') as HTMLButtonElement;
      expect(btn).not.toBeNull();

      const pointerEvent = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      const mouseEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

      btn.dispatchEvent(pointerEvent);
      expect(pointerEvent.defaultPrevented).toBe(true);

      btn.dispatchEvent(mouseEvent);
      expect(mouseEvent.defaultPrevented).toBe(true);
    });
  });

  describe('2. Active Equation Snippet Injection & Smart Caret Positioning', () => {
    it('should inject a fraction and position caret in the numerator placeholder', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      const emptyXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
      const widget = new WordEquationWidget(emptyXml, 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      // Verify initial state: caret is at root slot offset 0
      expect(widget.caret.offset).toBe(0);

      // Inject fraction snippet: <mfrac><mrow></mrow><mrow></mrow></mfrac>
      widget.insertMathSnippet('<mfrac><mrow></mrow><mrow></mrow></mfrac>', cmView);

      // Verify AST updated: root slot now has 1 child which is a FractionNode
      expect(widget.ast.children.length).toBe(1);
      const fracNode = widget.ast.children[0] as any;
      expect(fracNode.type).toBe('fraction');

      // Verify smart caret placement: positioned inside first empty placeholder (the numerator) at offset 0
      expect(widget.caret.slotId).toBe(fracNode.numerator.id);
      expect(widget.caret.offset).toBe(0);

      // Verify CodeMirror document was synchronized
      const updatedDoc = cmView.state.doc.toString();
      expect(updatedDoc).toContain('<mfrac>');
      expect(updatedDoc).toContain('</mfrac>');
    });

    it('should inject a radical and position caret in the radicand placeholder', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      const emptyXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
      const widget = new WordEquationWidget(emptyXml, 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      // Inject square root snippet
      widget.insertMathSnippet('<msqrt><mrow></mrow></msqrt>', cmView);

      expect(widget.ast.children.length).toBe(1);
      const radNode = widget.ast.children[0] as any;
      expect(radNode.type).toBe('radical');
      expect(widget.caret.slotId).toBe(radNode.radicand.id);
      expect(widget.caret.offset).toBe(0);
    });

    it('should inject a script structure (x^{⬚}) and position caret in the exponent placeholder', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      const emptyXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
      const widget = new WordEquationWidget(emptyXml, 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      // Inject superscript snippet: <msup><mrow><mi>x</mi></mrow><mrow></mrow></msup>
      widget.insertMathSnippet('<msup><mrow><mi>x</mi></mrow><mrow></mrow></msup>', cmView);

      expect(widget.ast.children.length).toBe(1);
      const supNode = widget.ast.children[0] as any;
      expect(supNode.type).toBe('superscript');
      // Base has 'x', exponent slot is empty. Caret must be inside exponent slot!
      expect(widget.caret.slotId).toBe(supNode.sup.id);
      expect(widget.caret.offset).toBe(0);
    });

    it('should inject an operator (±) and position caret immediately after it', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      const emptyXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
      const widget = new WordEquationWidget(emptyXml, 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      widget.insertMathSnippet('<mo>±</mo>', cmView);

      expect(widget.ast.children.length).toBe(1);
      expect(widget.caret.slotId).toBe(widget.ast.id);
      expect(widget.caret.offset).toBe(1);
    });

    it('should inject a matrix and position caret in the first cell', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      const emptyXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
      const widget = new WordEquationWidget(emptyXml, 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      const matrixXml = '<mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable>';
      widget.insertMathSnippet(matrixXml, cmView);

      const matNode = widget.ast.children[0] as any;
      expect(matNode.type).toBe('matrix');
      expect(widget.caret.slotId).toBe(matNode.rows[0][0].id);
      expect(widget.caret.offset).toBe(0);
    });
  });

  describe('3. Gallery View Click Insertion Dispatching', () => {
    it('should insert into active equation widget when an equation is focused', async () => {
      await plugin.onload();

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const state = EditorState.create({ doc });
      const cmView = new EditorView({ state });

      const emptyXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
      const widget = new WordEquationWidget(emptyXml, 0, doc.length, false, 'math-word');
      widget.enterFromStart(cmView);

      // Verify active session has widget and focus
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect(getActiveEquationWidget()).toBe(widget);

      const leaf = new (WorkspaceLeaf as any)(app);
      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      // Click the fraction button
      const fracBtn = gallery.contentEl.querySelector('.equation-gallery-btn[data-item="fraction"]') as HTMLButtonElement;
      fracBtn.click();

      // Verify widget AST has fraction and caret is in numerator
      expect(widget.ast.children.length).toBe(1);
      const fracNode = widget.ast.children[0] as any;
      expect(fracNode.type).toBe('fraction');
      expect(widget.caret.slotId).toBe(fracNode.numerator.id);
    });

    it('should insert new equation block at editor cursor when no equation is active', async () => {
      await plugin.onload();
      clearActiveEquationState();

      // Setup active markdown view with editor
      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      const gallery = new EquationGalleryView(leaf, plugin);
      await gallery.onOpen();

      // Click the square root button
      const sqrtBtn = gallery.contentEl.querySelector('.equation-gallery-btn[data-item="sqrt"]') as HTMLButtonElement;
      sqrtBtn.click();

      // Verify markdown editor received block equation template with sqrt
      const content = mdView.editor.getValue();
      expect(content).toContain('```math-word');
      expect(content).toContain('<msqrt>');
      expect(content).toContain('</msqrt>');
    });
  });

  describe('4. Obsidian Commands Registration & Execution', () => {
    it('should register "Insert block equation", "Insert inline equation", and "Toggle equation gallery"', async () => {
      await plugin.onload();

      const commands = (plugin as any)._commands as any[];
      const blockCmd = commands.find((c) => c.id === 'insert-block-equation');
      const inlineCmd = commands.find((c) => c.id === 'insert-inline-equation');
      const toggleCmd = commands.find((c) => c.id === 'toggle-equation-gallery');

      expect(blockCmd).toBeDefined();
      expect(blockCmd.name).toBe('Insert block equation');
      expect(blockCmd.hotkeys).toEqual([{ modifiers: ['Alt'], key: '=' }]);

      expect(inlineCmd).toBeDefined();
      expect(inlineCmd.name).toBe('Insert inline equation');

      expect(toggleCmd).toBeDefined();
      expect(toggleCmd.name).toBe('Toggle equation gallery');

      // Verify duplicate legacy aliases are NOT directly registered in command palette (_commands)
      const legacyBlock = commands.find((c) => c.id === 'insert-word-equation');
      const legacyInline = commands.find((c) => c.id === 'insert-word-equation-inline');
      expect(legacyBlock).toBeUndefined();
      expect(legacyInline).toBeUndefined();

      // Verify legacy aliases are programmatically mapped onto app.commands
      const appCmds = app.commands.commands;
      const appBlockLegacy = appCmds.get ? appCmds.get('insert-word-equation') : appCmds['insert-word-equation'];
      const appInlineLegacy = appCmds.get ? appCmds.get('insert-word-equation-inline') : appCmds['insert-word-equation-inline'];
      expect(appBlockLegacy).toBeDefined();
      expect(appInlineLegacy).toBeDefined();
    });

    it('should execute "Insert block equation" command on editor', async () => {
      await plugin.onload();

      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      app.commands.executeCommandById('insert-block-equation');

      const content = mdView.editor.getValue();
      expect(content).toContain('```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    });

    it('should execute "Insert inline equation" command on editor', async () => {
      await plugin.onload();

      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      app.commands.executeCommandById('insert-inline-equation');

      const content = mdView.editor.getValue();
      expect(content).toContain('/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math> /weq_inline');
    });

    it('should toggle equation gallery sidebar leaf', async () => {
      await plugin.onload();

      expect(app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length).toBe(0);

      // Execute toggle: should create and reveal leaf
      await app.commands.executeCommandById('toggle-equation-gallery');
      expect(app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length).toBe(1);

      // Execute toggle again: should detach leaf
      await app.commands.executeCommandById('toggle-equation-gallery');
      expect(app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length).toBe(0);
    });
  });

  describe('5. Auto Show Gallery Setting & Active Focus Hook', () => {
    it('should not reveal gallery on equation focus when autoShowGallery is false', async () => {
      await plugin.onload();
      plugin.settings.autoShowGallery = false;

      const activateSpy = vi.spyOn(plugin, 'activateGalleryView');

      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'root', offset: 0 },
        isFocused: true,
      });

      expect(activateSpy).not.toHaveBeenCalled();
    });

    it('should automatically reveal gallery on equation focus when autoShowGallery is true', async () => {
      await plugin.onload();
      plugin.settings.autoShowGallery = true;

      const activateSpy = vi.spyOn(plugin, 'activateGalleryView');

      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'root', offset: 0 },
        isFocused: true,
      });

      expect(activateSpy).toHaveBeenCalledTimes(1);
    });

    it('should render "Auto show gallery" setting in setting tab and toggle it', async () => {
      await plugin.onload();
      const tab = new WordEquationSettingTab(app, plugin);
      tab.display();

      const settingsItems = Array.from(tab.containerEl.querySelectorAll('.setting-item'));
      const autoShowSetting = settingsItems.find((el) =>
        el.textContent?.includes('Auto show gallery')
      );
      expect(autoShowSetting).toBeDefined();
      expect(autoShowSetting?.textContent).toContain('Automatically open the Equation Gallery sidebar');
    });

    it('should execute legacy alias "insert-word-equation" and "insert-word-equation-inline" commands', async () => {
      await plugin.onload();

      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      app.commands.executeCommandById('insert-word-equation');
      expect(mdView.editor.getValue()).toContain('```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');

      mdView.editor.setValue('');
      app.commands.executeCommandById('insert-word-equation-inline');
      expect(mdView.editor.getValue()).toContain('/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math> /weq_inline');
    });

    it('should automatically hide gallery on equation exit when autoShowGallery is true after debounce', async () => {
      vi.useFakeTimers();
      try {
        await plugin.onload();
        plugin.settings.autoShowGallery = true;

        const hideSpy = vi.spyOn(plugin, 'hideGalleryView');

        // Focus equation
        setActiveEquationState({
          from: 0,
          to: 10,
          caret: { slotId: 'root', offset: 0 },
          isFocused: true,
        });

        // Exit equation
        clearActiveEquationState();

        // Immediately after exit, debounce has not fired yet
        expect(hideSpy).not.toHaveBeenCalled();

        // Fast-forward 60ms
        vi.advanceTimersByTime(60);

        expect(hideSpy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should detach gallery leaf and collapse rightSplit in hideGalleryView', async () => {
      await plugin.onload();

      // Create a gallery leaf
      await plugin.activateGalleryView();
      expect(app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length).toBe(1);

      app.workspace.rightSplit = {
        collapse: vi.fn(),
      };

      await plugin.hideGalleryView();

      expect(app.workspace.getLeavesOfType(VIEW_TYPE_EQUATION_GALLERY).length).toBe(0);
      expect(app.workspace.rightSplit.collapse).toHaveBeenCalled();
    });
  });
});
