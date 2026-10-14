import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { handleArrowKey } from '../../src/editor/navigation';
import { handleMouseClick } from '../../src/editor/hit-testing';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  createMatrix,
  createUnderOver,
  updateParentPointers,
  findSlotById,
  resetIdCounter,
} from '../../src/core/ast';
import {
  getActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';

describe('Adversarial Challenger 1 Suite: R1 (Rendering Fixes) & R2 (Navigation Edge Cases)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
    clearActiveEquationState();
  });

  function getWidgetAndDom(view: any): { widget: WordEquationWidget; dom: HTMLElement } {
    let widget: WordEquationWidget | null = null;
    view.state.field(wordEquationStateField).between(0, view.state.doc.length, (from: number, to: number, dec: any) => {
      if (dec.spec?.widget instanceof WordEquationWidget) {
        widget = dec.spec.widget;
      }
    });
    if (!widget) throw new Error('WordEquationWidget not found in state field');
    const dom = (widget as any).toDOM(view);
    return { widget: widget as WordEquationWidget, dom };
  }

  // =========================================================================
  // Dimension 1: Placeholder Borders Across Nested Parent Containers
  // =========================================================================
  describe('Dimension 1: Placeholder Borders Across Nested Parent Containers', () => {
    it('styles.css strictly mandates 1px dashed transparent for unfocused placeholders', () => {
      const cssPath = resolve(__dirname, '../../styles.css');
      const css = readFileSync(cssPath, 'utf8');

      // Unfocused border MUST be transparent
      expect(css).toMatch(/\.eq-placeholder\s*\{[^}]*border:\s*1px\s+dashed\s+transparent/);
      // Geometry preservation
      expect(css).toMatch(/\.eq-placeholder\s*\{[^}]*min-width:\s*0\.9em/);
      expect(css).toMatch(/\.eq-placeholder\s*\{[^}]*height:\s*1em/);
      expect(css).toMatch(/\.eq-placeholder\s*\{[^}]*border-radius:\s*3px/);
      // Focused accent border
      expect(css).toMatch(/\.eq-placeholder\.eq-focused\s*\{[^}]*border-color:\s*var\(--interactive-accent/);
    });

    it('verifies crisp ⬚ glyph with transparent border across nested containers (Fraction in Radical)', () => {
      // Radical -> Fraction (empty num, empty den)
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const frac = createFraction(num, den);
      const rad = createRadical(createSlot('radicand', [frac]));
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const placeholders = Array.from(dom.querySelectorAll('.eq-placeholder')) as HTMLElement[];
      expect(placeholders.length).toBe(2);

      for (const ph of placeholders) {
        expect(ph.textContent).toBe('⬚');
        expect(ph.classList.contains('eq-focused')).toBe(false);
        expect(ph.getAttribute('data-placeholder-for')).toBeTruthy();
      }
    });

    it('verifies crisp ⬚ glyph with transparent border across nested containers (Radical in Fraction)', () => {
      // Fraction -> Num has Radical (empty radicand), Den has Radical (empty radicand)
      const rad1 = createRadical(createSlot('radicand', []));
      const rad2 = createRadical(createSlot('radicand', []));
      const num = createSlot('numerator', [rad1]);
      const den = createSlot('denominator', [rad2]);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const placeholders = Array.from(dom.querySelectorAll('.eq-placeholder')) as HTMLElement[];
      expect(placeholders.length).toBe(2);

      for (const ph of placeholders) {
        expect(ph.textContent).toBe('⬚');
        expect(ph.classList.contains('eq-focused')).toBe(false);
      }
    });

    it('verifies crisp ⬚ glyph with transparent border across multi-slot 3x3 matrix', () => {
      // 3x3 matrix where 5 of 9 cells are empty placeholders
      const cells: any[][] = [
        [createSlot('cell', []), createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [])],
        [createSlot('cell', [createToken('2', 'mn')]), createSlot('cell', []), createSlot('cell', [createToken('3', 'mn')])],
        [createSlot('cell', []), createSlot('cell', []), createSlot('cell', [createToken('4', 'mn')])],
      ];
      const mat = createMatrix(cells);
      const root = createSlot('root', [mat]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const placeholders = Array.from(dom.querySelectorAll('.eq-placeholder')) as HTMLElement[];
      expect(placeholders.length).toBe(5);

      for (const ph of placeholders) {
        expect(ph.textContent).toBe('⬚');
        expect(ph.classList.contains('eq-focused')).toBe(false);
      }
    });

    it('verifies empty fraction inside empty fraction has zero double dashed borders', () => {
      // F1: num = F2 (empty), den = F3 (empty)
      const n2 = createSlot('numerator', []);
      const d2 = createSlot('denominator', []);
      const f2 = createFraction(n2, d2);

      const n3 = createSlot('numerator', []);
      const d3 = createSlot('denominator', []);
      const f3 = createFraction(n3, d3);

      const f1 = createFraction(createSlot('numerator', [f2]), createSlot('denominator', [f3]));
      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const placeholders = Array.from(dom.querySelectorAll('.eq-placeholder')) as HTMLElement[];
      expect(placeholders.length).toBe(4);

      for (const ph of placeholders) {
        expect(ph.textContent).toBe('⬚');
        expect(ph.classList.contains('eq-focused')).toBe(false);
      }
    });

    it('clears ⬚ and injects caret ONLY into focused slot, keeping all siblings with ⬚ and transparent border', () => {
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      // Render with caret focused on denominator
      const dom = renderer.render(root, { caret: { slotId: den.id, offset: 0 } });

      const numPh = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      const denPh = dom.querySelector('.eq-denominator .eq-placeholder') as HTMLElement;

      expect(numPh.textContent).toBe('⬚');
      expect(numPh.classList.contains('eq-focused')).toBe(false);

      expect(denPh.classList.contains('eq-focused')).toBe(true);
      expect(denPh.querySelector('.eq-caret')).not.toBeNull();
      expect(denPh.querySelector('.eq-caret')!.textContent).toBe('|');
      expect(denPh.textContent).toBe('|');
    });
  });

  // =========================================================================
  // Dimension 2: Radical Surd Connection Across Varying Radicand Heights
  // =========================================================================
  describe('Dimension 2: Radical Surd Connection Across Varying Radicand Heights', () => {
    it('styles.css guarantees inline SVG surd with negative margin and full height', () => {
      const cssPath = resolve(__dirname, '../../styles.css');
      const css = readFileSync(cssPath, 'utf8');

      expect(css).toMatch(/\.eq-radical\s*\{[^}]*display:\s*inline-flex/);
      expect(css).toMatch(/\.eq-radical\s*\{[^}]*align-items:\s*stretch/);
      expect(css).toMatch(/\.eq-radical-surd\s*\{[^}]*margin-right:\s*-1px/);
      expect(css).toMatch(/\.eq-radical-surd\s*\{[^}]*padding-right:\s*0/);
      expect(css).toMatch(/\.eq-radical-surd\s*\{[^}]*flex-shrink:\s*0/);
      expect(css).toMatch(/\.eq-radical-svg\s*\{[^}]*width:\s*0\.65em/);
      expect(css).toMatch(/\.eq-radical-svg\s*\{[^}]*height:\s*100%/);
      expect(css).toMatch(/\.eq-radicand\s*\{[^}]*border-top:\s*1\.2px\s+solid\s+currentColor/);
    });

    it('renders vector SVG checkmark with preserveAspectRatio="none" across varying radicand heights', () => {
      const testCases = [
        {
          name: '1. Single atom radicand',
          node: createRadical(createSlot('radicand', [createToken('x', 'mi')])),
        },
        {
          name: '2. Tall fraction radicand',
          node: createRadical(
            createSlot('radicand', [
              createFraction(
                createSlot('numerator', [createToken('a', 'mi')]),
                createSlot('denominator', [createToken('b', 'mi')])
              ),
            ])
          ),
        },
        {
          name: '3. 3-level nested fraction radicand',
          node: createRadical(
            createSlot('radicand', [
              createFraction(
                createSlot('numerator', [createToken('1', 'mn')]),
                createSlot('denominator', [
                  createFraction(
                    createSlot('numerator', [createToken('2', 'mn')]),
                    createSlot('denominator', [createToken('3', 'mn')])
                  ),
                ])
              ),
            ])
          ),
        },
        {
          name: '4. Multi-row matrix radicand',
          node: createRadical(
            createSlot('radicand', [
              createMatrix([
                [createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [createToken('2', 'mn')])],
                [createSlot('cell', [createToken('3', 'mn')]), createSlot('cell', [createToken('4', 'mn')])],
                [createSlot('cell', [createToken('5', 'mn')]), createSlot('cell', [createToken('6', 'mn')])],
              ]),
            ])
          ),
        },
        {
          name: '5. Nth-root with index and fraction radicand',
          node: createRoot(
            createSlot('radicand', [
              createFraction(
                createSlot('numerator', [createToken('p', 'mi')]),
                createSlot('denominator', [createToken('q', 'mi')])
              ),
            ]),
            createSlot('index', [createToken('5', 'mn')])
          ),
        },
        {
          name: '6. Empty placeholder radicand',
          node: createRadical(createSlot('radicand', [])),
        },
      ];

      const renderer = new DomRenderer();

      for (const tc of testCases) {
        const root = createSlot('root', [tc.node]);
        updateParentPointers(root);

        const dom = renderer.render(root);
        const radicalEl = dom.querySelector('.eq-radical') as HTMLElement;
        expect(radicalEl, `${tc.name}: .eq-radical must exist`).not.toBeNull();

        const surdEl = radicalEl.querySelector('.eq-radical-surd') as HTMLElement;
        expect(surdEl, `${tc.name}: .eq-radical-surd must exist`).not.toBeNull();

        const svgEl = surdEl.querySelector('svg.eq-radical-svg') as SVGElement;
        expect(svgEl, `${tc.name}: svg.eq-radical-svg must exist`).not.toBeNull();
        expect(svgEl.getAttribute('viewBox'), `${tc.name}: viewBox must be '0 0 12 24'`).toBe('0 0 12 24');
        expect(svgEl.getAttribute('preserveAspectRatio'), `${tc.name}: preserveAspectRatio must be 'none'`).toBe('none');

        const pathEl = svgEl.querySelector('path');
        expect(pathEl, `${tc.name}: path must exist`).not.toBeNull();
        expect(pathEl!.getAttribute('d'), `${tc.name}: path d must end at (12, 1)`).toBe('M1 13 L3 13 L6 23 L11 1 L12 1');
        expect(pathEl!.getAttribute('stroke'), `${tc.name}: stroke must be currentColor`).toBe('currentColor');

        const radicandEl = radicalEl.querySelector('.eq-radicand') as HTMLElement;
        expect(radicandEl, `${tc.name}: .eq-radicand must exist`).not.toBeNull();
      }
    });

    it('verifies seamless connection layout: CSS negative margin, path termination, and hit-testing', () => {
      const radicand = createSlot('radicand', [
        createFraction(
          createSlot('numerator', [createToken('1', 'mn')]),
          createSlot('denominator', [createToken('2', 'mn')])
        ),
      ]);
      const rad = createRadical(radicand);
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);
      container.appendChild(dom);

      const surdSpan = dom.querySelector('.eq-radical-surd') as HTMLElement;
      const surdSvg = dom.querySelector('.eq-radical-svg') as SVGElement;
      const radicandEl = dom.querySelector('.eq-radicand') as HTMLElement;
      const pathEl = surdSvg.querySelector('path') as SVGPathElement;

      expect(surdSpan).not.toBeNull();
      expect(surdSvg).not.toBeNull();
      expect(radicandEl).not.toBeNull();
      expect(pathEl).not.toBeNull();

      // Verify path ends at top-right edge (12, 1) to connect with border-top
      const d = pathEl.getAttribute('d') || '';
      expect(d).toMatch(/L12\s+1$/);

      // Verify hit testing on SVG checkmark maps directly to radicand
      const caret = handleMouseClick(root, dom, 5, 5, surdSpan);
      expect(caret.slotId).toBe(radicand.id);

      // Verify hit testing on SVG path directly maps to radicand
      const caretPath = handleMouseClick(root, dom, 5, 5, pathEl as any);
      expect(caretPath.slotId).toBe(radicand.id);
    });
  });

  // =========================================================================
  // Dimension 3: Empty Fraction Typing Without Freezes & Stress Invariants
  // =========================================================================
  describe('Dimension 3: Empty Fraction Typing Without Freezes', () => {
    it('rapid burst typing of 40 characters into empty fraction without dropping input or freezing', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // ArrowRight into numerator placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

      const frac = widget.ast.children[0] as any;
      expect(frac.type).toBe('fraction');
      const numId = frac.numerator.id;
      expect(widget.caret.slotId).toBe(numId);
      expect(widget.caret.offset).toBe(0);

      // Burst type 40 characters: letters, numbers, operators
      const burstChars = 'abcdefghijklmnopqrstuvwxyz0123456789+-*=';
      expect(burstChars.length).toBe(40);

      for (let i = 0; i < burstChars.length; i++) {
        const ch = burstChars[i];
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));

        expect(widget.isFocused, `Must remain focused at char ${i} ('${ch}')`).toBe(true);
        expect(getActiveEquationState()?.isFocused, `Active state must be focused at char ${i}`).toBe(true);

        const currentNum = (widget.ast.children[0] as any).numerator;
        expect(currentNum.children.length, `Slot children length must equal ${i + 1}`).toBe(i + 1);
        expect(widget.caret.offset, `Caret offset must track to ${i + 1}`).toBe(i + 1);
      }

      // Check document was updated with all 40 characters
      const docStr = view.state.doc.toString();
      expect(docStr).toContain('<mi>a</mi>');
      expect(docStr).toContain('<mn>9</mn>');
      expect(docStr).toContain('<mo>+</mo>');
      expect(docStr).toContain('<mo>=</mo>');

      view.destroy();
      editorContainer.remove();
    });

    it('accepts non-ASCII Unicode characters (Greek, Cyrillic, CJK) into empty fraction without freezing', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

      const unicodeChars = ['α', 'β', 'π', 'θ', '∑', 'д', 'ж', '数', '学'];

      for (let i = 0; i < unicodeChars.length; i++) {
        const ch = unicodeChars[i];
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));

        expect(widget.isFocused, `Must not freeze on unicode char '${ch}'`).toBe(true);
        const currentNum = (widget.ast.children[0] as any).numerator;
        expect(currentNum.children.length).toBe(i + 1);
        expect((currentNum.children[i] as any).text).toBe(ch);
      }

      const docStr = view.state.doc.toString();
      expect(docStr).toContain('α');
      expect(docStr).toContain('π');
      expect(docStr).toContain('数');

      view.destroy();
      editorContainer.remove();
    });

    it('accepts full spectrum of mathematical operators into empty fraction', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

      const mathOperators = ['+', '-', '*', '/', '=', '<', '>', '≤', '≥', '≠', '±', '×', '÷', '≈'];

      for (let i = 0; i < mathOperators.length; i++) {
        const op = mathOperators[i];
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: op, bubbles: true, cancelable: true }));

        expect(widget.isFocused, `Must not freeze on operator '${op}'`).toBe(true);
        const currentNum = (widget.ast.children[0] as any).numerator;
        expect((currentNum.children[i] as any).tokenKind).toBe('mo');
        expect((currentNum.children[i] as any).text).toBe(op);
      }

      view.destroy();
      editorContainer.remove();
    });

    it('survives typing and complete backspacing back to empty placeholder without crash or freeze', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

      // Type 5 characters
      for (const ch of ['x', 'y', 'z', '1', '2']) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      }

      let currentNum = (widget.ast.children[0] as any).numerator;
      expect(currentNum.children.length).toBe(5);

      // Backspace all 5 characters
      for (let b = 0; b < 5; b++) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
        expect(widget.isFocused, `Must stay focused during backspace ${b + 1}`).toBe(true);
      }

      // Slot is now empty again
      currentNum = (widget.ast.children[0] as any).numerator;
      expect(currentNum.children.length).toBe(0);
      expect(widget.caret.offset).toBe(0);

      // Rerender must display ⬚ placeholder again without freezing
      const placeholder = dom.querySelector('.eq-numerator .eq-placeholder');
      expect(placeholder).not.toBeNull();

      // Immediately type again into the emptied slot
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true }));
      currentNum = (widget.ast.children[0] as any).numerator;
      expect(currentNum.children.length).toBe(1);
      expect((currentNum.children[0] as any).text).toBe('w');

      view.destroy();
      editorContainer.remove();
    });

    it('navigates seamlessly across both empty numerator and denominator with arrow keys and typing in both', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);

      // Step 1: Into numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      const frac = widget.ast.children[0] as any;
      expect(widget.caret.slotId).toBe(frac.numerator.id);

      // Step 2: Into denominator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      expect(widget.caret.slotId).toBe(frac.denominator.id);

      // Step 3: Type '9' into denominator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true, cancelable: true }));
      let den = (widget.ast.children[0] as any).denominator;
      expect(den.children.length).toBe(1);
      expect((den.children[0] as any).text).toBe('9');

      // Step 4: ArrowUp into numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      let num = (widget.ast.children[0] as any).numerator;
      expect(widget.caret.slotId).toBe(num.id);

      // Step 5: Type '7' into numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true }));
      num = (widget.ast.children[0] as any).numerator;
      expect(num.children.length).toBe(1);
      expect((num.children[0] as any).text).toBe('7');

      // Step 6: Verify document has 7 over 9
      expect(view.state.doc.toString()).toContain('<mn>7</mn>');
      expect(view.state.doc.toString()).toContain('<mn>9</mn>');

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // Dimension 4: Multi-Level Vertical Fraction Navigation (4-Level and 5-Level)
  // =========================================================================
  describe('Dimension 4: Multi-Level Vertical Fraction Navigation', () => {
    it('navigates sequentially upward across 4-level continued fraction 1 / (2 / (3 / (4 / 5)))', () => {
      // F4: 4 / 5
      const n4 = createSlot('numerator', [createToken('4', 'mn')]);
      const d4 = createSlot('denominator', [createToken('5', 'mn')]);
      const f4 = createFraction(n4, d4);

      // F3: 3 / F4
      const n3 = createSlot('numerator', [createToken('3', 'mn')]);
      const d3 = createSlot('denominator', [f4]);
      const f3 = createFraction(n3, d3);

      // F2: 2 / F3
      const n2 = createSlot('numerator', [createToken('2', 'mn')]);
      const d2 = createSlot('denominator', [f3]);
      const f2 = createFraction(n2, d2);

      // F1: 1 / F2
      const n1 = createSlot('numerator', [createToken('1', 'mn')]);
      const d1 = createSlot('denominator', [f2]);
      const f1 = createFraction(n1, d1);

      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      // Caret starts at 5 (innermost denominator d4)
      let caret = { slotId: d4.id, offset: 1 };

      // Step 1: 5 -> 4
      let r1 = handleArrowKey(root, caret, 'ArrowUp');
      expect(r1.handled).toBe(true);
      expect(r1.caret.slotId).toBe(n4.id);

      // Step 2: 4 -> 3
      let r2 = handleArrowKey(root, r1.caret, 'ArrowUp');
      expect(r2.handled).toBe(true);
      expect(r2.caret.slotId).toBe(n3.id);

      // Step 3: 3 -> 2
      let r3 = handleArrowKey(root, r2.caret, 'ArrowUp');
      expect(r3.handled).toBe(true);
      expect(r3.caret.slotId).toBe(n2.id);

      // Step 4: 2 -> 1
      let r4 = handleArrowKey(root, r3.caret, 'ArrowUp');
      expect(r4.handled).toBe(true);
      expect(r4.caret.slotId).toBe(n1.id);

      // Step 5: At top level (1) -> cleanly exits upward
      let r5 = handleArrowKey(root, r4.caret, 'ArrowUp');
      expect(r5.handled).toBe(false);
      expect(r5.exitDirection).toBe('up');
    });

    it('navigates sequentially upward across 5-level continued fraction 1 / (2 / (3 / (4 / (5 / 6))))', () => {
      // F5: 5 / 6
      const n5 = createSlot('numerator', [createToken('5', 'mn')]);
      const d5 = createSlot('denominator', [createToken('6', 'mn')]);
      const f5 = createFraction(n5, d5);

      // F4: 4 / F5
      const n4 = createSlot('numerator', [createToken('4', 'mn')]);
      const d4 = createSlot('denominator', [f5]);
      const f4 = createFraction(n4, d4);

      // F3: 3 / F4
      const n3 = createSlot('numerator', [createToken('3', 'mn')]);
      const d3 = createSlot('denominator', [f4]);
      const f3 = createFraction(n3, d3);

      // F2: 2 / F3
      const n2 = createSlot('numerator', [createToken('2', 'mn')]);
      const d2 = createSlot('denominator', [f3]);
      const f2 = createFraction(n2, d2);

      // F1: 1 / F2
      const n1 = createSlot('numerator', [createToken('1', 'mn')]);
      const d1 = createSlot('denominator', [f2]);
      const f1 = createFraction(n1, d1);

      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      // Start at 6
      let caret = { slotId: d5.id, offset: 1 };

      const path = [
        { expectedSlot: n5.id, name: '5 (L5 num)' },
        { expectedSlot: n4.id, name: '4 (L4 num)' },
        { expectedSlot: n3.id, name: '3 (L3 num)' },
        { expectedSlot: n2.id, name: '2 (L2 num)' },
        { expectedSlot: n1.id, name: '1 (L1 num)' },
      ];

      for (let i = 0; i < path.length; i++) {
        const res = handleArrowKey(root, caret, 'ArrowUp');
        expect(res.handled, `Step ${i + 1} to ${path[i].name} must be handled`).toBe(true);
        expect(res.caret.slotId, `Step ${i + 1} must reach ${path[i].name}`).toBe(path[i].expectedSlot);
        caret = res.caret;
      }

      // Exit upward
      const exitRes = handleArrowKey(root, caret, 'ArrowUp');
      expect(exitRes.handled).toBe(false);
      expect(exitRes.exitDirection).toBe('up');
    });

    it('navigates sequentially downward across 5-level nested fraction (( ( (1/2) / 3 ) / 4 ) / 5) / 6', () => {
      // Inverted nesting:
      // F5: 1 / 2
      const n5 = createSlot('numerator', [createToken('1', 'mn')]);
      const d5 = createSlot('denominator', [createToken('2', 'mn')]);
      const f5 = createFraction(n5, d5);

      // F4: F5 / 3
      const n4 = createSlot('numerator', [f5]);
      const d4 = createSlot('denominator', [createToken('3', 'mn')]);
      const f4 = createFraction(n4, d4);

      // F3: F4 / 4
      const n3 = createSlot('numerator', [f4]);
      const d3 = createSlot('denominator', [createToken('4', 'mn')]);
      const f3 = createFraction(n3, d3);

      // F2: F3 / 5
      const n2 = createSlot('numerator', [f3]);
      const d2 = createSlot('denominator', [createToken('5', 'mn')]);
      const f2 = createFraction(n2, d2);

      // F1: F2 / 6
      const n1 = createSlot('numerator', [f2]);
      const d1 = createSlot('denominator', [createToken('6', 'mn')]);
      const f1 = createFraction(n1, d1);

      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      // Caret starts at 1
      let caret = { slotId: n5.id, offset: 0 };

      const path = [
        { expectedSlot: d5.id, name: '2 (L5 den)' },
        { expectedSlot: d4.id, name: '3 (L4 den)' },
        { expectedSlot: d3.id, name: '4 (L3 den)' },
        { expectedSlot: d2.id, name: '5 (L2 den)' },
        { expectedSlot: d1.id, name: '6 (L1 den)' },
      ];

      for (let i = 0; i < path.length; i++) {
        const res = handleArrowKey(root, caret, 'ArrowDown');
        expect(res.handled, `Step ${i + 1} to ${path[i].name} must be handled`).toBe(true);
        expect(res.caret.slotId, `Step ${i + 1} must reach ${path[i].name}`).toBe(path[i].expectedSlot);
        caret = res.caret;
      }

      // Exit downward
      const exitRes = handleArrowKey(root, caret, 'ArrowDown');
      expect(exitRes.handled).toBe(false);
      expect(exitRes.exitDirection).toBe('down');
    });

    it('stress tests rapid alternating ArrowUp / ArrowDown jitter in 5-level fraction without getting stuck or escaping', () => {
      // 5-level continued fraction: 1 / (2 / (3 / (4 / (5 / 6))))
      const n5 = createSlot('numerator', [createToken('5', 'mn')]);
      const d5 = createSlot('denominator', [createToken('6', 'mn')]);
      const f5 = createFraction(n5, d5);

      const n4 = createSlot('numerator', [createToken('4', 'mn')]);
      const d4 = createSlot('denominator', [f5]);
      const f4 = createFraction(n4, d4);

      const n3 = createSlot('numerator', [createToken('3', 'mn')]);
      const d3 = createSlot('denominator', [f4]);
      const f3 = createFraction(n3, d3);

      const n2 = createSlot('numerator', [createToken('2', 'mn')]);
      const d2 = createSlot('denominator', [f3]);
      const f2 = createFraction(n2, d2);

      const n1 = createSlot('numerator', [createToken('1', 'mn')]);
      const d1 = createSlot('denominator', [f2]);
      const f1 = createFraction(n1, d1);

      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      // Start at 6 (innermost denominator)
      let currentCaret = { slotId: d5.id, offset: 1 };

      // Alternating sequence of 40 vertical movements designed to bounce between levels
      const sequence: Array<'ArrowUp' | 'ArrowDown'> = [
        'ArrowUp',   // to 5
        'ArrowUp',   // to 4
        'ArrowDown', // back to 5
        'ArrowUp',   // to 4
        'ArrowUp',   // to 3
        'ArrowDown', // to 4
        'ArrowUp',   // to 3
        'ArrowUp',   // to 2
        'ArrowDown', // to 3
        'ArrowUp',   // to 2
        'ArrowUp',   // to 1
        'ArrowDown', // to 2
        'ArrowDown', // to 3
        'ArrowUp',   // to 2
        'ArrowDown', // to 3
        'ArrowDown', // to 4
        'ArrowDown', // to 5
        'ArrowDown', // to 6
        'ArrowUp',   // to 5
        'ArrowUp',   // to 4
        'ArrowUp',   // to 3
        'ArrowUp',   // to 2
        'ArrowUp',   // to 1
        'ArrowDown', // to 2
        'ArrowUp',   // to 1
        'ArrowDown', // to 2
        'ArrowDown', // to 3
        'ArrowUp',   // to 2
        'ArrowDown', // to 3
        'ArrowDown', // to 4
        'ArrowUp',   // to 3
        'ArrowDown', // to 4
        'ArrowDown', // to 5
        'ArrowDown', // to 6
        'ArrowUp',   // to 5
        'ArrowDown', // to 6
        'ArrowUp',   // to 5
        'ArrowUp',   // to 4
        'ArrowUp',   // to 3
        'ArrowUp',   // to 2
      ];

      for (let i = 0; i < sequence.length; i++) {
        const key = sequence[i];
        const res = handleArrowKey(root, currentCaret, key);

        expect(res.handled, `Step ${i + 1} (${key}) must be handled`).toBe(true);
        expect(res.caret, `Step ${i + 1} (${key}) caret must exist`).not.toBeNull();
        expect(res.exitDirection, `Step ${i + 1} (${key}) must not prematurely exit`).toBeUndefined();

        const foundSlot = findSlotById(root, res.caret.slotId);
        expect(foundSlot, `Step ${i + 1} (${key}) slot must exist in AST`).not.toBeNull();

        currentCaret = res.caret;
      }
    });

    it('navigates tree with nested fractions on BOTH numerator and denominator: ((1/2)/(3/4)) / ((5/6)/(7/8))', () => {
      // Numerator branch: (1/2) / (3/4)
      const f12 = createFraction(
        createSlot('numerator', [createToken('1', 'mn')]),
        createSlot('denominator', [createToken('2', 'mn')])
      );
      const f34 = createFraction(
        createSlot('numerator', [createToken('3', 'mn')]),
        createSlot('denominator', [createToken('4', 'mn')])
      );
      const topFrac = createFraction(
        createSlot('numerator', [f12]),
        createSlot('denominator', [f34])
      );

      // Denominator branch: (5/6) / (7/8)
      const f56 = createFraction(
        createSlot('numerator', [createToken('5', 'mn')]),
        createSlot('denominator', [createToken('6', 'mn')])
      );
      const f78 = createFraction(
        createSlot('numerator', [createToken('7', 'mn')]),
        createSlot('denominator', [createToken('8', 'mn')])
      );
      const bottomFrac = createFraction(
        createSlot('numerator', [f56]),
        createSlot('denominator', [f78])
      );

      const mainFrac = createFraction(
        createSlot('numerator', [topFrac]),
        createSlot('denominator', [bottomFrac])
      );
      const root = createSlot('root', [mainFrac]);
      updateParentPointers(root);

      // Caret starts at 8 (bottom branch innermost denominator)
      let caret = { slotId: f78.denominator.id, offset: 1 };

      // ArrowUp moves from 8 to 7
      let r1 = handleArrowKey(root, caret, 'ArrowUp');
      expect(r1.handled).toBe(true);
      expect(r1.caret.slotId).toBe(f78.numerator.id);

      // ArrowUp moves from 7 up across bottomFrac to f56 denominator (6)
      let r2 = handleArrowKey(root, r1.caret, 'ArrowUp');
      expect(r2.handled).toBe(true);
      expect(r2.caret.slotId).toBe(f56.denominator.id);

      // ArrowUp moves from 6 to 5
      let r3 = handleArrowKey(root, r2.caret, 'ArrowUp');
      expect(r3.handled).toBe(true);
      expect(r3.caret.slotId).toBe(f56.numerator.id);

      // ArrowUp moves from 5 across mainFrac up into topFrac denominator (4)
      let r4 = handleArrowKey(root, r3.caret, 'ArrowUp');
      expect(r4.handled).toBe(true);
      expect(r4.caret.slotId).toBe(f34.denominator.id);
    });

    it('navigates sequentially upward and downward across 6-level continued fraction 1 / (2 / (3 / (4 / (5 / (6 / 7)))))', () => {
      // F6: 6 / 7
      const n6 = createSlot('numerator', [createToken('6', 'mn')]);
      const d6 = createSlot('denominator', [createToken('7', 'mn')]);
      const f6 = createFraction(n6, d6);

      // F5: 5 / F6
      const n5 = createSlot('numerator', [createToken('5', 'mn')]);
      const d5 = createSlot('denominator', [f6]);
      const f5 = createFraction(n5, d5);

      // F4: 4 / F5
      const n4 = createSlot('numerator', [createToken('4', 'mn')]);
      const d4 = createSlot('denominator', [f5]);
      const f4 = createFraction(n4, d4);

      // F3: 3 / F4
      const n3 = createSlot('numerator', [createToken('3', 'mn')]);
      const d3 = createSlot('denominator', [f4]);
      const f3 = createFraction(n3, d3);

      // F2: 2 / F3
      const n2 = createSlot('numerator', [createToken('2', 'mn')]);
      const d2 = createSlot('denominator', [f3]);
      const f2 = createFraction(n2, d2);

      // F1: 1 / F2
      const n1 = createSlot('numerator', [createToken('1', 'mn')]);
      const d1 = createSlot('denominator', [f2]);
      const f1 = createFraction(n1, d1);

      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      // 1. Upward climb from 7: 7 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1 -> exit 'up'
      let caret = { slotId: d6.id, offset: 1 };
      const upPath = [n6.id, n5.id, n4.id, n3.id, n2.id, n1.id];

      for (let i = 0; i < upPath.length; i++) {
        const res = handleArrowKey(root, caret, 'ArrowUp');
        expect(res.handled, `Up step ${i + 1} must be handled`).toBe(true);
        expect(res.caret.slotId, `Up step ${i + 1} target slot mismatch`).toBe(upPath[i]);
        caret = res.caret;
      }

      const upExit = handleArrowKey(root, caret, 'ArrowUp');
      expect(upExit.handled).toBe(false);
      expect(upExit.exitDirection).toBe('up');

      // 2. Downward descent from 1: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> exit 'down'
      let downCaret = { slotId: n1.id, offset: 0 };
      const downPath = [n2.id, n3.id, n4.id, n5.id, n6.id, d6.id];

      for (let i = 0; i < downPath.length; i++) {
        const res = handleArrowKey(root, downCaret, 'ArrowDown');
        expect(res.handled, `Down step ${i + 1} must be handled`).toBe(true);
        expect(res.caret.slotId, `Down step ${i + 1} target slot mismatch`).toBe(downPath[i]);
        downCaret = res.caret;
      }

      const downExit = handleArrowKey(root, downCaret, 'ArrowDown');
      expect(downExit.handled).toBe(false);
      expect(downExit.exitDirection).toBe('down');
    });

    it('stress tests 20 rapid cycles of alternating typing and backspacing in empty fraction', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>\n```\n';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      widget.enterFromStart(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

      const frac = widget.ast.children[0] as any;
      expect(widget.caret.slotId).toBe(frac.numerator.id);

      // Perform 20 cycles: type a char, verify non-empty, backspace it, verify empty
      for (let cycle = 0; cycle < 20; cycle++) {
        const charToType = String.fromCharCode(97 + (cycle % 26)); // 'a', 'b', ...

        // Type
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: charToType, bubbles: true, cancelable: true }));
        expect(widget.isFocused, `Cycle ${cycle}: Must be focused after typing`).toBe(true);
        let num = (widget.ast.children[0] as any).numerator;
        expect(num.children.length, `Cycle ${cycle}: Must have 1 child`).toBe(1);
        expect((num.children[0] as any).text).toBe(charToType);

        // Backspace
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
        expect(widget.isFocused, `Cycle ${cycle}: Must remain focused after backspace`).toBe(true);
        num = (widget.ast.children[0] as any).numerator;
        expect(num.children.length, `Cycle ${cycle}: Must be empty`).toBe(0);
        expect(widget.caret.offset).toBe(0);
      }

      // Slot is cleanly empty, document valid
      expect(view.state.doc.toString()).toContain('<mfrac>');

      view.destroy();
      editorContainer.remove();
    });
  });
});
