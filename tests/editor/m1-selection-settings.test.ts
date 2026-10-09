/**
 * Milestone 1 Acceptance & Unit Tests:
 * - R1: Selection Highlighting (CodeMirror ViewPlugin updating .eq-selected on equation DOM elements when spanned by external selections, plus CSS styling).
 * - R2: Settings UI Rendering (custom shortcuts table expansion column rendering visual DOM equation preview via DomRenderer while keeping input intact).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { resetIdCounter } from '../../src/core/ast';
import { createMockEditor } from '../helpers/cm6-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  updateEquationSelectionDom,
  updateVisualCaretDom,
} from '../../src/editor/selection';
import { equationSelectionHighlightPlugin } from '../../src/editor/navigation-extension';
import {
  WordEquationSettingTab,
  renderExpansionPreview,
} from '../../src/settings/settings-tab';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import { setCustomShortcuts } from '../../src/shortcuts/catalog';
import { App } from '../mocks/obsidian';

describe('Milestone 1: Selection Highlighting & Settings UI Rendering Suite', () => {
  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
  });

  afterEach(() => {
    clearActiveEquationState();
  });

  // =========================================================================
  // R1: Selection Highlighting Tests
  // =========================================================================
  describe('R1: Selection Highlighting', () => {
    describe('updateEquationSelectionDom unit helper', () => {
      it('adds .eq-selected to container and all child .word-equation-math elements when isSelected is true', () => {
        const container = document.createElement('div');
        container.className = 'word-equation-block';
        const mathBox = document.createElement('div');
        mathBox.className = 'word-equation-math';
        container.appendChild(mathBox);

        updateEquationSelectionDom(container, true);
        expect(container.classList.contains('eq-selected')).toBe(true);
        expect(mathBox.classList.contains('eq-selected')).toBe(true);
      });

      it('removes .eq-selected from container and all child .word-equation-math elements when isSelected is false', () => {
        const container = document.createElement('div');
        container.className = 'word-equation-block eq-selected';
        const mathBox = document.createElement('div');
        mathBox.className = 'word-equation-math eq-selected';
        container.appendChild(mathBox);

        updateEquationSelectionDom(container, false);
        expect(container.classList.contains('eq-selected')).toBe(false);
        expect(mathBox.classList.contains('eq-selected')).toBe(false);
      });

      it('works correctly for inline equations (.word-equation-inline)', () => {
        const container = document.createElement('span');
        container.className = 'word-equation-inline';
        const mathBox = document.createElement('span');
        mathBox.className = 'word-equation-math';
        container.appendChild(mathBox);

        updateEquationSelectionDom(container, true);
        expect(container.classList.contains('eq-selected')).toBe(true);
        expect(mathBox.classList.contains('eq-selected')).toBe(true);

        updateEquationSelectionDom(container, false);
        expect(container.classList.contains('eq-selected')).toBe(false);
        expect(mathBox.classList.contains('eq-selected')).toBe(false);
      });

      it('handles target element being .word-equation-math directly', () => {
        const mathBox = document.createElement('div');
        mathBox.className = 'word-equation-math';

        updateEquationSelectionDom(mathBox, true);
        expect(mathBox.classList.contains('eq-selected')).toBe(true);

        updateEquationSelectionDom(mathBox, false);
        expect(mathBox.classList.contains('eq-selected')).toBe(false);
      });
    });

    describe('WordEquationWidget DOM selection integration', () => {
      it('applies .eq-selected in toDOM if widget is covered by non-empty external selection', () => {
        const doc = 'Intro\n```math-word\n<math><mn>42</mn></math>\n```\nOutro';
        const { view, container } = createMockEditor(doc);
        // Equation range is approx 6 to 48
        const widgetFrom = 6;
        const widgetTo = 48;

        // Set selection spanning widget
        view.dispatch({ selection: { anchor: 0, head: 50 } });

        const widget = new WordEquationWidget(
          '<math><mn>42</mn></math>',
          widgetFrom,
          widgetTo,
          false,
          'math-word'
        );
        const dom = widget.toDOM(view);

        expect(dom.classList.contains('eq-selected')).toBe(true);
        const math = dom.querySelector('.word-equation-math');
        expect(math?.classList.contains('eq-selected')).toBe(true);

        view.destroy();
        container.remove();
      });

      it('does not apply .eq-selected in toDOM when selection does not overlap', () => {
        const doc = 'Intro\n```math-word\n<math><mn>42</mn></math>\n```\nOutro';
        const { view, container } = createMockEditor(doc);
        // Selection only in "Intro"
        view.dispatch({ selection: { anchor: 0, head: 4 } });

        const widget = new WordEquationWidget(
          '<math><mn>42</mn></math>',
          6,
          48,
          false,
          'math-word'
        );
        const dom = widget.toDOM(view);

        expect(dom.classList.contains('eq-selected')).toBe(false);
        const math = dom.querySelector('.word-equation-math');
        expect(math?.classList.contains('eq-selected')).toBe(false);

        view.destroy();
        container.remove();
      });

      it('does not apply .eq-selected in toDOM when selection is collapsed', () => {
        const doc = 'Intro\n```math-word\n<math><mn>42</mn></math>\n```\nOutro';
        const { view, container } = createMockEditor(doc);
        // Collapsed cursor at pos 10 inside widget
        view.dispatch({ selection: { anchor: 10, head: 10 } });

        const widget = new WordEquationWidget(
          '<math><mn>42</mn></math>',
          6,
          48,
          false,
          'math-word'
        );
        const dom = widget.toDOM(view);

        expect(dom.classList.contains('eq-selected')).toBe(false);

        view.destroy();
        container.remove();
      });
    });

    describe('CodeMirror ViewPlugin equationSelectionHighlightPlugin live synchronization', () => {
      it('dynamically adds .eq-selected on block equation when external selection spans across it and removes when collapsed', () => {
        const doc = 'Before\n```math-word\n<math><mi>x</mi></math>\n```\nAfter';
        const { view, container } = createMockEditor(doc);

        // Verify equation widget rendered in DOM
        const eqBlock = view.dom.querySelector('.word-equation-block') as HTMLElement | null;
        expect(eqBlock).not.toBeNull();
        const mathBox = eqBlock?.querySelector('.word-equation-math') as HTMLElement | null;
        expect(mathBox).not.toBeNull();

        // Initially cursor at start, collapsed -> no selection
        expect(eqBlock?.classList.contains('eq-selected')).toBe(false);
        expect(mathBox?.classList.contains('eq-selected')).toBe(false);

        // Select all text spanning across the equation
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });

        expect(eqBlock?.classList.contains('eq-selected')).toBe(true);
        expect(mathBox?.classList.contains('eq-selected')).toBe(true);

        // Collapse selection -> highlight immediately disappears
        view.dispatch({ selection: { anchor: 0 } });

        expect(eqBlock?.classList.contains('eq-selected')).toBe(false);
        expect(mathBox?.classList.contains('eq-selected')).toBe(false);

        view.destroy();
        container.remove();
      });

      it('dynamically highlights inline equation when selected and clears on collapse', () => {
        const doc = 'Before /weq_inline <math><mi>y</mi></math> /weq_inline After';
        const { view, container } = createMockEditor(doc);

        const eqInline = view.dom.querySelector('.word-equation-inline') as HTMLElement | null;
        expect(eqInline).not.toBeNull();
        const mathBox = eqInline?.querySelector('.word-equation-math') as HTMLElement | null;
        expect(mathBox).not.toBeNull();

        // Initially no highlight
        expect(eqInline?.classList.contains('eq-selected')).toBe(false);

        // Select across inline equation
        view.dispatch({ selection: { anchor: 2, head: doc.length - 2 } });

        expect(eqInline?.classList.contains('eq-selected')).toBe(true);
        expect(mathBox?.classList.contains('eq-selected')).toBe(true);

        // Collapse to end of file
        view.dispatch({ selection: { anchor: doc.length } });

        expect(eqInline?.classList.contains('eq-selected')).toBe(false);
        expect(mathBox?.classList.contains('eq-selected')).toBe(false);

        view.destroy();
        container.remove();
      });

      it('does not apply .eq-selected when user is internally focused and editing equation', () => {
        const doc = '```math-word\n<math><mn>123</mn></math>\n```';
        const { view, container } = createMockEditor(doc);

        const eqBlock = view.dom.querySelector('.word-equation-block') as HTMLElement | null;
        expect(eqBlock).not.toBeNull();
        const widget = (eqBlock as any)?.__widget as WordEquationWidget;
        expect(widget).toBeDefined();

        // Enter equation internally
        widget.enterFromStart(view);

        // Set active session state
        setActiveEquationState({
          from: widget.from,
          to: widget.to,
          caret: widget.caret,
          isFocused: true,
          ast: widget.ast,
        });

        // Dispatch an update to view
        view.dispatch({ selection: { anchor: 0, head: 5 } });

        // Equation is internally active -> isInternallyActive prevents .eq-selected
        expect(eqBlock?.classList.contains('eq-selected')).toBe(false);

        // updateVisualCaretDom also explicitly strips .eq-selected when isFocused is true
        updateVisualCaretDom(eqBlock!, widget.caret, true);
        expect(eqBlock?.classList.contains('eq-selected')).toBe(false);
        expect(eqBlock?.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(false);

        view.destroy();
        container.remove();
      });

      it('accurately distinguishes selection boundaries right before and right after equation', () => {
        const doc = 'Prefix text\n```math-word\n<math><mi>z</mi></math>\n```\nSuffix text';
        const { view, container } = createMockEditor(doc);

        const eqBlock = view.dom.querySelector('.word-equation-block') as HTMLElement | null;
        expect(eqBlock).not.toBeNull();
        const from = Number(eqBlock?.getAttribute('data-equation-from'));
        const to = Number(eqBlock?.getAttribute('data-equation-to'));

        // 1. Selection strictly within prefix (from 0 to from)
        view.dispatch({ selection: { anchor: 0, head: from } });
        expect(eqBlock?.classList.contains('eq-selected')).toBe(false);

        // 2. Selection strictly within suffix (from to to doc.length)
        view.dispatch({ selection: { anchor: to, head: view.state.doc.length } });
        expect(eqBlock?.classList.contains('eq-selected')).toBe(false);

        // 3. Selection overlapping by 1 character into equation
        view.dispatch({ selection: { anchor: from - 2, head: from + 1 } });
        expect(eqBlock?.classList.contains('eq-selected')).toBe(true);

        view.destroy();
        container.remove();
      });
    });
  });

  // =========================================================================
  // R2: Settings UI Rendering Tests
  // =========================================================================
  describe('R2: Settings UI Rendering', () => {
    describe('renderExpansionPreview direct rendering function', () => {
      it('renders dimmed ⬚ placeholder when expansion is empty', () => {
        const container = document.createElement('div');
        renderExpansionPreview('', container);

        const placeholder = container.querySelector('.weq-preview-empty');
        expect(placeholder).not.toBeNull();
        expect(placeholder?.textContent).toBe('⬚');
      });

      it('renders visual equation element for symbol string (e.g. ⊗)', () => {
        const container = document.createElement('div');
        renderExpansionPreview('⊗', container);

        const math = container.querySelector('.word-equation-math');
        expect(math).not.toBeNull();
        expect(container.textContent).toContain('⊗');
      });

      it('renders visual fraction and native MathML element for MathML fraction string', () => {
        const container = document.createElement('div');
        const mathml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
        renderExpansionPreview(mathml, container);

        // 1. Visual DOM equation elements from DomRenderer
        const mathBox = container.querySelector('.word-equation-math');
        expect(mathBox).not.toBeNull();
        const fraction = container.querySelector('.eq-fraction');
        expect(fraction).not.toBeNull();
        const num = container.querySelector('.eq-numerator');
        const den = container.querySelector('.eq-denominator');
        expect(num?.textContent).toBe('1');
        expect(den?.textContent).toBe('2');

        // 2. Native MathML DOM elements (.weq-native-mathml)
        const nativeMath = container.querySelector('math.weq-native-mathml');
        expect(nativeMath).not.toBeNull();
        expect(nativeMath?.querySelector('mfrac')).not.toBeNull();
        expect(nativeMath?.querySelector('mn')?.textContent).toBe('1');
      });

      it('renders visual radical structure for MathML square root string', () => {
        const container = document.createElement('div');
        const mathml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mi>x</mi></msqrt></math>';
        renderExpansionPreview(mathml, container);

        const radical = container.querySelector('.eq-radical');
        expect(radical).not.toBeNull();
        const radicand = container.querySelector('.eq-radicand');
        expect(radicand?.textContent).toContain('x');

        const nativeMath = container.querySelector('math.weq-native-mathml');
        expect(nativeMath).not.toBeNull();
        expect(nativeMath?.querySelector('msqrt')).not.toBeNull();
      });

      it('renders visual superscript for MathML msup string', () => {
        const container = document.createElement('div');
        const mathml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>e</mi><mi>x</mi></msup></math>';
        renderExpansionPreview(mathml, container);

        const scriptBox = container.querySelector('.eq-script-box');
        expect(scriptBox).not.toBeNull();
        const sup = container.querySelector('.eq-superscript');
        expect(sup).not.toBeNull();
        expect(sup?.textContent).toContain('x');
      });

      it('gracefully handles malformed MathML without throwing errors', () => {
        const container = document.createElement('div');
        expect(() => {
          renderExpansionPreview('<math><broken>', container);
        }).not.toThrow();
        expect(container.textContent).toBeTruthy();
      });
    });

    describe('WordEquationSettingTab custom shortcuts table visual expansion column', () => {
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

      it('renders visual equation previews alongside input fields in the expansion column', () => {
        tab.display();
        const rows = tab.containerEl.querySelectorAll('tbody tr');
        expect(rows.length).toBe(2);

        // Row 1: \tensor -> ⊗
        const row1Exp = rows[0].querySelector('.weq-col-expansion');
        expect(row1Exp).not.toBeNull();
        const preview1 = row1Exp?.querySelector('.weq-expansion-preview');
        const input1 = row1Exp?.querySelector('input.weq-input-expansion') as HTMLInputElement;
        expect(preview1).not.toBeNull();
        expect(input1).not.toBeNull();
        expect(input1.value).toBe('⊗');
        expect(preview1?.querySelector('.word-equation-math')).not.toBeNull();
        expect(preview1?.textContent).toContain('⊗');

        // Row 2: \half -> MathML fraction
        const row2Exp = rows[1].querySelector('.weq-col-expansion');
        expect(row2Exp).not.toBeNull();
        const preview2 = row2Exp?.querySelector('.weq-expansion-preview');
        const input2 = row2Exp?.querySelector('input.weq-input-expansion') as HTMLInputElement;
        expect(preview2).not.toBeNull();
        expect(input2).not.toBeNull();
        expect(input2.value).toContain('<mfrac>');
        // Confirms visual fraction element is rendered in DOM, not raw text
        expect(preview2?.querySelector('.word-equation-math')).not.toBeNull();
        expect(preview2?.querySelector('.eq-fraction')).not.toBeNull();
        expect(preview2?.querySelector('.eq-numerator')?.textContent).toBe('1');
        expect(preview2?.querySelector('.eq-denominator')?.textContent).toBe('2');
        expect(preview2?.querySelector('math.weq-native-mathml')).not.toBeNull();
      });

      it('clicking .weq-expansion-preview focuses the corresponding input field', () => {
        tab.display();
        const rows = tab.containerEl.querySelectorAll('tbody tr');
        const rowExp = rows[0].querySelector('.weq-col-expansion')!;
        const preview = rowExp.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = rowExp.querySelector('input.weq-input-expansion') as HTMLInputElement;

        let focused = false;
        input.focus = () => {
          focused = true;
        };

        preview.click();
        expect(focused).toBe(true);
      });

      it('typing into input field immediately updates the visual preview in real time', async () => {
        tab.display();
        const rows = tab.containerEl.querySelectorAll('tbody tr');
        const rowExp = rows[0].querySelector('.weq-col-expansion')!;
        const preview = rowExp.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = rowExp.querySelector('input.weq-input-expansion') as HTMLInputElement;

        // Change expansion to a fraction MathML
        input.value = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>';
        input.dispatchEvent(new Event('input'));

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Confirms preview dynamically re-rendered the visual fraction
        const frac = preview.querySelector('.eq-fraction');
        expect(frac).not.toBeNull();
        expect(preview.querySelector('.eq-numerator')?.textContent).toBe('a');
        expect(preview.querySelector('.eq-denominator')?.textContent).toBe('b');
        expect(mockPlugin.settings.customShortcuts[0].expansion).toBe(input.value);
      });

      it('adding a new shortcut renders an empty preview placeholder and updates when typed', async () => {
        tab.display();
        const addBtn = Array.from(tab.containerEl.querySelectorAll('button')).find(
          (btn) => btn.textContent?.includes('Add Shortcut')
        );
        expect(addBtn).toBeDefined();

        addBtn!.click();
        await new Promise((resolve) => setTimeout(resolve, 50));

        const rows = tab.containerEl.querySelectorAll('tbody tr');
        expect(rows.length).toBe(3);

        const newRowExp = rows[2].querySelector('.weq-col-expansion')!;
        const preview = newRowExp.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = newRowExp.querySelector('input.weq-input-expansion') as HTMLInputElement;

        // Initially empty -> renders ⬚ placeholder
        expect(preview.querySelector('.weq-preview-empty')?.textContent).toBe('⬚');

        // Type a symbol into new row
        input.value = '√';
        input.dispatchEvent(new Event('input'));

        expect(preview.querySelector('.word-equation-math')).not.toBeNull();
        expect(preview.textContent).toContain('√');
      });
    });
  });
});
