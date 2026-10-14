import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { updateVisualCaretDom } from '../../src/editor/selection';
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
} from '../../src/core/ast';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
  simulateClickAt,
} from '../helpers/dom-layout-engine';

describe('Adversarial Caret Rendering & Mouse Hit-Testing Stress Suite', () => {
  let container: HTMLElement;

  beforeEach(() => {
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
    if (!widget) {
      throw new Error('WordEquationWidget not found in view');
    }
    const dom = (view.dom.querySelector('.word-equation-block') ||
      view.dom.querySelector('.word-equation-inline')) as HTMLElement;
    if (!dom) {
      throw new Error('Equation DOM root not found');
    }
    return { widget, dom };
  }

  // =========================================================================
  // Section 1: Deeply Nested Equations Hit-Testing & Caret Rendering
  // =========================================================================
  describe('1. Deeply Nested Equations', () => {
    it('accurately hit-tests and renders caret in fraction nested inside radical: sqrt((a+1)/(b-2))', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<msqrt>' +
        '<mfrac>' +
        '<mrow><mi>a</mi><mo>+</mo><mn>1</mn></mrow>' +
        '<mrow><mi>b</mi><mo>-</mo><mn>2</mn></mrow>' +
        '</mfrac>' +
        '</msqrt>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      // Target numerator tokens: 'a', '+', '1'
      const numEl = dom.querySelector('.eq-numerator') as HTMLElement;
      expect(numEl).not.toBeNull();
      const numTokens = Array.from(numEl.querySelectorAll('.eq-token')) as HTMLElement[];
      expect(numTokens.length).toBe(3);

      // Click on 'a' (before midpoint -> offset 0)
      const rectA = numTokens[0].getBoundingClientRect();
      simulateClickAt(dom, rectA.left + rectA.width * 0.2, rectA.top + rectA.height * 0.5);

      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must exist in DOM').not.toBeNull();
      expect(caret.isConnected).toBe(true);
      expect(caret.textContent).toBe('|');
      expect(numEl.contains(caret)).toBe(true);
      expect(caret.nextElementSibling).toBe(numTokens[0]);

      // Click on '+' (after midpoint -> offset 2 in numerator slot)
      computeAndApplyLayout(dom, 100, 100);
      const rectPlus = numTokens[1].getBoundingClientRect();
      simulateClickAt(dom, rectPlus.left + rectPlus.width * 0.8, rectPlus.top + rectPlus.height * 0.5);

      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(numEl.contains(caret)).toBe(true);
      expect(caret.previousElementSibling).toBe(numTokens[1]);

      // Target denominator tokens: 'b', '-', '2'
      const denEl = dom.querySelector('.eq-denominator') as HTMLElement;
      expect(denEl).not.toBeNull();
      const denTokens = Array.from(denEl.querySelectorAll('.eq-token')) as HTMLElement[];
      expect(denTokens.length).toBe(3);

      // Click on '2' in denominator
      computeAndApplyLayout(dom, 100, 100);
      const rect2 = denTokens[2].getBoundingClientRect();
      simulateClickAt(dom, rect2.left + rect2.width * 0.8, rect2.top + rect2.height * 0.5);

      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(denEl.contains(caret)).toBe(true);
      expect(numEl.contains(caret)).toBe(false);
      expect(caret.previousElementSibling).toBe(denTokens[2]);

      view.destroy();
      editorContainer.remove();
    });

    it('hit-tests nth-root with fraction in index and fraction in radicand: root(m/n, (x+y)/z)', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mroot>' +
        '<mfrac><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow><mi>z</mi></mfrac>' +
        '<mfrac><mi>m</mi><mi>n</mi></mfrac>' +
        '</mroot>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const idxEl = dom.querySelector('.eq-radical-index') as HTMLElement;
      const radEl = dom.querySelector('.eq-radicand') as HTMLElement;
      expect(idxEl).not.toBeNull();
      expect(radEl).not.toBeNull();

      // Click inside index numerator ('m')
      const tokenM = idxEl.querySelector('.eq-numerator .eq-token') as HTMLElement;
      expect(tokenM).not.toBeNull();
      expect(tokenM.textContent).toBe('m');
      const rectM = tokenM.getBoundingClientRect();
      simulateClickAt(dom, rectM.left + rectM.width * 0.5, rectM.top + rectM.height * 0.5);

      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(idxEl.contains(caret)).toBe(true);
      expect(radEl.contains(caret)).toBe(false);

      // Click inside radicand denominator ('z')
      computeAndApplyLayout(dom, 100, 100);
      const tokenZ = radEl.querySelector('.eq-denominator .eq-token') as HTMLElement;
      expect(tokenZ).not.toBeNull();
      expect(tokenZ.textContent).toBe('z');
      const rectZ = tokenZ.getBoundingClientRect();
      simulateClickAt(dom, rectZ.left + rectZ.width * 0.5, rectZ.top + rectZ.height * 0.5);

      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(radEl.contains(caret)).toBe(true);
      expect(idxEl.contains(caret)).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('hit-tests and places caret across 4-level deeply nested superscripts: x^(y^(z^w))', () => {
      // AST construction for 4-level superscript
      const slotW = createSlot('sup', [createToken('w', 'mi')]);
      const supZ = createSuperscript(createSlot('base', [createToken('z', 'mi')]), slotW);
      const supY = createSuperscript(createSlot('base', [createToken('y', 'mi')]), createSlot('sup', [supZ]));
      const supX = createSuperscript(createSlot('base', [createToken('x', 'mi')]), createSlot('sup', [supY]));
      const root = createSlot('root', [supX]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const rendered = renderer.render(root, { isFocused: true, caret: { slotId: root.id, offset: 0 } });
      document.body.appendChild(rendered);
      computeAndApplyLayout(rendered, 100, 100);

      // Verify each level's token can be targeted
      const tokens = Array.from(rendered.querySelectorAll('.eq-token')) as HTMLElement[];
      const tokenMap: Record<string, HTMLElement> = {};
      tokens.forEach((t) => {
        tokenMap[t.textContent || ''] = t;
      });

      expect(tokenMap['x']).toBeDefined();
      expect(tokenMap['y']).toBeDefined();
      expect(tokenMap['z']).toBeDefined();
      expect(tokenMap['w']).toBeDefined();

      // Click on 'w' (innermost superscript)
      const rectW = tokenMap['w'].getBoundingClientRect();
      const caretW = handleMouseClick(root, rendered, rectW.left + rectW.width * 0.8, rectW.top + rectW.height * 0.5, tokenMap['w']);
      expect(caretW.slotId).toBe(slotW.id);
      expect(caretW.offset).toBe(1);

      // Update DOM and verify caret element is in innermost superscript element
      updateVisualCaretDom(rendered, caretW, true);
      const caretEl = rendered.querySelector('.eq-caret') as HTMLElement;
      expect(caretEl).not.toBeNull();
      expect(caretEl.parentElement?.contains(tokenMap['w'])).toBe(true);

      // Click on 'y' (level 1 superscript)
      const rectY = tokenMap['y'].getBoundingClientRect();
      const caretY = handleMouseClick(root, rendered, rectY.left + rectY.width * 0.2, rectY.top + rectY.height * 0.5, tokenMap['y']);
      updateVisualCaretDom(rendered, caretY, true);
      const caretElY = rendered.querySelector('.eq-caret') as HTMLElement;
      expect(caretElY).not.toBeNull();
      expect(caretElY.parentElement?.contains(tokenMap['y'])).toBe(true);

      rendered.remove();
    });

    it('hit-tests matrix with nested fractions, radicals, and superscripts in cells', () => {
      // 2x2 Matrix:
      // [ (1/2),    x^2 ]
      // [ sqrt(y),  a+b ]
      const cell00 = createSlot('cell', [createFraction(createSlot('numerator', [createToken('1', 'mn')]), createSlot('denominator', [createToken('2', 'mn')]))]);
      const cell01 = createSlot('cell', [createSuperscript(createSlot('base', [createToken('x', 'mi')]), createSlot('sup', [createToken('2', 'mn')]))]);
      const cell10 = createSlot('cell', [createRadical(createSlot('radicand', [createToken('y', 'mi')]))]);
      const cell11 = createSlot('cell', [createToken('a', 'mi'), createToken('+', 'mo'), createToken('b', 'mi')]);

      const mat = createMatrix([
        [cell00, cell01],
        [cell10, cell11],
      ]);
      const root = createSlot('root', [mat]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root, { isFocused: true });
      document.body.appendChild(dom);
      computeAndApplyLayout(dom, 100, 100);

      const cells = Array.from(dom.querySelectorAll('.eq-matrix-cell')) as HTMLElement[];
      expect(cells.length).toBe(4);

      // 1. Click numerator '1' in cell (0,0)
      const token1 = cells[0].querySelector('.eq-numerator .eq-token') as HTMLElement;
      expect(token1.textContent).toBe('1');
      const rect1 = token1.getBoundingClientRect();
      const caret1 = handleMouseClick(root, dom, rect1.left + rect1.width * 0.2, rect1.top + rect1.height * 0.5, token1);
      expect(caret1.offset).toBe(0);
      updateVisualCaretDom(dom, caret1, true);
      let caretEl = dom.querySelector('.eq-caret') as HTMLElement;
      expect(cells[0].contains(caretEl)).toBe(true);

      // 2. Click superscript '2' in cell (0,1)
      const tokenSup2 = cells[1].querySelector('.eq-superscript .eq-token') as HTMLElement;
      expect(tokenSup2.textContent).toBe('2');
      const rectSup2 = tokenSup2.getBoundingClientRect();
      const caretSup2 = handleMouseClick(root, dom, rectSup2.left + rectSup2.width * 0.8, rectSup2.top + rectSup2.height * 0.5, tokenSup2);
      expect(caretSup2.offset).toBe(1);
      updateVisualCaretDom(dom, caretSup2, true);
      caretEl = dom.querySelector('.eq-caret') as HTMLElement;
      expect(cells[1].contains(caretEl)).toBe(true);

      // 3. Click radicand 'y' in cell (1,0)
      const tokenY = cells[2].querySelector('.eq-radicand .eq-token') as HTMLElement;
      expect(tokenY.textContent).toBe('y');
      const rectY = tokenY.getBoundingClientRect();
      const caretY = handleMouseClick(root, dom, rectY.left + rectY.width * 0.5, rectY.top + rectY.height * 0.5, tokenY);
      updateVisualCaretDom(dom, caretY, true);
      caretEl = dom.querySelector('.eq-caret') as HTMLElement;
      expect(cells[2].contains(caretEl)).toBe(true);

      // 4. Click '+' in cell (1,1)
      const tokenPlus = cells[3].querySelectorAll('.eq-token')[1] as HTMLElement;
      expect(tokenPlus.textContent).toBe('+');
      const rectPlus = tokenPlus.getBoundingClientRect();
      const caretPlus = handleMouseClick(root, dom, rectPlus.left + rectPlus.width * 0.8, rectPlus.top + rectPlus.height * 0.5, tokenPlus);
      expect(caretPlus.slotId).toBe(cell11.id);
      expect(caretPlus.offset).toBe(2);
      updateVisualCaretDom(dom, caretPlus, true);
      caretEl = dom.querySelector('.eq-caret') as HTMLElement;
      expect(cells[3].contains(caretEl)).toBe(true);

      dom.remove();
    });
  });

  // =========================================================================
  // Section 2: Extreme Coordinate Clicks
  // =========================================================================
  describe('2. Extreme Coordinate Clicks', () => {
    it('handles negative coordinates gracefully without crashing and clamps to offset 0', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mn>1</mn></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      // Negative coordinates: (-100, -50)
      simulateClickAt(dom, -100, -50);

      const caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must exist after negative coordinate click').not.toBeNull();
      expect(caret.isConnected).toBe(true);
      expect(widget.caret.offset).toBe(0); // Clamped to beginning
      expect(widget.caret.slotId).toBe(widget.ast.id);

      // Another extreme negative: (-9999, 100)
      simulateClickAt(dom, -9999, 100);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();
      expect(widget.caret.offset).toBe(0);

      view.destroy();
      editorContainer.remove();
    });

    it('handles coordinates far beyond viewport/bounds and clamps to slot end', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mn>1</mn></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      // Far right/bottom coordinate: (99999, 99999)
      simulateClickAt(dom, 99999, 99999);

      const caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must exist after out-of-bounds coordinate click').not.toBeNull();
      expect(caret.isConnected).toBe(true);
      expect(widget.caret.offset).toBe(widget.ast.children.length); // Clamped to end

      // Far top-right coordinate: (10000, -500)
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, 10000, -500);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();
      expect(widget.caret.offset).toBe(widget.ast.children.length);

      view.destroy();
      editorContainer.remove();
    });

    it('correctly resolves exact boundary midpoints (midX, midX-eps, midX+eps)', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const tokenK = dom.querySelector('.eq-token') as HTMLElement;
      const rect = tokenK.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;

      // Exact midpoint: clickX <= midX -> offset 0
      simulateClickAt(dom, midX, rect.top + rect.height / 2);
      expect(widget.caret.offset).toBe(0);

      // Epsilon to the left: midX - 0.01 -> offset 0
      simulateClickAt(dom, midX - 0.01, rect.top + rect.height / 2);
      expect(widget.caret.offset).toBe(0);

      // Epsilon to the right: midX + 0.01 -> offset 1
      simulateClickAt(dom, midX + 0.01, rect.top + rect.height / 2);
      expect(widget.caret.offset).toBe(1);

      // Exactly at left edge
      simulateClickAt(dom, rect.left, rect.top + rect.height / 2);
      expect(widget.caret.offset).toBe(0);

      // Exactly at right edge
      simulateClickAt(dom, rect.right, rect.top + rect.height / 2);
      expect(widget.caret.offset).toBe(1);

      view.destroy();
      editorContainer.remove();
    });

    it('resolves clicks exactly on fraction horizontal divider line between num and den', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const numEl = dom.querySelector('.eq-numerator') as HTMLElement;
      const denEl = dom.querySelector('.eq-denominator') as HTMLElement;
      const numRect = numEl.getBoundingClientRect();
      const denRect = denEl.getBoundingClientRect();

      // Divider line midpoint between num bottom and den top
      const dividerY = (numRect.bottom + denRect.top) / 2;
      const midX = numRect.left + numRect.width / 2;

      // Click slightly above divider -> numerator
      simulateClickAt(dom, midX, dividerY - 1);
      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(numEl.contains(caret)).toBe(true);

      // Click slightly below divider -> denominator
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, midX, dividerY + 1);
      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(denEl.contains(caret)).toBe(true);

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // Section 3: Rapid Mouse Clicks across Multiple Slots
  // =========================================================================
  describe('3. Rapid Mouse Clicks across Multiple Slots', () => {
    it('survives a rapid burst of 30 clicks across various slots without caret disappearance or duplication', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mi>a</mi><mi>b</mi></mfrac>' +
        '<mo>+</mo>' +
        '<msqrt><mi>c</mi></msqrt>' +
        '<mo>-</mo>' +
        '<msup><mi>d</mi><mn>2</mn></msup>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];
      expect(tokens.length).toBeGreaterThanOrEqual(6);

      // Rapidly click between different tokens in sequence for 30 iterations
      for (let i = 0; i < 30; i++) {
        const targetToken = tokens[i % tokens.length];
        const rect = targetToken.getBoundingClientRect();
        // Alternate clicking left half vs right half
        const clickX = i % 2 === 0 ? rect.left + 2 : rect.right - 2;
        const clickY = rect.top + rect.height / 2;

        simulateClickAt(dom, clickX, clickY);

        // STRESS INVARIANT CHECK: exactly one .eq-caret in DOM
        const carets = dom.querySelectorAll('.eq-caret');
        expect(carets.length, `Iteration ${i}: Must have exactly one .eq-caret`).toBe(1);

        const caret = carets[0] as HTMLElement;
        expect(caret.isConnected, `Iteration ${i}: Caret must be attached`).toBe(true);
        expect(caret.textContent, `Iteration ${i}: Caret text must be '|'`).toBe('|');
        expect(caret.getAttribute('data-caret'), `Iteration ${i}: Caret data-caret attribute`).toBe('true');

        const style = window.getComputedStyle(caret);
        expect(style.display, `Iteration ${i}: Caret display`).not.toBe('none');
        expect(style.visibility, `Iteration ${i}: Caret visibility`).not.toBe('hidden');
      }

      view.destroy();
      editorContainer.remove();
    });

    it('rapidly alternates clicks between root slot boundary and deep nested slots without blur race condition', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mi>A</mi>' +
        '<mo>+</mo>' +
        '<mfrac><mi>x</mi><mi>y</mi></mfrac>' +
        '<mo>+</mo>' +
        '<mi>B</mi>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const tokenA = dom.querySelector('.eq-token') as HTMLElement;
      const numToken = dom.querySelector('.eq-numerator .eq-token') as HTMLElement;
      const denToken = dom.querySelector('.eq-denominator .eq-token') as HTMLElement;

      // Rapidly cycle: root start -> numerator -> denominator -> root end
      const clickTargets = [
        { el: tokenA, ratio: 0.1 },
        { el: numToken, ratio: 0.5 },
        { el: denToken, ratio: 0.5 },
        { el: tokenA, ratio: 0.9 },
      ];

      for (let i = 0; i < 20; i++) {
        const target = clickTargets[i % clickTargets.length];
        const rect = target.el.getBoundingClientRect();
        simulateClickAt(dom, rect.left + rect.width * target.ratio, rect.top + rect.height * 0.5);

        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Cycle ${i}: Caret must remain rendered`).not.toBeNull();
        expect(dom.classList.contains('eq-active') || dom.querySelector('.eq-active')).toBeTruthy();
      }

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // Section 4: Caret DOM Visibility across Empty Placeholders and Populated Slots
  // =========================================================================
  describe('4. Caret DOM Visibility across Empty Placeholders & Populated Slots', () => {
    it('manages caret rendering inside empty fraction numerator and denominator placeholders', () => {
      // Fraction with both empty numerator and denominator
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const numPlaceholder = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      const denPlaceholder = dom.querySelector('.eq-denominator .eq-placeholder') as HTMLElement;
      expect(numPlaceholder).not.toBeNull();
      expect(denPlaceholder).not.toBeNull();
      expect(numPlaceholder.textContent).toBe('⬚');
      expect(denPlaceholder.textContent).toBe('⬚');

      // Click numerator placeholder
      const numRect = numPlaceholder.getBoundingClientRect();
      simulateClickAt(dom, numRect.left + numRect.width * 0.5, numRect.top + numRect.height * 0.5);

      // Numerator gets .eq-focused and contains caret
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(true);
      const caretInNum = numPlaceholder.querySelector('.eq-caret') as HTMLElement;
      expect(caretInNum).not.toBeNull();
      expect(caretInNum.textContent).toBe('|');
      expect(numPlaceholder.childNodes.length).toBe(1); // Only caret child, '⬚' stripped

      // Denominator remains unfocused and shows '⬚'
      expect(denPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(denPlaceholder.textContent).toBe('⬚');
      expect(denPlaceholder.querySelector('.eq-caret')).toBeNull();

      // Click denominator placeholder
      computeAndApplyLayout(dom, 100, 100);
      const denRect = denPlaceholder.getBoundingClientRect();
      simulateClickAt(dom, denRect.left + denRect.width * 0.5, denRect.top + denRect.height * 0.5);

      // Denominator acquires caret and .eq-focused
      expect(denPlaceholder.classList.contains('eq-focused')).toBe(true);
      const caretInDen = denPlaceholder.querySelector('.eq-caret') as HTMLElement;
      expect(caretInDen).not.toBeNull();
      expect(caretInDen.textContent).toBe('|');

      // Numerator restores '⬚' and unfocuses
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(numPlaceholder.textContent).toBe('⬚');
      expect(numPlaceholder.querySelector('.eq-caret')).toBeNull();

      view.destroy();
      editorContainer.remove();
    });

    it('transitions caret seamlessly when switching between empty placeholder and populated slot', () => {
      // Fraction with empty numerator and populated denominator 'x'
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow></mrow><mi>x</mi></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const numPlaceholder = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      const denToken = dom.querySelector('.eq-denominator .eq-token') as HTMLElement;
      expect(numPlaceholder).not.toBeNull();
      expect(denToken).not.toBeNull();

      // 1. Click into populated denominator
      const denRect = denToken.getBoundingClientRect();
      simulateClickAt(dom, denRect.left + denRect.width * 0.8, denRect.top + denRect.height * 0.5);

      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      // Caret is sibling of token, not inside placeholder
      expect(caret.parentElement?.classList.contains('eq-slot')).toBe(true);
      expect(caret.parentElement?.classList.contains('eq-placeholder')).toBe(false);
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(numPlaceholder.textContent).toBe('⬚');

      // 2. Click into empty numerator placeholder
      computeAndApplyLayout(dom, 100, 100);
      const numRect = numPlaceholder.getBoundingClientRect();
      simulateClickAt(dom, numRect.left + numRect.width * 0.5, numRect.top + numRect.height * 0.5);

      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(numPlaceholder.contains(caret)).toBe(true);
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(true);
      expect(dom.querySelector('.eq-denominator .eq-caret')).toBeNull();

      // 3. Click back into populated denominator
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, denRect.left + 2, denRect.top + denRect.height * 0.5);

      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(dom.querySelector('.eq-denominator')?.contains(caret)).toBe(true);
      expect(numPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(numPlaceholder.textContent).toBe('⬚');

      view.destroy();
      editorContainer.remove();
    });

    it('handles nested empty boxes in radical containing empty fraction: sqrt( [] / [] )', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mfrac><mrow></mrow><mrow></mrow></mfrac></msqrt></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const placeholders = Array.from(dom.querySelectorAll('.eq-placeholder')) as HTMLElement[];
      expect(placeholders.length).toBe(2); // Num and Den placeholders

      // Click numerator
      const rect0 = placeholders[0].getBoundingClientRect();
      simulateClickAt(dom, rect0.left + 2, rect0.top + 2);

      expect(placeholders[0].classList.contains('eq-focused')).toBe(true);
      expect(placeholders[0].querySelector('.eq-caret')).not.toBeNull();
      expect(placeholders[1].classList.contains('eq-focused')).toBe(false);
      expect(placeholders[1].textContent).toBe('⬚');

      // Click denominator
      computeAndApplyLayout(dom, 100, 100);
      const rect1 = placeholders[1].getBoundingClientRect();
      simulateClickAt(dom, rect1.left + 2, rect1.top + 2);

      expect(placeholders[1].classList.contains('eq-focused')).toBe(true);
      expect(placeholders[1].querySelector('.eq-caret')).not.toBeNull();
      expect(placeholders[0].classList.contains('eq-focused')).toBe(false);
      expect(placeholders[0].textContent).toBe('⬚');

      view.destroy();
      editorContainer.remove();
    });

    it('verifies strict DOM styling and accessibility properties of .eq-caret', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>m</mi></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget.enterFromStart(view);

      const caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();

      // Accessibility & attributes
      expect(caret.getAttribute('data-caret')).toBe('true');
      expect(caret.getAttribute('aria-hidden')).toBe('true');
      expect(caret.textContent).toBe('|');

      // Layout and display
      const style = window.getComputedStyle(caret);
      expect(style.display).toBe('inline-block');
      expect(style.verticalAlign).toBe('middle');
      expect(style.userSelect).toBe('none');
      expect(style.pointerEvents).toBe('none');

      // Square-wave blinking animation is declared
      expect(style.animationName || style.animation).toContain('eq-blink');

      view.destroy();
      editorContainer.remove();
    });

    it('manages empty superscript and subscript placeholders: x^[] and []_2', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mrow></mrow></msup></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const supPlaceholder = dom.querySelector('.eq-superscript .eq-placeholder') as HTMLElement;
      const baseToken = dom.querySelector('.eq-token') as HTMLElement;
      expect(supPlaceholder).not.toBeNull();
      expect(baseToken.textContent).toBe('x');
      expect(supPlaceholder.textContent).toBe('⬚');

      // Click empty superscript
      const supRect = supPlaceholder.getBoundingClientRect();
      simulateClickAt(dom, supRect.left + supRect.width * 0.5, supRect.top + supRect.height * 0.5);

      expect(supPlaceholder.classList.contains('eq-focused')).toBe(true);
      const caret = supPlaceholder.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.textContent).toBe('|');

      // Click base token
      computeAndApplyLayout(dom, 100, 100);
      const baseRect = baseToken.getBoundingClientRect();
      simulateClickAt(dom, baseRect.left + baseRect.width * 0.2, baseRect.top + baseRect.height * 0.5);

      expect(supPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(supPlaceholder.textContent).toBe('⬚');
      expect(dom.querySelector('.eq-caret')?.parentElement?.contains(baseToken)).toBe(true);

      view.destroy();
      editorContainer.remove();
    });
  });

  describe('5. Advanced Combination Stress Tests', () => {
    it('hit-tests matrix nested inside fraction numerator: (matrix / (x + y))', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac>' +
        '<mtable>' +
        '<mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr>' +
        '<mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr>' +
        '</mtable>' +
        '<mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow>' +
        '</mfrac>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const matrixCells = Array.from(dom.querySelectorAll('.eq-matrix-cell')) as HTMLElement[];
      expect(matrixCells.length).toBe(4);

      // Click cell (1, 1) containing '4'
      const token4 = matrixCells[3].querySelector('.eq-token') as HTMLElement;
      expect(token4.textContent).toBe('4');
      const rect4 = token4.getBoundingClientRect();
      simulateClickAt(dom, rect4.left + rect4.width * 0.5, rect4.top + rect4.height * 0.5);

      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(matrixCells[3].contains(caret)).toBe(true);

      // Click denominator 'y'
      computeAndApplyLayout(dom, 100, 100);
      const denEl = dom.querySelector('.eq-denominator') as HTMLElement;
      const denTokens = Array.from(denEl.querySelectorAll('.eq-token')) as HTMLElement[];
      const tokenY = denTokens[denTokens.length - 1];
      expect(tokenY.textContent).toBe('y');
      const rectY = tokenY.getBoundingClientRect();
      simulateClickAt(dom, rectY.left + rectY.width * 0.8, rectY.top + rectY.height * 0.5);

      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(denEl.contains(caret)).toBe(true);
      expect(matrixCells[3].contains(caret)).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('hit-tests deeply nested radicals (nested surds): sqrt(1 + sqrt(2 + sqrt(3)))', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<msqrt><mrow>' +
        '<mn>1</mn><mo>+</mo>' +
        '<msqrt><mrow>' +
        '<mn>2</mn><mo>+</mo>' +
        '<msqrt><mn>3</mn></msqrt>' +
        '</mrow></msqrt>' +
        '</mrow></msqrt>' +
        '</math>';
      const doc = '```math-word\n' + mathml + '\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const radicals = Array.from(dom.querySelectorAll('.eq-radical')) as HTMLElement[];
      expect(radicals.length).toBe(3);

      // Innermost radical has token '3'
      const token3 = radicals[2].querySelector('.eq-token') as HTMLElement;
      expect(token3.textContent).toBe('3');
      const rect3 = token3.getBoundingClientRect();
      simulateClickAt(dom, rect3.left + rect3.width * 0.8, rect3.top + rect3.height * 0.5);

      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(radicals[2].querySelector('.eq-radicand')?.contains(caret)).toBe(true);

      // Outermost radical token '1'
      computeAndApplyLayout(dom, 100, 100);
      const token1 = dom.querySelector('.eq-token') as HTMLElement;
      expect(token1.textContent).toBe('1');
      const rect1 = token1.getBoundingClientRect();
      simulateClickAt(dom, rect1.left + 2, rect1.top + rect1.height * 0.5);

      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.nextElementSibling).toBe(token1);

      view.destroy();
      editorContainer.remove();
    });

    it('interleaves rapid clicks and keyboard typing without losing .eq-caret', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const numToken = dom.querySelector('.eq-numerator .eq-token') as HTMLElement;
      const denToken = dom.querySelector('.eq-denominator .eq-token') as HTMLElement;

      // 1. Click numerator
      const numRect = numToken.getBoundingClientRect();
      simulateClickAt(dom, numRect.right - 1, numRect.top + numRect.height * 0.5);
      expect(dom.querySelector('.eq-numerator .eq-caret')).not.toBeNull();

      // Type '1'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // 2. Click denominator
      computeAndApplyLayout(dom, 100, 100);
      const denRect = denToken.getBoundingClientRect();
      simulateClickAt(dom, denRect.right - 1, denRect.top + denRect.height * 0.5);
      expect(dom.querySelector('.eq-denominator .eq-caret')).not.toBeNull();

      // Type '2'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // 3. Click numerator again
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, numRect.left + 2, numRect.top + numRect.height * 0.5);
      expect(dom.querySelector('.eq-numerator .eq-caret')).not.toBeNull();

      view.destroy();
      editorContainer.remove();
    });
  });
});
