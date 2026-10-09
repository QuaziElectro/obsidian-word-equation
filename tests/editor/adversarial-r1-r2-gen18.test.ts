/**
 * Adversarial Stress Test Suite: Milestone 1 (R1 & R2)
 *
 * R1 Stress Targets:
 * - 3-level and 4-level nested fractions mounted on fresh load; clicks directly into empty
 *   denominators and numerators at deepest nesting levels without prior document transactions or typed numbers.
 * - Clicks on radical/root placeholders inside nested fractions on fresh load.
 * - Keyboard arrow key entrance and traversal into nested empty slots on fresh load.
 * - Rapid sequential clicks across different nested placeholders.
 * - Structural border / fraction bar hit-testing resilience.
 *
 * R2 Stress Targets:
 * - InteractiveEquationBox standalone box in settings tab: verify exactly 1 visual box
 *   (.word-equation-math[tabindex="0"]) and 0 visible raw inputs.
 * - Rapid typing of complex algebraic expressions (a^2 + b^2 = c^2) and live serialization to MathML.
 * - Backspace, Delete, and arrow navigation inside the settings equation box.
 * - Custom shortcut expansion (e.g. \alpha  -> α) inside settings visual equation box.
 * - Multiple sequential updates and verify onChange / plugin.saveSettings() is invoked with clean serialized MathML.
 * - Emptying the settings equation box and verifying placeholder display.
 * - Fuzz/malformed XML input resilience.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  resetIdCounter,
  findSlotById,
  findNodeById,
} from '../../src/core/ast';
import { createMockEditor } from '../helpers/cm6-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { updateVisualCaretDom } from '../../src/editor/selection';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import {
  WordEquationSettingTab,
  renderExpansionPreview,
} from '../../src/settings/settings-tab';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { setCustomShortcuts, getCustomShortcuts } from '../../src/shortcuts/catalog';
import { App } from '../mocks/obsidian';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';

describe('Adversarial Stress Suite: R1 (Init & Locking) & R2 (Editable Settings Preview)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // GROUP 1: R1 Stress Tests (Deep Nesting, Placeholders, Fresh-Load Clicks & Navigation)
  // =========================================================================
  describe('Group 1: R1 Deep Nesting & Fresh-Load Interactivity Stress Tests', () => {
    it('1. [R1] 3-level nested fraction fresh load: clicks directly into deepest empty denominator without prior edits', () => {
      // 3-level nested fraction: \frac{1}{\frac{2}{\frac{3}{\Box}}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mrow/></mfrac></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_from, _to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const fractions = dom.querySelectorAll('.eq-fraction');
      expect(fractions.length).toBe(3);

      // Deepest fraction is index 2; its denominator is children[1]
      const deepestFrac = fractions[2];
      const deepestDenSlot = deepestFrac.children[1].querySelector('.eq-slot') as HTMLElement;
      expect(deepestDenSlot).not.toBeNull();
      const deepestPlaceholder = deepestDenSlot.querySelector('.eq-placeholder') as HTMLElement;
      expect(deepestPlaceholder).not.toBeNull();

      const targetSlotId = deepestDenSlot.getAttribute('data-slot-id');
      expect(targetSlotId).toBeTruthy();

      // Dispatch pointerdown click directly on the deepest placeholder
      deepestPlaceholder.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
      );

      const active = getActiveEquationState();
      expect(active).not.toBeNull();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(targetSlotId);
      expect(active?.caret.offset).toBe(0);

      // Visual caret verification
      const caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(deepestPlaceholder.classList.contains('eq-focused')).toBe(true);
      expect(deepestPlaceholder.contains(caret)).toBe(true);

      // Ancestors must not be marked as focused
      const ancestorPlaceholders = Array.from(dom.querySelectorAll('.eq-placeholder')).filter(
        (p) => p !== deepestPlaceholder
      );
      ancestorPlaceholders.forEach((p) => {
        expect(p.classList.contains('eq-focused')).toBe(false);
      });

      view.destroy();
      editorContainer.remove();
    });

    it('2. [R1] 3-level nested fraction fresh load: clicks directly into deepest empty numerator and types immediately', () => {
      // 3-level nested fraction with empty numerator at innermost level: \frac{1}{\frac{\frac{\Box}{4}}{3}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mfrac><mrow/><mn>4</mn></mfrac><mn>3</mn></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const fractions = dom.querySelectorAll('.eq-fraction');
      expect(fractions.length).toBe(3);

      // Find the empty numerator placeholder
      const placeholder = dom.querySelector('.eq-placeholder') as HTMLElement;
      expect(placeholder).not.toBeNull();
      const parentSlot = placeholder.closest('.eq-slot') as HTMLElement;
      const slotId = parentSlot.getAttribute('data-slot-id');

      // Click directly on this innermost numerator placeholder
      placeholder.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })
      );

      const active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(slotId);
      expect(active?.caret.offset).toBe(0);

      // Type '7' immediately without any prior document transactions or pre-edits
      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      mathBox.dispatchEvent(
        new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true })
      );

      // Document must now contain '7' and the equation remains active
      expect(view.state.doc.toString()).toContain('7');
      const updatedActive = getActiveEquationState();
      expect(updatedActive?.isFocused).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('3. [R1] 4-level deeply nested fraction fresh load: clicks directly into 4th-level denominator', () => {
      // 4-level nested fraction: \frac{1}{\frac{2}{\frac{3}{\frac{4}{\Box}}}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mfrac><mn>4</mn><mrow/></mfrac></mfrac></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const fractions = dom.querySelectorAll('.eq-fraction');
      expect(fractions.length).toBe(4);

      // Level 4 fraction denominator
      const level4Frac = fractions[3];
      const level4DenSlot = level4Frac.children[1].querySelector('.eq-slot') as HTMLElement;
      expect(level4DenSlot).not.toBeNull();
      const level4Placeholder = level4DenSlot.querySelector('.eq-placeholder') as HTMLElement;
      expect(level4Placeholder).not.toBeNull();
      const level4SlotId = level4DenSlot.getAttribute('data-slot-id');

      // Click on level 4 placeholder
      level4Placeholder.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 15, clientY: 15 })
      );

      const active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(level4SlotId);
      expect(active?.caret.offset).toBe(0);

      // Verify flashing caret DOM injection inside level 4 placeholder
      const caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(level4Placeholder.contains(caret)).toBe(true);
      expect(level4Placeholder.classList.contains('eq-focused')).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('4. [R1] 4-level nested fraction with multiple empty slots at alternating levels maps each slot independently', () => {
      // \frac{\Box}{\frac{2}{\frac{\Box}{\frac{4}{\Box}}}}
      // Level 1 num = Box (Slot A)
      // Level 3 num = Box (Slot B)
      // Level 4 den = Box (Slot C)
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mfrac><mn>2</mn><mfrac><mrow/><mfrac><mn>4</mn><mrow/></mfrac></mfrac></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const placeholders = Array.from(dom.querySelectorAll<HTMLElement>('.eq-placeholder'));
      expect(placeholders.length).toBe(3);

      for (let i = 0; i < placeholders.length; i++) {
        const ph = placeholders[i];
        const slotEl = ph.closest('.eq-slot') as HTMLElement;
        const expectedSlotId = slotEl.getAttribute('data-slot-id');

        ph.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })
        );

        const active = getActiveEquationState();
        expect(active?.isFocused).toBe(true);
        expect(active?.caret.slotId).toBe(expectedSlotId);
        expect(active?.caret.offset).toBe(0);

        const caret = dom.querySelector('.eq-caret');
        expect(caret).not.toBeNull();
        expect(ph.contains(caret)).toBe(true);
        expect(ph.classList.contains('eq-focused')).toBe(true);
      }

      view.destroy();
      editorContainer.remove();
    });

    it('5. [R1] Radical placeholder inside nested fraction on fresh load maps directly to radicand', () => {
      // \frac{1}{\frac{2}{\sqrt{\Box}}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><msqrt><mrow/></msqrt></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const radEl = dom.querySelector('.eq-radical');
      expect(radEl).not.toBeNull();

      const radPlaceholder = radEl!.querySelector('.eq-radicand .eq-placeholder') as HTMLElement;
      expect(radPlaceholder).not.toBeNull();
      const radSlot = radEl!.querySelector('.eq-radicand .eq-slot') as HTMLElement;
      const radSlotId = radSlot.getAttribute('data-slot-id');

      // Click on radical placeholder inside nested fraction
      radPlaceholder.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 })
      );

      const active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(radSlotId);
      expect(active?.caret.offset).toBe(0);

      // Type 'x' into radical slot
      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      mathBox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
      );

      expect(view.state.doc.toString()).toContain('x');

      view.destroy();
      editorContainer.remove();
    });

    it('6. [R1] Indexed root placeholder inside nested fraction on fresh load maps accurately to index slot', () => {
      // \frac{\sqrt[\Box]{x}}{\frac{2}{3}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mroot><mi>x</mi><mrow/></mroot><mfrac><mn>2</mn><mn>3</mn></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const rootIndexSlot = dom.querySelector('.eq-radical-index .eq-slot') as HTMLElement;
      expect(rootIndexSlot).not.toBeNull();
      const rootIndexPlaceholder = rootIndexSlot.querySelector('.eq-placeholder') as HTMLElement;
      expect(rootIndexPlaceholder).not.toBeNull();
      const indexSlotId = rootIndexSlot.getAttribute('data-slot-id');

      // Click directly on root index placeholder
      rootIndexPlaceholder.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 25, clientY: 25 })
      );

      const active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(indexSlotId);
      expect(active?.caret.offset).toBe(0);

      // Type '3' for cube root
      const mathBox = dom.querySelector('.word-equation-math') as HTMLElement;
      mathBox.dispatchEvent(
        new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true })
      );

      expect(view.state.doc.toString()).toContain('3');

      view.destroy();
      editorContainer.remove();
    });

    it('7. [R1] Keyboard arrow key entrance and forward traversal into nested empty slots on fresh load', () => {
      // \frac{\Box}{\frac{\Box}{2}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mfrac><mrow/><mn>2</mn></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      // Enter from start on fresh load without prior document edits
      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.offset).toBe(0);

      const fractions = dom.querySelectorAll('.eq-fraction');
      const outerNumSlot = fractions[0].children[0].querySelector('.eq-slot') as HTMLElement;
      const outerNumSlotId = outerNumSlot.getAttribute('data-slot-id');

      const innerFrac = fractions[1];
      const innerNumSlot = innerFrac.children[0].querySelector('.eq-slot') as HTMLElement;
      const innerNumSlotId = innerNumSlot.getAttribute('data-slot-id');

      const innerDenSlot = innerFrac.children[1].querySelector('.eq-slot') as HTMLElement;
      const innerDenSlotId = innerDenSlot.getAttribute('data-slot-id');

      // ArrowRight enters outer numerator empty placeholder
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );
      let active = getActiveEquationState();
      expect(active?.caret.slotId).toBe(outerNumSlotId);

      // ArrowDown navigates into nested denominator fraction numerator empty placeholder
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );
      active = getActiveEquationState();
      expect(active?.caret.slotId).toBe(innerNumSlotId);

      // ArrowDown navigates into nested denominator fraction denominator ('2')
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );
      active = getActiveEquationState();
      expect(active?.caret.slotId).toBe(innerDenSlotId);

      view.destroy();
      editorContainer.remove();
    });

    it('8. [R1] Keyboard upward traversal from deepest nested empty slot without early escaping', () => {
      // 3-level fraction: \frac{1}{\frac{2}{\frac{3}{\Box}}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mfrac><mn>3</mn><mrow/></mfrac></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const fractions = dom.querySelectorAll('.eq-fraction');
      const deepestDenSlot = fractions[2].children[1].querySelector('.eq-slot') as HTMLElement;
      const deepestPlaceholder = deepestDenSlot.querySelector('.eq-placeholder') as HTMLElement;

      // Click into deepest placeholder
      deepestPlaceholder.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
      );

      let active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);

      const slot3Id = fractions[2].children[0].querySelector('.eq-slot')?.getAttribute('data-slot-id');
      const slot2Id = fractions[1].children[0].querySelector('.eq-slot')?.getAttribute('data-slot-id');
      const slot1Id = fractions[0].children[0].querySelector('.eq-slot')?.getAttribute('data-slot-id');

      // ArrowUp step 1: moves to numerator 3
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
      );
      active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(slot3Id);

      // ArrowUp step 2: moves to numerator 2
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
      );
      active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(slot2Id);

      // ArrowUp step 3: moves to numerator 1
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
      );
      active = getActiveEquationState();
      expect(active?.isFocused).toBe(true);
      expect(active?.caret.slotId).toBe(slot1Id);

      view.destroy();
      editorContainer.remove();
    });

    it('9. [R1] Rapid sequential clicks across different nested placeholders maintains clean visual caret state', () => {
      // Multiple placeholders: \frac{\Box}{\frac{\Box}{\sqrt{\Box}}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mfrac><mrow/><msqrt><mrow/></msqrt></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const placeholders = Array.from(dom.querySelectorAll<HTMLElement>('.eq-placeholder'));
      expect(placeholders.length).toBe(3);

      // Cycle rapidly through the placeholders multiple times
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < placeholders.length; i++) {
          const ph = placeholders[i];
          ph.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20 + i * 5, clientY: 20 })
          );

          // Invariant: Exactly ONE visual caret element in the entire equation
          const carets = dom.querySelectorAll('.eq-caret');
          expect(carets.length).toBe(1);

          // Invariant: Only the targeted placeholder has .eq-focused
          expect(ph.classList.contains('eq-focused')).toBe(true);
          expect(ph.contains(carets[0])).toBe(true);

          for (let j = 0; j < placeholders.length; j++) {
            if (j !== i) {
              expect(placeholders[j].classList.contains('eq-focused')).toBe(false);
              expect(placeholders[j].textContent).toBe('⬚');
            }
          }
        }
      }

      view.destroy();
      editorContainer.remove();
    });

    it('10. [R1] Structural hit-testing on fraction bar resolves to correct nested slot without falling back to root', () => {
      // \frac{1}{\frac{2}{\Box}}
      const doc =
        '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mrow/></mfrac></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = widget!.toDOM(view);
      editorContainer.appendChild(dom);

      const fractions = dom.querySelectorAll('.eq-fraction');
      expect(fractions.length).toBe(2);

      const innerFrac = fractions[1] as HTMLElement;
      const innerDenSlot = innerFrac.children[1].querySelector('.eq-slot') as HTMLElement;
      const innerDenSlotId = innerDenSlot.getAttribute('data-slot-id');

      // Click targeting the inner fraction element directly
      const caret = handleMouseClick(widget!.ast, dom, 50, 100, innerFrac);
      // Must map to either inner numerator or inner denominator, definitely not the root slot
      const rootSlotId = widget!.ast.id;
      expect(caret.slotId).not.toBe(rootSlotId);
      expect([
        innerFrac.children[0].querySelector('.eq-slot')?.getAttribute('data-slot-id'),
        innerDenSlotId,
      ]).toContain(caret.slotId);

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // GROUP 2: R2 Stress Tests (Settings Tab Single Box & InteractiveEquationBox)
  // =========================================================================
  describe('Group 2: R2 Settings Visual Equation Box & InteractiveBox Stress Tests', () => {
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
            {
              trigger: '\\nest',
              expansion:
                '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mfrac><mn>2</mn><mn>3</mn></mfrac></mfrac></math>',
            },
            {
              trigger: '\\sqrtx',
              expansion: '<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mi>x</mi></msqrt></math>',
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

    it('11. [R2] Settings tab expansion column renders exactly 1 visual box (.word-equation-math[tabindex="0"]) and 0 visible raw inputs', () => {
      tab.display();
      const rows = tab.containerEl.querySelectorAll('tbody tr');
      expect(rows.length).toBe(4);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const expCol = row.querySelector('.weq-col-expansion');
        expect(expCol).not.toBeNull();

        // Exactly 1 visual equation box
        const mathBoxes = expCol!.querySelectorAll('.word-equation-math');
        expect(mathBoxes.length).toBe(1);
        const boxEl = mathBoxes[0] as HTMLElement;
        expect(boxEl.getAttribute('tabindex')).toBe('0');
        expect(boxEl.classList.contains('weq-settings-equation-box')).toBe(true);

        // 0 visible raw inputs or textareas in the expansion column
        const rawInputs = expCol!.querySelectorAll('input, textarea');
        rawInputs.forEach((inp) => {
          const el = inp as HTMLElement;
          expect(el.style.display === 'none' || el.getAttribute('type') === 'hidden').toBe(true);
        });

        // Hidden input synchronization check
        const hiddenInp = expCol!.querySelector('input.weq-input-expansion') as HTMLInputElement;
        expect(hiddenInp).not.toBeNull();
        expect(hiddenInp.value).toBe(mockPlugin.settings.customShortcuts[i].expansion);
      }
    });

    it('12. [R2] Rapid typing of complex algebraic expressions (a^2 + b^2 = c^2) live-serializes to valid MathML', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      let lastXml = '';
      const box = new InteractiveEquationBox({
        container: host,
        initialContent: '',
        onChange: (newXml) => {
          lastXml = newXml;
        },
      });

      box.focus();
      expect(box.isFocused).toBe(true);

      // Simulate typing: a, ^, 2,  , +,  , b, ^, 2,  , =,  , c, ^, 2
      const keys = ['a', '^', '2', ' ', '+', ' ', 'b', '^', '2', ' ', '=', ' ', 'c', '^', '2'];
      for (const key of keys) {
        box.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        );
      }

      expect(lastXml).toBeTruthy();
      expect(lastXml).toContain('<math');
      expect(lastXml).toContain('</math>');
      expect(lastXml).toContain('a');
      expect(lastXml).toContain('b');
      expect(lastXml).toContain('c');
      expect(lastXml).toContain('+');
      expect(lastXml).toContain('=');
      expect(lastXml).toContain('2');

      // MathML must be parseable XML
      const domParser = new DOMParser();
      const parsedDoc = domParser.parseFromString(lastXml, 'application/xml');
      expect(parsedDoc.querySelector('parsererror')).toBeNull();
    });

    it('13. [R2] Keyboard arrow navigation inside InteractiveEquationBox navigates across fraction slots', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      const initialXml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac></math>';
      const box = new InteractiveEquationBox({
        container: host,
        initialContent: initialXml,
        onChange: () => {},
      });

      // Focus the box
      box.focus();

      // Click on numerator 'a'
      const numSlot = box.dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      expect(numSlot).not.toBeNull();
      numSlot.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      expect(box.isFocused).toBe(true);
      const numSlotId = numSlot.getAttribute('data-slot-id');
      expect(box.caret.slotId).toBe(numSlotId);

      // Press ArrowDown to move to denominator
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );
      const denSlot = box.dom.querySelector('.eq-denominator .eq-slot') as HTMLElement;
      const denSlotId = denSlot.getAttribute('data-slot-id');
      expect(box.caret.slotId).toBe(denSlotId);

      // In denominator, press ArrowRight to step past first token 'c'
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );
      expect(box.caret.slotId).toBe(denSlotId);
      expect(box.caret.offset).toBe(1);

      // Press ArrowLeft to step back to offset 0
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
      );
      expect(box.caret.slotId).toBe(denSlotId);
      expect(box.caret.offset).toBe(0);

      // Press ArrowUp to return to numerator
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
      );
      expect(box.caret.slotId).toBe(numSlotId);
    });

    it('14. [R2] Backspace and Delete handling inside InteractiveEquationBox updates live MathML', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      let savedXml = '';
      const box = new InteractiveEquationBox({
        container: host,
        initialContent: 'x + y = z',
        onChange: (xml) => {
          savedXml = xml;
        },
      });

      box.focus();
      // Caret is at end of root slot
      expect(box.caret.offset).toBe(box.ast.children.length);

      // Backspace removes 'z'
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
      );
      expect(savedXml).not.toContain('<mi>z</mi>');
      expect(box.dom.textContent).not.toContain('z');

      // Move caret to start (offset 0)
      box.caret = { slotId: box.ast.id, offset: 0 };
      box.updateVisualState();

      // Delete removes 'x'
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
      );
      expect(savedXml).not.toContain('<mi>x</mi>');
      expect(box.dom.textContent).not.toContain('x');
    });

    it('15. [R2] Custom shortcut expansion inside InteractiveEquationBox replaces trigger with expanded symbol', () => {
      setCustomShortcuts([
        { trigger: '\\alpha', expansion: 'α' },
        { trigger: '\\beta', expansion: 'β' },
      ]);

      const host = document.createElement('div');
      container.appendChild(host);

      let savedXml = '';
      const box = new InteractiveEquationBox({
        container: host,
        initialContent: '',
        onChange: (xml) => {
          savedXml = xml;
        },
      });

      box.focus();

      // Type \alpha followed by space
      for (const char of ['\\', 'a', 'l', 'p', 'h', 'a']) {
        box.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true })
        );
      }
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      );

      expect(box.dom.textContent).toContain('α');
      expect(box.dom.textContent).not.toContain('\\alpha');
      expect(savedXml).toContain('α');

      // Continue typing + \beta followed by space
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true })
      );
      for (const char of ['\\', 'b', 'e', 't', 'a']) {
        box.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true })
        );
      }
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      );

      expect(box.dom.textContent).toContain('β');
      expect(savedXml).toContain('β');
    });

    it('16. [R2] Multiple sequential updates in settings tab invoke plugin.saveSettings() and update shortcut expansion', async () => {
      let saveCount = 0;
      mockPlugin.saveSettings = async () => {
        saveCount++;
        setCustomShortcuts(mockPlugin.settings.customShortcuts);
      };

      tab.display();
      const firstRow = tab.containerEl.querySelector('tbody tr')!;
      const expCol = firstRow.querySelector('.weq-col-expansion')!;
      const mathBox = expCol.querySelector('.word-equation-math') as HTMLElement;
      const interactiveBox = (mathBox as any).__interactiveBox as InteractiveEquationBox;
      expect(interactiveBox).toBeDefined();

      interactiveBox.focus();

      const inputChars = ['1', '2', '3'];
      for (const ch of inputChars) {
        mathBox.dispatchEvent(
          new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true })
        );
      }

      expect(saveCount).toBe(3);
      expect(mockPlugin.settings.customShortcuts[0].expansion).toContain('1');
      expect(mockPlugin.settings.customShortcuts[0].expansion).toContain('2');
      expect(mockPlugin.settings.customShortcuts[0].expansion).toContain('3');
    });

    it('17. [R2] Emptying the settings equation box displays placeholder and maintains focus/blur states', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      let savedXml = '';
      const box = new InteractiveEquationBox({
        container: host,
        initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math>',
        onChange: (xml) => {
          savedXml = xml;
        },
      });

      box.focus();
      expect(box.ast.children.length).toBe(1);

      // Backspace to delete 'k'
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
      );

      // AST is now completely empty
      expect(box.ast.children.length).toBe(0);
      expect(savedXml).not.toContain('k');

      // Visual DOM must display placeholder
      const placeholder = box.dom.querySelector('.eq-placeholder');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.classList.contains('weq-preview-empty')).toBe(true);

      // Blur the box
      box.dom.dispatchEvent(new Event('blur'));
      expect(box.isFocused).toBe(false);
      expect(box.dom.classList.contains('eq-active')).toBe(false);
      expect(placeholder?.textContent).toBe('⬚');

      // Re-focus the box
      box.focus();
      expect(box.isFocused).toBe(true);
      expect(box.dom.classList.contains('eq-active')).toBe(true);
      expect(box.dom.querySelector('.eq-caret')).not.toBeNull();
    });

    it('18. [R2] Fuzz resilience: initializes robustly across valid MathML, linear strings, empty, and malformed inputs', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      const testInputs = [
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>',
        'x^2 + y^2',
        '',
        '     \n\t   ',
        '<math><mfrac><mi>x</mi></math>',
        '<math><unclosed><tag>',
        '<<<broken>>>',
      ];

      for (const input of testInputs) {
        host.innerHTML = '';
        expect(() => {
          const box = new InteractiveEquationBox({
            container: host,
            initialContent: input,
            onChange: () => {},
          });
          expect(box.dom).not.toBeNull();
          expect(box.dom.getAttribute('tabindex')).toBe('0');
          box.focus();
          box.dom.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true })
          );
        }).not.toThrow();
      }
    });

    it('19. [R2] Tab key navigation smoothly cycles between nested slots inside InteractiveEquationBox', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      const xml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>x</mi><mi>y</mi></mfrac></math>';
      const box = new InteractiveEquationBox({
        container: host,
        initialContent: xml,
        onChange: () => {},
      });

      box.focus();
      const numSlot = box.dom.querySelector('.eq-numerator .eq-slot') as HTMLElement;
      numSlot.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

      const numSlotId = numSlot.getAttribute('data-slot-id');
      const denSlotId = box.dom.querySelector('.eq-denominator .eq-slot')?.getAttribute('data-slot-id');
      expect(box.caret.slotId).toBe(numSlotId);

      // Press Tab -> jumps to denominator slot
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      );
      expect(box.caret.slotId).toBe(denSlotId);

      // Press Shift+Tab -> jumps back to numerator slot
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
      );
      expect(box.caret.slotId).toBe(numSlotId);
    });

    it('20. [R1 & R2 Integration] Standalone InteractiveEquationBox parity with WordEquationWidget rendering', () => {
      // Both components rendering the same MathML must output equivalent DOM structure
      const testXml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><msqrt><mn>2</mn></msqrt></mfrac></math>';

      const host = document.createElement('div');
      container.appendChild(host);

      const box = new InteractiveEquationBox({
        container: host,
        initialContent: testXml,
        onChange: () => {},
      });

      const { view, container: editorContainer } = createMockEditor(
        `\`\`\`math-word\n${testXml}\n\`\`\``,
        [],
        true
      );
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 100, (_f, _t, dec) => {
        widget = (dec.spec as any).widget;
      });
      const widgetDom = widget!.toDOM(view);

      // Structural element tag names and CSS class parity
      expect(box.dom.querySelectorAll('.eq-fraction').length).toBe(
        widgetDom.querySelectorAll('.eq-fraction').length
      );
      expect(box.dom.querySelectorAll('.eq-radical').length).toBe(
        widgetDom.querySelectorAll('.eq-radical').length
      );
      expect(box.dom.querySelectorAll('.eq-numerator').length).toBe(
        widgetDom.querySelectorAll('.eq-numerator').length
      );
      expect(box.dom.querySelectorAll('.eq-denominator').length).toBe(
        widgetDom.querySelectorAll('.eq-denominator').length
      );

      view.destroy();
      editorContainer.remove();
    });
  });
});
