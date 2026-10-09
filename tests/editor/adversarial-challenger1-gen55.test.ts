import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseMathML } from '../../src/core/mathml-parser';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { resetIdCounter, findSlotById, createSlot, createToken } from '../../src/core/ast';
import { CaretPosition, SelectionRange, SlotNode } from '../../src/core/types';
import { updatePartialSelectionDom } from '../../src/editor/selection';
import {
  handleSelectionStep,
  handleHierarchicalBoundaryExpansion,
  elevateSelectionForDrag,
  WordEquationWidget,
} from '../../src/editor/widget';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger 1 (Gen 55): Keyboard Selection Traversal & Structure Stepping Stress Suite', () => {
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

  // =========================================================================
  // GROUP 1: Deeply Nested Mathematical Structures (Bugs 1 & 2)
  // =========================================================================
  describe('Group 1: Deeply Nested Hierarchies (Fractions, Radicals, Matrices, Subsup)', () => {
    const deepNestedXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac>
        <mrow>
          <msqrt>
            <mfrac>
              <mrow><mi>a</mi></mrow>
              <mrow><mi>b</mi></mrow>
            </mfrac>
          </msqrt>
        </mrow>
        <mrow><mi>c</mi></mrow>
      </mfrac>
      <mi>d</mi>
    </math>`;

    it('Scenario 1.1: Atomic stepping at root preserves enclosing slot integrity without descending into nested child structures', () => {
      const ast = parseMathML(deepNestedXml);
      const rootSlot = ast;
      const caret: CaretPosition = { slotId: rootSlot.id, offset: 0 };

      // Step 1: Shift+ArrowRight from root offset 0 over the entire outer fraction
      const step1 = handleSelectionStep(rootSlot, null, caret, 'ArrowRight');
      expect(step1).not.toBeNull();
      expect(step1!.handled).toBe(true);
      expect(step1!.selection.anchor).toEqual({ slotId: rootSlot.id, offset: 0 });
      expect(step1!.selection.head).toEqual({ slotId: rootSlot.id, offset: 1 });
      expect(step1!.caret).toEqual({ slotId: rootSlot.id, offset: 1 });

      // Step 2: Shift+ArrowRight over token 'd'
      const step2 = handleSelectionStep(rootSlot, step1!.selection, step1!.caret, 'ArrowRight');
      expect(step2!.handled).toBe(true);
      expect(step2!.selection.anchor).toEqual({ slotId: rootSlot.id, offset: 0 });
      expect(step2!.selection.head).toEqual({ slotId: rootSlot.id, offset: 2 });

      // Step 3: Shift+ArrowRight at root boundary exits cleanly
      const step3 = handleSelectionStep(rootSlot, step2!.selection, step2!.caret, 'ArrowRight');
      expect(step3!.handled).toBe(false);
      expect(step3!.exitDirection).toBe('after');
    });

    it('Scenario 1.2: Deep hierarchical ladder: climbs from innermost numerator sequentially to root and exits', () => {
      const ast = parseMathML(deepNestedXml);
      const outerFrac = ast.children[0] as any;
      const outerNum = outerFrac.numerator;
      const sqrtNode = outerNum.children[0] as any;
      const radicand = sqrtNode.radicand;
      const innerFrac = radicand.children[0] as any;
      const innerNum = innerFrac.numerator;

      // Start at offset 0 before 'a' in innermost numerator
      const initialCaret: CaretPosition = { slotId: innerNum.id, offset: 0 };

      // Step 1: Steps over token 'a' in innerNum -> [0, 1]
      const step1 = handleSelectionStep(ast, null, initialCaret, 'ArrowRight')!;
      expect(step1.handled).toBe(true);
      expect(step1.selection.anchor).toEqual({ slotId: innerNum.id, offset: 0 });
      expect(step1.selection.head).toEqual({ slotId: innerNum.id, offset: 1 });

      // Step 2: At boundary of innerNum (fully selected [0, 1]) -> expands to innerFrac in radicand [0, 1]
      const step2 = handleSelectionStep(ast, step1.selection, step1.caret, 'ArrowRight')!;
      expect(step2.handled).toBe(true);
      expect(step2.selection.anchor).toEqual({ slotId: radicand.id, offset: 0 });
      expect(step2.selection.head).toEqual({ slotId: radicand.id, offset: 1 });

      // Step 3: At boundary of radicand (fully selected [0, 1]) -> expands to sqrt in outerNum [0, 1]
      const step3 = handleSelectionStep(ast, step2.selection, step2.caret, 'ArrowRight')!;
      expect(step3.handled).toBe(true);
      expect(step3.selection.anchor).toEqual({ slotId: outerNum.id, offset: 0 });
      expect(step3.selection.head).toEqual({ slotId: outerNum.id, offset: 1 });

      // Step 4: At boundary of outerNum (fully selected [0, 1]) -> expands to outerFrac in root [0, 1]
      const step4 = handleSelectionStep(ast, step3.selection, step3.caret, 'ArrowRight')!;
      expect(step4.handled).toBe(true);
      expect(step4.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(step4.selection.head).toEqual({ slotId: ast.id, offset: 1 });

      // Step 5: In root, next step steps over token 'd' [0, 2]
      const step5 = handleSelectionStep(ast, step4.selection, step4.caret, 'ArrowRight')!;
      expect(step5.handled).toBe(true);
      expect(step5.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(step5.selection.head).toEqual({ slotId: ast.id, offset: 2 });

      // Step 6: At root boundary, exits cleanly to markdown
      const step6 = handleSelectionStep(ast, step5.selection, step5.caret, 'ArrowRight')!;
      expect(step6.handled).toBe(false);
      expect(step6.exitDirection).toBe('after');
    });

    it('Scenario 1.3: Deep hierarchical backward ladder: climbs backward from innermost denominator to root', () => {
      const ast = parseMathML(deepNestedXml);
      const outerFrac = ast.children[0] as any;
      const outerNum = outerFrac.numerator;
      const sqrtNode = outerNum.children[0] as any;
      const radicand = sqrtNode.radicand;
      const innerFrac = radicand.children[0] as any;
      const innerDen = innerFrac.denominator;

      // Start at offset 1 after 'b' in innermost denominator
      const initialCaret: CaretPosition = { slotId: innerDen.id, offset: 1 };

      // Step 1: Backward step over token 'b' in innerDen -> [1, 0]
      const step1 = handleSelectionStep(ast, null, initialCaret, 'ArrowLeft')!;
      expect(step1.handled).toBe(true);
      expect(step1.selection.anchor).toEqual({ slotId: innerDen.id, offset: 1 });
      expect(step1.selection.head).toEqual({ slotId: innerDen.id, offset: 0 });

      // Step 2: At start boundary of innerDen (fully selected backward [1, 0]) -> expands backward to innerFrac in radicand [1, 0]
      const step2 = handleSelectionStep(ast, step1.selection, step1.caret, 'ArrowLeft')!;
      expect(step2.handled).toBe(true);
      expect(step2.selection.anchor).toEqual({ slotId: radicand.id, offset: 1 });
      expect(step2.selection.head).toEqual({ slotId: radicand.id, offset: 0 });

      // Step 3: At start boundary of radicand -> expands backward to sqrt in outerNum [1, 0]
      const step3 = handleSelectionStep(ast, step2.selection, step2.caret, 'ArrowLeft')!;
      expect(step3.handled).toBe(true);
      expect(step3.selection.anchor).toEqual({ slotId: outerNum.id, offset: 1 });
      expect(step3.selection.head).toEqual({ slotId: outerNum.id, offset: 0 });

      // Step 4: At start boundary of outerNum -> expands backward to outerFrac in root [1, 0]
      const step4 = handleSelectionStep(ast, step3.selection, step3.caret, 'ArrowLeft')!;
      expect(step4.handled).toBe(true);
      expect(step4.selection.anchor).toEqual({ slotId: ast.id, offset: 1 });
      expect(step4.selection.head).toEqual({ slotId: ast.id, offset: 0 });

      // Step 5: At start boundary of root slot -> exits cleanly to markdown
      const step5 = handleSelectionStep(ast, step4.selection, step4.caret, 'ArrowLeft')!;
      expect(step5.handled).toBe(false);
      expect(step5.exitDirection).toBe('before');
    });

    it('Scenario 1.4: Nested matrix and fenced expression selection stepping', () => {
      const matrixXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfenced open="[" close="]">
          <mtable>
            <mtr><mtd><mi>x</mi></mtd><mtd><mi>y</mi></mtd></mtr>
            <mtr><mtd><mi>z</mi></mtd><mtd><mi>w</mi></mtd></mtr>
          </mtable>
        </mfenced>
      </math>`;
      const ast = parseMathML(matrixXml);
      const fencedNode = ast.children[0] as any;
      const fencedSlot = fencedNode.content;
      const matrixNode = fencedSlot.children[0] as any;
      const cell00 = matrixNode.rows[0][0];

      // Caret inside cell [0][0] at offset 0
      const caret: CaretPosition = { slotId: cell00.id, offset: 0 };

      // Step 1: Select token 'x' in cell [0][0]
      const step1 = handleSelectionStep(ast, null, caret, 'ArrowRight')!;
      expect(step1.handled).toBe(true);
      expect(step1.selection.anchor).toEqual({ slotId: cell00.id, offset: 0 });
      expect(step1.selection.head).toEqual({ slotId: cell00.id, offset: 1 });

      // Step 2: At cell boundary, expands to matrix in fenced content
      const step2 = handleSelectionStep(ast, step1.selection, step1.caret, 'ArrowRight')!;
      expect(step2.handled).toBe(true);
      expect(step2.selection.anchor).toEqual({ slotId: fencedSlot.id, offset: 0 });
      expect(step2.selection.head).toEqual({ slotId: fencedSlot.id, offset: 1 });

      // Step 3: At fencedSlot boundary, expands to fenced node in root
      const step3 = handleSelectionStep(ast, step2.selection, step2.caret, 'ArrowRight')!;
      expect(step3.handled).toBe(true);
      expect(step3.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(step3.selection.head).toEqual({ slotId: ast.id, offset: 1 });
    });
  });

  // =========================================================================
  // GROUP 2: Empty Placeholder Boundaries & Hierarchical Scope Expansion
  // =========================================================================
  describe('Group 2: Empty Placeholders & Complex Boundaries', () => {
    const emptyNestedXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <msqrt>
        <mfrac>
          <mrow/>
          <mrow/>
        </mfrac>
      </msqrt>
    </math>`;

    it('Scenario 2.1: Empty fraction inside empty radical: Stage 1 highlights empty slot, Stage 2 expands to inner fraction, then to radical', () => {
      const ast = parseMathML(emptyNestedXml);
      const sqrtNode = ast.children[0] as any;
      const radicand = sqrtNode.radicand;
      const fracNode = radicand.children[0] as any;
      const numSlot = fracNode.numerator;

      const caret: CaretPosition = { slotId: numSlot.id, offset: 0 };
      const sel: SelectionRange = { anchor: caret, head: caret };

      // Step 1: Stage 1 highlights empty numerator
      const step1 = handleHierarchicalBoundaryExpansion(ast, sel, numSlot, 'ArrowRight', null);
      expect(step1.handled).toBe(true);
      expect(step1.highlightedSlotId).toBe(numSlot.id);

      // Step 2: Stage 2 elevates to fraction in radicand
      const step2 = handleHierarchicalBoundaryExpansion(ast, sel, numSlot, 'ArrowRight', numSlot.id);
      expect(step2.handled).toBe(true);
      expect(step2.highlightedSlotId).toBeNull();
      expect(step2.selection.anchor).toEqual({ slotId: radicand.id, offset: 0 });
      expect(step2.selection.head).toEqual({ slotId: radicand.id, offset: 1 });

      // Step 3: At radicand boundary, elevates to radical in root
      const step3 = handleHierarchicalBoundaryExpansion(ast, step2.selection, radicand, 'ArrowRight', null);
      expect(step3.handled).toBe(true);
      expect(step3.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(step3.selection.head).toEqual({ slotId: ast.id, offset: 1 });

      // Step 4: At root boundary, exits cleanly to markdown
      const step4 = handleHierarchicalBoundaryExpansion(ast, step3.selection, ast, 'ArrowRight', null);
      expect(step4.handled).toBe(false);
      expect(step4.exitDirection).toBe('after');
    });

    it('Scenario 2.2: Backward expansion on empty denominator inside empty radical', () => {
      const ast = parseMathML(emptyNestedXml);
      const sqrtNode = ast.children[0] as any;
      const radicand = sqrtNode.radicand;
      const fracNode = radicand.children[0] as any;
      const denSlot = fracNode.denominator;

      const caret: CaretPosition = { slotId: denSlot.id, offset: 0 };
      const sel: SelectionRange = { anchor: caret, head: caret };

      // Step 1: Backward Stage 1 highlights empty denominator
      const step1 = handleHierarchicalBoundaryExpansion(ast, sel, denSlot, 'ArrowLeft', null);
      expect(step1.handled).toBe(true);
      expect(step1.highlightedSlotId).toBe(denSlot.id);

      // Step 2: Backward Stage 2 elevates to fraction in radicand [1, 0]
      const step2 = handleHierarchicalBoundaryExpansion(ast, sel, denSlot, 'ArrowLeft', denSlot.id);
      expect(step2.handled).toBe(true);
      expect(step2.highlightedSlotId).toBeNull();
      expect(step2.selection.anchor).toEqual({ slotId: radicand.id, offset: 1 });
      expect(step2.selection.head).toEqual({ slotId: radicand.id, offset: 0 });

      // Step 3: Backward at radicand boundary elevates to radical in root [1, 0]
      const step3 = handleHierarchicalBoundaryExpansion(ast, step2.selection, radicand, 'ArrowLeft', null);
      expect(step3.handled).toBe(true);
      expect(step3.selection.anchor).toEqual({ slotId: ast.id, offset: 1 });
      expect(step3.selection.head).toEqual({ slotId: ast.id, offset: 0 });

      // Step 4: Root boundary exits before
      const step4 = handleHierarchicalBoundaryExpansion(ast, step3.selection, ast, 'ArrowLeft', null);
      expect(step4.handled).toBe(false);
      expect(step4.exitDirection).toBe('before');
    });

    it('Scenario 2.3: Multiple consecutive empty structures in root stepped atomically without penetration', () => {
      const multiEmptyXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac><mrow/><mrow/></mfrac>
        <msqrt><mrow/></msqrt>
      </math>`;
      const ast = parseMathML(multiEmptyXml);
      const rootSlot = ast;
      const caret: CaretPosition = { slotId: rootSlot.id, offset: 0 };

      // Step 1: Shift+ArrowRight steps over empty fraction [0, 1]
      const step1 = handleSelectionStep(rootSlot, null, caret, 'ArrowRight')!;
      expect(step1.handled).toBe(true);
      expect(step1.selection.anchor).toEqual({ slotId: rootSlot.id, offset: 0 });
      expect(step1.selection.head).toEqual({ slotId: rootSlot.id, offset: 1 });

      // Step 2: Next Shift+ArrowRight steps over empty sqrt [0, 2]
      const step2 = handleSelectionStep(rootSlot, step1.selection, step1.caret, 'ArrowRight')!;
      expect(step2.handled).toBe(true);
      expect(step2.selection.anchor).toEqual({ slotId: rootSlot.id, offset: 0 });
      expect(step2.selection.head).toEqual({ slotId: rootSlot.id, offset: 2 });

      // Step 3: Reverse backward steps back to [0, 1]
      const step3 = handleSelectionStep(rootSlot, step2.selection, step2.caret, 'ArrowLeft')!;
      expect(step3.handled).toBe(true);
      expect(step3.selection.head).toEqual({ slotId: rootSlot.id, offset: 1 });

      // Step 4: Reverse backward steps back to [0, 0] (collapsed on anchor)
      const step4 = handleSelectionStep(rootSlot, step3.selection, step3.caret, 'ArrowLeft')!;
      expect(step4.handled).toBe(true);
      expect(step4.selection.head).toEqual({ slotId: rootSlot.id, offset: 0 });

      // Step 5: At root offset 0, ArrowLeft exits cleanly to markdown
      const step5 = handleSelectionStep(rootSlot, step4.selection, step4.caret, 'ArrowLeft')!;
      expect(step5.handled).toBe(false);
      expect(step5.exitDirection).toBe('before');
    });

    it('Scenario 2.4: Completely empty root equation exits cleanly without throwing', () => {
      const emptyAst = createSlot('root', []);
      const caret: CaretPosition = { slotId: emptyAst.id, offset: 0 };

      const stepRight = handleSelectionStep(emptyAst, null, caret, 'ArrowRight');
      expect(stepRight).not.toBeNull();
      expect(stepRight!.handled).toBe(false);
      expect(stepRight!.exitDirection).toBe('after');

      const stepLeft = handleSelectionStep(emptyAst, null, caret, 'ArrowLeft');
      expect(stepLeft).not.toBeNull();
      expect(stepLeft!.handled).toBe(false);
      expect(stepLeft!.exitDirection).toBe('before');
    });
  });

  // =========================================================================
  // GROUP 3: Rapid Direction Changes, Anchor-Head Collision & Sign Flips
  // =========================================================================
  describe('Group 3: Rapid Direction Reversals & Anchor-Head Collision Dynamics', () => {
    const sequenceXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac>
      <mo>+</mo>
      <mfrac><mrow><mi>c</mi></mrow><mrow><mi>d</mi></mrow></mfrac>
      <mo>-</mo>
      <mfrac><mrow><mi>e</mi></mrow><mrow><mi>f</mi></mrow></mfrac>
    </math>`;

    it('Scenario 3.1: Forward expansion across multiple structures, reverse shrink, collision collapse, and continuation into backward selection', () => {
      const ast = parseMathML(sequenceXml);
      const rootSlot = ast;
      // Start caret at offset 2 (between '+' at 1 and second fraction at 2)
      const startPos: CaretPosition = { slotId: rootSlot.id, offset: 2 };

      // Step F1: Forward select second fraction -> [2, 3]
      const f1 = handleSelectionStep(rootSlot, null, startPos, 'ArrowRight')!;
      expect(f1.selection.anchor.offset).toBe(2);
      expect(f1.selection.head.offset).toBe(3);

      // Step F2: Forward select '-' -> [2, 4]
      const f2 = handleSelectionStep(rootSlot, f1.selection, f1.caret, 'ArrowRight')!;
      expect(f2.selection.anchor.offset).toBe(2);
      expect(f2.selection.head.offset).toBe(4);

      // Step F3: Forward select third fraction -> [2, 5]
      const f3 = handleSelectionStep(rootSlot, f2.selection, f2.caret, 'ArrowRight')!;
      expect(f3.selection.anchor.offset).toBe(2);
      expect(f3.selection.head.offset).toBe(5);

      // Reverse R1: Backward shrink to [2, 4]
      const r1 = handleSelectionStep(rootSlot, f3.selection, f3.caret, 'ArrowLeft')!;
      expect(r1.selection.anchor.offset).toBe(2);
      expect(r1.selection.head.offset).toBe(4);

      // Reverse R2: Backward shrink to [2, 3]
      const r2 = handleSelectionStep(rootSlot, r1.selection, r1.caret, 'ArrowLeft')!;
      expect(r2.selection.anchor.offset).toBe(2);
      expect(r2.selection.head.offset).toBe(3);

      // Reverse R3: Head meets Anchor at offset 2 -> COLLISION / COLLAPSE [2, 2]
      const r3 = handleSelectionStep(rootSlot, r2.selection, r2.caret, 'ArrowLeft')!;
      expect(r3.selection.anchor.offset).toBe(2);
      expect(r3.selection.head.offset).toBe(2);
      expect(r3.caret.offset).toBe(2);

      // Verify DOM: Collapsed selection clears all highlight classes
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);
      updatePartialSelectionDom(dom, ast, r3.selection);
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect(dom.querySelectorAll('.eq-selected-structure').length).toBe(0);

      // Reverse R4: Crosses anchor into BACKWARD selection of '+' -> [2, 1]
      const r4 = handleSelectionStep(rootSlot, r3.selection, r3.caret, 'ArrowLeft')!;
      expect(r4.selection.anchor.offset).toBe(2);
      expect(r4.selection.head.offset).toBe(1);
      expect(r4.caret.offset).toBe(1);

      // Verify DOM: Backward selection of token '+' at index 1 is highlighted
      updatePartialSelectionDom(dom, ast, r4.selection);
      const plusEl = dom.querySelector(`[data-node-id="${rootSlot.children[1].id}"]`);
      expect(plusEl?.classList.contains('eq-selected-token')).toBe(true);

      // Reverse R5: Backward select first fraction -> [2, 0]
      const r5 = handleSelectionStep(rootSlot, r4.selection, r4.caret, 'ArrowLeft')!;
      expect(r5.selection.anchor.offset).toBe(2);
      expect(r5.selection.head.offset).toBe(0);

      // Forward step F4 from backward selection shrinks backward range -> [2, 1]
      const f4 = handleSelectionStep(rootSlot, r5.selection, r5.caret, 'ArrowRight')!;
      expect(f4.selection.anchor.offset).toBe(2);
      expect(f4.selection.head.offset).toBe(1);

      // Forward step F5: Head meets Anchor again -> SECOND COLLISION / COLLAPSE [2, 2]
      const f5 = handleSelectionStep(rootSlot, f4.selection, f4.caret, 'ArrowRight')!;
      expect(f5.selection.anchor.offset).toBe(2);
      expect(f5.selection.head.offset).toBe(2);

      // Forward step F6: Re-expands forward -> [2, 3]
      const f6 = handleSelectionStep(rootSlot, f5.selection, f5.caret, 'ArrowRight')!;
      expect(f6.selection.anchor.offset).toBe(2);
      expect(f6.selection.head.offset).toBe(3);
    });

    it('Scenario 3.2: Rapid ping-pong inside a multi-character slot preserves anchor invariant', () => {
      const ast = parseMathML(`<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mrow><mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi></mrow>
      </math>`);
      const slot = ast;
      const startPos: CaretPosition = { slotId: slot.id, offset: 2 };

      // Step right -> [2, 3]
      let sel = handleSelectionStep(slot, null, startPos, 'ArrowRight')!;
      expect(sel.selection.head.offset).toBe(3);

      // Step right -> [2, 4]
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowRight')!;
      expect(sel.selection.head.offset).toBe(4);

      // Step left -> [2, 3]
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowLeft')!;
      expect(sel.selection.head.offset).toBe(3);

      // Step left -> [2, 2] (collision)
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowLeft')!;
      expect(sel.selection.anchor.offset).toBe(2);
      expect(sel.selection.head.offset).toBe(2);

      // Step left -> [2, 1] (backward)
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowLeft')!;
      expect(sel.selection.anchor.offset).toBe(2);
      expect(sel.selection.head.offset).toBe(1);

      // Step left -> [2, 0] (backward)
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowLeft')!;
      expect(sel.selection.anchor.offset).toBe(2);
      expect(sel.selection.head.offset).toBe(0);

      // Step right -> [2, 1]
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowRight')!;
      expect(sel.selection.head.offset).toBe(1);

      // Step right -> [2, 2] (collision)
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowRight')!;
      expect(sel.selection.head.offset).toBe(2);

      // Step right -> [2, 3] (forward)
      sel = handleSelectionStep(slot, sel.selection, sel.caret, 'ArrowRight')!;
      expect(sel.selection.head.offset).toBe(3);
    });
  });

  // =========================================================================
  // GROUP 4: Backward Selection Expansion Under Edge Conditions
  // =========================================================================
  describe('Group 4: Backward Selection Expansion & Boundary Ladders', () => {
    const fracInSequenceXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mi>x</mi>
      <mfrac>
        <mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow>
        <mrow><mi>d</mi><mi>e</mi><mi>f</mi></mrow>
      </mfrac>
      <mi>y</mi>
    </math>`;

    it('Scenario 4.1: Partial backward selection hitting slot start triggers Stage 1 full selection, then Stage 2 parent expansion', () => {
      const ast = parseMathML(fracInSequenceXml);
      const fracNode = ast.children[1] as any;
      const numSlot = fracNode.numerator;

      // Start at offset 2 (between 'b' and 'c'). Step backward to 1, then to 0
      const partialSel: SelectionRange = {
        anchor: { slotId: numSlot.id, offset: 2 },
        head: { slotId: numSlot.id, offset: 0 },
      };

      // At offset 0, pressing ArrowLeft must first trigger Stage 1: select entire slot backward [3, 0]
      const stage1 = handleHierarchicalBoundaryExpansion(ast, partialSel, numSlot, 'ArrowLeft');
      expect(stage1.handled).toBe(true);
      expect(stage1.selection.anchor).toEqual({ slotId: numSlot.id, offset: 3 });
      expect(stage1.selection.head).toEqual({ slotId: numSlot.id, offset: 0 });

      // On next press of ArrowLeft (now fully selected backward [3, 0]): Stage 2 expands backward to fraction in root [2, 1]
      const stage2 = handleHierarchicalBoundaryExpansion(ast, stage1.selection, numSlot, 'ArrowLeft');
      expect(stage2.handled).toBe(true);
      expect(stage2.selection.anchor).toEqual({ slotId: ast.id, offset: 2 });
      expect(stage2.selection.head).toEqual({ slotId: ast.id, offset: 1 });
      expect(stage2.caret).toEqual({ slotId: ast.id, offset: 1 });

      // Next ArrowLeft in root slot steps backward over token 'x' at index 0 -> [2, 0]
      const stepOverX = handleSelectionStep(ast, stage2.selection, stage2.caret, 'ArrowLeft')!;
      expect(stepOverX.handled).toBe(true);
      expect(stepOverX.selection.anchor).toEqual({ slotId: ast.id, offset: 2 });
      expect(stepOverX.selection.head).toEqual({ slotId: ast.id, offset: 0 });

      // Next ArrowLeft at root boundary exits cleanly
      const exitStep = handleSelectionStep(ast, stepOverX.selection, stepOverX.caret, 'ArrowLeft')!;
      expect(exitStep.handled).toBe(false);
      expect(exitStep.exitDirection).toBe('before');
    });

    it('Scenario 4.2: Hierarchical expansion backward maintains DOM structure highlight class on parent fraction', () => {
      const ast = parseMathML(fracInSequenceXml);
      const fracNode = ast.children[1] as any;
      const numSlot = fracNode.numerator;

      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      // Fully selected backward in numerator
      const fullyBack: SelectionRange = {
        anchor: { slotId: numSlot.id, offset: 3 },
        head: { slotId: numSlot.id, offset: 0 },
      };

      const expansion = handleHierarchicalBoundaryExpansion(ast, fullyBack, numSlot, 'ArrowLeft');
      expect(expansion.handled).toBe(true);

      // Render partial selection in DOM
      updatePartialSelectionDom(dom, ast, expansion.selection);

      const fracEl = dom.querySelector('.eq-fraction');
      expect(fracEl?.classList.contains('eq-selected-structure')).toBe(true);
    });
  });

  // =========================================================================
  // GROUP 5: Vertical Selection Coexistence with Horizontal Structure Stepping
  // =========================================================================
  describe('Group 5: Vertical Selection Coexistence with Horizontal Structure Stepping', () => {
    const fractionGridXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac>
        <mrow><mi>a</mi><mi>b</mi></mrow>
        <mrow><mi>c</mi><mi>d</mi></mrow>
      </mfrac>
    </math>`;

    it('Scenario 5.1: Cross-boundary vertical selection via Shift+ArrowUp followed by horizontal Shift+ArrowRight stepping', () => {
      const widget = new WordEquationWidget(fractionGridXml, 0, 100);
      const fracNode = widget.ast.children[0] as any;
      const numSlot = fracNode.numerator;
      const denSlot = fracNode.denominator;

      // Start caret in denominator at offset 1 (between 'c' and 'd')
      widget.caret = { slotId: denSlot.id, offset: 1 };
      widget.selection = null;

      // 1. Shift+ArrowUp: moves head from denominator to numerator at offset 1
      const handledUp = widget.handleArrowNavigation('ArrowUp', true);
      expect(handledUp).toBe(true);
      expect(widget.selection).not.toBeNull();
      expect(widget.selection!.anchor).toEqual({ slotId: denSlot.id, offset: 1 });
      expect(widget.selection!.head).toEqual({ slotId: numSlot.id, offset: 1 });
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 1 });

      // 2. Shift+ArrowRight: steps head horizontally inside numerator to offset 2
      const handledRight = widget.handleArrowNavigation('ArrowRight', true);
      expect(handledRight).toBe(true);
      expect(widget.selection!.anchor).toEqual({ slotId: denSlot.id, offset: 1 });
      expect(widget.selection!.head).toEqual({ slotId: numSlot.id, offset: 2 });
      expect(widget.caret).toEqual({ slotId: numSlot.id, offset: 2 });

      // 3. Shift+ArrowLeft: steps head horizontally back to offset 1 in numerator
      const handledLeft = widget.handleArrowNavigation('ArrowLeft', true);
      expect(handledLeft).toBe(true);
      expect(widget.selection!.anchor).toEqual({ slotId: denSlot.id, offset: 1 });
      expect(widget.selection!.head).toEqual({ slotId: numSlot.id, offset: 1 });

      // 4. Shift+ArrowDown: moves head vertically back to denominator at offset 1
      const handledDown = widget.handleArrowNavigation('ArrowDown', true);
      expect(handledDown).toBe(true);
      // Head meets Anchor -> selection collapses!
      expect(widget.selection!.anchor).toEqual({ slotId: denSlot.id, offset: 1 });
      expect(widget.selection!.head).toEqual({ slotId: denSlot.id, offset: 1 });
    });

    it('Scenario 5.2: Shift+ArrowRight followed by Shift+ArrowDown creates valid cross-boundary selection without crashing', () => {
      const widget = new WordEquationWidget(fractionGridXml, 0, 100);
      const fracNode = widget.ast.children[0] as any;
      const numSlot = fracNode.numerator;
      const denSlot = fracNode.denominator;

      // Start in numerator at offset 0
      widget.caret = { slotId: numSlot.id, offset: 0 };
      widget.selection = null;

      // 1. Shift+ArrowRight: selects 'a' [0, 1] in numerator
      widget.handleArrowNavigation('ArrowRight', true);
      expect(widget.selection!.anchor).toEqual({ slotId: numSlot.id, offset: 0 });
      expect(widget.selection!.head).toEqual({ slotId: numSlot.id, offset: 1 });

      // 2. Shift+ArrowDown: moves head to denominator at offset 1
      widget.handleArrowNavigation('ArrowDown', true);
      expect(widget.selection!.anchor).toEqual({ slotId: numSlot.id, offset: 0 });
      expect(widget.selection!.head).toEqual({ slotId: denSlot.id, offset: 1 });

      // 3. Verify DOM rendering for cross-boundary selection
      const renderer = new DomRenderer();
      const dom = renderer.render(widget.ast);
      container.appendChild(dom);
      updatePartialSelectionDom(dom, widget.ast, widget.selection);

      const numContainer = dom.querySelector('.eq-numerator');
      const denContainer = dom.querySelector('.eq-denominator');
      expect(numContainer?.classList.contains('eq-partial-selected')).toBe(true);
      expect(denContainer?.classList.contains('eq-partial-selected')).toBe(true);
    });

    it('Scenario 5.3: Deep vertical traversal across multi-level fractions followed by horizontal stepping and collapsing', () => {
      const nested3Xml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mi>a</mi></mrow>
          <mrow>
            <mfrac>
              <mrow><mi>b</mi></mrow>
              <mrow><mi>c</mi></mrow>
            </mfrac>
          </mrow>
        </mfrac>
      </math>`;
      const widget = new WordEquationWidget(nested3Xml, 0, 100);
      const outerFrac = widget.ast.children[0] as any;
      const innerFrac = outerFrac.denominator.children[0] as any;
      const bottomSlot = innerFrac.denominator;
      const middleSlot = innerFrac.numerator;
      const topSlot = outerFrac.numerator;

      // Start in bottom slot 'c'
      widget.caret = { slotId: bottomSlot.id, offset: 0 };
      widget.selection = null;

      // 1. Shift+ArrowUp: moves to middle slot 'b'
      expect(widget.handleArrowNavigation('ArrowUp', true)).toBe(true);
      expect(widget.selection!.anchor).toEqual({ slotId: bottomSlot.id, offset: 0 });
      expect(widget.selection!.head.slotId).toBe(middleSlot.id);

      // 2. Shift+ArrowUp: moves to top slot 'a'
      expect(widget.handleArrowNavigation('ArrowUp', true)).toBe(true);
      expect(widget.selection!.head.slotId).toBe(topSlot.id);

      // 3. Shift+ArrowRight: steps head in top slot 'a'
      expect(widget.handleArrowNavigation('ArrowRight', true)).toBe(true);
      expect(widget.selection!.head).toEqual({ slotId: topSlot.id, offset: 1 });

      // 4. Shift+ArrowDown: moves head back to middle slot
      expect(widget.handleArrowNavigation('ArrowDown', true)).toBe(true);
      expect(widget.selection!.head.slotId).toBe(middleSlot.id);

      // 5. Shift+ArrowDown: moves head back to bottom slot at offset 1 (clamped from offset 1)
      expect(widget.handleArrowNavigation('ArrowDown', true)).toBe(true);
      expect(widget.selection!.anchor).toEqual({ slotId: bottomSlot.id, offset: 0 });
      expect(widget.selection!.head).toEqual({ slotId: bottomSlot.id, offset: 1 });

      // 6. Shift+ArrowLeft: steps head horizontally back to offset 0 -> COLLAPSES on anchor!
      expect(widget.handleArrowNavigation('ArrowLeft', true)).toBe(true);
      expect(widget.selection!.anchor).toEqual({ slotId: bottomSlot.id, offset: 0 });
      expect(widget.selection!.head).toEqual({ slotId: bottomSlot.id, offset: 0 });
    });
  });

  // =========================================================================
  // GROUP 6: Deep 4-Level Fractions, Subsup & Mixed Empty Structural Stepping
  // =========================================================================
  describe('Group 6: Deep 4-Level Fractions, Subsup & Mixed Empty Structures', () => {
    it('Scenario 6.1: 4-level fraction ladder climbing from innermost denominator through all levels to root', () => {
      const fourLevelXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mn>1</mn></mrow>
          <mrow>
            <mfrac>
              <mrow><mn>2</mn></mrow>
              <mrow>
                <mfrac>
                  <mrow><mn>3</mn></mrow>
                  <mrow><mn>4</mn></mrow>
                </mfrac>
              </mrow>
            </mfrac>
          </mrow>
        </mfrac>
      </math>`;
      const ast = parseMathML(fourLevelXml);
      const frac1 = ast.children[0] as any;
      const frac2 = frac1.denominator.children[0] as any;
      const frac3 = frac2.denominator.children[0] as any;
      const slot4 = frac3.denominator;

      // Start at offset 0 before '4'
      const caret: CaretPosition = { slotId: slot4.id, offset: 0 };

      // Step 1: select '4' -> [0, 1] in slot4
      const s1 = handleSelectionStep(ast, null, caret, 'ArrowRight')!;
      expect(s1.handled).toBe(true);
      expect(s1.selection.anchor).toEqual({ slotId: slot4.id, offset: 0 });
      expect(s1.selection.head).toEqual({ slotId: slot4.id, offset: 1 });

      // Step 2: expand to frac3 in frac2.denominator -> [0, 1]
      const s2 = handleSelectionStep(ast, s1.selection, s1.caret, 'ArrowRight')!;
      expect(s2.handled).toBe(true);
      expect(s2.selection.anchor).toEqual({ slotId: frac2.denominator.id, offset: 0 });
      expect(s2.selection.head).toEqual({ slotId: frac2.denominator.id, offset: 1 });

      // Step 3: expand to frac2 in frac1.denominator -> [0, 1]
      const s3 = handleSelectionStep(ast, s2.selection, s2.caret, 'ArrowRight')!;
      expect(s3.handled).toBe(true);
      expect(s3.selection.anchor).toEqual({ slotId: frac1.denominator.id, offset: 0 });
      expect(s3.selection.head).toEqual({ slotId: frac1.denominator.id, offset: 1 });

      // Step 4: expand to frac1 in root -> [0, 1]
      const s4 = handleSelectionStep(ast, s3.selection, s3.caret, 'ArrowRight')!;
      expect(s4.handled).toBe(true);
      expect(s4.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(s4.selection.head).toEqual({ slotId: ast.id, offset: 1 });

      // Step 5: root boundary exit
      const s5 = handleSelectionStep(ast, s4.selection, s4.caret, 'ArrowRight')!;
      expect(s5.handled).toBe(false);
      expect(s5.exitDirection).toBe('after');
    });

    it('Scenario 6.2: Subscript and Superscript (msubsup) atomic stepping and hierarchical expansion', () => {
      const subsupXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msubsup>
          <mrow><mi>x</mi></mrow>
          <mrow><mi>i</mi></mrow>
          <mrow><mn>2</mn></mrow>
        </msubsup>
        <mo>=</mo>
      </math>`;
      const ast = parseMathML(subsupXml);
      const subsupNode = ast.children[0] as any;
      const subSlot = subsupNode.sub;
      const supSlot = subsupNode.sup;

      // 1. From root offset 0, Shift+ArrowRight steps over entire msubsup atomically
      const rootCaret: CaretPosition = { slotId: ast.id, offset: 0 };
      const rootStep = handleSelectionStep(ast, null, rootCaret, 'ArrowRight')!;
      expect(rootStep.handled).toBe(true);
      expect(rootStep.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(rootStep.selection.head).toEqual({ slotId: ast.id, offset: 1 });

      // 2. Inside subSlot ('i'), Shift+ArrowRight selects 'i', then expands to msubsup in root
      const subCaret: CaretPosition = { slotId: subSlot.id, offset: 0 };
      const subStep1 = handleSelectionStep(ast, null, subCaret, 'ArrowRight')!;
      expect(subStep1.handled).toBe(true);
      expect(subStep1.selection.anchor).toEqual({ slotId: subSlot.id, offset: 0 });
      expect(subStep1.selection.head).toEqual({ slotId: subSlot.id, offset: 1 });

      const subStep2 = handleSelectionStep(ast, subStep1.selection, subStep1.caret, 'ArrowRight')!;
      expect(subStep2.handled).toBe(true);
      expect(subStep2.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(subStep2.selection.head).toEqual({ slotId: ast.id, offset: 1 });

      // 3. Inside supSlot ('2'), Shift+ArrowLeft backward selects '2', then expands backward to msubsup in root
      const supCaret: CaretPosition = { slotId: supSlot.id, offset: 1 };
      const supStep1 = handleSelectionStep(ast, null, supCaret, 'ArrowLeft')!;
      expect(supStep1.handled).toBe(true);
      expect(supStep1.selection.anchor).toEqual({ slotId: supSlot.id, offset: 1 });
      expect(supStep1.selection.head).toEqual({ slotId: supSlot.id, offset: 0 });

      const supStep2 = handleSelectionStep(ast, supStep1.selection, supStep1.caret, 'ArrowLeft')!;
      expect(supStep2.handled).toBe(true);
      expect(supStep2.selection.anchor).toEqual({ slotId: ast.id, offset: 1 });
      expect(supStep2.selection.head).toEqual({ slotId: ast.id, offset: 0 });
    });

    it('Scenario 6.3: Mixed empty numerator and populated denominator hierarchical boundary traversal', () => {
      const mixedFracXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow/>
          <mrow><mi>x</mi></mrow>
        </mfrac>
      </math>`;
      const ast = parseMathML(mixedFracXml);
      const fracNode = ast.children[0] as any;
      const numSlot = fracNode.numerator;
      const denSlot = fracNode.denominator;

      // Start in empty numerator: Stage 1 highlights, Stage 2 expands to fraction in root
      const numCaret: CaretPosition = { slotId: numSlot.id, offset: 0 };
      const numSel: SelectionRange = { anchor: numCaret, head: numCaret };
      const numStage1 = handleHierarchicalBoundaryExpansion(ast, numSel, numSlot, 'ArrowRight', null);
      expect(numStage1.handled).toBe(true);
      expect(numStage1.highlightedSlotId).toBe(numSlot.id);

      const numStage2 = handleHierarchicalBoundaryExpansion(ast, numSel, numSlot, 'ArrowRight', numSlot.id);
      expect(numStage2.handled).toBe(true);
      expect(numStage2.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(numStage2.selection.head).toEqual({ slotId: ast.id, offset: 1 });

      // Start in populated denominator: backward selects 'x', Stage 2 expands backward to fraction in root
      const denCaret: CaretPosition = { slotId: denSlot.id, offset: 1 };
      const denStep1 = handleSelectionStep(ast, null, denCaret, 'ArrowLeft')!;
      expect(denStep1.selection.anchor).toEqual({ slotId: denSlot.id, offset: 1 });
      expect(denStep1.selection.head).toEqual({ slotId: denSlot.id, offset: 0 });

      const denStep2 = handleSelectionStep(ast, denStep1.selection, denStep1.caret, 'ArrowLeft')!;
      expect(denStep2.handled).toBe(true);
      expect(denStep2.selection.anchor).toEqual({ slotId: ast.id, offset: 1 });
      expect(denStep2.selection.head).toEqual({ slotId: ast.id, offset: 0 });
    });
  });
});

