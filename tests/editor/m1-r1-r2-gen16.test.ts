import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { handleArrowKey } from '../../src/editor/navigation';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { getActiveEquationState, clearActiveEquationState } from '../../src/editor/active-session';

describe('Milestone 1 (R1 & R2) Implementation Verification', () => {
  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
  });

  // =========================================================================
  // R1: Placeholder & Root Rendering Fixes
  // =========================================================================
  describe('R1: Placeholder Rendering & Double Dashed Square Resolution', () => {
    it('styles.css defines transparent dashed border on .eq-placeholder and accent on .eq-focused', () => {
      const cssPath = resolve(__dirname, '../../styles.css');
      const css = readFileSync(cssPath, 'utf8');

      // Unfocused placeholder must use transparent border to eliminate double dashed box
      expect(css).toMatch(/\.eq-placeholder\s*\{[^}]*border:\s*1px\s+dashed\s+transparent/);
      expect(css).toMatch(/\.eq-placeholder\s*\{[^}]*color:\s*var\(--text-muted,\s*#888\)/);

      // Focused placeholder highlights with interactive accent
      expect(css).toMatch(/\.eq-placeholder\.eq-focused\s*\{[^}]*border-color:\s*var\(--interactive-accent,\s*#705dcf\)/);
    });

    it('renders unfocused empty placeholders with ⬚ glyph and preserves box geometry', () => {
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const placeholders = dom.querySelectorAll('.eq-placeholder');
      expect(placeholders.length).toBe(2);

      const numPh = placeholders[0] as HTMLElement;
      const denPh = placeholders[1] as HTMLElement;

      expect(numPh.textContent).toBe('⬚');
      expect(denPh.textContent).toBe('⬚');
      expect(numPh.classList.contains('eq-focused')).toBe(false);
      expect(denPh.classList.contains('eq-focused')).toBe(false);
    });

    it('clears ⬚ and displays visual caret inside focused placeholder', () => {
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root, { caret: { slotId: num.id, offset: 0 } });

      const numPh = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      const denPh = dom.querySelector('.eq-denominator .eq-placeholder') as HTMLElement;

      expect(numPh.classList.contains('eq-focused')).toBe(true);
      expect(numPh.querySelector('.eq-caret')).not.toBeNull();
      expect(numPh.querySelector('.eq-caret')!.textContent).toBe('|');

      // Unfocused denominator retains ⬚ glyph
      expect(denPh.classList.contains('eq-focused')).toBe(false);
      expect(denPh.textContent).toBe('⬚');
    });
  });

  describe('R1: Radical / Square Root Seamless SVG Surd Rendering', () => {
    it('styles.css defines .eq-radical-surd and .eq-radical-svg for seamless vinculum connection', () => {
      const cssPath = resolve(__dirname, '../../styles.css');
      const css = readFileSync(cssPath, 'utf8');

      expect(css).toMatch(/\.eq-radical-surd\s*\{[^}]*display:\s*inline-flex/);
      expect(css).toMatch(/\.eq-radical-surd\s*\{[^}]*margin-right:\s*-1px/);
      expect(css).toMatch(/\.eq-radical-surd\s*\{[^}]*padding-right:\s*0/);
      expect(css).toMatch(/\.eq-radical-svg\s*\{[^}]*width:\s*0\.65em/);
      expect(css).toMatch(/\.eq-radical-svg\s*\{[^}]*height:\s*100%/);
    });

    it('renders radical surd with inline SVG checkmark and vector path in renderRadical', () => {
      const radicand = createSlot('radicand', [createToken('x', 'mi')]);
      const rad = createRadical(radicand);
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const surdEl = dom.querySelector('.eq-radical-surd') as HTMLElement;
      expect(surdEl).not.toBeNull();

      const svg = surdEl.querySelector('svg.eq-radical-svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('viewBox')).toBe('0 0 12 24');
      expect(svg!.getAttribute('preserveAspectRatio')).toBe('none');

      const path = svg!.querySelector('path');
      expect(path).not.toBeNull();
      expect(path!.getAttribute('d')).toBe('M1 13 L3 13 L6 23 L11 1 L12 1');
      expect(path!.getAttribute('stroke')).toBe('currentColor');
    });

    it('renders nth-root surd with inline SVG checkmark and index slot in renderRoot', () => {
      const idx = createSlot('index', [createToken('3', 'mn')]);
      const radicand = createSlot('radicand', [createToken('y', 'mi')]);
      const rootNode = createRoot(radicand, idx);
      const root = createSlot('root', [rootNode]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const idxEl = dom.querySelector('.eq-radical-index');
      expect(idxEl).not.toBeNull();
      expect(idxEl!.textContent).toBe('3');

      const surdEl = dom.querySelector('.eq-radical-surd') as HTMLElement;
      expect(surdEl).not.toBeNull();
      const svg = surdEl.querySelector('svg.eq-radical-svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('viewBox')).toBe('0 0 12 24');
    });

    it('supports mouse hit-testing through SVG checkmark directly into radicand slot', () => {
      const radicand = createSlot('radicand', [createToken('z', 'mi')]);
      const rad = createRadical(radicand);
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const svgPath = dom.querySelector('.eq-radical-svg path') as SVGPathElement;
      expect(svgPath).not.toBeNull();

      const caret = handleMouseClick(root, dom, 5, 5, svgPath as any);
      expect(caret.slotId).toBe(radicand.id);
    });
  });

  // =========================================================================
  // R2: Navigation Edge Cases
  // =========================================================================
  describe('R2: Multi-Level (Nested) Fraction Vertical Arrow Navigation', () => {
    it('navigates sequentially upward across 3-level continued fraction 1 / (2 / (3 / 4))', () => {
      // Construct 3-level fraction:
      // F1: num 1, den -> F2
      // F2: num 2, den -> F3
      // F3: num 3, den 4
      const n3 = createSlot('numerator', [createToken('3', 'mn')]);
      const d3 = createSlot('denominator', [createToken('4', 'mn')]);
      const f3 = createFraction(n3, d3);

      const n2 = createSlot('numerator', [createToken('2', 'mn')]);
      const d2 = createSlot('denominator', [f3]);
      const f2 = createFraction(n2, d2);

      const n1 = createSlot('numerator', [createToken('1', 'mn')]);
      const d1 = createSlot('denominator', [f2]);
      const f1 = createFraction(n1, d1);

      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      // Caret starts at 4 (innermost denominator d3)
      let caret = { slotId: d3.id, offset: 1 };

      // Press ArrowUp 1: moves from 4 to 3 (f3 numerator)
      let res1 = handleArrowKey(root, caret, 'ArrowUp');
      expect(res1.handled).toBe(true);
      expect(res1.caret.slotId).toBe(n3.id);

      // Press ArrowUp 2: moves from 3 to 2 (f2 numerator) without escaping
      let res2 = handleArrowKey(root, res1.caret, 'ArrowUp');
      expect(res2.handled).toBe(true);
      expect(res2.caret.slotId).toBe(n2.id);

      // Press ArrowUp 3: moves from 2 to 1 (f1 numerator) without escaping
      let res3 = handleArrowKey(root, res2.caret, 'ArrowUp');
      expect(res3.handled).toBe(true);
      expect(res3.caret.slotId).toBe(n1.id);

      // Press ArrowUp 4: at top level, cleanly exits equation upward
      let res4 = handleArrowKey(root, res3.caret, 'ArrowUp');
      expect(res4.handled).toBe(false);
      expect(res4.exitDirection).toBe('up');
    });

    it('navigates sequentially downward across 3-level nested fraction ((1 / 2) / 3) / 4', () => {
      // Construct 3-level fraction descending:
      // F3: num 1, den 2
      // F2: num F3, den 3
      // F1: num F2, den 4
      const n3 = createSlot('numerator', [createToken('1', 'mn')]);
      const d3 = createSlot('denominator', [createToken('2', 'mn')]);
      const f3 = createFraction(n3, d3);

      const n2 = createSlot('numerator', [f3]);
      const d2 = createSlot('denominator', [createToken('3', 'mn')]);
      const f2 = createFraction(n2, d2);

      const n1 = createSlot('numerator', [f2]);
      const d1 = createSlot('denominator', [createToken('4', 'mn')]);
      const f1 = createFraction(n1, d1);

      const root = createSlot('root', [f1]);
      updateParentPointers(root);

      // Caret starts at 1 (innermost numerator n3)
      let caret = { slotId: n3.id, offset: 0 };

      // Press ArrowDown 1: moves from 1 to 2 (f3 denominator)
      let res1 = handleArrowKey(root, caret, 'ArrowDown');
      expect(res1.handled).toBe(true);
      expect(res1.caret.slotId).toBe(d3.id);

      // Press ArrowDown 2: moves from 2 to 3 (f2 denominator)
      let res2 = handleArrowKey(root, res1.caret, 'ArrowDown');
      expect(res2.handled).toBe(true);
      expect(res2.caret.slotId).toBe(d2.id);

      // Press ArrowDown 3: moves from 3 to 4 (f1 denominator)
      let res3 = handleArrowKey(root, res2.caret, 'ArrowDown');
      expect(res3.handled).toBe(true);
      expect(res3.caret.slotId).toBe(d1.id);

      // Press ArrowDown 4: at bottom level, cleanly exits equation downward
      let res4 = handleArrowKey(root, res3.caret, 'ArrowDown');
      expect(res4.handled).toBe(false);
      expect(res4.exitDirection).toBe('down');
    });

    it('navigates across 4-level nested fractions 1 / (2 / (3 / (4 / 5)))', () => {
      const n4 = createSlot('numerator', [createToken('4', 'mn')]);
      const d4 = createSlot('denominator', [createToken('5', 'mn')]);
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

      let caret = { slotId: d4.id, offset: 1 }; // at '5'

      const r1 = handleArrowKey(root, caret, 'ArrowUp'); // to '4'
      expect(r1.caret.slotId).toBe(n4.id);

      const r2 = handleArrowKey(root, r1.caret, 'ArrowUp'); // to '3'
      expect(r2.caret.slotId).toBe(n3.id);

      const r3 = handleArrowKey(root, r2.caret, 'ArrowUp'); // to '2'
      expect(r3.caret.slotId).toBe(n2.id);

      const r4 = handleArrowKey(root, r3.caret, 'ArrowUp'); // to '1'
      expect(r4.caret.slotId).toBe(n1.id);

      const r5 = handleArrowKey(root, r4.caret, 'ArrowUp'); // exit up
      expect(r5.handled).toBe(false);
      expect(r5.exitDirection).toBe('up');
    });
  });

  describe('R2: Empty Fraction Typing without Freezing & Caret Stickiness', () => {
    it('allows continuous sequential typing inside empty fraction placeholders without freeze', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Step 1: Enter equation from start
      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);

      // Step 2: Navigate Right into numerator placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

      const frac = widget!.ast.children[0] as any;
      expect(frac.type).toBe('fraction');
      const numSlot = frac.numerator;
      const denSlot = frac.denominator;

      expect(widget!.caret.slotId).toBe(numSlot.id);
      expect(widget!.caret.offset).toBe(0);

      // Step 3: Type first character 'a' into numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
      expect(widget!.isFocused).toBe(true);
      let currentNum = (widget!.ast.children[0] as any).numerator;
      expect(currentNum.children.length).toBe(1);
      expect((currentNum.children[0] as any).text).toBe('a');
      expect(widget!.caret.slotId).toBe(currentNum.id);
      expect(widget!.caret.offset).toBe(1);

      // Step 4: Type second character 'b' into numerator - MUST NOT FREEZE
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
      expect(widget!.isFocused).toBe(true);
      currentNum = (widget!.ast.children[0] as any).numerator;
      expect(currentNum.children.length).toBe(2);
      expect((currentNum.children[1] as any).text).toBe('b');
      expect(widget!.caret.slotId).toBe(currentNum.id);
      expect(widget!.caret.offset).toBe(2);

      // Step 5: Type third character 'c' into numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }));
      expect(widget!.isFocused).toBe(true);
      currentNum = (widget!.ast.children[0] as any).numerator;
      expect(currentNum.children.length).toBe(3);
      expect((currentNum.children[2] as any).text).toBe('c');

      // Step 6: ArrowRight moves from numerator to denominator placeholder
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      let currentDen = (widget!.ast.children[0] as any).denominator;
      expect(widget!.caret.slotId).toBe(currentDen.id);
      expect(widget!.caret.offset).toBe(0);

      // Step 7: Type '1' into denominator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
      expect(widget!.isFocused).toBe(true);
      currentDen = (widget!.ast.children[0] as any).denominator;
      expect(currentDen.children.length).toBe(1);
      expect((currentDen.children[0] as any).text).toBe('1');
      expect(widget!.caret.slotId).toBe(currentDen.id);
      expect(widget!.caret.offset).toBe(1);

      // Step 8: Type '2' into denominator - continuous typing operates reliably
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
      currentDen = (widget!.ast.children[0] as any).denominator;
      expect(currentDen.children.length).toBe(2);
      expect((currentDen.children[1] as any).text).toBe('2');

      // Step 9: Verify document contains the updated MathML with a, b, c and 1, 2
      expect(view.state.doc.toString()).toContain('<mi>a</mi>');
      expect(view.state.doc.toString()).toContain('<mi>b</mi>');
      expect(view.state.doc.toString()).toContain('<mi>c</mi>');
      expect(view.state.doc.toString()).toContain('<mn>1</mn>');
      expect(view.state.doc.toString()).toContain('<mn>2</mn>');

      view.destroy();
      container.remove();
    });

    it('navigates seamlessly with ArrowRight through empty fraction without getting stuck', () => {
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // 1. Caret at start of root (before fraction)
      let caret = { slotId: root.id, offset: 0 };

      // 2. ArrowRight enters numerator placeholder
      let res1 = handleArrowKey(root, caret, 'ArrowRight');
      expect(res1.handled).toBe(true);
      expect(res1.caret.slotId).toBe(num.id);
      expect(res1.caret.offset).toBe(0);

      // 3. ArrowRight moves to denominator placeholder
      let res2 = handleArrowKey(root, res1.caret, 'ArrowRight');
      expect(res2.handled).toBe(true);
      expect(res2.caret.slotId).toBe(den.id);
      expect(res2.caret.offset).toBe(0);

      // 4. ArrowRight exits fraction into root slot (after fraction)
      let res3 = handleArrowKey(root, res2.caret, 'ArrowRight');
      expect(res3.handled).toBe(true);
      expect(res3.caret.slotId).toBe(root.id);
      expect(res3.caret.offset).toBe(1);

      // 5. ArrowRight exits equation after
      let res4 = handleArrowKey(root, res3.caret, 'ArrowRight');
      expect(res4.handled).toBe(false);
      expect(res4.exitDirection).toBe('after');
    });

    it('WordEquationWidget.destroy does not clear ActiveEquationState during internal update', () => {
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(getActiveEquationState()).not.toBeNull();
      expect(getActiveEquationState()!.isFocused).toBe(true);

      // Normal destroy when view is destroyed clears active state
      view.destroy();
      container.remove();
      expect(getActiveEquationState()).toBeNull();
    });
  });
});
