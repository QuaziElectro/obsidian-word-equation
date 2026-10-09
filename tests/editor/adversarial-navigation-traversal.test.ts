import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';

describe('Adversarial Navigation Traversal & Interactive Editing Stress Suite', () => {
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

  // Helper to fetch the active equation widget and container DOM
  function getWidgetAndDom(view: any, searchPos = 0): { widget: WordEquationWidget; dom: HTMLElement } {
    let widget: WordEquationWidget | null = null;
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(searchPos, view.state.doc.length, (from: number, to: number, dec: any) => {
        if (!widget && dec.spec?.widget instanceof WordEquationWidget) {
          widget = dec.spec.widget;
        }
      });
    }
    const dom = (view.dom.querySelector('.word-equation-block') ||
      view.dom.querySelector('.word-equation-inline')) as HTMLElement;
    if (!widget || !dom) {
      throw new Error('Widget or DOM container not found');
    }
    return { widget, dom };
  }

  // --------------------------------------------------------------------------
  // 1. Long Sequences of Arrow Key Steps Through Complex Formulas
  // --------------------------------------------------------------------------
  describe('1. Long Sequences of Arrow Key Steps Through Complex Formulas', () => {
    it('traverses step-by-step through a compound equation (fraction + nth-root + subsup) with .eq-caret on EVERY step', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac>' +
        '<mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mi>a</mi></mrow>' +
        '<mroot><mrow><mi>y</mi><mo>-</mo><mn>1</mn></mrow><mn>3</mn></mroot>' +
        '</mfrac>' +
        '<mo>+</mo>' +
        '<msubsup><mi>z</mi><mi>i</mi><mi>k</mi></msubsup>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      expect(widget).not.toBeNull();
      expect(dom).not.toBeNull();

      // Enter from start
      widget!.enterFromStart(view);

      const initialCaret = dom.querySelector('.eq-caret');
      expect(initialCaret, 'Initial caret must exist').not.toBeNull();
      expect(initialCaret!.textContent).toBe('|');

      // Sequentially press ArrowRight until the equation exits.
      // Every step prior to exit MUST have .eq-caret present in DOM.
      let stepCount = 0;
      const maxSteps = 50;

      while (stepCount < maxSteps) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        stepCount++;

        const caret = dom.querySelector('.eq-caret');
        const isActive = dom.classList.contains('eq-active');

        if (!isActive) {
          // Exited the equation cleanly
          break;
        }

        expect(caret, `Caret must NOT disappear at step ${stepCount}`).not.toBeNull();
        expect(caret!.isConnected, `Caret must be attached to DOM at step ${stepCount}`).toBe(true);
        expect(caret!.textContent, `Caret text must be '|' at step ${stepCount}`).toBe('|');
      }

      // Must have traversed through multiple structural steps before exiting
      expect(stepCount).toBeGreaterThanOrEqual(10);
      expect(stepCount).toBeLessThan(maxSteps);

      view.destroy();
      editorContainer.remove();
    });

    it('traverses a 2x2 matrix step-by-step through all cells without caret vanishing', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mtable>' +
        '<mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr>' +
        '<mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr>' +
        '</mtable>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      let stepCount = 0;
      const visitedCells = new Set<string>();

      while (stepCount < 30) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        stepCount++;

        const caret = dom.querySelector('.eq-caret');
        if (!dom.classList.contains('eq-active')) {
          break;
        }

        expect(caret, `Caret must be present at matrix step ${stepCount}`).not.toBeNull();
        expect(caret!.isConnected).toBe(true);

        const parentSlot = caret!.closest('.eq-slot');
        if (parentSlot && parentSlot.getAttribute('data-slot-role') === 'cell') {
          visitedCells.add(parentSlot.getAttribute('data-slot-id') || 'unknown');
        }
      }

      // All 4 matrix cells should have been traversed
      expect(visitedCells.size).toBe(4);
      expect(stepCount).toBeGreaterThanOrEqual(8);

      view.destroy();
      editorContainer.remove();
    });

    it('reverses backwards with ArrowLeft through a complex formula without caret vanishing', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mi>y</mi></mfrac>' +
        '<mo>=</mo>' +
        '<msup><mi>z</mi><mn>3</mn></msup>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      expect(widget).not.toBeNull();

      // Enter from end
      widget!.enterFromEnd(view);

      let stepCount = 0;
      while (stepCount < 40) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        stepCount++;

        const caret = dom.querySelector('.eq-caret');
        if (!dom.classList.contains('eq-active')) {
          break;
        }

        expect(caret, `Caret must NOT disappear during backward step ${stepCount}`).not.toBeNull();
        expect(caret!.isConnected).toBe(true);
        expect(caret!.textContent).toBe('|');
      }

      expect(stepCount).toBeGreaterThanOrEqual(8);
      expect(stepCount).toBeLessThan(40);

      view.destroy();
      editorContainer.remove();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Rapid Bidirectional Reversals (ArrowRight followed immediately by ArrowLeft)
  // --------------------------------------------------------------------------
  describe('2. Rapid Bidirectional Reversals', () => {
    it('rapidly oscillates back and forth at box boundary 30 times without caret desync', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mi>a</mi><mo>+</mo><mfrac><mi>b</mi><mi>c</mi></mfrac><mo>+</mo><mi>d</mi>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);

      // Advance 2 steps to reach the fraction box boundary
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Rapidly oscillate ArrowRight / ArrowLeft 30 times
      for (let i = 0; i < 30; i++) {
        // Step forward into fraction
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        let caret = dom.querySelector('.eq-caret');
        expect(caret, `Caret must exist on oscillation forward step ${i}`).not.toBeNull();
        expect(caret!.isConnected).toBe(true);

        // Immediately step backward out of fraction
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        caret = dom.querySelector('.eq-caret');
        expect(caret, `Caret must exist on oscillation backward step ${i}`).not.toBeNull();
        expect(caret!.isConnected).toBe(true);
      }

      view.destroy();
      editorContainer.remove();
    });

    it('performs irregular zigzag traversal (forward 3, back 2) across entire formula', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><msqrt><mi>y</mi></msqrt><mo>=</mo><mi>z</mi>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      for (let cycle = 0; cycle < 5; cycle++) {
        // Advance 3 steps
        for (let f = 0; f < 3; f++) {
          dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          if (dom.classList.contains('eq-active')) {
            const caret = dom.querySelector('.eq-caret');
            expect(caret, `Caret missing on forward zigzag ${cycle}-${f}`).not.toBeNull();
          }
        }
        // Retreat 2 steps
        for (let b = 0; b < 2; b++) {
          dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
          if (dom.classList.contains('eq-active')) {
            const caret = dom.querySelector('.eq-caret');
            expect(caret, `Caret missing on backward zigzag ${cycle}-${b}`).not.toBeNull();
          }
        }
      }

      view.destroy();
      editorContainer.remove();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Vertical Traversal (ArrowUp / ArrowDown)
  // --------------------------------------------------------------------------
  describe('3. Vertical Traversal (ArrowUp / ArrowDown)', () => {
    it('cycles vertically between fraction numerator and denominator 15 times', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>+</mo><mi>d</mi></mrow></mfrac>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      // Enter numerator: ArrowRight from root enters numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const numEl = dom.querySelector('.eq-numerator')!;
      const denEl = dom.querySelector('.eq-denominator')!;

      for (let i = 0; i < 15; i++) {
        // ArrowDown: numerator -> denominator
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        let caret = dom.querySelector('.eq-caret');
        expect(caret, `Caret must exist after ArrowDown cycle ${i}`).not.toBeNull();
        expect(denEl.contains(caret), `Caret must be in denominator after ArrowDown ${i}`).toBe(true);

        // ArrowUp: denominator -> numerator
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        caret = dom.querySelector('.eq-caret');
        expect(caret, `Caret must exist after ArrowUp cycle ${i}`).not.toBeNull();
        expect(numEl.contains(caret), `Caret must be in numerator after ArrowUp ${i}`).toBe(true);
      }

      view.destroy();
      editorContainer.remove();
    });

    it('clamps horizontal offset correctly when jumping vertically between unequal length slots', () => {
      // Numerator has 5 tokens (a + b + c), denominator has 1 token (d)
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi><mo>+</mo><mi>c</mi></mrow><mi>d</mi></mfrac>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      // Move into numerator, step all the way to offset 5
      for (let i = 0; i < 6; i++) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }

      const numEl = dom.querySelector('.eq-numerator')!;
      const denEl = dom.querySelector('.eq-denominator')!;

      // ArrowDown into short denominator: offset must clamp to denominator length (1) without crashing
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      let caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(denEl.contains(caret)).toBe(true);

      // ArrowUp back to numerator: offset stays valid
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(numEl.contains(caret)).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('navigates vertically across rows in a 3x3 matrix', () => {
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mtable>' +
        '<mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr>' +
        '<mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr>' +
        '<mtr><mtd><mn>5</mn></mtd><mtd><mn>6</mn></mtd></mtr>' +
        '</mtable>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      // Step into cell (0,0) with token '1'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const cells = dom.querySelectorAll('.eq-matrix-cell');
      expect(cells.length).toBe(6);

      // Down to row 1 cell (1,0) token '3'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      let caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(cells[2].contains(caret)).toBe(true);

      // Down to row 2 cell (2,0) token '5'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(cells[4].contains(caret)).toBe(true);

      // Up to row 1 cell (1,0)
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(cells[2].contains(caret)).toBe(true);

      // Up to row 0 cell (0,0)
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret).not.toBeNull();
      expect(cells[0].contains(caret)).toBe(true);

      view.destroy();
      editorContainer.remove();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Entry from Adjacent Document Text Before and After Block Equations
  // --------------------------------------------------------------------------
  describe('4. Entry from Adjacent Document Text Before/After Block Equations', () => {
    it('enters from cursor at blockStart - 1 (newline before block fence) via ArrowRight', () => {
      const doc = `Heading\n\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\n\nTrailing`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      // Cursor on newline right before the block delimiter
      view.dispatch({ selection: { anchor: blockStart - 1 } });
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must appear upon entering from newline before block').not.toBeNull();
      expect(caret.isConnected).toBe(true);
      expect(caret.textContent).toBe('|');

      view.destroy();
      editorContainer.remove();
    });

    it('enters from cursor at exact blockStart via ArrowRight', () => {
      const doc = `Heading\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\nTrailing`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      view.dispatch({ selection: { anchor: blockStart } });
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must appear upon entering from exact blockStart').not.toBeNull();
      expect(caret.isConnected).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('enters from cursor at exact blockEnd via ArrowLeft', () => {
      const doc = `Heading\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\nTrailing`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockEnd = doc.indexOf('\nTrailing');
      view.dispatch({ selection: { anchor: blockEnd } });
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must appear upon entering from exact blockEnd').not.toBeNull();
      expect(caret.isConnected).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('enters from cursor at blockEnd + 1 (newline after block fence) via ArrowLeft', () => {
      const doc = `Heading\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\n\nTrailing`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockEnd = doc.indexOf('\n\nTrailing');
      // Cursor on newline right after block fence
      view.dispatch({ selection: { anchor: blockEnd + 1 } });
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must appear upon entering from newline after block').not.toBeNull();
      expect(caret.isConnected).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('enters from line above via ArrowDown', () => {
      const doc = `Line Above\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\nLine Below`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      // Place cursor anywhere on "Line Above"
      view.dispatch({ selection: { anchor: 4 } });
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must appear upon entering from line above via ArrowDown').not.toBeNull();
      expect(caret.isConnected).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('enters from line below via ArrowUp', () => {
      const doc = `Line Above\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\nLine Below`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const belowPos = doc.indexOf('Line Below');
      view.dispatch({ selection: { anchor: belowPos + 2 } });
      expect(view.dom.querySelector('.eq-caret')).toBeNull();

      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
      );

      const caret = view.dom.querySelector('.eq-caret') as HTMLElement;
      expect(caret, 'Caret must appear upon entering from line below via ArrowUp').not.toBeNull();
      expect(caret.isConnected).toBe(true);

      view.destroy();
      editorContainer.remove();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Typing Characters Followed by Arrow Navigation (Post-Sync Caret Preservation)
  // --------------------------------------------------------------------------
  describe('5. Typing Characters Followed by Arrow Navigation (Post-Sync Preservation)', () => {
    it('types character, navigates with arrows, and types again while preserving .eq-caret', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      expect(widget).not.toBeNull();
      widget!.enterFromStart(view);

      // Initial caret
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step 1: Type '1'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      let caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after typing "1"').not.toBeNull();
      expect(caret!.isConnected).toBe(true);

      // Step 2: Navigate ArrowLeft (move before '1')
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after ArrowLeft').not.toBeNull();
      expect(caret!.isConnected).toBe(true);

      // Step 3: Type 'a' (inserts before '1')
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after typing "a"').not.toBeNull();
      expect(caret!.isConnected).toBe(true);

      // Step 4: Navigate ArrowRight twice
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after ArrowRight (1)').not.toBeNull();

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after ArrowRight (2)').not.toBeNull();

      // Step 5: Type '+'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after typing "+"').not.toBeNull();

      view.destroy();
      editorContainer.remove();
    });

    it('interleaves multi-character insertions, backspace, and arrow traversal', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"></math>\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      // Type "abc"
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Backspace removes 'c'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      let caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must remain after backspace').not.toBeNull();

      // Move left before 'b'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must remain after moving left').not.toBeNull();

      // Insert '9' between 'a' and 'b'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must remain after inserting "9"').not.toBeNull();

      // Move right past 'b'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must remain after moving right past "b"').not.toBeNull();

      // Verify underlying document contains updated MathML
      const updatedDoc = view.state.doc.toString();
      expect(updatedDoc).toContain('<mi>a</mi>');
      expect(updatedDoc).toContain('<mn>9</mn>');
      expect(updatedDoc).toContain('<mi>b</mi>');

      view.destroy();
      editorContainer.remove();
    });

    it('enters from document text via ArrowRight, then immediately edits and navigates', () => {
      const doc = `Text\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math>\n\`\`\`\nEnd`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const blockStart = doc.indexOf('```math-word');
      view.dispatch({ selection: { anchor: blockStart } });

      // Enter equation via ArrowRight from document
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );

      const dom = (view.dom.querySelector('.word-equation-block') ||
        view.dom.querySelector('.word-equation-inline')) as HTMLElement;
      expect(dom).not.toBeNull();

      let caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must be visible after entry').not.toBeNull();

      // Type '7'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after typing "7"').not.toBeNull();

      // Navigate ArrowRight
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after ArrowRight navigation').not.toBeNull();

      // Type 'y'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must persist after typing "y"').not.toBeNull();

      view.destroy();
      editorContainer.remove();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Navigation Through Empty Placeholders & Tab Key Cycling
  // --------------------------------------------------------------------------
  describe('6. Empty Placeholders & Tab Key Structural Cycling', () => {
    it('navigates through empty fraction placeholders via ArrowRight with caret staying inside placeholder', () => {
      // Empty fraction with empty numerator and denominator
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mrow></mrow><mrow></mrow></mfrac>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      // Step 1: Into numerator placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      let caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must exist in empty numerator').not.toBeNull();
      const numPlaceholder = dom.querySelector('.eq-numerator .eq-placeholder');
      expect(numPlaceholder?.classList.contains('eq-focused')).toBe(true);

      // Step 2: Into denominator placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must exist in empty denominator').not.toBeNull();
      const denPlaceholder = dom.querySelector('.eq-denominator .eq-placeholder');
      expect(denPlaceholder?.classList.contains('eq-focused')).toBe(true);

      view.destroy();
      editorContainer.remove();
    });

    it('cycles between empty placeholders using Tab and Shift-Tab without losing caret', () => {
      // Fraction with empty numerator and denominator followed by radical with empty radicand
      const mathml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac><mrow></mrow><mrow></mrow></mfrac><mo>+</mo><msqrt><mrow></mrow></msqrt>' +
        '</math>';
      const doc = `\`\`\`math-word\n${mathml}\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      // Cycle forward with Tab 6 times
      for (let t = 0; t < 6; t++) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Caret must exist after Tab ${t}`).not.toBeNull();
        expect(caret!.textContent).toBe('|');
      }

      // Cycle backward with Shift+Tab 6 times
      for (let st = 0; st < 6; st++) {
        dom.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
        );
        const caret = dom.querySelector('.eq-caret');
        expect(caret, `Caret must exist after Shift-Tab ${st}`).not.toBeNull();
        expect(caret!.textContent).toBe('|');
      }

      view.destroy();
      editorContainer.remove();
    });
  });

  // --------------------------------------------------------------------------
  // 7. Navigation Through Inline Equations (/weq_inline)
  // --------------------------------------------------------------------------
  describe('7. Navigation Through Inline Equations', () => {
    it('enters inline equation from adjacent text and traverses step-by-step', () => {
      const doc = `Prefix /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mi>b</mi></math> /weq_inline Suffix`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const inlineStart = doc.indexOf('/weq_inline');
      view.dispatch({ selection: { anchor: inlineStart } });

      // ArrowRight to enter inline equation
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );

      const dom = view.dom.querySelector('.word-equation-inline') as HTMLElement;
      expect(dom).not.toBeNull();
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step right past 'a'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step right past '+'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Step right past 'b'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).not.toBeNull();

      // Final ArrowRight exits inline equation
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(dom.querySelector('.eq-caret')).toBeNull();

      view.destroy();
      editorContainer.remove();
    });
  });

  // --------------------------------------------------------------------------
  // 8. Structural Dissolution via Backspace and Caret Preservation
  // --------------------------------------------------------------------------
  describe('8. Structural Dissolution & Caret Preservation', () => {
    it('preserves caret inside placeholder when character is deleted with backspace', () => {
      const doc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>\n\`\`\`\n`;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      const { widget, dom } = getWidgetAndDom(view);
      widget!.enterFromStart(view);

      // Move past 'x'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Backspace deletes 'x', turning slot into empty placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      const caret = dom.querySelector('.eq-caret');
      expect(caret, 'Caret must remain visible in placeholder after deleting sole character').not.toBeNull();
      expect(caret!.textContent).toBe('|');

      const placeholder = dom.querySelector('.eq-placeholder.eq-focused');
      expect(placeholder).not.toBeNull();

      view.destroy();
      editorContainer.remove();
    });
  });
});
