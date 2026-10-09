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

describe('Phase 2: Selection Boundary, Traversal & Multi-Click Unit Suite', () => {
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

  const fractionXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
    <mfrac>
      <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
      <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
    </mfrac>
    <mi>s</mi>
  </math>`;

  // -------------------------------------------------------------------------
  // BUG 1: Shift+Arrow Entering Structures (Atomic Stepping)
  // -------------------------------------------------------------------------
  describe('Bug 1: Shift+Arrow Atomic Selection Stepping', () => {
    it('selects entire fraction atomically on Shift+ArrowRight from root offset 0', () => {
      const ast = parseMathML(fractionXml);
      const rootSlot = ast;
      const caret: CaretPosition = { slotId: rootSlot.id, offset: 0 };

      const step = handleSelectionStep(rootSlot, null, caret, 'ArrowRight');
      expect(step).not.toBeNull();
      // Must atomically select [0, 1] in root slot
      expect(step!.selection.anchor).toEqual({ slotId: rootSlot.id, offset: 0 });
      expect(step!.selection.head).toEqual({ slotId: rootSlot.id, offset: 1 });
      expect(step!.caret).toEqual({ slotId: rootSlot.id, offset: 1 });
      // Must NOT descend into numerator
      expect(step!.selection.head.slotId).not.toBe((rootSlot.children[0] as any).numerator.id);
    });

    it('selects entire fraction atomically backward on Shift+ArrowLeft from root offset 1', () => {
      const ast = parseMathML(fractionXml);
      const rootSlot = ast;
      const caret: CaretPosition = { slotId: rootSlot.id, offset: 1 };

      const step = handleSelectionStep(rootSlot, null, caret, 'ArrowLeft');
      expect(step).not.toBeNull();
      // Must atomically select [1, 0] in root slot
      expect(step!.selection.anchor).toEqual({ slotId: rootSlot.id, offset: 1 });
      expect(step!.selection.head).toEqual({ slotId: rootSlot.id, offset: 0 });
      expect(step!.caret).toEqual({ slotId: rootSlot.id, offset: 0 });
      // Must NOT descend into denominator
      expect(step!.selection.head.slotId).not.toBe((rootSlot.children[0] as any).denominator.id);
    });

    it('collapses selection when stepping in reverse direction until head meets anchor', () => {
      const ast = parseMathML(fractionXml);
      const rootSlot = ast;
      const caret: CaretPosition = { slotId: rootSlot.id, offset: 0 };

      // Step 1: Forward over fraction
      const step1 = handleSelectionStep(rootSlot, null, caret, 'ArrowRight')!;
      expect(step1.selection.anchor.offset).toBe(0);
      expect(step1.selection.head.offset).toBe(1);

      // Step 2: Forward over token 's'
      const step2 = handleSelectionStep(rootSlot, step1.selection, step1.caret, 'ArrowRight')!;
      expect(step2.selection.head.offset).toBe(2);

      // Step 3: Reverse backward (shrink selection)
      const step3 = handleSelectionStep(rootSlot, step2.selection, step2.caret, 'ArrowLeft')!;
      expect(step3.selection.anchor.offset).toBe(0);
      expect(step3.selection.head.offset).toBe(1);

      // Step 4: Reverse backward again -> head meets anchor (collapse)
      const step4 = handleSelectionStep(rootSlot, step3.selection, step3.caret, 'ArrowLeft')!;
      expect(step4.selection.anchor.offset).toBe(0);
      expect(step4.selection.head.offset).toBe(0);
      expect(step4.caret.offset).toBe(0);

      // Step 5: At root boundary offset 0, ArrowLeft returns handled: false (exit to markdown)
      const step5 = handleSelectionStep(rootSlot, step4.selection, step4.caret, 'ArrowLeft')!;
      expect(step5.handled).toBe(false);
      expect(step5.exitDirection).toBe('before');
    });
  });

  // -------------------------------------------------------------------------
  // BUG 2: Shift+Arrow Exiting Structures (Hierarchical Scope Expansion)
  // -------------------------------------------------------------------------
  describe('Bug 2: Hierarchical Boundary Selection Expansion', () => {
    it('Stage 1: selects placeholder contents when caret reaches placeholder end', () => {
      const ast = parseMathML(fractionXml);
      const denSlot = (ast.children[0] as any).denominator;
      const caret: CaretPosition = { slotId: denSlot.id, offset: 3 };
      const partialSel: SelectionRange = {
        anchor: { slotId: denSlot.id, offset: 1 },
        head: { slotId: denSlot.id, offset: 3 },
      };

      const expansion = handleHierarchicalBoundaryExpansion(ast, partialSel, denSlot, 'ArrowRight');
      expect(expansion).not.toBeNull();
      // Stage 1: ensures full placeholder contents are selected [0, 3]
      expect(expansion.selection.anchor).toEqual({ slotId: denSlot.id, offset: 0 });
      expect(expansion.selection.head).toEqual({ slotId: denSlot.id, offset: 3 });
      expect(expansion.handled).toBe(true);
    });

    it('Stage 2: expands selection to parent fraction when placeholder is already fully selected', () => {
      const ast = parseMathML(fractionXml);
      const denSlot = (ast.children[0] as any).denominator;
      const fullySelected: SelectionRange = {
        anchor: { slotId: denSlot.id, offset: 0 },
        head: { slotId: denSlot.id, offset: 3 },
      };

      const expansion = handleHierarchicalBoundaryExpansion(ast, fullySelected, denSlot, 'ArrowRight');
      expect(expansion).not.toBeNull();
      // Stage 2: expands to parent fraction [0, 1] in root slot
      expect(expansion.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(expansion.selection.head).toEqual({ slotId: ast.id, offset: 1 });
      expect(expansion.caret).toEqual({ slotId: ast.id, offset: 1 });
      expect(expansion.handled).toBe(true);
    });

    it('Stage 2 Backward: expands selection backward to parent fraction from placeholder start', () => {
      const ast = parseMathML(fractionXml);
      const denSlot = (ast.children[0] as any).denominator;
      const fullySelectedBack: SelectionRange = {
        anchor: { slotId: denSlot.id, offset: 3 },
        head: { slotId: denSlot.id, offset: 0 },
      };

      const expansion = handleHierarchicalBoundaryExpansion(ast, fullySelectedBack, denSlot, 'ArrowLeft');
      expect(expansion).not.toBeNull();
      // Expands backward [1, 0] in root slot
      expect(expansion.selection.anchor).toEqual({ slotId: ast.id, offset: 1 });
      expect(expansion.selection.head).toEqual({ slotId: ast.id, offset: 0 });
      expect(expansion.caret).toEqual({ slotId: ast.id, offset: 0 });
      expect(expansion.handled).toBe(true);
    });

    it('handles empty placeholders: Stage 1 highlights slot, Stage 2 expands to parent', () => {
      const emptyFractionXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac><mrow/><mrow/></mfrac>
      </math>`;
      const ast = parseMathML(emptyFractionXml);
      const numSlot = (ast.children[0] as any).numerator;
      const caret: CaretPosition = { slotId: numSlot.id, offset: 0 };
      const sel: SelectionRange = { anchor: caret, head: caret };

      // First boundary expansion on unhighlighted empty placeholder: Stage 1
      const stage1 = handleHierarchicalBoundaryExpansion(ast, sel, numSlot, 'ArrowRight', null);
      expect(stage1.handled).toBe(true);
      expect(stage1.highlightedSlotId).toBe(numSlot.id);

      // Second boundary expansion on already highlighted empty placeholder: Stage 2
      const stage2 = handleHierarchicalBoundaryExpansion(ast, sel, numSlot, 'ArrowRight', numSlot.id);
      expect(stage2.handled).toBe(true);
      expect(stage2.highlightedSlotId).toBeNull();
      expect(stage2.selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(stage2.selection.head).toEqual({ slotId: ast.id, offset: 1 });
    });
  });

  // -------------------------------------------------------------------------
  // BUG 3: Mouse Drag Boundary Elevation & Composite Styling
  // -------------------------------------------------------------------------
  describe('Bug 3: Composite Structure Selection & Drag Elevation', () => {
    it('decorates composite .eq-fraction with .eq-selected-structure when structure is selected', () => {
      const ast = parseMathML(fractionXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      // Select root slot index 0 to 1 (the fraction)
      const rootSel: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, rootSel);

      const fractionEl = dom.querySelector('.eq-fraction');
      expect(fractionEl?.classList.contains('eq-selected-structure')).toBe(true);
    });

    it('does NOT decorate .eq-fraction with .eq-selected-structure when only intra-slot tokens are selected', () => {
      const ast = parseMathML(fractionXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const numSlot = (ast.children[0] as any).numerator;
      // Select characters 0 to 2 in numerator
      const tokenSel: SelectionRange = {
        anchor: { slotId: numSlot.id, offset: 0 },
        head: { slotId: numSlot.id, offset: 2 },
      };

      updatePartialSelectionDom(dom, ast, tokenSel);

      const fractionEl = dom.querySelector('.eq-fraction');
      expect(fractionEl?.classList.contains('eq-selected-structure')).toBe(false);
    });

    it('elevates selection for drag when pointer leaves placeholder boundary', () => {
      const ast = parseMathML(fractionXml);
      const numSlot = (ast.children[0] as any).numerator;

      // Drag initiated inside numerator (offset 2) and moves out to root (offset 1)
      const anchor: CaretPosition = { slotId: numSlot.id, offset: 2 };
      const head: CaretPosition = { slotId: ast.id, offset: 1 };

      const elevated = elevateSelectionForDrag(ast, anchor, head);
      expect(elevated.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(elevated.head).toEqual({ slotId: ast.id, offset: 1 });
    });

    it('preserves local selection when drag stays within the same placeholder', () => {
      const ast = parseMathML(fractionXml);
      const numSlot = (ast.children[0] as any).numerator;

      const anchor: CaretPosition = { slotId: numSlot.id, offset: 0 };
      const head: CaretPosition = { slotId: numSlot.id, offset: 2 };

      const notElevated = elevateSelectionForDrag(ast, anchor, head);
      expect(notElevated.anchor).toEqual(anchor);
      expect(notElevated.head).toEqual(head);
    });
  });

  // -------------------------------------------------------------------------
  // BUG 4: Visual Single-Highlight on Last Character
  // -------------------------------------------------------------------------
  describe('Bug 4: Intra-Slot Single Character Highlight Isolation', () => {
    it('applies only .eq-selected-token without .eq-partial-selected on container for intra-slot selection', () => {
      const ast = parseMathML(fractionXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const numSlot = (ast.children[0] as any).numerator;
      // Select only last character 'd' in numerator: [2, 3]
      const lastCharSel: SelectionRange = {
        anchor: { slotId: numSlot.id, offset: 2 },
        head: { slotId: numSlot.id, offset: 3 },
      };

      updatePartialSelectionDom(dom, ast, lastCharSel);

      const lastTokenEl = dom.querySelector(`[data-node-id="${numSlot.children[2].id}"]`);
      const numContainer = dom.querySelector('.eq-numerator');
      const slotEl = dom.querySelector(`[data-slot-id="${numSlot.id}"]`);

      // Selected token receives highlight
      expect(lastTokenEl?.classList.contains('eq-selected-token')).toBe(true);
      // Container and slot must NOT receive partial-selected background tint
      expect(numContainer?.classList.contains('eq-partial-selected')).toBe(false);
      expect(slotEl?.classList.contains('eq-partial-selected')).toBe(false);
    });

    it('still applies .eq-partial-selected for true cross-boundary selections', () => {
      const ast = parseMathML(fractionXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const numSlot = (ast.children[0] as any).numerator;
      const denSlot = (ast.children[0] as any).denominator;

      // Select spanning numerator into denominator: start.slotId !== end.slotId
      const crossSel: SelectionRange = {
        anchor: { slotId: numSlot.id, offset: 2 },
        head: { slotId: denSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, crossSel);

      const numContainer = dom.querySelector('.eq-numerator');
      const denContainer = dom.querySelector('.eq-denominator');

      // True cross-boundary selection correctly receives container styling
      expect(numContainer?.classList.contains('eq-partial-selected')).toBe(true);
      expect(denContainer?.classList.contains('eq-partial-selected')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // FEATURE DEFICIT: Click Selection (Double/Triple Click)
  // -------------------------------------------------------------------------
  describe('Feature Deficit: Multi-Click Selection', () => {
    it('resolves click counts with e.detail and timing/distance fallback', () => {
      const widget = new WordEquationWidget(fractionXml, 0, 100);

      // Single click with detail 1
      const ev1 = new MouseEvent('pointerdown', { detail: 1, clientX: 50, clientY: 50 });
      expect(widget.resolveClickCount(ev1)).toBe(1);

      // Double click with detail 2
      const ev2 = new MouseEvent('pointerdown', { detail: 2, clientX: 50, clientY: 50 });
      expect(widget.resolveClickCount(ev2)).toBe(2);

      // Synthetic double click with detail 0 but rapid timing within 15px
      const ev3 = new MouseEvent('pointerdown', { detail: 0, clientX: 52, clientY: 51 });
      expect(widget.resolveClickCount(ev3)).toBe(3);
    });

    it('double click selects the entire current placeholder', () => {
      const ast = parseMathML(fractionXml);
      const numSlot = (ast.children[0] as any).numerator;
      const clickedPos: CaretPosition = { slotId: numSlot.id, offset: 1 };

      const targetSlot = findSlotById(ast, clickedPos.slotId)!;
      const selection: SelectionRange = {
        anchor: { slotId: targetSlot.id, offset: 0 },
        head: { slotId: targetSlot.id, offset: targetSlot.children.length },
      };

      expect(selection.anchor).toEqual({ slotId: numSlot.id, offset: 0 });
      expect(selection.head).toEqual({ slotId: numSlot.id, offset: 3 });
    });

    it('triple click selects the entire root placeholder', () => {
      const ast = parseMathML(fractionXml);

      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: ast.children.length },
      };

      expect(selection.anchor).toEqual({ slotId: ast.id, offset: 0 });
      expect(selection.head).toEqual({ slotId: ast.id, offset: 2 });
    });
  });
});
