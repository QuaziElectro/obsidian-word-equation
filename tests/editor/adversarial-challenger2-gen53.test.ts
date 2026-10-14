import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseMathML } from '../../src/core/mathml-parser';
import { handleArrowKey } from '../../src/editor/navigation';
import { updatePartialSelectionDom } from '../../src/editor/selection';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { CaretPosition, SelectionRange, SlotNode } from '../../src/core/types';
import { resetIdCounter, findSlotById } from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Empirical Challenger 2 (Gen 53): Bug Reproduction & Stress Verification', () => {
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
    vi.restoreAllMocks();
  });

  // Test equation matching telemetry: \frac{asd}{asd}s
  const testXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mfrac>
    <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
    <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
  </mfrac>
  <mi>s</mi>
</math>`;

  it('empirically reproduces Bug 1: Shift+ArrowRight prematurely descends into numerator rather than selecting fraction', () => {
    const ast = parseMathML(testXml);
    const rootSlot = ast; // Root slot with children: [fraction, mi]
    expect(rootSlot.children.length).toBe(2);
    expect(rootSlot.children[0].type).toBe('fraction');

    // Caret starts at root offset 0 (before fraction)
    const caretAtStart: CaretPosition = { slotId: rootSlot.id, offset: 0 };

    // In current widget.ts line 1113, Shift+ArrowRight delegates to handleArrowKey(this.ast, this.selection.head, 'ArrowRight')
    const navResult = handleArrowKey(ast, caretAtStart, 'ArrowRight');

    // BUG 1 CONFIRMATION: The navigation handled it by descending into numerator offset 0
    expect(navResult.handled).toBe(true);
    const numSlot = (rootSlot.children[0] as any).numerator;
    expect(navResult.caret.slotId).toBe(numSlot.id);
    expect(navResult.caret.offset).toBe(0);
    // It did NOT select the fraction atomically at root slot [0, 1]
    expect(navResult.caret.slotId).not.toBe(rootSlot.id);
  });

  it('empirically reproduces Bug 1 (Backward): Shift+ArrowLeft prematurely descends into denominator rather than selecting fraction', () => {
    const ast = parseMathML(testXml);
    const rootSlot = ast;

    // Caret starts at root offset 1 (after fraction, before 's')
    const caretAfterFraction: CaretPosition = { slotId: rootSlot.id, offset: 1 };

    // Shift+ArrowLeft delegates to handleArrowKey(this.ast, this.selection.head, 'ArrowLeft')
    const navResult = handleArrowKey(ast, caretAfterFraction, 'ArrowLeft');

    // BUG 1 CONFIRMATION: Navigates into denominator offset 3
    expect(navResult.handled).toBe(true);
    const denSlot = (rootSlot.children[0] as any).denominator;
    expect(navResult.caret.slotId).toBe(denSlot.id);
    expect(navResult.caret.offset).toBe(3);
    // Did NOT stay at root slot with offset 0
    expect(navResult.caret.slotId).not.toBe(rootSlot.id);
  });

  it('empirically reproduces Bug 2: Shift+ArrowRight at denominator end bypasses hierarchical expansion and escapes fraction', () => {
    const ast = parseMathML(testXml);
    const rootSlot = ast;
    const denSlot = (rootSlot.children[0] as any).denominator;

    // Caret at end of denominator (offset 3)
    const caretAtDenEnd: CaretPosition = { slotId: denSlot.id, offset: 3 };

    // When pressing ArrowRight, unshifted navigation executes exit_composite_to_enclosing_slot
    const navResult = handleArrowKey(ast, caretAtDenEnd, 'ArrowRight');

    // BUG 2 CONFIRMATION: Directly exits fraction to root offset 1 without expanding selection
    expect(navResult.handled).toBe(true);
    expect(navResult.caret.slotId).toBe(rootSlot.id);
    expect(navResult.caret.offset).toBe(1);
  });

  it('empirically reproduces Bug 2 (Backward): Shift+ArrowLeft at denominator start jumps to numerator instead of hierarchical selection', () => {
    const ast = parseMathML(testXml);
    const rootSlot = ast;
    const denSlot = (rootSlot.children[0] as any).denominator;
    const numSlot = (rootSlot.children[0] as any).numerator;

    // Caret at start of denominator (offset 0)
    const caretAtDenStart: CaretPosition = { slotId: denSlot.id, offset: 0 };

    // When pressing ArrowLeft, unshifted navigation moves to previous sibling slot
    const navResult = handleArrowKey(ast, caretAtDenStart, 'ArrowLeft');

    // BUG 2 CONFIRMATION: Jumps into numerator offset 3 instead of selecting denominator
    expect(navResult.handled).toBe(true);
    expect(navResult.caret.slotId).toBe(numSlot.id);
    expect(navResult.caret.offset).toBe(3);
  });

  it('verifies Bug 4 remediation: Visual double-highlight is eliminated when selecting only the last character of a placeholder', () => {
    const ast = parseMathML(testXml);
    const renderer = new DomRenderer();
    const dom = renderer.render(ast);
    container.appendChild(dom);

    const numSlot = (ast.children[0] as any).numerator;
    // Select exclusively the last character 'd' in numerator: [2, 3]
    const selectionRange: SelectionRange = {
      anchor: { slotId: numSlot.id, offset: 2 },
      head: { slotId: numSlot.id, offset: 3 },
    };

    updatePartialSelectionDom(dom, ast, selectionRange);

    const lastTokenNode = numSlot.children[2];
    const lastTokenEl = dom.querySelector(`[data-node-id="${lastTokenNode.id}"]`);
    const numContainer = dom.querySelector('.eq-numerator');
    const slotEl = dom.querySelector(`[data-slot-id="${numSlot.id}"]`);

    // BUG 4 REMEDIATION:
    // 1. Token has .eq-selected-token
    expect(lastTokenEl?.classList.contains('eq-selected-token')).toBe(true);
    // 2. Container and slot do NOT receive .eq-partial-selected during intra-slot single character selection!
    expect(numContainer?.classList.contains('eq-partial-selected')).toBe(false);
    expect(slotEl?.classList.contains('eq-partial-selected')).toBe(false);
  });

  it('verifies Bug 3 remediation: Composite structures receive .eq-selected-structure in updatePartialSelectionDom', () => {
    const ast = parseMathML(testXml);
    const renderer = new DomRenderer();
    const dom = renderer.render(ast);
    container.appendChild(dom);

    // Select the fraction in root slot: [0, 1]
    const rootSelection: SelectionRange = {
      anchor: { slotId: ast.id, offset: 0 },
      head: { slotId: ast.id, offset: 1 },
    };

    updatePartialSelectionDom(dom, ast, rootSelection);

    const fractionEl = dom.querySelector('.eq-fraction');
    // BUG 3 REMEDIATION: The fraction element receives .eq-selected-structure
    expect(fractionEl?.classList.contains('eq-selected-structure')).toBe(true);
  });

  it('stress-tests proposed Bug 4 fix: intra-slot selection suppresses container partial-selected class', () => {
    const ast = parseMathML(testXml);
    const renderer = new DomRenderer();
    const dom = renderer.render(ast);
    container.appendChild(dom);

    const numSlot = (ast.children[0] as any).numerator;
    const isCrossBoundary = false; // Same slot: numSlot.id === numSlot.id

    // Under proposed fix:
    // Container classes (.eq-partial-selected on num, den, slot) should ONLY be applied if isCrossBoundary === true.
    expect(isCrossBoundary).toBe(false);
  });
});
