import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { DomRenderer } from '../../src/editor/dom-renderer';
import {
  updatePartialSelectionDom,
  updateEquationSelectionDom,
  normalizeSelection,
} from '../../src/editor/selection';
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
  getAllSlotsInOrder,
} from '../../src/core/ast';
import type { SlotNode } from '../../src/core/types';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';

describe('Adversarial Verification: Defect 2 Math Block Selection Boundary Clamping', () => {
  let container: HTMLElement;

  beforeEach(() => {
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    container.id = 'test-suite-container';
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

  // Helper to build ASTs
  function buildLinearAst(): SlotNode {
    const root = createSlot('root', [
      createToken('1', 'mn'),
      createToken('+', 'mo'),
      createToken('2', 'mn'),
      createToken('=', 'mo'),
      createToken('3', 'mn'),
    ]);
    updateParentPointers(root);
    return root;
  }

  function buildFractionAst(): SlotNode {
    const root = createSlot('root', [
      createFraction(
        createSlot('numerator', [createToken('1', 'mn')]),
        createSlot('denominator', [createToken('x', 'mi')])
      ),
      createToken('+', 'mo'),
      createToken('2', 'mn'),
    ]);
    updateParentPointers(root);
    return root;
  }

  function buildNestedFractionAst(): SlotNode {
    const innerFrac = createFraction(
      createSlot('numerator', [createToken('2', 'mn')]),
      createSlot('denominator', [createToken('3', 'mn')])
    );
    const root = createSlot('root', [
      createFraction(
        createSlot('numerator', [createToken('1', 'mn')]),
        createSlot('denominator', [innerFrac])
      ),
    ]);
    updateParentPointers(root);
    return root;
  }

  function buildMatrixAst(): SlotNode {
    const root = createSlot('root', [
      createMatrix([
        [createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [createToken('2', 'mn')]), createSlot('cell', [createToken('3', 'mn')])],
        [createSlot('cell', [createToken('4', 'mn')]), createSlot('cell', [createToken('5', 'mn')]), createSlot('cell', [createToken('6', 'mn')])],
        [createSlot('cell', [createToken('7', 'mn')]), createSlot('cell', [createToken('8', 'mn')]), createSlot('cell', [createToken('9', 'mn')])],
      ]),
    ]);
    updateParentPointers(root);
    return root;
  }

  function buildDeepCompositeAst(): SlotNode {
    const mat = createMatrix([
      [createSlot('cell', [createToken('a', 'mi')]), createSlot('cell', [createToken('b', 'mi')])],
    ]);
    const sup = createSuperscript(
      createSlot('base', [createToken('c', 'mi')]),
      createSlot('sup', [createToken('2', 'mn')])
    );
    const frac = createFraction(
      createSlot('numerator', [mat]),
      createSlot('denominator', [sup])
    );
    const root = createSlot('root', [
      createRoot(
        createSlot('radicand', [frac]),
        createSlot('index', [createToken('3', 'mn')])
      ),
    ]);
    updateParentPointers(root);
    return root;
  }

  // =========================================================================
  // Test 1: Coordinate Stress Testing on Fallback 4 (Extreme & Hostile Drags)
  // =========================================================================
  describe('1. Hostile Drag Coordinates & Fallback 4 Clamping', () => {
    const testCases = [
      { name: 'Linear Equation (1 + 2 = 3)', astBuilder: buildLinearAst },
      { name: 'Fraction Equation (1/x + 2)', astBuilder: buildFractionAst },
      { name: 'Nested Fraction (1/(2/3))', astBuilder: buildNestedFractionAst },
      { name: 'Matrix Equation (3x3)', astBuilder: buildMatrixAst },
      { name: 'Deep Composite (cube root of matrix/c^2)', astBuilder: buildDeepCompositeAst },
    ];

    for (const { name, astBuilder } of testCases) {
      it(`strictly clamps hostile out-of-bounds coordinates for: ${name}`, () => {
        const ast = astBuilder();
        const renderer = new DomRenderer();
        const rootEl = renderer.render(ast, { inline: false });
        container.appendChild(rootEl);
        computeAndApplyLayout(rootEl, 100, 100);

        const rect = rootEl.getBoundingClientRect();
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);

        const L = rect.left;
        const R = rect.right;
        const T = rect.top;
        const B = rect.bottom;
        const midX = (L + R) / 2;
        const midY = (T + B) / 2;
        const rootChildrenLen = ast.children.length;

        // A. Drags 100px, 500px, 10000px ABOVE equation
        for (const dist of [1, 10, 100, 500, 1000, 10000]) {
          const res = handleMouseClick(ast, rootEl, midX, T - dist);
          expect(res.slotId, `Dist ${dist}px above must clamp to root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist}px above must clamp to offset 0`).toBe(0);
        }

        // B. Drags 100px, 500px, 10000px BELOW equation
        for (const dist of [1, 10, 100, 500, 1000, 10000]) {
          const res = handleMouseClick(ast, rootEl, midX, B + dist);
          expect(res.slotId, `Dist ${dist}px below must clamp to root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist}px below must clamp to offset rootChildrenLen`).toBe(rootChildrenLen);
        }

        // C. Drags 100px, 500px, 10000px LEFT of equation
        for (const dist of [1, 10, 100, 500, 1000, 10000]) {
          const res = handleMouseClick(ast, rootEl, L - dist, midY);
          expect(res.slotId, `Dist ${dist}px left must clamp to root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist}px left must clamp to offset 0`).toBe(0);
        }

        // D. Drags 100px, 500px, 10000px RIGHT of equation
        for (const dist of [1, 10, 100, 500, 1000, 10000]) {
          const res = handleMouseClick(ast, rootEl, R + dist, midY);
          expect(res.slotId, `Dist ${dist}px right must clamp to root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist}px right must clamp to offset rootChildrenLen`).toBe(rootChildrenLen);
        }

        // E. Diagonal Drags (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
        for (const dist of [50, 100, 500, 2000]) {
          // Top-Left -> clamped to 0
          const resTL = handleMouseClick(ast, rootEl, L - dist, T - dist);
          expect(resTL.slotId).toBe(ast.id);
          expect(resTL.offset).toBe(0);

          // Top-Right -> clamped to rootChildrenLen (since clickX >= right)
          const resTR = handleMouseClick(ast, rootEl, R + dist, T - dist);
          expect(resTR.slotId).toBe(ast.id);
          expect(resTR.offset).toBe(rootChildrenLen);

          // Bottom-Left -> clamped to 0 (since clickX <= left)
          const resBL = handleMouseClick(ast, rootEl, L - dist, B + dist);
          expect(resBL.slotId).toBe(ast.id);
          expect(resBL.offset).toBe(0);

          // Bottom-Right -> clamped to rootChildrenLen
          const resBR = handleMouseClick(ast, rootEl, R + dist, B + dist);
          expect(resBR.slotId).toBe(ast.id);
          expect(resBR.offset).toBe(rootChildrenLen);
        }

        rootEl.remove();
      });
    }

    it('proves zero points in dense 360-degree perimeter sweep ever bypass to Fallback 5', () => {
      const ast = buildDeepCompositeAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, { inline: false });
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 200, 200);

      const rect = rootEl.getBoundingClientRect();
      const allSlots = getAllSlotsInOrder(ast);
      const subSlotIds = allSlots.filter((s) => s.id !== ast.id).map((s) => s.id);
      expect(subSlotIds.length).toBeGreaterThan(3);

      const centerX = (rect.left + rect.right) / 2;
      const centerY = (rect.top + rect.bottom) / 2;
      const diagonalRadius = Math.hypot(rect.width, rect.height) / 2;

      let testedPoints = 0;
      // Test angles 0 to 359 degrees at various distances beyond bounding box
      for (let angleDeg = 0; angleDeg < 360; angleDeg += 15) {
        const rad = (angleDeg * Math.PI) / 180;
        for (const extraDist of [5, 25, 75, 150, 500, 2500]) {
          const testDist = diagonalRadius + extraDist;
          const px = centerX + Math.cos(rad) * testDist;
          const py = centerY + Math.sin(rad) * testDist;

          // Double check point is outside rect
          const isOutside = px < rect.left || px > rect.right || py < rect.top || py > rect.bottom;
          if (isOutside) {
            const hit = handleMouseClick(ast, rootEl, px, py);
            testedPoints++;

            // Crucial assertion: hit must NEVER be any sub-slot! (which Fallback 5 would return)
            expect(subSlotIds).not.toContain(hit.slotId);
            expect(hit.slotId).toBe(ast.id);
            expect([0, ast.children.length]).toContain(hit.offset);
          }
        }
      }

      expect(testedPoints).toBeGreaterThan(100);
      rootEl.remove();
    });
  });

  // =========================================================================
  // Test 2: Nested Equation Selection Clamping (Fractions, Roots, Matrices)
  // =========================================================================
  describe('2. Nested Equation Selection Range Behavior', () => {
    it('anchoring inside fraction denominator and dragging above clamps selection without crashing', () => {
      const ast = buildFractionAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, { inline: false });
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 100, 100);

      const denSlot = (ast.children[0] as any).denominator as SlotNode;
      expect(denSlot).toBeDefined();

      const anchor = { slotId: denSlot.id, offset: 0 };
      // Drag 300px above
      const rect = rootEl.getBoundingClientRect();
      const head = handleMouseClick(ast, rootEl, rect.left + 20, rect.top - 300);

      expect(head.slotId).toBe(ast.id);
      expect(head.offset).toBe(0);

      // Verify normalizeSelection
      const norm = normalizeSelection(ast, { anchor, head });
      expect(norm.isBackward).toBe(true);
      expect(norm.start.slotId).toBe(ast.id);
      expect(norm.start.offset).toBe(0);
      expect(norm.end.slotId).toBe(denSlot.id);
      expect(norm.end.offset).toBe(0);

      // Verify updatePartialSelectionDom handles this cross-boundary range cleanly
      updatePartialSelectionDom(rootEl, ast, { anchor, head });

      // Equation root must NOT have .eq-selected class (only tokens/slots)
      expect(rootEl.classList.contains('eq-selected')).toBe(false);

      // Denominator and numerator should have partial highlights
      const selectedTokens = rootEl.querySelectorAll('.eq-selected-token');
      expect(selectedTokens.length).toBeGreaterThan(0);

      rootEl.remove();
    });

    it('anchoring inside 3x3 matrix center cell and dragging below clamps selection to equation end', () => {
      const ast = buildMatrixAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, { inline: false });
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 100, 100);

      // Cell (1, 1) = '5'
      const matrixNode = ast.children[0] as any;
      const centerCell = matrixNode.rows[1][1] as SlotNode;
      expect(centerCell).toBeDefined();

      const anchor = { slotId: centerCell.id, offset: 0 };
      // Drag 500px below
      const rect = rootEl.getBoundingClientRect();
      const head = handleMouseClick(ast, rootEl, (rect.left + rect.right) / 2, rect.bottom + 500);

      expect(head.slotId).toBe(ast.id);
      expect(head.offset).toBe(ast.children.length);

      const norm = normalizeSelection(ast, { anchor, head });
      expect(norm.isBackward).toBe(false);
      expect(norm.start.slotId).toBe(centerCell.id);
      expect(norm.end.slotId).toBe(ast.id);
      expect(norm.end.offset).toBe(ast.children.length);

      updatePartialSelectionDom(rootEl, ast, { anchor, head });
      expect(rootEl.classList.contains('eq-selected')).toBe(false);

      const selectedTokens = rootEl.querySelectorAll('.eq-selected-token');
      expect(selectedTokens.length).toBeGreaterThan(0);

      rootEl.remove();
    });
  });

  // =========================================================================
  // Test 3: Markdown & CodeMirror DOM Selection Containment & selectstart
  // =========================================================================
  describe('3. Native DOM Containment & selectstart Suppression', () => {
    it('suppresses native selectstart during active drag inside editor', () => {
      const doc = 'Paragraph before equation.\n\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mn>2</mn></math>\n```\n\nParagraph after equation.';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const token1 = dom.querySelector('.eq-token') as HTMLElement;
      expect(token1).not.toBeNull();
      const tokRect = token1.getBoundingClientRect();

      // Dispatch pointerdown to start drag session
      const ptrDown = new MouseEvent('pointerdown', {
        clientX: tokRect.left + 2,
        clientY: tokRect.top + 2,
        buttons: 1,
        bubbles: true,
      });
      dom.dispatchEvent(ptrDown);

      // Dispatch pointermove > 3px to arm dragging
      const ptrMove = new MouseEvent('pointermove', {
        clientX: tokRect.left + 15,
        clientY: tokRect.top + 2,
        buttons: 1,
        bubbles: true,
      });
      document.dispatchEvent(ptrMove);

      // Now verify that selectstart is prevented on document
      const selectEvent = new Event('selectstart', { bubbles: true, cancelable: true });
      const allowed = document.dispatchEvent(selectEvent);
      expect(allowed, 'selectstart must be prevented by active drag session').toBe(false);
      expect(selectEvent.defaultPrevented).toBe(true);

      // Now drag far outside into surrounding markdown (500px above)
      const ptrMoveAbove = new MouseEvent('pointermove', {
        clientX: tokRect.left,
        clientY: tokRect.top - 500,
        buttons: 1,
        bubbles: true,
      });
      document.dispatchEvent(ptrMoveAbove);

      expect(widget.selection).not.toBeNull();
      expect(widget.selection!.head.slotId).toBe(widget.ast.id);
      expect(widget.selection!.head.offset).toBe(0);

      // Verify that surrounding editor container has NO selection classes
      expect(editorContainer.classList.contains('eq-selected')).toBe(false);
      const editorParas = editorContainer.querySelectorAll('p, .cm-line');
      for (const p of editorParas) {
        expect(p.classList.contains('eq-selected')).toBe(false);
        expect(p.classList.contains('eq-selected-token')).toBe(false);
      }

      // Dispatch pointerup to end drag
      const ptrUp = new MouseEvent('pointerup', {
        clientX: tokRect.left,
        clientY: tokRect.top - 500,
        buttons: 0,
        bubbles: true,
      });
      document.dispatchEvent(ptrUp);

      // selectstart should no longer be prevented
      const afterSelectEvent = new Event('selectstart', { bubbles: true, cancelable: true });
      const afterAllowed = document.dispatchEvent(afterSelectEvent);
      expect(afterAllowed, 'selectstart must be allowed after drag ends').toBe(true);
      expect(afterSelectEvent.defaultPrevented).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('verifies explicitTarget outside rootEl is completely ignored by handleMouseClick', () => {
      const ast = buildLinearAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, { inline: false });
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 100, 100);

      // External DOM element (e.g. Markdown paragraph)
      const outsideEl = document.createElement('div');
      outsideEl.id = 'external-markdown-line';
      outsideEl.textContent = 'Some outside text';
      container.appendChild(outsideEl);

      const rect = rootEl.getBoundingClientRect();
      // Click at 500px above equation with explicitTarget = outsideEl
      const res = handleMouseClick(ast, rootEl, (rect.left + rect.right) / 2, rect.top - 500, outsideEl);

      expect(res.slotId).toBe(ast.id);
      expect(res.offset).toBe(0);

      rootEl.remove();
      outsideEl.remove();
    });
  });
});
