import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { updateVisualCaretDom, insertCharacter } from '../../src/editor/selection';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  createSuperscript,
  createSubscript,
  createMatrix,
  updateParentPointers,
  findSlotById,
  resetIdCounter,
} from '../../src/core/ast';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
  simulateClickAt,
} from '../helpers/dom-layout-engine';

describe('Gen15 Adversarial Challenge: Rapid Bursts, Boundary Edges & Nested Placeholders', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
  });

  function getWidgetAndDom(view: any): { widget: WordEquationWidget; dom: HTMLElement } {
    let widget: WordEquationWidget | null = null;
    view.state.field(wordEquationStateField).between(0, view.state.doc.length, (f: number, t: number, dec: any) => {
      if (dec.spec?.widget instanceof WordEquationWidget) {
        widget = dec.spec.widget;
      }
    });
    if (!widget) throw new Error('WordEquationWidget not found');
    const dom = (view.dom.querySelector('.word-equation-block') ||
      view.dom.querySelector('.word-equation-inline')) as HTMLElement;
    if (!dom) throw new Error('Equation DOM root not found');
    return { widget, dom };
  }

  // =========================================================================
  // Section 1: Rapid Click Bursts Stress Test (50-100 cycles)
  // =========================================================================
  describe('1. Rapid Click Bursts', () => {
    it('maintains strict single-caret invariant across 100 rapid click cycles on a complex equation', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>-</mo><mi>d</mi></mrow></mfrac>' +
        '<mo>+</mo>' +
        '<msqrt><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow></msqrt>' +
        '<mo>=</mo><mn>0</mn>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];
      expect(tokens.length).toBeGreaterThanOrEqual(10);

      for (let i = 0; i < 100; i++) {
        const token = tokens[i % tokens.length];
        const rect = token.getBoundingClientRect();
        const clickX = i % 3 === 0 ? rect.left + 1 : i % 3 === 1 ? rect.right - 1 : (rect.left + rect.right) / 2;
        const clickY = rect.top + rect.height / 2;

        simulateClickAt(dom, clickX, clickY);

        // Invariant 1: Exactly 1 .eq-caret in DOM
        const carets = dom.querySelectorAll('.eq-caret');
        expect(carets.length, `Cycle ${i}: Caret count must be exactly 1`).toBe(1);

        // Invariant 2: Text content is '|'
        const caretEl = carets[0] as HTMLElement;
        expect(caretEl.textContent, `Cycle ${i}: Caret text must be '|'`).toBe('|');

        // Invariant 3: Caret is attached
        expect(caretEl.isConnected, `Cycle ${i}: Caret must be attached`).toBe(true);

        // Invariant 4: eq-active on equation root
        const isEqActive = dom.classList.contains('eq-active') || dom.querySelector('.word-equation-math.eq-active') !== null;
        expect(isEqActive, `Cycle ${i}: Root equation must be active`).toBe(true);
      }

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // Section 2: Boundary Edges and Sub-Pixel Coordinate Clicks
  // =========================================================================
  describe('2. Boundary Edges and Sub-Pixel Coordinates', () => {
    it('handles decimal / floating-point sub-pixel boundary coordinates without errors', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mi>y</mi></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const tokenX = dom.querySelector('.eq-token') as HTMLElement;
      const rect = tokenX.getBoundingClientRect();

      // Decimal coordinates around midX
      const midX = rect.left + rect.width / 2;
      const decimalOffsets = [-0.999, -0.5001, -0.0001, 0.0, 0.0001, 0.5001, 0.999];

      for (const off of decimalOffsets) {
        simulateClickAt(dom, midX + off, rect.top + rect.height / 2);
        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Sub-pixel offset ${off} must render caret`).not.toBeNull();
        expect(widget.caret.offset).toBe(midX + off <= midX ? 0 : 1);
      }

      view.destroy();
      editorContainer.remove();
    });

    it('recovers gracefully from clicks far outside equation boundaries in all directions', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const extremePoints = [
        { x: -5000, y: -5000, expectedOffset: 0 },
        { x: -100, y: 100, expectedOffset: 0 },
        { x: 50000, y: 50000, expectedOffset: 1 },
        { x: 10000, y: 100, expectedOffset: 1 },
        { x: 100, y: -9999, expectedOffset: 0 },
      ];

      for (const pt of extremePoints) {
        simulateClickAt(dom, pt.x, pt.y);
        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Click at (${pt.x}, ${pt.y}) must produce caret`).not.toBeNull();
        expect(widget.caret.offset).toBe(pt.expectedOffset);
      }

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // Section 3: Deeply Nested Empty Placeholders
  // =========================================================================
  describe('3. Deeply Nested Empty Placeholders', () => {
    it('manages caret switching across multiple empty placeholders in nth-root of fraction', () => {
      // root( [] / [], [] )
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const idx = createSlot('index', []);
      const frac = createFraction(num, den);
      const rootNode = createRoot(createSlot('radicand', [frac]), idx);
      const root = createSlot('root', [rootNode]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root, { isFocused: true, caret: { slotId: root.id, offset: 0 } });
      document.body.appendChild(dom);
      computeAndApplyLayout(dom, 100, 100);

      const idxPlaceholder = dom.querySelector('.eq-radical-index .eq-placeholder') as HTMLElement;
      const numPlaceholder = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      const denPlaceholder = dom.querySelector('.eq-denominator .eq-placeholder') as HTMLElement;
      expect(idxPlaceholder).not.toBeNull();
      expect(numPlaceholder).not.toBeNull();
      expect(denPlaceholder).not.toBeNull();

      // Click index placeholder
      const rectIdx = idxPlaceholder.getBoundingClientRect();
      const caretIdx = handleMouseClick(root, dom, rectIdx.left + 5, rectIdx.top + 5, idxPlaceholder);
      expect(caretIdx.slotId).toBe(idx.id);

      updateVisualCaretDom(dom, caretIdx, true);
      expect(idxPlaceholder.classList.contains('eq-focused')).toBe(true);
      expect(idxPlaceholder.querySelector('.eq-caret')).not.toBeNull();
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(denPlaceholder.classList.contains('eq-focused')).toBe(false);

      // Click numerator placeholder
      const rectNum = numPlaceholder.getBoundingClientRect();
      const caretNum = handleMouseClick(root, dom, rectNum.left + 5, rectNum.top + 5, numPlaceholder);
      expect(caretNum.slotId).toBe(num.id);

      updateVisualCaretDom(dom, caretNum, true);
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(true);
      expect(numPlaceholder.querySelector('.eq-caret')).not.toBeNull();
      expect(idxPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(idxPlaceholder.textContent).toBe('⬚');

      // Click denominator placeholder
      const rectDen = denPlaceholder.getBoundingClientRect();
      const caretDen = handleMouseClick(root, dom, rectDen.left + 5, rectDen.top + 5, denPlaceholder);
      expect(caretDen.slotId).toBe(den.id);

      updateVisualCaretDom(dom, caretDen, true);
      expect(denPlaceholder.classList.contains('eq-focused')).toBe(true);
      expect(denPlaceholder.querySelector('.eq-caret')).not.toBeNull();
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(numPlaceholder.textContent).toBe('⬚');

      dom.remove();
    });

    it('types character into placeholder slot and transitions DOM without placeholder ghost', () => {
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', [createToken('2', 'mn')]);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Caret is at offset 0 in empty numerator
      const caret = { slotId: num.id, offset: 0 };
      const edit = insertCharacter(root, caret, '9');
      expect(edit.handled).toBe(true);

      const renderer = new DomRenderer();
      const updatedDom = renderer.render(edit.root, { isFocused: true, caret: edit.caret });
      document.body.appendChild(updatedDom);

      const numEl = updatedDom.querySelector('.eq-numerator') as HTMLElement;
      expect(numEl).not.toBeNull();

      // Numerator should no longer have .eq-placeholder
      expect(numEl.querySelector('.eq-placeholder')).toBeNull();

      // Numerator should have token '9' and caret '|'
      const token9 = numEl.querySelector('.eq-token') as HTMLElement;
      expect(token9).not.toBeNull();
      expect(token9.textContent).toBe('9');

      const caretEl = numEl.querySelector('.eq-caret') as HTMLElement;
      expect(caretEl).not.toBeNull();
      expect(token9.nextElementSibling).toBe(caretEl);

      updatedDom.remove();
    });
  });

  // =========================================================================
  // Section 4: Deeply Nested Continued Fraction Traversal
  // =========================================================================
  describe('4. Deeply Nested Continued Fractions', () => {
    it('accurately resolves caret location across a 5-level continued fraction', () => {
      // 1 / (1 + 1 / (1 + 1 / (1 + 1 / (1 + 1 / x))))
      let innermost: any = createToken('x', 'mi');
      const slotChain: string[] = [];

      for (let level = 5; level >= 1; level--) {
        const denSlot = createSlot('denominator', [createToken('1', 'mn'), createToken('+', 'mo'), innermost]);
        const numSlot = createSlot('numerator', [createToken('1', 'mn')]);
        slotChain.unshift(denSlot.id);
        innermost = createFraction(numSlot, denSlot);
      }

      const root = createSlot('root', [innermost]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root, { isFocused: true });
      document.body.appendChild(dom);
      computeAndApplyLayout(dom, 100, 100);

      // Locate innermost 'x' token
      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];
      const tokenX = tokens.find((t) => t.textContent === 'x');
      expect(tokenX).toBeDefined();

      const rectX = tokenX!.getBoundingClientRect();
      const caretAtX = handleMouseClick(root, dom, rectX.left + rectX.width * 0.8, rectX.top + rectX.height * 0.5, tokenX);

      expect(caretAtX.offset).toBe(3); // after 'x' in denominator slot
      expect(caretAtX.slotId).toBe(slotChain[slotChain.length - 1]);

      updateVisualCaretDom(dom, caretAtX, true);
      const caretEl = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caretEl).not.toBeNull();
      expect(caretEl.previousElementSibling).toBe(tokenX);

      dom.remove();
    });
  });
});
