import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { updateVisualCaretDom } from '../../src/editor/selection';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
  simulateClickAt,
  simulateArrowKey,
} from '../helpers/dom-layout-engine';

describe('R1-R3 Visual Caret DOM Integration Test Suite', () => {
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

  describe('R1: True Visual Caret DOM Presence & Visibility', () => {
    it('verifies .eq-caret explicitly exists and is attached in DOM when equation is active', () => {
      const doc = `Text\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mn>1</mn></math>\n\`\`\`\nEnd`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(blockStart, blockStart + 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      // Activate widget
      widget!.enterFromStart(view);

      // Verify active math box
      const mathEl = view.dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathEl).not.toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(true);

      // Verify caret DOM element exists explicitly
      const caretEl = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caretEl).not.toBeNull();
      expect(caretEl.isConnected).toBe(true);
      expect(caretEl.textContent).toBe('|');
      expect(caretEl.getAttribute('data-caret')).toBe('true');
      expect(caretEl.getAttribute('aria-hidden')).toBe('true');

      // Verify caret visibility via computed style
      const style = window.getComputedStyle(caretEl);
      expect(style.display).not.toBe('none');
      expect(style.visibility).not.toBe('hidden');

      view.destroy();
      editorContainer.remove();
    });

    it('verifies .eq-caret renders inside empty placeholder box when slot is empty', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"></math>\n\`\`\``;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // Root slot is empty placeholder
      const placeholderEl = view.dom.querySelector('.eq-placeholder.eq-focused') as HTMLElement;
      expect(placeholderEl).not.toBeNull();

      const caretEl = placeholderEl.querySelector('.eq-caret') as HTMLElement;
      expect(caretEl).not.toBeNull();
      expect(caretEl.textContent).toBe('|');

      view.destroy();
      editorContainer.remove();
    });

    it('verifies .eq-caret is removed from DOM when equation loses focus', () => {
      const doc = `Text\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>y</mi></math>\n\`\`\`\nEnd`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(blockStart, blockStart + 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });

      widget!.enterFromStart(view);
      expect(view.dom.querySelector('.eq-caret')).not.toBeNull();

      // Dispatch blur / focusout to outside element
      const mathEl = view.dom.querySelector('.word-equation-math') as HTMLElement;
      mathEl.dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body, bubbles: true }));

      expect(view.dom.querySelector('.eq-caret')).toBeNull();
      expect(mathEl.classList.contains('eq-active')).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('regression: placing caret in parent slot containing empty descendant placeholder does not hijack into child placeholder', () => {
      // Equation: \frac{\Box}{2} + 3
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow></mrow><mn>2</mn></mfrac><mo>+</mo><mn>3</mn></math>\n\`\`\``;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();

      const dom = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();

      // Ensure fraction numerator has an empty placeholder with symbol
      const numeratorPlaceholder = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      expect(numeratorPlaceholder).not.toBeNull();
      expect(numeratorPlaceholder.textContent).toBe('⬚');

      const rootSlotId = widget!.ast.id;

      // 1. Place caret in root slot at offset 1 (between fraction and '+')
      updateVisualCaretDom(dom, { slotId: rootSlotId, offset: 1 }, true);

      // Caret must be attached and located directly in the root slot
      const caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.isConnected).toBe(true);
      expect(caret.parentElement).not.toBe(numeratorPlaceholder);
      expect(caret.parentElement?.getAttribute('data-slot-id')).toBe(rootSlotId);

      // The descendant numerator placeholder must NOT be hijacked or focused
      expect(numeratorPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(numeratorPlaceholder.textContent).toBe('⬚');
      expect(numeratorPlaceholder.querySelector('.eq-caret')).toBeNull();

      // 2. Place caret in root slot at offset 2 (after '+')
      updateVisualCaretDom(dom, { slotId: rootSlotId, offset: 2 }, true);

      const caretAtOffset2 = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caretAtOffset2).not.toBeNull();
      expect(caretAtOffset2.parentElement?.getAttribute('data-slot-id')).toBe(rootSlotId);
      expect(numeratorPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(numeratorPlaceholder.textContent).toBe('⬚');

      // 3. Directly target the empty numerator slot: verify it DOES focus the placeholder
      const frac = widget!.ast.children[0] as any;
      const numSlotId = frac.numerator.id;
      updateVisualCaretDom(dom, { slotId: numSlotId, offset: 0 }, true);

      const caretInNum = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caretInNum).not.toBeNull();
      expect(caretInNum.parentElement).toBe(numeratorPlaceholder);
      expect(numeratorPlaceholder.classList.contains('eq-focused')).toBe(true);

      // 4. Also verify mouse click hit-testing on '+' places caret in root slot without hijacking
      computeAndApplyLayout(dom, 100, 100);
      const plusToken = Array.from(dom.querySelectorAll('.eq-token')).find(
        (el) => el.textContent === '+'
      ) as HTMLElement;
      expect(plusToken).not.toBeNull();
      const plusRect = plusToken.getBoundingClientRect();
      simulateClickAt(dom, plusRect.left + plusRect.width * 0.2, plusRect.top + plusRect.height * 0.5);

      const caretAfterClick = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caretAfterClick).not.toBeNull();
      expect(caretAfterClick.parentElement?.getAttribute('data-slot-id')).toBe(rootSlotId);
      expect(numeratorPlaceholder.classList.contains('eq-focused')).toBe(false);
      expect(numeratorPlaceholder.textContent).toBe('⬚');

      view.destroy();
      editorContainer.remove();
    });
  });

  describe('R2: Mouse Hit-Testing & Caret Relocation in DOM', () => {
    it('clicking coordinates before vs after token midpoint moves .eq-caret accurately in DOM', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mi>b</mi></math>\n\`\`\``;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      const dom = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();
      computeAndApplyLayout(dom, 100, 100);

      const tokenA = dom.querySelector('.eq-token[data-node-id]') as HTMLElement;
      const rectA = tokenA.getBoundingClientRect();

      // Click before midpoint of token 'a' -> offset 0
      simulateClickAt(dom, rectA.left + rectA.width * 0.2, rectA.top + rectA.height * 0.5);
      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.nextElementSibling).toBe(tokenA); // Caret is before token 'a'

      // Click after midpoint of token 'a' -> offset 1
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, rectA.left + rectA.width * 0.8, rectA.top + rectA.height * 0.5);
      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.previousElementSibling).toBe(tokenA); // Caret is after token 'a'

      view.destroy();
      editorContainer.remove();
    });

    it('clicking inside fraction numerator vs denominator places .eq-caret in correct slot DOM', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>n</mi><mi>d</mi></mfrac></math>\n\`\`\``;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      const dom = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();
      computeAndApplyLayout(dom, 100, 100);

      const numEl = dom.querySelector('.eq-numerator') as HTMLElement;
      const denEl = dom.querySelector('.eq-denominator') as HTMLElement;
      const numRect = numEl.getBoundingClientRect();
      const denRect = denEl.getBoundingClientRect();

      // Click inside numerator
      simulateClickAt(dom, numRect.left + 5, numRect.top + 5);
      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(numEl.contains(caret)).toBe(true);
      expect(denEl.contains(caret)).toBe(false);

      // Click inside denominator
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, denRect.left + 5, denRect.top + 5);
      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(denEl.contains(caret)).toBe(true);
      expect(numEl.contains(caret)).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('clicking inside nth-root (<mroot>) places .eq-caret in index vs radicand', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mroot><mi>x</mi><mn>3</mn></mroot></math>\n\`\`\``;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      const dom = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();
      computeAndApplyLayout(dom, 100, 100);

      const idxEl = dom.querySelector('.eq-radical-index') as HTMLElement;
      const radEl = dom.querySelector('.eq-radicand') as HTMLElement;
      expect(idxEl).not.toBeNull();
      expect(radEl).not.toBeNull();

      const idxRect = idxEl.getBoundingClientRect();
      const radRect = radEl.getBoundingClientRect();

      // Click in index
      simulateClickAt(dom, idxRect.left + 2, idxRect.top + 2);
      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(idxEl.contains(caret)).toBe(true);

      // Click in radicand
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, radRect.left + 2, radRect.top + 2);
      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(radEl.contains(caret)).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('clicking in outer margin gracefully positions caret at root boundary', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>+</mo><mi>y</mi></math>\n\`\`\``;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      const dom = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();
      computeAndApplyLayout(dom, 100, 100);

      // Click far left of equation (margin)
      simulateClickAt(dom, 10, 110);
      let caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(widget!.caret.offset).toBe(0);

      // Click far right of equation (margin)
      computeAndApplyLayout(dom, 100, 100);
      simulateClickAt(dom, 500, 110);
      caret = dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(widget!.caret.offset).toBe(widget!.ast.children.length);

      view.destroy();
      editorContainer.remove();
    });
  });

  describe('R3: Keyboard Entry & Structural Traversal Without Caret Disappearance', () => {
    it('ArrowRight from adjacent text places .eq-caret at beginning of equation', () => {
      const doc = `Start\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\nEnd`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      view.dispatch({ selection: { anchor: blockStart } });

      // Before keypress: no caret exists
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      // Press ArrowRight at boundary
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        })
      );

      // Equation acquires focus and caret DOM element is explicitly created
      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.isConnected).toBe(true);

      const tokenX = view.dom.querySelector('.eq-token') as HTMLElement;
      expect(caret.nextElementSibling).toBe(tokenX); // At beginning before token 'x'

      view.destroy();
      editorContainer.remove();
    });

    it('ArrowRight from line above enters equation across newline boundary', () => {
      const doc = `Line1\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>z</mi></math>\n\`\`\`\nLine3`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      // Position cursor at blockStart - 1 (the newline before ```math-word)
      view.dispatch({ selection: { anchor: blockStart - 1 } });

      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.textContent).toBe('|');

      view.destroy();
      editorContainer.remove();
    });

    it('ArrowLeft from adjacent text places .eq-caret at end of equation', () => {
      const doc = `Start\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\nEnd`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockEnd = doc.indexOf('\nEnd');
      view.dispatch({ selection: { anchor: blockEnd } });

      // Before keypress: no caret exists
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      // Press ArrowLeft at boundary
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          bubbles: true,
          cancelable: true,
        })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret).not.toBeNull();
      expect(caret.isConnected).toBe(true);

      const tokenX = view.dom.querySelector('.eq-token') as HTMLElement;
      expect(caret.previousElementSibling).toBe(tokenX); // At end after token 'x'

      view.destroy();
      editorContainer.remove();
    });

    it('ArrowRight inside moves caret through structure without .eq-caret disappearing at any step', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac><mo>+</mo><mi>c</mi></math>\n\`\`\`\nAfter`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      const dom = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();

      widget!.enterFromStart(view);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Helper to press ArrowRight and assert caret never disappears
      const stepArrowRight = (description: string) => {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const currentCaret = dom.querySelector('.eq-caret');
        expect(currentCaret, `Caret must NOT disappear during: ${description}`).not.toBeNull();
        expect(currentCaret!.isConnected, `Caret must be attached to DOM during: ${description}`).toBe(true);
        expect(currentCaret!.textContent).toBe('|');
        return currentCaret!;
      };

      // Step 1: Into numerator before 'a'
      const c1 = stepArrowRight('numerator before a');
      const numEl = dom.querySelector('.eq-numerator')!;
      expect(numEl.contains(c1)).toBe(true);

      // Step 2: In numerator past 'a'
      const c2 = stepArrowRight('numerator past a');
      expect(numEl.contains(c2)).toBe(true);

      // Step 3: Into denominator before 'b'
      const c3 = stepArrowRight('denominator before b');
      const denEl = dom.querySelector('.eq-denominator')!;
      expect(denEl.contains(c3)).toBe(true);

      // Step 4: Denominator past 'b'
      const c4 = stepArrowRight('denominator past b');
      expect(denEl.contains(c4)).toBe(true);

      // Step 5: Exit fraction to root slot before '+'
      const c5 = stepArrowRight('root slot before +');
      expect(dom.querySelector('.eq-slot[data-slot-role="root"]')!.contains(c5)).toBe(true);

      // Step 6: Past '+'
      const c6 = stepArrowRight('past +');
      expect(c6).not.toBeNull();

      // Step 7: Past 'c' (end of equation)
      const c7 = stepArrowRight('past c to end');
      expect(c7).not.toBeNull();

      // Step 8: Final ArrowRight exits equation to text
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).toBeNull(); // Cleanly removed upon exit
      expect(dom.classList.contains('eq-active')).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('typing a character updates AST and keeps .eq-caret visible in the DOM', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\``;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, 1, (f, t, dec) => {
        widget = (dec.spec as any).widget;
      });
      const dom = (view.dom.querySelector('.word-equation-block') || view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();

      widget!.enterFromStart(view);
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Type '9'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true }));

      // Caret must still exist and be visible in DOM
      const caretAfterTyping = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caretAfterTyping).not.toBeNull();
      expect(caretAfterTyping.isConnected).toBe(true);
      expect(caretAfterTyping.textContent).toBe('|');

      view.destroy();
      editorContainer.remove();
    });
  });
});
