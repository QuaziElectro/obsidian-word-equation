import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { DomRenderer } from '../../src/editor/dom-renderer';
import {
  updatePartialSelectionDom,
  normalizeSelection,
} from '../../src/editor/selection';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  createSuperscript,
  createMatrix,
  updateParentPointers,
  getAllSlotsInOrder,
} from '../../src/core/ast';
import { SlotNode, CaretPosition } from '../../src/core/types';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';

describe('Challenger 2 Empirical Harness: Drag Selection & Boundary Clamping Stress Test', () => {
  let container: HTMLElement;

  beforeEach(() => {
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    container.id = 'challenger2-stress-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
  });

  function getWidgetAndDom(view: any): { widget: WordEquationWidget; dom: HTMLElement } {
    let widget: WordEquationWidget | null = null;
    view.state.field(wordEquationStateField).between(0, view.state.doc.length, (_f: number, _t: number, dec: any) => {
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
        [createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [createToken('2', 'mn')])],
        [createSlot('cell', [createToken('3', 'mn')]), createSlot('cell', [createToken('4', 'mn')])],
      ]),
    ]);
    updateParentPointers(root);
    return root;
  }

  function buildComplexAst(): SlotNode {
    const root = createSlot('root', [
      createRoot(
        createSlot('radicand', [
          createFraction(
            createSlot('numerator', [createToken('a', 'mi')]),
            createSlot('denominator', [createToken('b', 'mi')])
          ),
        ]),
        createSlot('index', [createToken('3', 'mn')])
      ),
      createToken('+', 'mo'),
      createSuperscript(
        createSlot('base', [createToken('x', 'mi')]),
        createSlot('sup', [createToken('2', 'mn')])
      ),
    ]);
    updateParentPointers(root);
    return root;
  }

  // =========================================================================
  // Section 1: Drag selection within equations highlights tokens correctly
  // =========================================================================
  describe('1. In-Equation Drag Selection & Visual Highlighting', () => {
    it('correctly creates partial selection when dragging across tokens inside linear equation', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>1</mn><mo>+</mo><mn>2</mn><mo>=</mo><mn>3</mn></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];
      expect(tokens.length).toBe(5);

      const t0Rect = tokens[0].getBoundingClientRect();
      const t2Rect = tokens[2].getBoundingClientRect();

      // Start drag at token 0 ("1")
      dom.dispatchEvent(new MouseEvent('mousedown', {
        clientX: t0Rect.left + 2,
        clientY: t0Rect.top + t0Rect.height / 2,
        buttons: 1,
        bubbles: true,
      }));

      // Move > 3px to arm dragging and move to token 2 ("2")
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: t2Rect.right - 2,
        clientY: t2Rect.top + t2Rect.height / 2,
        buttons: 1,
        bubbles: true,
      }));

      expect(widget.selection).not.toBeNull();
      expect(widget.selection!.anchor.slotId).toBe(widget.ast.id);
      expect(widget.selection!.anchor.offset).toBe(0);
      expect(widget.selection!.head.slotId).toBe(widget.ast.id);
      expect(widget.selection!.head.offset).toBe(3); // covers 1, +, 2

      // Check DOM highlighting: outer block must NOT be eq-selected
      expect(dom.classList.contains('eq-selected')).toBe(false);

      // Selected tokens should be highlighted
      const highlighted = dom.querySelectorAll('.eq-selected-token');
      expect(highlighted.length).toBe(3);

      // Release mouse
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: t2Rect.right - 2,
        clientY: t2Rect.top + t2Rect.height / 2,
        buttons: 0,
        bubbles: true,
      }));

      // Selection persists after mouseup
      expect(widget.selection).not.toBeNull();
      expect(widget.selection!.head.offset).toBe(3);

      view.destroy();
      editorContainer.remove();
    });

    it('handles backward drag selection correctly (right to left)', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>1</mn><mo>+</mo><mn>2</mn><mo>=</mo><mn>3</mn></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const tokens = Array.from(dom.querySelectorAll('.eq-token')) as HTMLElement[];
      const t4Rect = tokens[4].getBoundingClientRect(); // "3"
      const t2Rect = tokens[2].getBoundingClientRect(); // "2"

      // Mousedown on token 4
      dom.dispatchEvent(new MouseEvent('mousedown', {
        clientX: t4Rect.right - 2,
        clientY: t4Rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      // Drag leftward to token 2
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: t2Rect.left + 2,
        clientY: t2Rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      expect(widget.selection).not.toBeNull();
      const norm = normalizeSelection(widget.ast, widget.selection!);
      expect(norm.isBackward).toBe(true);
      expect(norm.start.offset).toBe(2);
      expect(norm.end.offset).toBe(5);

      document.dispatchEvent(new MouseEvent('mouseup', { buttons: 0, bubbles: true }));
      view.destroy();
      editorContainer.remove();
    });

    it('crosses structural boundaries: dragging from fraction numerator down into denominator', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mn>2</mn></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const numToken = dom.querySelector('.eq-numerator .eq-token') as HTMLElement;
      const denToken = dom.querySelector('.eq-denominator .eq-token') as HTMLElement;
      const numRect = numToken.getBoundingClientRect();
      const denRect = denToken.getBoundingClientRect();

      dom.dispatchEvent(new MouseEvent('mousedown', {
        clientX: numRect.left + 2,
        clientY: numRect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: denRect.right - 2,
        clientY: denRect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      expect(widget.selection).not.toBeNull();
      // Bug 3 Remediation: dragging across placeholder boundary elevates selection to parent structure
      expect(widget.selection!.anchor.slotId).toBe(widget.selection!.head.slotId);
      expect(dom.querySelector('.eq-fraction')?.classList.contains('eq-selected-structure')).toBe(true);

      const norm = normalizeSelection(widget.ast, widget.selection!);
      expect(norm.isBackward).toBe(false);

      // Verify DOM highlighting executes without throwing
      updatePartialSelectionDom(dom, widget.ast, widget.selection);
      expect(dom.classList.contains('eq-selected')).toBe(false);

      document.dispatchEvent(new MouseEvent('mouseup', { buttons: 0, bubbles: true }));
      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // Section 2: Boundary Clamping Across All Cardinal Directions & Extremes
  // =========================================================================
  describe('2. Boundary Clamping Across Cardinal Directions & Extremes', () => {
    const testSuites = [
      { name: 'Linear AST', builder: buildLinearAst },
      { name: 'Fraction AST', builder: buildFractionAst },
      { name: 'Nested Fraction AST', builder: buildNestedFractionAst },
      { name: 'Matrix AST', builder: buildMatrixAst },
      { name: 'Complex Composite AST', builder: buildComplexAst },
    ];

    for (const { name, builder } of testSuites) {
      it(`strictly clamps out-of-bounds drags in all directions for ${name}`, () => {
        const ast = builder();
        const renderer = new DomRenderer();
        const rootEl = renderer.render(ast, {});
        container.appendChild(rootEl);
        computeAndApplyLayout(rootEl, 100, 100);

        const rect = rootEl.getBoundingClientRect();
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);

        const midX = (rect.left + rect.right) / 2;
        const midY = (rect.top + rect.bottom) / 2;
        const rootLen = ast.children.length;

        // 1. Drags ABOVE equation (varying distances from 1px to 100,000px)
        for (const dist of [1, 5, 20, 100, 500, 5000, 50000, 100000]) {
          const res = handleMouseClick(ast, rootEl, midX, rect.top - dist);
          expect(res.slotId, `Dist ${dist} above: must be root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist} above: must be 0`).toBe(0);
        }

        // 2. Drags BELOW equation (varying distances)
        for (const dist of [1, 5, 20, 100, 500, 5000, 50000, 100000]) {
          const res = handleMouseClick(ast, rootEl, midX, rect.bottom + dist);
          expect(res.slotId, `Dist ${dist} below: must be root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist} below: must be root.children.length`).toBe(rootLen);
        }

        // 3. Drags LEFT of equation (varying distances)
        for (const dist of [1, 5, 20, 100, 500, 5000, 50000, 100000]) {
          const res = handleMouseClick(ast, rootEl, rect.left - dist, midY);
          expect(res.slotId, `Dist ${dist} left: must be root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist} left: must be 0`).toBe(0);
        }

        // 4. Drags RIGHT of equation (varying distances)
        for (const dist of [1, 5, 20, 100, 500, 5000, 50000, 100000]) {
          const res = handleMouseClick(ast, rootEl, rect.right + dist, midY);
          expect(res.slotId, `Dist ${dist} right: must be root.id`).toBe(ast.id);
          expect(res.offset, `Dist ${dist} right: must be root.children.length`).toBe(rootLen);
        }

        // 5. Diagonals:
        // Top-Left -> (left - dist, top - dist) -> offset 0
        for (const dist of [10, 100, 1000]) {
          const res = handleMouseClick(ast, rootEl, rect.left - dist, rect.top - dist);
          expect(res.slotId).toBe(ast.id);
          expect(res.offset).toBe(0);
        }

        // Top-Right -> (right + dist, top - dist) -> right check triggers first -> offset rootLen
        for (const dist of [10, 100, 1000]) {
          const res = handleMouseClick(ast, rootEl, rect.right + dist, rect.top - dist);
          expect(res.slotId).toBe(ast.id);
          expect(res.offset).toBe(rootLen);
        }

        // Bottom-Left -> (left - dist, bottom + dist) -> left check triggers first -> offset 0
        for (const dist of [10, 100, 1000]) {
          const res = handleMouseClick(ast, rootEl, rect.left - dist, rect.bottom + dist);
          expect(res.slotId).toBe(ast.id);
          expect(res.offset).toBe(0);
        }

        // Bottom-Right -> (right + dist, bottom + dist) -> right check triggers -> offset rootLen
        for (const dist of [10, 100, 1000]) {
          const res = handleMouseClick(ast, rootEl, rect.right + dist, rect.bottom + dist);
          expect(res.slotId).toBe(ast.id);
          expect(res.offset).toBe(rootLen);
        }

        rootEl.remove();
      });
    }
  });

  // =========================================================================
  // Section 3: Hostile Coordinates & Robustness
  // =========================================================================
  describe('3. Hostile Adversarial Coordinates & Stress Vectors', () => {
    it('handles negative coordinates (-100, -100), (-999999, -999999) without failure', () => {
      const ast = buildLinearAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, {});
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 100, 100);

      const hostileNegatives = [
        [-1, -1],
        [-50, -50],
        [-100, 120], // neg X, positive Y
        [150, -500], // positive X, neg Y
        [-999999, -999999],
        [-1e7, -1e7],
        [-Infinity, -Infinity],
      ];

      for (const [x, y] of hostileNegatives) {
        const res = handleMouseClick(ast, rootEl, x, y);
        expect(res).toBeDefined();
        expect(res.slotId).toBe(ast.id);
        // Either clamped to 0 or rootLen depending on X quadrant
        expect([0, ast.children.length]).toContain(res.offset);
      }

      rootEl.remove();
    });

    it('handles coordinates far beyond viewport (1e6, 1e6), (1e8, -1e8)', () => {
      const ast = buildFractionAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, {});
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 100, 100);

      const hostilePositives = [
        [99999, 99999],
        [1e6, 1e6],
        [1e8, 1e8],
        [1e7, -500],
        [Infinity, Infinity],
      ];

      for (const [x, y] of hostilePositives) {
        const res = handleMouseClick(ast, rootEl, x, y);
        expect(res).toBeDefined();
        expect(res.slotId).toBe(ast.id);
        expect(res.offset).toBe(ast.children.length);
      }

      rootEl.remove();
    });

    it('survives rapid diagonal drags across all 4 quadrants in a single session', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mi>x</mi></mfrac><mo>+</mo><mn>2</mn></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const token1 = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token1.getBoundingClientRect();

      // Start drag at token 1
      dom.dispatchEvent(new MouseEvent('mousedown', {
        clientX: rect.left + 2,
        clientY: rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      // Rapidly oscillate mousemove across far quadrants
      const waypoints = [
        [-5000, -5000],  // Top-left
        [5000, -5000],   // Top-right
        [5000, 5000],    // Bottom-right
        [-5000, 5000],   // Bottom-left
        [rect.left, -200], // Direct top
        [rect.left, 500],  // Direct bottom
        [-500, rect.top],  // Direct left
        [800, rect.top],   // Direct right
      ];

      for (let i = 0; i < 50; i++) {
        const [wx, wy] = waypoints[i % waypoints.length];
        document.dispatchEvent(new MouseEvent('mousemove', {
          clientX: wx,
          clientY: wy,
          buttons: 1,
          bubbles: true,
        }));

        expect(widget.selection).not.toBeNull();
        expect(widget.selection!.head.slotId).toBe(widget.ast.id);
        expect([0, widget.ast.children.length]).toContain(widget.selection!.head.offset);
        expect(dom.classList.contains('eq-selected')).toBe(false);
      }

      // Finish drag
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: 5000,
        clientY: 5000,
        buttons: 0,
        bubbles: true,
      }));

      expect(widget.selection).not.toBeNull();
      view.destroy();
      editorContainer.remove();
    });

    it('safely handles non-finite coordinates (NaN) without throwing', () => {
      const ast = buildLinearAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, {});
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 100, 100);

      expect(() => {
        const res = handleMouseClick(ast, rootEl, NaN, NaN);
        expect(res).toBeDefined();
        expect(res.slotId).toBe(ast.id);
      }).not.toThrow();

      rootEl.remove();
    });

    it('ignores external elements passed as explicitTarget when outside rootEl', () => {
      const ast = buildLinearAst();
      const renderer = new DomRenderer();
      const rootEl = renderer.render(ast, {});
      container.appendChild(rootEl);
      computeAndApplyLayout(rootEl, 100, 100);

      const outsideEl = document.createElement('div');
      outsideEl.id = 'outside-editor-element';
      outsideEl.innerHTML = '<span>Paragraph outside equation</span>';
      container.appendChild(outsideEl);

      const rect = rootEl.getBoundingClientRect();

      // Passing outside element as explicitTarget while coordinates are 300px above
      const resAbove = handleMouseClick(ast, rootEl, (rect.left + rect.right) / 2, rect.top - 300, outsideEl);
      expect(resAbove.slotId).toBe(ast.id);
      expect(resAbove.offset).toBe(0);

      // Passing outside element while coordinates are 300px below
      const resBelow = handleMouseClick(ast, rootEl, (rect.left + rect.right) / 2, rect.bottom + 300, outsideEl);
      expect(resBelow.slotId).toBe(ast.id);
      expect(resBelow.offset).toBe(ast.children.length);

      rootEl.remove();
      outsideEl.remove();
    });
  });

  // =========================================================================
  // Section 4: Selection Isolation & Browser Integration
  // =========================================================================
  describe('4. Selection Isolation & Browser Event Containment', () => {
    it('prevents native selectstart during active drag and restores it on mouseup', () => {
      const doc = 'Text before\n\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>1</mn><mo>+</mo><mn>2</mn></math>\n```\n\nText after';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      computeAndApplyLayout(dom, 100, 100);

      const token1 = dom.querySelector('.eq-token') as HTMLElement;
      const rect = token1.getBoundingClientRect();

      // Start drag
      dom.dispatchEvent(new MouseEvent('mousedown', {
        clientX: rect.left + 2,
        clientY: rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      // Move 10px to arm drag
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: rect.left + 12,
        clientY: rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      // Dispatch selectstart on document
      const selEvt = new Event('selectstart', { bubbles: true, cancelable: true });
      const allowed = document.dispatchEvent(selEvt);
      expect(allowed, 'selectstart must be prevented during active drag').toBe(false);
      expect(selEvt.defaultPrevented).toBe(true);

      // Drag 300px above into surrounding markdown
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: rect.left + 12,
        clientY: rect.top - 300,
        buttons: 1,
        bubbles: true,
      }));

      // Outer equation container and document must not have selection classes
      expect(editorContainer.classList.contains('eq-selected')).toBe(false);

      // Release mouse
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: rect.left + 12,
        clientY: rect.top - 300,
        buttons: 0,
        bubbles: true,
      }));

      // After release, selectstart must be allowed
      const afterSelEvt = new Event('selectstart', { bubbles: true, cancelable: true });
      const afterAllowed = document.dispatchEvent(afterSelEvt);
      expect(afterAllowed, 'selectstart must be allowed after drag release').toBe(true);
      expect(afterSelEvt.defaultPrevented).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('guarantees clean teardown when switching between two equations', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>1</mn></math>\n```\n\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mn>2</mn></math>\n```';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);
      computeAndApplyLayout(editorContainer, 100, 100);

      const widgets: WordEquationWidget[] = [];
      view.state.field(wordEquationStateField).between(0, view.state.doc.length, (_f: number, _t: number, dec: any) => {
        if (dec.spec?.widget instanceof WordEquationWidget) {
          widgets.push(dec.spec.widget);
        }
      });
      expect(widgets.length).toBe(2);

      const mathEls = Array.from(editorContainer.querySelectorAll('.word-equation-math')) as HTMLElement[];
      expect(mathEls.length).toBe(2);

      const m0Rect = mathEls[0].getBoundingClientRect();
      const m1Rect = mathEls[1].getBoundingClientRect();

      // 1. Drag on Equation 1
      mathEls[0].dispatchEvent(new MouseEvent('mousedown', {
        clientX: m0Rect.left + 2,
        clientY: m0Rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: m0Rect.left + 20,
        clientY: m0Rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));
      expect(widgets[0].selection).not.toBeNull();

      // 2. Click on Equation 2 (abrupt switch without prior mouseup)
      mathEls[1].dispatchEvent(new MouseEvent('mousedown', {
        clientX: m1Rect.left + 2,
        clientY: m1Rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      // Equation 1 selection must be cleared and orphaned drag destroyed
      expect(widgets[0].selection).toBeNull();
      expect(widgets[1].isFocused).toBe(true);

      // Subsequent movement over Equation 2 must NOT affect Equation 1
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: m1Rect.left + 25,
        clientY: m1Rect.top + 2,
        buttons: 1,
        bubbles: true,
      }));

      expect(widgets[0].selection).toBeNull();
      expect(widgets[1].selection).not.toBeNull();

      document.dispatchEvent(new MouseEvent('mouseup', { buttons: 0, bubbles: true }));
      view.destroy();
      editorContainer.remove();
    });
  });
});
