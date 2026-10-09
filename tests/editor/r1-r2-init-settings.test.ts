/**
 * Milestone 1 (R1 & R2) Verification Test Suite:
 * - R1: Initialization & State Locking Bug
 *   Equations on a freshly opened Obsidian vault do not allow the caret into nested placeholders
 *   until edited with a number. Equations must be fully parsed and fully interactive via mouse
 *   and keyboard immediately upon file load.
 * - R2: Fully Editable Settings Preview
 *   In the plugin settings tab, the MathML expansion column must show exactly ONE visual equation box.
 *   This visual equation must be fully interactive and editable using mouse and keyboard exactly
 *   like the main markdown editor. Any edits made to this visual equation must automatically save
 *   and update the underlying MathML expansion code for that shortcut.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { resetIdCounter, findSlotById, findNodeById } from '../../src/core/ast';
import { createMockEditor } from '../helpers/cm6-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { updateVisualCaretDom } from '../../src/editor/selection';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import { WordEquationSettingTab, renderExpansionPreview } from '../../src/settings/settings-tab';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { setCustomShortcuts, getCustomShortcuts } from '../../src/shortcuts/catalog';
import { App } from '../mocks/obsidian';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';

describe('Milestone 1: R1 (Initialization & Locking) and R2 (Interactive Settings Preview)', () => {
  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
  });

  afterEach(() => {
    clearActiveEquationState();
  });

  // =========================================================================
  // R1: Initialization & State Locking Bug
  // =========================================================================
  describe('R1: Initialization & State Locking Bug', () => {
    it('immediately allows clicking into a nested empty placeholder on a freshly loaded document without prior edits', () => {
      // 2-level nested fraction with empty nested denominator: \frac{1}{\frac{2}{\Box}}
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mrow/></mfrac></mfrac></math>\n```';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      // Render to DOM as would happen on fresh file load in Obsidian
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      // Locate the nested denominator placeholder
      const fractions = dom.querySelectorAll('.eq-fraction');
      expect(fractions.length).toBe(2);
      const innerFrac = fractions[1];
      const innerDenSlot = innerFrac.children[1].querySelector('.eq-slot') as HTMLElement;
      expect(innerDenSlot).not.toBeNull();
      const innerPlaceholder = innerDenSlot.querySelector('.eq-placeholder') as HTMLElement;
      expect(innerPlaceholder).not.toBeNull();

      const expectedNestedSlotId = innerDenSlot.getAttribute('data-slot-id');
      expect(expectedNestedSlotId).toBeTruthy();

      // 1. Dispatch pointerdown click directly on the nested placeholder on fresh load
      const clickResult = handleMouseClick(widget!.ast, dom, 0, 0, innerPlaceholder);
      expect(clickResult.slotId).toBe(expectedNestedSlotId);
      expect(clickResult.offset).toBe(0);

      // 2. Dispatch pointerdown click on the nested slot element padding
      const slotClickResult = handleMouseClick(widget!.ast, dom, 0, 0, innerDenSlot);
      expect(slotClickResult.slotId).toBe(expectedNestedSlotId);
      expect(slotClickResult.offset).toBe(0);

      // 3. Verify visual caret DOM positions cleanly inside the nested placeholder
      updateVisualCaretDom(dom, clickResult, true);
      const caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(innerPlaceholder.classList.contains('eq-focused')).toBe(true);
      expect(innerPlaceholder.contains(caret)).toBe(true);

      view.destroy();
      container.remove();
    });

    it('allows typing immediately into an empty nested placeholder without requiring number pre-editing', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mrow/></mfrac></mfrac></math>\n```';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      const innerFrac = dom.querySelectorAll('.eq-fraction')[1];
      const innerDenSlot = innerFrac.children[1].querySelector('.eq-slot') as HTMLElement;
      const innerPlaceholder = innerDenSlot.querySelector('.eq-placeholder') as HTMLElement;
      expect(innerPlaceholder).not.toBeNull();

      // Simulate click activation on fresh load
      innerPlaceholder.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      const active = getActiveEquationState();
      expect(active).not.toBeNull();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(innerDenSlot.getAttribute('data-slot-id'));

      // Simulate typing a character 'x' into the placeholder
      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      mathBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));

      // Document must have updated with 'x' inserted into the nested denominator
      expect(view.state.doc.toString()).toContain('x');

      view.destroy();
      container.remove();
    });

    it('enables keyboard arrow navigation immediately upon equation entry on fresh load', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\n```';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      // On fresh load, focus equation at start without prior document edit transactions
      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.offset).toBe(0);

      // Press ArrowRight to enter fraction numerator, then ArrowDown to navigate to denominator
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );

      const activeState = getActiveEquationState();
      expect(activeState).not.toBeNull();
      expect(activeState?.isFocused).toBe(true);

      view.destroy();
      container.remove();
    });

    it('supports 3-level nested fractions with empty placeholders on fresh load', () => {
      // 3-level nested fraction: \frac{1}{\frac{2}{\frac{3}{\Box}}}
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mrow/></mfrac></mfrac></mfrac></math>\n```';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      container.appendChild(dom);

      const fractions = dom.querySelectorAll('.eq-fraction');
      expect(fractions.length).toBe(3);
      const deepestDenSlot = fractions[2].children[1].querySelector('.eq-slot') as HTMLElement;
      expect(deepestDenSlot).not.toBeNull();
      const deepestPlaceholder = deepestDenSlot.querySelector('.eq-placeholder') as HTMLElement;
      expect(deepestPlaceholder).not.toBeNull();

      const deepestSlotId = deepestDenSlot.getAttribute('data-slot-id');

      // Click on deepest empty placeholder
      const caret = handleMouseClick(widget!.ast, dom, 0, 0, deepestPlaceholder);
      expect(caret.slotId).toBe(deepestSlotId);
      expect(caret.offset).toBe(0);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // R2: Fully Editable Settings Preview
  // =========================================================================
  describe('R2: Fully Editable Settings Preview', () => {
    let mockPlugin: any;
    let tab: WordEquationSettingTab;

    beforeEach(() => {
      mockPlugin = {
        app: new App(),
        manifest: { id: 'obsidian-word-equation' },
        settings: {
          autoExpandShortcuts: true,
          defaultDelimiter: 'math-word',
          customShortcuts: [
            { trigger: '\\tensor', expansion: '⊗' },
            {
              trigger: '\\half',
              expansion: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>',
            },
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

    it('renders exactly ONE visual equation box (.word-equation-math[tabindex="0"]) per shortcut row in settings tab', () => {
      tab.display();
      const rows = tab.containerEl.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);

      for (const row of Array.from(rows)) {
        const expCol = row.querySelector('.weq-col-expansion');
        expect(expCol).not.toBeNull();

        // Must show exactly ONE visual equation box
        const mathBoxes = expCol!.querySelectorAll('.word-equation-math');
        expect(mathBoxes.length).toBe(1);
        const mathBox = mathBoxes[0] as HTMLElement;
        expect(mathBox.getAttribute('tabindex')).toBe('0');

        // Any underlying input element must not be visibly displayed (display: none)
        const inputs = expCol!.querySelectorAll('input.weq-input-expansion');
        for (const inp of Array.from(inputs)) {
          expect((inp as HTMLElement).style.display).toBe('none');
        }
      }
    });

    it('allows clicking the visual equation box in settings to focus and show visual blinking caret', () => {
      tab.display();
      const firstRow = tab.containerEl.querySelector('tbody tr')!;
      const expCol = firstRow.querySelector('.weq-col-expansion')!;
      const mathBox = expCol.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();

      // Initially inactive
      expect(mathBox.classList.contains('eq-active')).toBe(false);

      // Click the box
      mathBox.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      // Now active with visual caret
      expect(mathBox.classList.contains('eq-active')).toBe(true);
      const caret = mathBox.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(caret?.textContent).toBe('|');
    });

    it('typing characters into settings visual equation box automatically updates AST and saves MathML', async () => {
      let saved = false;
      mockPlugin.saveSettings = async () => {
        saved = true;
        setCustomShortcuts(mockPlugin.settings.customShortcuts);
      };

      tab.display();
      const firstRow = tab.containerEl.querySelector('tbody tr')!;
      const expCol = firstRow.querySelector('.weq-col-expansion')!;
      const mathBox = expCol.querySelector('.word-equation-math') as HTMLElement;

      // Focus box
      mathBox.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      // Type '5'
      mathBox.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));

      expect(saved).toBe(true);
      expect(mockPlugin.settings.customShortcuts[0].expansion).toContain('5');
      expect(mathBox.textContent).toContain('5');
    });

    it('navigates with arrow keys inside settings visual equation box across fraction slots', () => {
      tab.display();
      // Row 2 is \half: <mfrac><mn>1</mn><mn>2</mn></mfrac>
      const row2 = tab.containerEl.querySelectorAll('tbody tr')[1];
      const expCol = row2.querySelector('.weq-col-expansion')!;
      const mathBox = expCol.querySelector('.word-equation-math') as HTMLElement;

      // Click numerator (which contains '1')
      const numSlot = mathBox.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      expect(numSlot).not.toBeNull();

      numSlot.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(mathBox.classList.contains('eq-active')).toBe(true);

      // Press ArrowDown to move to denominator
      mathBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));

      // Denominator should now have the caret
      const denSlot = mathBox.querySelector('.eq-denominator .eq-slot') as HTMLElement;
      const caret = mathBox.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(denSlot.contains(caret)).toBe(true);
    });

    it('deletes characters with Backspace in settings visual equation box and auto-saves', async () => {
      tab.display();
      const row2 = tab.containerEl.querySelectorAll('tbody tr')[1];
      const expCol = row2.querySelector('.weq-col-expansion')!;
      const mathBox = expCol.querySelector('.word-equation-math') as HTMLElement;

      // Focus denominator (offset 1, after '2')
      const token2 = mathBox.querySelector('.eq-denominator .eq-token') as HTMLElement;
      token2.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100 }));

      // Press Backspace to delete '2'
      mathBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));

      // Denominator is now empty (shows placeholder ⬚)
      const denPlaceholder = mathBox.querySelector('.eq-denominator .eq-placeholder');
      expect(denPlaceholder).not.toBeNull();
      expect(mockPlugin.settings.customShortcuts[1].expansion).not.toContain('<mn>2</mn>');
    });

    it('expands shortcut inside settings visual equation box upon typing space', async () => {
      // Configure shortcut catalog with trigger \alpha -> α
      setCustomShortcuts([{ trigger: '\\alpha', expansion: 'α' }]);

      const container = document.createElement('div');
      document.body.appendChild(container);

      let savedXml = '';
      const box = new InteractiveEquationBox({
        container,
        initialContent: '',
        onChange: (xml) => {
          savedXml = xml;
        },
      });

      // Focus
      box.dom.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      // Type \alpha
      for (const char of ['\\', 'a', 'l', 'p', 'h', 'a']) {
        box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
      }

      // Type space to trigger expansion
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

      // Should have expanded to α
      expect(box.dom.textContent).toContain('α');
      expect(savedXml).toContain('α');

      container.remove();
    });

    it('maintains backward compatibility with renderExpansionPreview helper', () => {
      const container = document.createElement('div');
      renderExpansionPreview('<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>3</mn><mn>4</mn></mfrac></math>', container);

      expect(container.querySelector('.word-equation-math')).not.toBeNull();
      expect(container.querySelector('.eq-fraction')).not.toBeNull();
      expect(container.querySelector('.eq-numerator')?.textContent).toBe('3');
      expect(container.querySelector('.eq-denominator')?.textContent).toBe('4');
    });
  });
});
