/**
 * Gen17 Adversarial Stress Suite:
 * - R1 Selection Highlighting:
 *     * Multi-range selections (disjoint selection ranges, multi-cursor collapsed & uncollapsed, multiple equations).
 *     * Inverted selections (head < anchor, backward drag across equations, boundaries, and inside-out).
 *     * Rapid selection expansion and collapse (drag loops, incremental step-by-step sweeps, rapid toggles).
 *     * Deeply nested equations and mixed inline/block equation selections.
 *     * Precise boundary selections (exact boundary touching vs 1-character overlap, inside-to-outside, outside-to-inside).
 *     * Suppression of .eq-selected during internal equation active editing and restoration after exit.
 * - R2 Settings UI Rendering:
 *     * Extreme MathML inputs (10-level nested fractions, empty tags, malformed XML, large matrices, mixed unicode math symbols).
 *     * Live typing rapid mutations in input.weq-input-expansion (keystroke-by-keystroke simulation, backspacing, randomized stress fuzzing).
 *     * Click interactions and event propagation (click-to-focus bubbling from deep inner elements, rapid clicks, add/delete shortcuts lifecycle).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { resetIdCounter } from '../../src/core/ast';
import { createMockEditor } from '../helpers/cm6-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  updateEquationSelectionDom,
  updateVisualCaretDom,
} from '../../src/editor/selection';
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
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';

describe('Gen17 Adversarial Stress Suite: R1 (Selection Highlighting) & R2 (Settings UI Rendering)', () => {
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
  // R1: Adversarial Selection Highlighting
  // =========================================================================
  describe('R1: Adversarial Selection Highlighting', () => {
    it('handles multi-range selections: disjoint selections across multiple block and inline equations', () => {
      // Document with 3 equations:
      // Eq1 (block): lines 1-3
      // Eq2 (inline): line 5
      // Eq3 (block): lines 7-9
      const doc = [
        'Intro text before equations',
        '```math-word',
        '<math><mn>1</mn></math>',
        '```',
        'Intermediate text with /weq_inline <math><mi>x</mi></math> /weq_inline in the middle.',
        'Separating paragraph between second and third equations.',
        '```math-word',
        '<math><mn>3</mn></math>',
        '```',
        'Outro conclusion at the very bottom.',
      ].join('\n');

      const { view, container: editorContainer } = createMockEditor(doc, [
        EditorState.allowMultipleSelections.of(true),
      ]);

      const equationEls = Array.from(
        view.dom.querySelectorAll<HTMLElement>('[data-equation-from]')
      );
      expect(equationEls.length).toBe(3);

      const [eq1El, eq2El, eq3El] = equationEls;
      const eq1From = Number(eq1El.getAttribute('data-equation-from'));
      const eq1To = Number(eq1El.getAttribute('data-equation-to'));
      const eq2From = Number(eq2El.getAttribute('data-equation-from'));
      const eq2To = Number(eq2El.getAttribute('data-equation-to'));
      const eq3From = Number(eq3El.getAttribute('data-equation-from'));
      const eq3To = Number(eq3El.getAttribute('data-equation-to'));

      // Scenario A: Disjoint multi-range selection: Range 1 covers Eq1, Range 2 covers Eq3, Eq2 untouched
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.range(eq1From, eq1To),
          EditorSelection.range(eq3From, eq3To),
        ]),
      });

      expect(eq1El.classList.contains('eq-selected')).toBe(true);
      expect(eq1El.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(true);

      expect(eq2El.classList.contains('eq-selected')).toBe(false);
      expect(eq2El.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(false);

      expect(eq3El.classList.contains('eq-selected')).toBe(true);
      expect(eq3El.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(true);

      // Scenario B: Multi-range with one collapsed cursor at Eq1, non-empty selection on Eq2, collapsed at Eq3
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.range(eq1From + 2, eq1From + 2), // Collapsed in Eq1
          EditorSelection.range(eq2From, eq2To),           // Non-empty on Eq2
          EditorSelection.range(eq3From + 4, eq3From + 4), // Collapsed in Eq3
        ]),
      });

      expect(eq1El.classList.contains('eq-selected')).toBe(false);
      expect(eq2El.classList.contains('eq-selected')).toBe(true);
      expect(eq3El.classList.contains('eq-selected')).toBe(false);

      // Scenario C: Multi-cursor where all cursors are collapsed (e.g. 5 cursors placed across document)
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.range(0, 0),
          EditorSelection.range(eq1From, eq1From),
          EditorSelection.range(eq2From, eq2From),
          EditorSelection.range(eq3From, eq3From),
          EditorSelection.range(view.state.doc.length, view.state.doc.length),
        ]),
      });

      expect(eq1El.classList.contains('eq-selected')).toBe(false);
      expect(eq2El.classList.contains('eq-selected')).toBe(false);
      expect(eq3El.classList.contains('eq-selected')).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('handles inverted selections (backward drag, head < anchor) over block and inline equations', () => {
      const doc = 'Prefix text\n```math-word\n<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\n```\nMiddle /weq_inline <math><msqrt><mi>z</mi></msqrt></math> /weq_inline Suffix';
      const { view, container: editorContainer } = createMockEditor(doc);

      const equationEls = Array.from(
        view.dom.querySelectorAll<HTMLElement>('[data-equation-from]')
      );
      expect(equationEls.length).toBe(2);

      const [eqBlock, eqInline] = equationEls;
      const bFrom = Number(eqBlock.getAttribute('data-equation-from'));
      const bTo = Number(eqBlock.getAttribute('data-equation-to'));
      const iFrom = Number(eqInline.getAttribute('data-equation-from'));
      const iTo = Number(eqInline.getAttribute('data-equation-to'));

      // 1. Backward drag completely spanning block equation: anchor = bTo + 5, head = bFrom - 5
      view.dispatch({
        selection: EditorSelection.range(bTo + 5, bFrom - 5),
      });
      expect(view.state.selection.main.head).toBeLessThan(view.state.selection.main.anchor);
      expect(eqBlock.classList.contains('eq-selected')).toBe(true);
      expect(eqBlock.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(true);
      expect(eqInline.classList.contains('eq-selected')).toBe(false);

      // 2. Backward drag starting inside block equation and ending before it: anchor = bFrom + 5, head = bFrom - 3
      view.dispatch({
        selection: EditorSelection.range(bFrom + 5, bFrom - 3),
      });
      expect(eqBlock.classList.contains('eq-selected')).toBe(true);

      // 3. Backward drag starting after block equation and ending inside it: anchor = bTo + 3, head = bTo - 4
      view.dispatch({
        selection: EditorSelection.range(bTo + 3, bTo - 4),
      });
      expect(eqBlock.classList.contains('eq-selected')).toBe(true);

      // 4. Backward drag over inline equation: anchor = iTo + 2, head = iFrom - 2
      view.dispatch({
        selection: EditorSelection.range(iTo + 2, iFrom - 2),
      });
      expect(eqBlock.classList.contains('eq-selected')).toBe(false);
      expect(eqInline.classList.contains('eq-selected')).toBe(true);
      expect(eqInline.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(true);

      // 5. Inverted selection strictly before equation: anchor = bFrom, head = 0
      // Note: anchor = bFrom means r.to = bFrom, r.from = 0. Does not overlap [bFrom, bTo]
      view.dispatch({
        selection: EditorSelection.range(bFrom, 0),
      });
      expect(eqBlock.classList.contains('eq-selected')).toBe(false);

      // 6. Inverted selection strictly after equation: anchor = view.state.doc.length, head = bTo
      // r.from = bTo, r.to = length. Does not overlap [bFrom, bTo]
      view.dispatch({
        selection: EditorSelection.range(view.state.doc.length, bTo),
      });
      expect(eqBlock.classList.contains('eq-selected')).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('handles continuous drag sweeps and rapid selection expansion/collapse without state corruption', () => {
      const doc = 'Header\n```math-word\n<math><mi>A</mi></math>\n```\nMid /weq_inline <math><mi>B</mi></math> /weq_inline\n```math-word\n<math><mi>C</mi></math>\n```\nFooter';
      const { view, container: editorContainer } = createMockEditor(doc);

      const equationEls = Array.from(
        view.dom.querySelectorAll<HTMLElement>('[data-equation-from]')
      );
      expect(equationEls.length).toBe(3);

      const ranges = equationEls.map((el) => ({
        el,
        from: Number(el.getAttribute('data-equation-from')),
        to: Number(el.getAttribute('data-equation-to')),
      }));

      // Simulate a continuous drag selection from position 0 sweeping across entire document character-by-character
      const docLen = view.state.doc.length;
      for (let head = 0; head <= docLen; head += 3) {
        view.dispatch({
          selection: EditorSelection.range(0, head),
        });

        const selFrom = 0;
        const selTo = head;
        const isNonEmpty = selFrom < selTo;

        ranges.forEach(({ el, from, to }) => {
          const expectedSelected = isNonEmpty && selFrom < to && selTo > from;
          const actualSelected = el.classList.contains('eq-selected');
          expect(actualSelected).toBe(expectedSelected);
        });
      }

      // Rapid toggle stress test: 50 cycles of collapse vs select-all
      for (let i = 0; i < 50; i++) {
        // Select all
        view.dispatch({ selection: { anchor: 0, head: docLen } });
        expect(ranges.every((r) => r.el.classList.contains('eq-selected'))).toBe(true);

        // Collapse to anchor
        view.dispatch({ selection: { anchor: 10 } });
        expect(ranges.some((r) => r.el.classList.contains('eq-selected'))).toBe(false);
      }

      view.destroy();
      editorContainer.remove();
    });

    it('handles deeply nested equation structures and styling application', () => {
      // Equation with 4-level nested fractions inside radical
      const deepMathML = '<math><msqrt><mfrac><mrow><mfrac><mrow><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow><mn>3</mn></mfrac></mrow><mn>4</mn></mfrac></msqrt></math>';
      const doc = `Start\n\`\`\`math-word\n${deepMathML}\n\`\`\`\nEnd`;

      const { view, container: editorContainer } = createMockEditor(doc);

      const eqEl = view.dom.querySelector('.word-equation-block') as HTMLElement;
      expect(eqEl).not.toBeNull();

      // Deep structure verification
      const radical = eqEl.querySelector('.eq-radical');
      expect(radical).not.toBeNull();
      const fractions = eqEl.querySelectorAll('.eq-fraction');
      expect(fractions.length).toBe(3);

      // Apply selection highlight across equation
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });

      expect(eqEl.classList.contains('eq-selected')).toBe(true);
      const mathBox = eqEl.querySelector('.word-equation-math') as HTMLElement;
      expect(mathBox).not.toBeNull();
      expect(mathBox.classList.contains('eq-selected')).toBe(true);

      // Collapse selection
      view.dispatch({ selection: { anchor: 0 } });
      expect(eqEl.classList.contains('eq-selected')).toBe(false);
      expect(mathBox.classList.contains('eq-selected')).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('accurately verifies strict boundary conditions (overlap by 1 character vs exact touching)', () => {
      const doc = 'AAA\n```math-word\n<math><mn>7</mn></math>\n```\nBBB';
      const { view, container: editorContainer } = createMockEditor(doc);

      const eqEl = view.dom.querySelector('.word-equation-block') as HTMLElement;
      expect(eqEl).not.toBeNull();

      const from = Number(eqEl.getAttribute('data-equation-from'));
      const to = Number(eqEl.getAttribute('data-equation-to'));

      // Test 1: Exact left boundary touch [0, from] -> NOT selected
      view.dispatch({ selection: EditorSelection.range(0, from) });
      expect(eqEl.classList.contains('eq-selected')).toBe(false);

      // Test 2: Overlap left boundary by 1 char [0, from + 1] -> SELECTED
      view.dispatch({ selection: EditorSelection.range(0, from + 1) });
      expect(eqEl.classList.contains('eq-selected')).toBe(true);

      // Test 3: Exact right boundary touch [to, doc.length] -> NOT selected
      view.dispatch({ selection: EditorSelection.range(to, view.state.doc.length) });
      expect(eqEl.classList.contains('eq-selected')).toBe(false);

      // Test 4: Overlap right boundary by 1 char [to - 1, doc.length] -> SELECTED
      view.dispatch({ selection: EditorSelection.range(to - 1, view.state.doc.length) });
      expect(eqEl.classList.contains('eq-selected')).toBe(true);

      // Test 5: Inverted exact touch [from, 0] -> NOT selected
      view.dispatch({ selection: EditorSelection.range(from, 0) });
      expect(eqEl.classList.contains('eq-selected')).toBe(false);

      // Test 6: Inverted overlap left boundary [from + 1, 0] -> SELECTED
      view.dispatch({ selection: EditorSelection.range(from + 1, 0) });
      expect(eqEl.classList.contains('eq-selected')).toBe(true);

      // Test 7: Inverted exact touch [doc.length, to] -> NOT selected
      view.dispatch({ selection: EditorSelection.range(view.state.doc.length, to) });
      expect(eqEl.classList.contains('eq-selected')).toBe(false);

      // Test 8: Inverted overlap right boundary [doc.length, to - 1] -> SELECTED
      view.dispatch({ selection: EditorSelection.range(view.state.doc.length, to - 1) });
      expect(eqEl.classList.contains('eq-selected')).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('suppresses selection highlight during active internal equation focus and restores on exit', () => {
      const doc = 'Text before\n```math-word\n<math><mi>x</mi></math>\n```\nText after';
      const { view, container: editorContainer } = createMockEditor(doc);

      const eqEl = view.dom.querySelector('.word-equation-block') as HTMLElement;
      expect(eqEl).not.toBeNull();
      const widget = (eqEl as any).__widget as WordEquationWidget;
      expect(widget).toBeDefined();

      const from = Number(eqEl.getAttribute('data-equation-from'));
      const to = Number(eqEl.getAttribute('data-equation-to'));

      // 1. External selection over equation -> selected
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      expect(eqEl.classList.contains('eq-selected')).toBe(true);

      // 2. User enters equation internally -> active session takes over
      widget.enterFromStart(view);
      setActiveEquationState({
        from,
        to,
        caret: widget.caret,
        isFocused: true,
        ast: widget.ast,
      });

      // Dispatch view update
      view.dispatch({ selection: { anchor: 0, head: 5 } });

      // Because equation is internally active, .eq-selected must NOT be present
      expect(eqEl.classList.contains('eq-selected')).toBe(false);
      expect(eqEl.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(false);

      // 3. User exits internal editing -> active session cleared
      clearActiveEquationState();
      widget.isFocused = false;

      // New external selection spanning equation
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      expect(eqEl.classList.contains('eq-selected')).toBe(true);
      expect(eqEl.querySelector('.word-equation-math')?.classList.contains('eq-selected')).toBe(true);

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // R2: Adversarial Settings UI Rendering
  // =========================================================================
  describe('R2: Adversarial Settings UI Rendering', () => {
    describe('Extreme MathML inputs and robust rendering resilience', () => {
      it('renders 10-level deeply nested fractions without stack overflow or crash', () => {
        let nested = '<mn>0</mn>';
        for (let i = 1; i <= 10; i++) {
          nested = `<mfrac><mn>${i}</mn><mrow>${nested}</mrow></mfrac>`;
        }
        const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML">${nested}</math>`;

        const containerEl = document.createElement('div');
        expect(() => {
          renderExpansionPreview(xml, containerEl);
        }).not.toThrow();

        const math = containerEl.querySelector('.word-equation-math');
        expect(math).not.toBeNull();
        const fractions = containerEl.querySelectorAll('.eq-fraction');
        expect(fractions.length).toBe(10);
        expect(containerEl.querySelector('math.weq-native-mathml')).not.toBeNull();
      });

      it('safely handles empty MathML tags and self-closing tags', () => {
        const emptyCases = [
          '<math><mfrac><mrow></mrow><mrow></mrow></mfrac></math>',
          '<math><mfrac><mrow/><mrow/></mfrac></math>',
          '<math><msqrt></msqrt></math>',
          '<math><msqrt/></math>',
          '<math><msub><mrow/><mrow/></msub></math>',
          '<math><msup><mrow/><mrow/></msup></math>',
          '<math><msubsup><mrow/><mrow/><mrow/></msubsup></math>',
          '<math><mi></mi></math>',
          '<math><mn></mn></math>',
          '<math><mo></mo></math>',
          '<math><mtext></mtext></math>',
          '<math></math>',
          '<math/>',
        ];

        emptyCases.forEach((xml) => {
          const preview = document.createElement('div');
          expect(() => {
            renderExpansionPreview(xml, preview);
          }).not.toThrow();
          expect(preview.children.length).toBeGreaterThan(0);
        });
      });

      it('recovers gracefully from malformed XML, unclosed tags, and hostile strings', () => {
        const hostileInputs = [
          '<math><mfrac><mn>1</mfrac></math>',                // Unclosed mfrac
          '<<<math><unknown-element>',                         // Corrupted XML syntax
          '<math><mi>&unknown_entity;</mi></math>',            // Undefined XML entity
          '<script>alert("xss")</script>',                     // HTML script injection
          '<svg><circle cx="50" cy="50" r="40"/></svg>',       // Foreign SVG XML
          'Plain unformatted text without any XML tags',       // Raw non-XML string
          '\\\\\\///\\\\///||||||&&&',                         // Garbage punctuation
          'a / b + c * d ^ 2',                                 // Linear syntax fallback
          '   \n\t   \r\n   ',                                 // Whitespace-only
        ];

        hostileInputs.forEach((input) => {
          const preview = document.createElement('div');
          expect(() => {
            renderExpansionPreview(input, preview);
          }).not.toThrow();
          expect(preview.childNodes.length).toBeGreaterThan(0);
        });
      });

      it('renders large matrices without performance degradation', () => {
        // Construct a 10x10 matrix (100 cells)
        let rows = '';
        for (let r = 0; r < 10; r++) {
          let cols = '';
          for (let c = 0; c < 10; c++) {
            cols += `<mtd><mn>${r * 10 + c}</mn></mtd>`;
          }
          rows += `<mtr>${cols}</mtr>`;
        }
        const matrixXml = `<math xmlns="http://www.w3.org/1998/Math/MathML"><mtable>${rows}</mtable></math>`;

        const preview = document.createElement('div');
        const start = performance.now();
        renderExpansionPreview(matrixXml, preview);
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(500); // Must render well within 500ms
        const math = preview.querySelector('.word-equation-math');
        expect(math).not.toBeNull();
        expect(preview.querySelectorAll('.eq-matrix-cell').length).toBe(100);
      });

      it('accurately renders mixed Unicode mathematical symbols, operators, and modifiers', () => {
        const unicodeMath = 'α + β × γ ≤ ∑_{i=1}^{n} x_i ∫_0^∞ f(x)dx ⊗ ∇ × E⃗';
        const preview = document.createElement('div');

        expect(() => {
          renderExpansionPreview(unicodeMath, preview);
        }).not.toThrow();

        const text = preview.textContent || '';
        expect(text).toContain('α');
        expect(text).toContain('β');
        expect(text).toContain('γ');
        expect(text).toContain('∑');
        expect(text).toContain('∫');
        expect(text).toContain('∇');
        expect(text).toContain('⊗');
      });
    });

    describe('Live typing mutations, rapid keystrokes, and randomized fuzzing', () => {
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
              { trigger: '\\target', expansion: '' },
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

      it('simulates keystroke-by-keystroke typing through intermediate broken states', async () => {
        tab.display();
        const row = tab.containerEl.querySelector('tbody tr')!;
        const preview = row.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = row.querySelector('input.weq-input-expansion') as HTMLInputElement;

        // Initially empty -> renders placeholder ⬚
        expect(preview.querySelector('.weq-preview-empty')?.textContent).toBe('⬚');

        // Type full MathML fraction character-by-character
        const targetXml = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
        let accumulated = '';

        for (let i = 0; i < targetXml.length; i++) {
          accumulated += targetXml[i];
          input.value = accumulated;
          // Dispatch input event for each character
          input.dispatchEvent(new Event('input'));

          // Must never crash or leave container blank
          expect(preview.childNodes.length).toBeGreaterThan(0);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        // At final complete state, visual fraction must be rendered
        const frac = preview.querySelector('.eq-fraction');
        expect(frac).not.toBeNull();
        expect(preview.querySelector('.eq-numerator')?.textContent).toBe('1');
        expect(preview.querySelector('.eq-denominator')?.textContent).toBe('2');
        expect(preview.querySelector('math.weq-native-mathml')).not.toBeNull();
      });

      it('simulates keystroke-by-keystroke backspacing/deletion back to empty string', async () => {
        tab.display();
        const row = tab.containerEl.querySelector('tbody tr')!;
        const preview = row.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = row.querySelector('input.weq-input-expansion') as HTMLInputElement;

        // Set initial valid value
        input.value = '<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>';
        input.dispatchEvent(new Event('input'));
        expect(preview.querySelector('.eq-fraction')).not.toBeNull();

        // Backspace character-by-character
        while (input.value.length > 0) {
          input.value = input.value.slice(0, -1);
          input.dispatchEvent(new Event('input'));
          expect(preview.childNodes.length).toBeGreaterThan(0);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        // When completely emptied, placeholder ⬚ must be restored
        const emptyPlaceholder = preview.querySelector('.weq-preview-empty');
        expect(emptyPlaceholder).not.toBeNull();
        expect(emptyPlaceholder?.textContent).toBe('⬚');
      });

      it('fuzz-tests 50 randomized string mutations without unhandled exceptions', async () => {
        tab.display();
        const row = tab.containerEl.querySelector('tbody tr')!;
        const preview = row.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = row.querySelector('input.weq-input-expansion') as HTMLInputElement;

        const tokens = [
          '<math>', '</math>', '<mfrac>', '</mfrac>', '<mn>123</mn>', '<mi>x</mi>',
          '<msqrt>', '</msqrt>', '<msup>', '</msup>', '<mtext>hello</mtext>',
          '1/2', 'x^2', '\\alpha', '∑', '∫', '⬚', '<>', '><', '""', "''",
          '\n', '\t', '   ', 'invalid&entity;', '###', '```',
        ];

        for (let iter = 0; iter < 50; iter++) {
          // Generate random permutation of 3-5 tokens
          const numTokens = 3 + Math.floor(Math.random() * 3);
          let randomStr = '';
          for (let t = 0; t < numTokens; t++) {
            randomStr += tokens[Math.floor(Math.random() * tokens.length)];
          }

          input.value = randomStr;
          expect(() => {
            input.dispatchEvent(new Event('input'));
          }).not.toThrow();

          expect(preview.childNodes.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Click interactions, focus delegation, and event bubbling', () => {
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
              {
                trigger: '\\complex',
                expansion: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow><msqrt><mi>x</mi></msqrt></mrow><mn>2</mn></mfrac></math>',
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

      it('delegates focus to input when clicking on deeply nested elements inside preview', () => {
        tab.display();
        const row = tab.containerEl.querySelector('tbody tr')!;
        const preview = row.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = row.querySelector('input.weq-input-expansion') as HTMLInputElement;

        let focusCount = 0;
        input.focus = () => {
          focusCount++;
        };

        // 1. Click directly on preview container
        preview.click();
        expect(focusCount).toBe(1);

        // 2. Click on radical radicand deep inside fraction numerator
        const radicand = preview.querySelector('.eq-radicand') as HTMLElement;
        expect(radicand).not.toBeNull();
        radicand.click();
        expect(focusCount).toBe(2);

        // 3. Click on fraction denominator
        const den = preview.querySelector('.eq-denominator') as HTMLElement;
        expect(den).not.toBeNull();
        den.click();
        expect(focusCount).toBe(3);

        // 4. Click on radical symbol
        const radicalSymbol = preview.querySelector('.eq-radical-symbol') as HTMLElement;
        if (radicalSymbol) {
          radicalSymbol.click();
          expect(focusCount).toBe(4);
        }
      });

      it('handles rapid click bursts without error or broken state', () => {
        tab.display();
        const row = tab.containerEl.querySelector('tbody tr')!;
        const preview = row.querySelector('.weq-expansion-preview') as HTMLElement;
        const input = row.querySelector('input.weq-input-expansion') as HTMLInputElement;

        let focusCount = 0;
        input.focus = () => {
          focusCount++;
        };

        for (let i = 0; i < 20; i++) {
          preview.click();
        }
        expect(focusCount).toBe(20);
      });

      it('supports full shortcut lifecycle: add, edit trigger, edit expansion, preview update, and delete', async () => {
        tab.display();
        expect(tab.containerEl.querySelectorAll('tbody tr').length).toBe(1);

        // 1. Click "Add Shortcut"
        const addBtn = Array.from(tab.containerEl.querySelectorAll('button')).find(
          (b) => b.textContent?.includes('Add Shortcut')
        );
        expect(addBtn).toBeDefined();
        addBtn!.click();
        await new Promise((resolve) => setTimeout(resolve, 30));

        let rows = tab.containerEl.querySelectorAll('tbody tr');
        expect(rows.length).toBe(2);

        // 2. Edit new row trigger and expansion
        const newRow = rows[1];
        const triggerInput = newRow.querySelector('input.weq-input-trigger') as HTMLInputElement;
        const expInput = newRow.querySelector('input.weq-input-expansion') as HTMLInputElement;
        const preview = newRow.querySelector('.weq-expansion-preview') as HTMLElement;

        triggerInput.value = '\\alpha';
        triggerInput.dispatchEvent(new Event('input'));

        expInput.value = '<math><mi>α</mi></math>';
        expInput.dispatchEvent(new Event('input'));
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(mockPlugin.settings.customShortcuts[1].trigger).toBe('\\alpha');
        expect(mockPlugin.settings.customShortcuts[1].expansion).toBe('<math><mi>α</mi></math>');
        expect(preview.textContent).toContain('α');

        // 3. Delete the first row
        const delBtnFirst = rows[0].querySelector('button.weq-btn-delete') as HTMLButtonElement;
        expect(delBtnFirst).not.toBeNull();
        delBtnFirst.click();
        await new Promise((resolve) => setTimeout(resolve, 30));

        // Re-queried rows: should now only have 1 row
        rows = tab.containerEl.querySelectorAll('tbody tr');
        expect(rows.length).toBe(1);
        expect(mockPlugin.settings.customShortcuts.length).toBe(1);
        expect(mockPlugin.settings.customShortcuts[0].trigger).toBe('\\alpha');
      });
    });
  });
});
