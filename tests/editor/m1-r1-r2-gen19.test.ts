/**
 * Milestone 1 (Gen19) Verification Test Suite:
 * Requirements R1 & R2:
 * 1. Partial Selection Double-Highlight Fix
 * 2. Permanent Initialization Lockup Fix
 * 3. Settings Visual Box Copy/Paste & Focus Preservation
 * 4. Boundary Deletion Fix (Markdown character deletion protection)
 * 5. Placeholder Deletion Navigation (Non-empty sibling protection)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  resetIdCounter,
  findSlotById,
  findNodeById,
  isEquationEmpty,
} from '../../src/core/ast';
import { createMockEditor } from '../helpers/cm6-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import {
  createEquationNavigationExtension,
  getActiveWidget,
} from '../../src/editor/navigation-extension';
import { handleMouseClick } from '../../src/editor/hit-testing';
import {
  updatePartialSelectionDom,
  updateEquationSelectionDom,
  deleteParentStructure,
} from '../../src/editor/selection';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import { WordEquationSettingTab } from '../../src/settings/settings-tab';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { App } from '../mocks/obsidian';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';

describe('Milestone 1 (Gen19): Requirements R1 & R2', () => {
  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
  });

  afterEach(() => {
    clearActiveEquationState();
  });

  // =========================================================================
  // 1. Partial Selection Double-Highlight Fix (R1)
  // =========================================================================
  describe('1. Partial Selection Double-Highlight Fix', () => {
    it('does not apply .eq-selected to the outer block or math element when partial selection is active', () => {
      const docStr = '```math-word\n<math><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      const numSlot = (widget!.ast.children[0] as any).numerator;
      expect(numSlot).toBeDefined();

      // Select tokens 'a' and '+' in numerator
      widget!.selection = {
        anchor: { slotId: numSlot.id, offset: 0 },
        head: { slotId: numSlot.id, offset: 2 },
      };
      widget!.caret = { slotId: numSlot.id, offset: 2 };
      widget!.isFocused = true;

      setActiveEquationState({
        from: widget!.from,
        to: widget!.to,
        caret: widget!.caret,
        selection: widget!.selection,
        isFocused: true,
        ast: widget!.ast,
      });

      updatePartialSelectionDom(dom, widget!.ast, widget!.selection);

      // Verify inner tokens are selected
      const selectedTokens = dom.querySelectorAll('.eq-selected-token');
      expect(selectedTokens.length).toBe(2);

      // Verify outer block and math element DO NOT have .eq-selected
      expect(dom.classList.contains('eq-selected')).toBe(false);
      const mathEl = dom.querySelector('.word-equation-math');
      expect(mathEl?.classList.contains('eq-selected')).toBe(false);

      // Verify root slot does NOT receive .eq-partial-selected
      const rootSlotEl = dom.querySelector('.eq-slot[data-slot-role="root"]');
      if (rootSlotEl) {
        expect(rootSlotEl.classList.contains('eq-partial-selected')).toBe(false);
      }

      // updateEquationSelectionDom must NOT apply .eq-selected if partial selection is active
      updateEquationSelectionDom(dom, true);
      expect(dom.classList.contains('eq-selected')).toBe(false);
      expect(mathEl?.classList.contains('eq-selected')).toBe(false);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // 2. Permanent Initialization Lockup Fix (R1)
  // =========================================================================
  describe('2. Permanent Initialization Lockup Fix', () => {
    it('preserves existing AST and placeholder IDs on click into empty fraction on fresh load', () => {
      const docStr = '```math-word\n<math><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      const frac = widget!.ast.children[0] as any;
      const initialNumId = frac.numerator.id;
      const initialDenId = frac.denominator.id;

      // Locate numerator placeholder DOM element
      const ph = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      expect(ph).not.toBeNull();
      expect(ph.getAttribute('data-placeholder-for')).toBe(initialNumId);

      // Simulate mouse click on placeholder on fresh load
      const clickPos = handleMouseClick(widget!.ast, dom, 0, 0, ph);
      expect(clickPos.slotId).toBe(initialNumId);
      expect(clickPos.offset).toBe(0);

      // Verify AST IDs were not destroyed or regenerated
      expect((widget!.ast.children[0] as any).numerator.id).toBe(initialNumId);
      expect((widget!.ast.children[0] as any).denominator.id).toBe(initialDenId);

      view.destroy();
      container.remove();
    });

    it('getActiveWidget resolves active widget cleanly and clears stale state when blurred', () => {
      const docStr = '```math-word\n<math><mi>x</mi></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      widget!.toDOM(view);

      // Focus widget
      widget!.enterFromStart(view);
      expect(getActiveWidget(view)).toBe(widget);

      // Unfocus widget
      widget!.isFocused = false;
      expect(getActiveWidget(view)).toBeNull();
      expect(getActiveEquationState()).toBeNull();

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // 3. Settings Visual Box Copy/Paste (R1)
  // =========================================================================
  describe('3. Settings Visual Box Copy/Paste', () => {
    it('supports copying and pasting MathML content in InteractiveEquationBox', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      let lastSavedXml = '';
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math><mi>x</mi></math>',
        onChange: (xml) => {
          lastSavedXml = xml;
        },
      });

      // Verify initial AST
      expect(box.ast.children.length).toBe(1);

      // Simulate pasting MathML fraction: <mfrac><mn>1</mn><mn>2</mn></mfrac>
      const pasteXml = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
      box.insertPastedContent(pasteXml);

      // Fraction is inserted at caret position
      expect(box.ast.children.length).toBe(2);
      expect(box.ast.children[1].type).toBe('fraction');
      expect(lastSavedXml).toContain('<mfrac>');

      // Simulate copy event
      let copiedText = '';
      let copiedType = '';
      const mockClipboardData = {
        setData: (type: string, data: string) => {
          copiedType = type;
          copiedText = data;
        },
        getData: (type: string) => '',
      };
      const copyEvt = new Event('copy', { bubbles: true, cancelable: true }) as any;
      copyEvt.clipboardData = mockClipboardData;
      box.dom.dispatchEvent(copyEvt);

      expect(copiedText).toContain('<mfrac>');
      expect(copiedText).toContain('<mi>x</mi>');

      container.remove();
    });

    it('removes focus stealing in SettingsTab preview click', async () => {
      const app = new App();
      const manifest = { id: 'obsidian-word-equation', name: 'Word Equation', version: '1.0.0' };
      const plugin = {
        app,
        manifest,
        settings: {
          customShortcuts: [{ trigger: '\\test', expansion: '<math><mi>y</mi></math>' }],
        },
        saveSettings: async () => {},
      } as any;

      const tab = new WordEquationSettingTab(app as any, plugin);
      tab.display();

      const previewEl = tab.containerEl.querySelector('.weq-expansion-preview') as HTMLElement;
      expect(previewEl).not.toBeNull();

      const interactiveBoxEl = previewEl.querySelector('.word-equation-math') as HTMLElement;
      expect(interactiveBoxEl).not.toBeNull();

      let focusedEl: HTMLElement | null = null;
      interactiveBoxEl.focus = () => {
        focusedEl = interactiveBoxEl;
      };

      // Clicking previewEl must give focus to interactiveBox.dom, not stolen by inputExp
      previewEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(focusedEl).toBe(interactiveBoxEl);

      tab.containerEl.remove();
    });
  });

  // =========================================================================
  // 4. Boundary Deletion Fix (R2)
  // =========================================================================
  describe('4. Boundary Deletion Fix', () => {
    it('deletes only character "a" and leaves equation intact when Backspace is pressed immediately after "a"', () => {
      const docStr = '```math-word\n<math><mi>x</mi></math>\n```\na';
      const { view, container } = createMockEditor(docStr, [], true);

      // Position caret immediately after 'a'
      const pos = docStr.length;
      view.dispatch({ selection: { anchor: pos } });

      // Dispatch Backspace
      const backspaceEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      const handled = view.contentDOM.dispatchEvent(backspaceEvent);

      // Backspace handler in navigation-extension returns false because pos > line.from,
      // allowing CodeMirror to delete character 'a' while leaving equation intact
      expect(view.state.doc.toString()).toContain('```math-word');
      expect(view.state.doc.toString()).toContain('<math><mi>x</mi></math>');

      view.destroy();
      container.remove();
    });

    it('deletes equation block when cursor is at column 0 immediately following the equation block', () => {
      const docStr = '```math-word\n<math><mi>x</mi></math>\n```\n';
      const { view, container } = createMockEditor(docStr, [], true);

      // Position caret at column 0 of line following equation block
      const pos = docStr.length;
      view.dispatch({ selection: { anchor: pos } });

      const backspaceEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(backspaceEvent);

      // Equation block is deleted
      expect(view.state.doc.toString()).not.toContain('```math-word');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // 5. Placeholder Deletion Navigation (R2)
  // =========================================================================
  describe('5. Placeholder Deletion Navigation', () => {
    it('does not dissolve fraction when Backspace is pressed in empty numerator if denominator is non-empty', () => {
      // Fraction \frac{⬚}{k}
      const docStr = '```math-word\n<math><mfrac><mrow></mrow><mrow><mi>k</mi></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      const frac = widget!.ast.children[0] as any;
      const numSlotId = frac.numerator.id;
      const denSlotId = frac.denominator.id;

      // Position caret in empty numerator at offset 0
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Press Backspace in empty numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Fraction MUST NOT be dissolved!
      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('fraction');
      expect(view.state.doc.toString()).toContain('<mfrac>');

      // Caret MUST move to the end of the non-empty denominator ('k', offset 1)
      expect(widget!.caret.slotId).toBe(denSlotId);
      expect(widget!.caret.offset).toBe(1);

      view.destroy();
      container.remove();
    });

    it('does not dissolve root when Backspace is pressed in empty index if radicand is non-empty', () => {
      // Root \sqrt[⬚]{x}
      const docStr = '```math-word\n<math><mroot><mrow><mi>x</mi></mrow><mrow></mrow></mroot></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      const rootNode = widget!.ast.children[0] as any;
      const indexSlotId = rootNode.index.id;
      const radSlotId = rootNode.radicand.id;

      // Position caret in empty index at offset 0
      widget!.enterFromStart(view);
      widget!.caret = { slotId: indexSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Press Backspace in empty index
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Root MUST NOT be dissolved!
      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('root');
      expect(view.state.doc.toString()).toContain('<mroot>');

      // Caret MUST move to the end of the non-empty radicand ('x', offset 1)
      expect(widget!.caret.slotId).toBe(radSlotId);
      expect(widget!.caret.offset).toBe(1);

      view.destroy();
      container.remove();
    });

    it('dissolves fraction when Backspace is pressed and all sibling slots are empty', () => {
      // Fraction \frac{⬚}{⬚}
      const docStr = '```math-word\n<math><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```';
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      const frac = widget!.ast.children[0] as any;
      const numSlotId = frac.numerator.id;

      // Position caret in empty numerator at offset 0
      widget!.enterFromStart(view);
      widget!.caret = { slotId: numSlotId, offset: 0 };
      widget!.updateCaretOnly(dom);

      // Press Backspace in empty numerator when denominator is also empty
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Fraction is dissolved
      expect(widget!.ast.children.length).toBe(0);
      expect(view.state.doc.toString()).not.toContain('<mfrac>');

      view.destroy();
      container.remove();
    });
  });
});
