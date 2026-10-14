import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMathML } from '../../src/core/mathml-parser';
import { DomRenderer } from '../../src/editor/dom-renderer';
import {
  resetIdCounter,
  findSlotById,
  elevateSelectionForDrag,
  comparePositions,
} from '../../src/core/ast';
import { CaretPosition, SelectionRange, SlotNode } from '../../src/core/types';
import { updatePartialSelectionDom } from '../../src/editor/selection';
import {
  WordEquationWidget,
  handleSelectionStep,
  handleHierarchicalBoundaryExpansion,
} from '../../src/editor/widget';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger M2 Gen55 Stress Suite', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    resetIdCounter();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    // Inject styles.css into document head for computed style verification
    const cssPath = path.resolve(__dirname, '../../styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    styleEl = document.createElement('style');
    styleEl.textContent = cssContent;
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    container.remove();
    styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // 1. NESTED DRAG ELEVATION & RETURN RESTORATION
  // =========================================================================
  describe('1. Drag Boundary Elevation Across Nested Structures & Return Restoration', () => {
    // 3-Level Nested Fraction: ((a1 a2) / (b1 b2)) / ((c1 c2) / (d1 d2)) + s
    const threeLevelFractionXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac>
        <mrow>
          <mfrac>
            <mrow><mi>a1</mi><mi>a2</mi></mrow>
            <mrow><mi>b1</mi><mi>b2</mi></mrow>
          </mfrac>
        </mrow>
        <mrow>
          <mfrac>
            <mrow><mi>c1</mi><mi>c2</mi></mrow>
            <mrow><mi>d1</mi><mi>d2</mi></mrow>
          </mfrac>
        </mrow>
      </mfrac>
      <mi>s</mi>
    </math>`;

    it('preserves intra-slot character drag at deepest nesting level without premature elevation', () => {
      const ast = parseMathML(threeLevelFractionXml);
      const outerFrac = ast.children[0] as any;
      const outerNum = outerFrac.numerator;
      const innerFrac1 = outerNum.children[0] as any;
      const innerNum1 = innerFrac1.numerator;

      // Drag within deepest numerator: a1 (offset 0) to a2 (offset 2)
      const anchor: CaretPosition = { slotId: innerNum1.id, offset: 0 };
      const head: CaretPosition = { slotId: innerNum1.id, offset: 2 };

      const result = elevateSelectionForDrag(ast, anchor, head);
      expect(result.anchor).toEqual(anchor);
      expect(result.head).toEqual(head);
    });

    it('elevates to intermediate composite structure when crossing sibling child slots', () => {
      const ast = parseMathML(threeLevelFractionXml);
      const outerFrac = ast.children[0] as any;
      const outerNum = outerFrac.numerator;
      const innerFrac1 = outerNum.children[0] as any;
      const innerNum1 = innerFrac1.numerator;
      const innerDen1 = innerFrac1.denominator;

      // Drag from inner numerator to inner denominator: LCA is outerNum!
      const anchor: CaretPosition = { slotId: innerNum1.id, offset: 1 };
      const head: CaretPosition = { slotId: innerDen1.id, offset: 1 };

      const elevated = elevateSelectionForDrag(ast, anchor, head);
      // Must elevate to innerFrac1 in outerNum: [0, 1]
      expect(elevated.anchor).toEqual({ slotId: outerNum.id, offset: 0 });
      expect(elevated.head).toEqual({ slotId: outerNum.id, offset: 1 });
    });

    it('elevates across multiple levels up to root slot when crossing outer fraction boundaries', () => {
      const ast = parseMathML(threeLevelFractionXml);
      const outerFrac = ast.children[0] as any;
      const outerNum = outerFrac.numerator;
      const outerDen = outerFrac.denominator;
      const innerFrac1 = outerNum.children[0] as any;
      const innerFrac2 = outerDen.children[0] as any;
      const innerNum1 = innerFrac1.numerator;
      const innerDen2 = innerFrac2.denominator;

      // Drag from innerNum1 (depth 3) to innerDen2 (depth 3): LCA is root!
      const anchor: CaretPosition = { slotId: innerNum1.id, offset: 1 };
      const head: CaretPosition = { slotId: innerDen2.id, offset: 1 };

      const elevated = elevateSelectionForDrag(ast, anchor, head);
      // Must elevate to outerFrac in root slot: [0, 1]
      expect(elevated.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(elevated.head).toEqual({ slotId: ast.id, offset: 1 });
    });

    it('restores intra-slot character selection when mouse returns to the original starting slot', () => {
      const ast = parseMathML(threeLevelFractionXml);
      const outerFrac = ast.children[0] as any;
      const outerNum = outerFrac.numerator;
      const outerDen = outerFrac.denominator;
      const innerFrac1 = outerNum.children[0] as any;
      const innerNum1 = innerFrac1.numerator;

      const anchor: CaretPosition = { slotId: innerNum1.id, offset: 0 };

      // Step 1: Dragged out into outer denominator -> elevated to root
      const headOut: CaretPosition = { slotId: outerDen.id, offset: 0 };
      const elevatedOut = elevateSelectionForDrag(ast, anchor, headOut);
      expect(elevatedOut.anchor.slotId).toBe(ast.id);
      expect(elevatedOut.head.slotId).toBe(ast.id);

      // Step 2: Dragged BACK into the starting slot (innerNum1) at offset 1
      const headBack: CaretPosition = { slotId: innerNum1.id, offset: 1 };
      const restored = elevateSelectionForDrag(ast, anchor, headBack);
      // Must restore precise character selection inside innerNum1
      expect(restored.anchor).toEqual({ slotId: innerNum1.id, offset: 0 });
      expect(restored.head).toEqual({ slotId: innerNum1.id, offset: 1 });
    });

    it('correctly elevates backward drags across nested structures', () => {
      const ast = parseMathML(threeLevelFractionXml);
      const outerFrac = ast.children[0] as any;
      const outerDen = outerFrac.denominator;
      const innerFrac2 = outerDen.children[0] as any;
      const innerDen2 = innerFrac2.denominator;
      const outerNum = outerFrac.numerator;
      const innerFrac1 = outerNum.children[0] as any;
      const innerNum1 = innerFrac1.numerator;

      // Drag backward from innerDen2 to innerNum1
      const anchor: CaretPosition = { slotId: innerDen2.id, offset: 2 };
      const head: CaretPosition = { slotId: innerNum1.id, offset: 0 };

      const backwardElevated = elevateSelectionForDrag(ast, anchor, head);
      // LCA is root; backward selection of outer fraction [1, 0]
      expect(backwardElevated.anchor).toEqual({ slotId: ast.id, offset: 1 });
      expect(backwardElevated.head).toEqual({ slotId: ast.id, offset: 0 });
    });

    it('elevates drag between matrix cells and restores on return', () => {
      const matrixXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mtable>
          <mtr>
            <mtd><mi>a</mi><mi>b</mi></mtd>
            <mtd><mi>c</mi></mtd>
          </mtr>
          <mtr>
            <mtd><mi>d</mi></mtd>
            <mtd><mi>e</mi><mi>f</mi></mtd>
          </mtr>
        </mtable>
        <mi>z</mi>
      </math>`;
      const ast = parseMathML(matrixXml);
      const matrixNode = ast.children[0] as any;
      const cell00 = matrixNode.rows[0][0];
      const cell11 = matrixNode.rows[1][1];

      // Intra-cell drag: cell00 [0, 1]
      const intra = elevateSelectionForDrag(ast, { slotId: cell00.id, offset: 0 }, { slotId: cell00.id, offset: 1 });
      expect(intra.anchor.slotId).toBe(cell00.id);

      // Drag between cell 0,0 and cell 1,1: LCA is root -> elevates to matrix in root [0, 1]
      const cross = elevateSelectionForDrag(ast, { slotId: cell00.id, offset: 0 }, { slotId: cell11.id, offset: 1 });
      expect(cross.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(cross.head).toEqual({ slotId: ast.id, offset: 1 });

      // Return to cell 0,0
      const returned = elevateSelectionForDrag(ast, { slotId: cell00.id, offset: 0 }, { slotId: cell00.id, offset: 2 });
      expect(returned.anchor).toEqual({ slotId: cell00.id, offset: 0 });
      expect(returned.head).toEqual({ slotId: cell00.id, offset: 2 });
    });

    it('elevates drag between radical radicand and root index', () => {
      const rootXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mroot>
          <mrow><mi>x</mi><mi>y</mi></mrow>
          <mn>3</mn>
        </mroot>
      </math>`;
      const ast = parseMathML(rootXml);
      const rootNode = ast.children[0] as any;
      const radicand = rootNode.radicand;
      const index = rootNode.index;

      const cross = elevateSelectionForDrag(ast, { slotId: radicand.id, offset: 1 }, { slotId: index.id, offset: 0 });
      expect(cross.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(cross.head).toEqual({ slotId: ast.id, offset: 1 });

      const returned = elevateSelectionForDrag(ast, { slotId: radicand.id, offset: 1 }, { slotId: radicand.id, offset: 2 });
      expect(returned.anchor).toEqual({ slotId: radicand.id, offset: 1 });
      expect(returned.head).toEqual({ slotId: radicand.id, offset: 2 });
    });
  });

  // =========================================================================
  // 2. STRICT CSS ISOLATION
  // =========================================================================
  describe('2. Strict CSS Isolation & Suppression of Patchy Child Highlights', () => {
    it('ensures child tokens inside .eq-selected-structure render with transparent background', () => {
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mi>a</mi><mi>b</mi></mrow>
          <mrow><mi>c</mi><mi>d</mi></mrow>
        </mfrac>
      </math>`;
      const ast = parseMathML(xml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      // Select entire fraction structure in root: [0, 1]
      const sel: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };
      updatePartialSelectionDom(dom, ast, sel);

      const fractionEl = dom.querySelector('.eq-fraction') as HTMLElement;
      expect(fractionEl?.classList.contains('eq-selected-structure')).toBe(true);

      // Child tokens inside the selected structure
      const tokens = fractionEl.querySelectorAll('.eq-token');
      expect(tokens.length).toBe(4);

      for (const tok of Array.from(tokens)) {
        const computed = window.getComputedStyle(tok);
        // Even if .eq-selected-token is applied, styles.css suppresses it to transparent
        expect(computed.backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(computed.boxShadow).toBe('none');
      }
    });

    it('ensures child slots and numerator/denominator inside .eq-selected-structure suppress patchy tints', () => {
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mi>a</mi></mrow>
          <mrow><mi>b</mi></mrow>
        </mfrac>
      </math>`;
      const ast = parseMathML(xml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const sel: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };
      updatePartialSelectionDom(dom, ast, sel);

      const fractionEl = dom.querySelector('.eq-fraction') as HTMLElement;
      expect(fractionEl?.classList.contains('eq-selected-structure')).toBe(true);

      // Even if child elements have .eq-partial-selected or .eq-selected-slot, styles.css overrides them
      const numEl = fractionEl.querySelector('.eq-numerator') as HTMLElement;
      const denEl = fractionEl.querySelector('.eq-denominator') as HTMLElement;
      const slots = fractionEl.querySelectorAll('.eq-slot');

      if (numEl) {
        numEl.classList.add('eq-partial-selected');
        expect(window.getComputedStyle(numEl).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      }
      if (denEl) {
        denEl.classList.add('eq-partial-selected');
        expect(window.getComputedStyle(denEl).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      }
      for (const slot of Array.from(slots)) {
        slot.classList.add('eq-selected-slot');
        expect(window.getComputedStyle(slot).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      }
    });

    it('applies .eq-selected-structure across diverse composite structures with uniform background', () => {
      const structures = [
        {
          name: 'radical',
          xml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><msqrt><mi>x</mi></msqrt></math>`,
          selector: '.eq-radical',
        },
        {
          name: 'matrix',
          xml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mtable><mtr><mtd><mi>x</mi></mtd></mtr></mtable></math>`,
          selector: '.eq-matrix',
        },
        {
          name: 'superscript',
          xml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><msup><mi>x</mi><mn>2</mn></msup></math>`,
          selector: '.eq-script-box',
        },
        {
          name: 'fenced',
          xml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mfenced open="(" close=")"><mi>x</mi></mfenced></math>`,
          selector: '.eq-fenced',
        },
        {
          name: 'underover',
          xml: `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><munderover><mo>∑</mo><mi>i</mi><mi>n</mi></munderover></math>`,
          selector: '.eq-underover',
        },
      ];

      for (const { name, xml, selector } of structures) {
        const ast = parseMathML(xml);
        const renderer = new DomRenderer();
        const dom = renderer.render(ast);
        container.appendChild(dom);

        const sel: SelectionRange = {
          anchor: { slotId: ast.id, offset: 0 },
          head: { slotId: ast.id, offset: 1 },
        };
        updatePartialSelectionDom(dom, ast, sel);

        const structEl = dom.querySelector(selector) as HTMLElement;
        expect(structEl, `Structure ${name} (${selector}) must be found`).not.toBeNull();
        expect(structEl.classList.contains('eq-selected-structure'), `${name} must receive .eq-selected-structure`).toBe(true);

        const comp = window.getComputedStyle(structEl);
        expect(comp.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

        // Verify child tokens inside are transparent
        const innerToken = structEl.querySelector('.eq-token');
        if (innerToken) {
          expect(window.getComputedStyle(innerToken).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        }
        dom.remove();
      }
    });

    it('demonstrates that higher specificity & correct cascade ordering in remediation restores strict isolation', () => {
      // Remediated CSS with higher specificity child suppression rules placed after token/slot rules
      const remediationCss = `
        .eq-selected-structure .eq-selected-token,
        .eq-selected-structure .eq-token.eq-selected-token,
        .eq-selected-structure .eq-placeholder.eq-selected-token,
        .eq-selected-structure .eq-partial-selected,
        .eq-selected-structure .eq-numerator.eq-partial-selected,
        .eq-selected-structure .eq-denominator.eq-partial-selected,
        .eq-selected-structure .eq-slot.eq-partial-selected,
        .eq-selected-structure .eq-slot:not([data-slot-role="root"]).eq-partial-selected,
        .eq-selected-structure .eq-selected-slot {
          background-color: transparent !important;
          box-shadow: none !important;
        }
      `;
      const remStyle = document.createElement('style');
      remStyle.textContent = remediationCss;
      document.head.appendChild(remStyle);

      try {
        const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
          <mfrac>
            <mrow><mi>a</mi><mi>b</mi></mrow>
            <mrow><mi>c</mi><mi>d</mi></mrow>
          </mfrac>
        </math>`;
        const ast = parseMathML(xml);
        const renderer = new DomRenderer();
        const dom = renderer.render(ast);
        container.appendChild(dom);

        const sel: SelectionRange = {
          anchor: { slotId: ast.id, offset: 0 },
          head: { slotId: ast.id, offset: 1 },
        };
        updatePartialSelectionDom(dom, ast, sel);

        const fractionEl = dom.querySelector('.eq-fraction') as HTMLElement;
        const tokens = fractionEl.querySelectorAll('.eq-token');
        for (const tok of Array.from(tokens)) {
          expect(window.getComputedStyle(tok).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        }

        const numEl = fractionEl.querySelector('.eq-numerator') as HTMLElement;
        if (numEl) {
          numEl.classList.add('eq-partial-selected');
          expect(window.getComputedStyle(numEl).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        }

        const slotEl = fractionEl.querySelector('.eq-slot') as HTMLElement;
        if (slotEl) {
          slotEl.classList.add('eq-selected-slot');
          expect(window.getComputedStyle(slotEl).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        }
      } finally {
        remStyle.remove();
      }
    });
  });

  // =========================================================================
  // 3. INTRA-SLOT HIGHLIGHT GATING ACROSS DIFFERENT STRUCTURES
  // =========================================================================
  describe('3. Intra-Slot Highlight Gating Across Diverse Mathematical Structures', () => {
    it('strictly suppresses .eq-partial-selected for intra-slot selection in fraction numerator and denominator', () => {
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow>
          <mrow><mi>x</mi><mi>y</mi><mi>z</mi></mrow>
        </mfrac>
      </math>`;
      const ast = parseMathML(xml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const numSlot = (ast.children[0] as any).numerator;
      const denSlot = (ast.children[0] as any).denominator;

      // Case A: Select last character 'c' in numerator: [2, 3]
      updatePartialSelectionDom(dom, ast, {
        anchor: { slotId: numSlot.id, offset: 2 },
        head: { slotId: numSlot.id, offset: 3 },
      });

      expect(dom.querySelector('.eq-numerator')?.classList.contains('eq-partial-selected')).toBe(false);
      expect(dom.querySelector('.eq-denominator')?.classList.contains('eq-partial-selected')).toBe(false);
      expect(dom.querySelector(`[data-slot-id="${numSlot.id}"]`)?.classList.contains('eq-partial-selected')).toBe(false);
      expect(dom.querySelector('.eq-fraction')?.classList.contains('eq-selected-structure')).toBe(false);

      // Clean and test Case B: Select character 'y' in denominator: [1, 2]
      dom.querySelectorAll('.eq-selected-token, .eq-partial-selected').forEach((el) => {
        el.classList.remove('eq-selected-token', 'eq-partial-selected');
      });

      updatePartialSelectionDom(dom, ast, {
        anchor: { slotId: denSlot.id, offset: 1 },
        head: { slotId: denSlot.id, offset: 2 },
      });

      expect(dom.querySelector('.eq-numerator')?.classList.contains('eq-partial-selected')).toBe(false);
      expect(dom.querySelector('.eq-denominator')?.classList.contains('eq-partial-selected')).toBe(false);
      expect(dom.querySelector(`[data-slot-id="${denSlot.id}"]`)?.classList.contains('eq-partial-selected')).toBe(false);
    });

    it('strictly suppresses .eq-partial-selected for intra-slot selection in root radicand & index', () => {
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mroot>
          <mrow><mi>u</mi><mi>v</mi><mi>w</mi></mrow>
          <mrow><mn>3</mn><mn>4</mn></mrow>
        </mroot>
      </math>`;
      const ast = parseMathML(xml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const rootNode = ast.children[0] as any;
      const radicand = rootNode.radicand;
      const index = rootNode.index;

      // Select 'v' in radicand
      updatePartialSelectionDom(dom, ast, {
        anchor: { slotId: radicand.id, offset: 1 },
        head: { slotId: radicand.id, offset: 2 },
      });

      expect(dom.querySelectorAll('.eq-partial-selected').length).toBe(0);
      expect(dom.querySelector(`[data-slot-id="${radicand.id}"]`)?.classList.contains('eq-partial-selected')).toBe(false);

      // Select '4' in index
      dom.querySelectorAll('.eq-selected-token, .eq-partial-selected').forEach((el) => {
        el.classList.remove('eq-selected-token', 'eq-partial-selected');
      });

      updatePartialSelectionDom(dom, ast, {
        anchor: { slotId: index.id, offset: 1 },
        head: { slotId: index.id, offset: 2 },
      });

      expect(dom.querySelectorAll('.eq-partial-selected').length).toBe(0);
      expect(dom.querySelector(`[data-slot-id="${index.id}"]`)?.classList.contains('eq-partial-selected')).toBe(false);
    });

    it('strictly suppresses .eq-partial-selected for intra-slot selection in superscripts, subscripts & matrix cells', () => {
      const subsupXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msubsup>
          <mi>x</mi>
          <mrow><mi>i</mi><mi>j</mi></mrow>
          <mrow><mi>k</mi><mi>l</mi></mrow>
        </msubsup>
      </math>`;
      const ast = parseMathML(subsupXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const node = ast.children[0] as any;
      const subSlot = node.sub;
      const supSlot = node.sup;

      // Intra-slot in sub
      updatePartialSelectionDom(dom, ast, {
        anchor: { slotId: subSlot.id, offset: 0 },
        head: { slotId: subSlot.id, offset: 1 },
      });
      expect(dom.querySelectorAll('.eq-partial-selected').length).toBe(0);

      // Intra-slot in sup
      dom.querySelectorAll('.eq-selected-token, .eq-partial-selected').forEach((el) => el.classList.remove('eq-selected-token', 'eq-partial-selected'));
      updatePartialSelectionDom(dom, ast, {
        anchor: { slotId: supSlot.id, offset: 1 },
        head: { slotId: supSlot.id, offset: 2 },
      });
      expect(dom.querySelectorAll('.eq-partial-selected').length).toBe(0);
    });

    it('still applies .eq-partial-selected when selection is truly cross-boundary', () => {
      const xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mi>a</mi><mi>b</mi></mrow>
          <mrow><mi>c</mi><mi>d</mi></mrow>
        </mfrac>
      </math>`;
      const ast = parseMathML(xml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const numSlot = (ast.children[0] as any).numerator;
      const denSlot = (ast.children[0] as any).denominator;

      // True cross-boundary: start in num, end in den
      updatePartialSelectionDom(dom, ast, {
        anchor: { slotId: numSlot.id, offset: 1 },
        head: { slotId: denSlot.id, offset: 1 },
      });

      expect(dom.querySelector('.eq-numerator')?.classList.contains('eq-partial-selected')).toBe(true);
      expect(dom.querySelector('.eq-denominator')?.classList.contains('eq-partial-selected')).toBe(true);
    });
  });

  // =========================================================================
  // 4. MULTI-CLICK SELECTION EDGE CASES
  // =========================================================================
  describe('4. Multi-Click Selection Edge Cases & Jitter Suppression', () => {
    const fractionXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac>
        <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
        <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
      </mfrac>
      <mi>s</mi>
    </math>`;

    const createMockView = () =>
      ({
        state: {
          selection: { ranges: [] },
          doc: { sliceString: () => '' },
        },
        dispatch: () => {},
      } as any);

    it('handles double-clicking an empty slot: highlights placeholder without crashing', () => {
      const emptySlotXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow></mrow>
          <mrow><mi>x</mi></mrow>
        </mfrac>
      </math>`;
      const widget = new WordEquationWidget(emptySlotXml, 0, 50);
      const mockView = createMockView();
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const numSlot = (widget.ast.children[0] as any).numerator as SlotNode;
      expect(numSlot.children.length).toBe(0);

      // Target the empty numerator placeholder element
      const placeholderEl = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      expect(placeholderEl).not.toBeNull();

      // Dispatch double click (detail: 2) on empty placeholder
      const dblClickEvt = new MouseEvent('pointerdown', {
        detail: 2,
        clientX: 10,
        clientY: 10,
        bubbles: true,
      });
      placeholderEl.dispatchEvent(dblClickEvt);

      // Empty slot double-click sets highlightedSlotId rather than multi-token range
      expect(widget.highlightedSlotId).toBe(numSlot.id);
      expect(widget.selection).toBeNull();
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 0 });

      // In DOM, the placeholder should have focused / highlighted class
      const slotEl = dom.querySelector(`[data-slot-id="${numSlot.id}"]`);
      expect(slotEl?.classList.contains('eq-placeholder-highlighted')).toBe(true);
    });

    it('supports rapid consecutive clicks: single -> double -> triple -> quadruple -> quintuple', () => {
      const widget = new WordEquationWidget(fractionXml, 0, 100);
      const mockView = createMockView();
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const targetEl = dom.querySelector('.eq-numerator .eq-token') as HTMLElement;
      expect(targetEl).not.toBeNull();

      // 1. Single click (detail: 1)
      const ev1 = new MouseEvent('pointerdown', { detail: 1, clientX: 20, clientY: 20, bubbles: true });
      targetEl.dispatchEvent(ev1);
      expect(widget.selection).toBeNull();

      // 2. Double click (detail: 2)
      const ev2 = new MouseEvent('pointerdown', { detail: 2, clientX: 20, clientY: 20, bubbles: true });
      targetEl.dispatchEvent(ev2);
      expect(widget.selection).not.toBeNull();
      const numSlot = (widget.ast.children[0] as any).numerator;
      expect(widget.selection?.anchor).toEqual({ slotId: numSlot.id, offset: 0 });
      expect(widget.selection?.head).toEqual({ slotId: numSlot.id, offset: numSlot.children.length });

      // 3. Triple click (detail: 3)
      const ev3 = new MouseEvent('pointerdown', { detail: 3, clientX: 20, clientY: 20, bubbles: true });
      targetEl.dispatchEvent(ev3);
      expect(widget.selection?.anchor).toEqual({ slotId: widget.ast.id, offset: 0 });
      expect(widget.selection?.head).toEqual({ slotId: widget.ast.id, offset: widget.ast.children.length });

      // 4. Quadruple click (detail: 4)
      const ev4 = new MouseEvent('pointerdown', { detail: 4, clientX: 20, clientY: 20, bubbles: true });
      targetEl.dispatchEvent(ev4);
      expect(widget.selection?.anchor).toEqual({ slotId: widget.ast.id, offset: 0 });
      expect(widget.selection?.head).toEqual({ slotId: widget.ast.id, offset: widget.ast.children.length });

      // 5. Quintuple click (detail: 5)
      const ev5 = new MouseEvent('pointerdown', { detail: 5, clientX: 20, clientY: 20, bubbles: true });
      targetEl.dispatchEvent(ev5);
      expect(widget.selection?.anchor).toEqual({ slotId: widget.ast.id, offset: 0 });
      expect(widget.selection?.head).toEqual({ slotId: widget.ast.id, offset: widget.ast.children.length });
    });

    it('suppresses drag jitter during multi-clicks when movement is below 10px threshold', () => {
      const widget = new WordEquationWidget(fractionXml, 0, 100);
      const mockView = createMockView();
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const targetEl = dom.querySelector('.eq-numerator .eq-token') as HTMLElement;

      // Double-click activation at (50, 50)
      const downEvt = new MouseEvent('pointerdown', {
        detail: 2,
        clientX: 50,
        clientY: 50,
        buttons: 1,
        bubbles: true,
      });
      targetEl.dispatchEvent(downEvt);

      // Verify double-click selected placeholder
      const numSlot = (widget.ast.children[0] as any).numerator;
      expect(widget.selection?.anchor.slotId).toBe(numSlot.id);
      expect(widget.selection?.head.offset).toBe(3);

      // Jitter 1: Small micro-movement (dx: 3, dy: 4 -> dist = 5px < 10px)
      const jitter1 = new MouseEvent('pointermove', {
        clientX: 53,
        clientY: 54,
        buttons: 1,
        bubbles: true,
      });
      document.dispatchEvent(jitter1);

      // Selection must remain intact (not converted to drag or collapsed)
      expect(widget.selection?.anchor.slotId).toBe(numSlot.id);
      expect(widget.selection?.head.offset).toBe(3);

      // Jitter 2: Movement of 8px (< 10px)
      const jitter2 = new MouseEvent('pointermove', {
        clientX: 56,
        clientY: 56,
        buttons: 1,
        bubbles: true,
      });
      document.dispatchEvent(jitter2);
      expect(widget.selection?.anchor.slotId).toBe(numSlot.id);
      expect(widget.selection?.head.offset).toBe(3);

      // Movement of 15px (>= 10px) triggers drag threshold
      const realMove = new MouseEvent('pointermove', {
        clientX: 65,
        clientY: 65,
        buttons: 1,
        bubbles: true,
      });
      document.dispatchEvent(realMove);

      // Release mouse
      const upEvt = new MouseEvent('pointerup', { clientX: 65, clientY: 65, bubbles: true });
      document.dispatchEvent(upEvt);
    });

    it('terminates drag session immediately if pointermove detects left button was released', () => {
      const widget = new WordEquationWidget(fractionXml, 0, 100);
      const mockView = createMockView();
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const targetEl = dom.querySelector('.eq-numerator .eq-token') as HTMLElement;
      const downEvt = new MouseEvent('pointerdown', {
        detail: 1,
        clientX: 50,
        clientY: 50,
        buttons: 1,
        bubbles: true,
      });
      targetEl.dispatchEvent(downEvt);

      // Move with buttons: 0 (released)
      const moveNoButtons = new MouseEvent('pointermove', {
        clientX: 80,
        clientY: 80,
        buttons: 0,
        bubbles: true,
      });
      document.dispatchEvent(moveNoButtons);

      // Click tracking and drag listeners should be torn down safely without thrown errors
      expect((widget as any).lastClickCount).toBe(0);
    });
  });

  // =========================================================================
  // 5. VALIDATE SCENARIO 43 IMPLEMENTATION IN E2E SUITE
  // =========================================================================
  describe('5. Real Obsidian Desktop E2E Scenario 43 Validation', () => {
    it('verifies Scenario 43 exists and rigorously covers all 5 bug and feature requirements', () => {
      const e2eFilePath = path.resolve(__dirname, '../e2e-obsidian/obsidian-real-e2e.test.mjs');
      expect(fs.existsSync(e2eFilePath)).toBe(true);

      const e2eContent = fs.readFileSync(e2eFilePath, 'utf-8');

      // 1. Scenario 43 Header and Note Content
      expect(e2eContent).toContain('SCENARIO 43: Selection Boundaries, Hierarchical Stepping & Multi-Click');
      expect(e2eContent).toContain('gen54-selection-boundary.md');

      // 2. Phase A: Bug 1 - Shift+Arrow Atomic Structure Stepping
      expect(e2eContent).toContain('Phase A: Bug 1 - Shift+Arrow Atomic Structure Stepping');
      expect(e2eContent).toContain(`hasStructureHighlight: fractionEl?.classList.contains('eq-selected-structure')`);
      expect(e2eContent).toContain('Shift+ArrowRight atomically selected composite fraction in root slot with .eq-selected-structure!');

      // 3. Phase B: Bug 2 - Shift+Arrow Hierarchical Scope Expansion
      expect(e2eContent).toContain('Phase B: Bug 2 - Shift+Arrow Hierarchical Scope Expansion');
      expect(e2eContent).toContain('s43PhaseBStage1.headOffset !== s43PhaseBStage1.numLength');
      expect(e2eContent).toContain('s43PhaseBStage2.anchorSlotId !== s43PhaseBStage2.rootSlotId');
      expect(e2eContent).toContain('Hierarchical boundary expansion promoted selection to parent structure!');

      // 4. Phase C: Bug 3 - Pointer Drag Boundary Elevation
      expect(e2eContent).toContain('Phase C: Bug 3 - Pointer Drag Boundary Elevation');
      expect(e2eContent).toContain('page.mouse.down()');
      expect(e2eContent).toContain('page.mouse.move(sBox.x');
      expect(e2eContent).toContain('Dragging across boundary elevated selection to parent structure with .eq-selected-structure!');

      // 5. Phase D: Bug 4 - Single Character Highlight Isolation
      expect(e2eContent).toContain('Phase D: Bug 4 - Single Character Highlight Isolation');
      expect(e2eContent).toContain('selectedTokenCount: selectedTokens.length');
      expect(e2eContent).toContain('hasNumPartialSelected');
      expect(e2eContent).toContain('Single character selection cleanly isolated with 0 double-highlight tint on container!');

      // 6. Phase E: Multi-Click Selection (Double-Click & Triple-Click)
      expect(e2eContent).toContain('Phase E: Multi-Click Selection');
      expect(e2eContent).toContain('page.mouse.dblclick');
      expect(e2eContent).toContain('Double-click selected entire current placeholder!');
      expect(e2eContent).toContain('page.mouse.click(');
      expect(e2eContent).toContain('{ clickCount: 3 }');
      expect(e2eContent).toContain('Triple-click selected entire root equation!');
    });
  });
});
