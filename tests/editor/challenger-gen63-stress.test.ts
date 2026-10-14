/**
 * Challenger Gen 63 Adversarial Stress Test Suite
 * Rigorous stress tests, edge cases, and oracles for Bugs 1-4:
 *
 * - Bug 1: Settings Math Block Ctrl+A / Cmd+A and Delete Selection in InteractiveEquationBox
 *   (empty equation, Mac Cmd+A vs Windows Ctrl+A, full wipe, partial selection forward/backward,
 *   multiple delete cycles, highlightedSlotId clearing, undo/redo history).
 *
 * - Bug 2: Equations in Tables Reverting to Source Code
 *   (fenced codeblocks with <br>, <br/>, <br />, <BR> linebreaks, forced inline decoration in table rows,
 *   multiple equations in a single row, pipe protection in MathML XML, single and double dollar syntax in cells,
 *   isInsideTableRow boundary patterns).
 *
 * - Bug 3: Layered Double Highlights on Matrix and Nested Math Elements
 *   (CSS universal child highlight suppression, nested matrices, nested fraction inside radical inside fraction,
 *   clearing pre-existing descendant highlight classes on elevation, multiscripts and underover).
 *
 * - Bug 4: Matrix Selection Delete via Shift+Arrow from First Cell
 *   (2x2 matrix with Delete and Backspace, 3x3 matrix, double Shift+Arrow elevation to root structure,
 *   populated matrix whole-selection deletion, non-empty sibling preservation).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorState, Text } from '@codemirror/state';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import {
  wordEquationStateField,
  buildEquationDecorations,
  isInsideTableRow,
  protectPipesInTableXml,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import {
  updatePartialSelectionDom,
  deleteSelection,
  deleteParentStructure,
} from '../../src/editor/selection';
import { handleSelectionStep } from '../../src/editor/navigation';
import { DomRenderer } from '../../src/editor/dom-renderer';
import {
  createSlot,
  createMatrix,
  createFraction,
  createRadical,
  createMultiscripts,
  createUnderOver,
  createToken,
  resetIdCounter,
} from '../../src/core/ast';

describe('Challenger Gen 63 Adversarial Stress Suite (Bugs 1-4)', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const cssPath = path.resolve(__dirname, '../../styles.css');
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      styleEl = document.createElement('style');
      styleEl.textContent = cssContent;
      document.head.appendChild(styleEl);
    }
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    if (styleEl) styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // BUG 1 ADVERSARIAL STRESS: Settings Math Block Ctrl+A and Delete Selection
  // =========================================================================
  describe('Bug 1: Settings Math Block Ctrl+A / Cmd+A and Delete Selection', () => {
    let boxContainer: HTMLElement;
    let box: InteractiveEquationBox;

    beforeEach(() => {
      boxContainer = document.createElement('div');
      container.appendChild(boxContainer);
      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: '<math><mi>a</mi><mo>+</mo><mi>b</mi><mo>=</mo><mi>c</mi></math>',
        onChange: () => {},
      });
    });

    afterEach(() => {
      box.destroy();
      boxContainer.remove();
    });

    it('Stress 1.1: Ctrl+A on an empty equation box does not throw and produces valid collapsed selection', () => {
      box.isFocused = true;
      box.setContent('<math></math>');
      expect(box.ast.children.length).toBe(0);

      const evt = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
      box.dom.dispatchEvent(evt);

      expect(evt.defaultPrevented).toBe(true);
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(0);

      // Subsequent Delete on empty selection must not crash
      const delEvt = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
      box.dom.dispatchEvent(delEvt);
      expect(delEvt.defaultPrevented).toBe(true);
      expect(box.ast.children.length).toBe(0);
      expect(box.caret.offset).toBe(0);

      // Subsequent Backspace on empty selection must not crash
      const bsEvt = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
      box.dom.dispatchEvent(bsEvt);
      expect(bsEvt.defaultPrevented).toBe(true);
      expect(box.ast.children.length).toBe(0);
    });

    it('Stress 1.2: Mac Cmd+A (metaKey) and uppercase A (KeyA with shift or caps) cleanly select all', () => {
      box.isFocused = true;
      box.selection = null;

      // MetaKey with lowercase 'a'
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true })
      );
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(5);

      // Reset selection and test uppercase 'A'
      box.selection = null;
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, bubbles: true, cancelable: true })
      );
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(5);

      // MetaKey with uppercase 'A'
      box.selection = null;
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'A', metaKey: true, bubbles: true, cancelable: true })
      );
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(5);
    });

    it('Stress 1.3: Full equation selection wipe via Delete resets caret and renders placeholder', () => {
      box.isFocused = true;
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })
      );
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })
      );

      expect(box.ast.children.length).toBe(0);
      expect(box.caret.slotId).toBe(box.ast.id);
      expect(box.caret.offset).toBe(0);
      expect(box.selection).toBeNull();
      expect(box.highlightedSlotId).toBeNull();

      const placeholder = box.dom.querySelector('.eq-placeholder');
      expect(placeholder).not.toBeNull();
    });

    it('Stress 1.4: Full equation selection wipe via Backspace leaves consistent state', () => {
      box.isFocused = true;
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true })
      );
      box.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
      );

      expect(box.ast.children.length).toBe(0);
      expect(box.caret.slotId).toBe(box.ast.id);
      expect(box.caret.offset).toBe(0);
      expect(box.selection).toBeNull();
      expect(box.highlightedSlotId).toBeNull();
      expect(box.dom.querySelector('.eq-placeholder')).not.toBeNull();
    });

    it('Stress 1.5: Multiple consecutive typing and Ctrl+A / Delete cycles', () => {
      box.isFocused = true;

      // Cycle 1: Select all and Delete
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      expect(box.ast.children.length).toBe(0);

      // Cycle 2: Insert new tokens 'x', '+', 'y'
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }));
      expect(box.ast.children.length).toBe(3);

      // Cycle 3: Select all and Backspace
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
      expect(box.selection!.head.offset).toBe(3);
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(box.ast.children.length).toBe(0);

      // Cycle 4: Extra Delete on already cleared equation does not throw
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      expect(box.ast.children.length).toBe(0);
    });

    it('Stress 1.6: Partial selection forward and backward deletion in root slot', () => {
      box.isFocused = true;
      // Equation is: a + b = c (5 tokens at offsets 0, 1, 2, 3, 4)

      // Forward partial selection: select '+ b =' (offsets 1 to 4)
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 1 },
        head: { slotId: box.ast.id, offset: 4 },
      };
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // Remaining tokens should be 'a' and 'c'
      expect(box.ast.children.length).toBe(2);
      expect((box.ast.children[0] as any).text).toBe('a');
      expect((box.ast.children[1] as any).text).toBe('c');
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(1);

      // Backward partial selection on remaining 'a' and 'c': select 'c' backward (offset 2 to 1)
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 2 },
        head: { slotId: box.ast.id, offset: 1 },
      };
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(box.ast.children.length).toBe(1);
      expect((box.ast.children[0] as any).text).toBe('a');
      expect(box.selection).toBeNull();
      expect(box.caret.offset).toBe(1);
    });

    it('Stress 1.7: Highlighted slot clearing in nested fraction and radical', () => {
      box.isFocused = true;
      box.setContent(
        '<math><mfrac><mrow><msqrt><mi>x</mi></msqrt></mrow><mrow><mi>y</mi><mo>+</mo><mn>1</mn></mrow></mfrac></math>'
      );

      const fracNode = box.ast.children[0] as any;
      const denSlot = fracNode.denominator;
      expect(denSlot.children.length).toBe(3); // 'y', '+', '1'

      // Highlight denominator slot
      box.highlightedSlotId = denSlot.id;

      // Press Delete
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // Denominator should now be emptied, highlightedSlotId cleared, caret positioned in denominator
      const updatedFrac = box.ast.children[0] as any;
      expect(updatedFrac.denominator.children.length).toBe(0);
      expect(box.highlightedSlotId).toBeNull();
      expect(box.caret.slotId).toBe(denSlot.id);
      expect(box.caret.offset).toBe(0);
    });

    it('Stress 1.8: Undo and Redo restores equation after full Ctrl+A + Delete', () => {
      box.isFocused = true;
      expect(box.ast.children.length).toBe(5);

      // Select all and Delete
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      expect(box.ast.children.length).toBe(0);

      // Press Ctrl+Z (Undo)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      expect(box.ast.children.length).toBe(5);

      // Press Ctrl+Y (Redo)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
      expect(box.ast.children.length).toBe(0);
    });
  });

  // =========================================================================
  // BUG 2 ADVERSARIAL STRESS: Equations in Tables Revert to Source Code
  // =========================================================================
  describe('Bug 2: Equations in Tables Revert to Source Code', () => {
    it('Stress 2.1: Fenced codeblocks with all HTML <br> variants (<br>, <br/>, <br />, <BR>) are recognized as equations', () => {
      const tableContent = [
        '| Format | Equation |',
        '| --- | --- |',
        '| standard br | ```math-word<br><math><mi>a</mi></math><br>``` |',
        '| self-closing br | ```weq<br/><math><mi>b</mi></math><br/>``` |',
        '| space-closing br | ```math-word<br /><math><mi>c</mi></math><br />``` |',
        '| uppercase BR | ```weq<BR><math><mi>d</mi></math><BR>``` |',
      ].join('\n');

      const state = EditorState.create({ doc: tableContent });
      const decorations = buildEquationDecorations(state);

      const widgets: WordEquationWidget[] = [];
      const blockFlags: boolean[] = [];

      decorations.between(0, state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widgets.push(w);
          blockFlags.push(Boolean((dec.spec as any)?.block));
        }
      });

      expect(widgets.length).toBe(4);
      // ALL table equation decorations MUST be inline (block: false) to prevent CodeMirror line crash
      expect(blockFlags.every((b) => b === false)).toBe(true);
      expect(widgets.every((w) => w.isInline === true || (w as any).isBlockInTable === true)).toBe(true);
    });

    it('Stress 2.2: Outside table rows, fenced blocks remain block: true; inside tables they are strictly forced to block: false', () => {
      const docContent = [
        '# Document',
        '```math-word',
        '<math><mi>outside</mi></math>',
        '```',
        '',
        '| Table Header |',
        '| --- |',
        '| ```math-word<br><math><mi>inside</mi></math><br>``` |',
      ].join('\n');

      const state = EditorState.create({ doc: docContent });
      const decorations = buildEquationDecorations(state);

      const found: Array<{ code: string; isBlockDecoration: boolean; isInlineWidget: boolean; isBlockInTable: boolean }> = [];

      decorations.between(0, state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          found.push({
            code: w.code,
            isBlockDecoration: Boolean((dec.spec as any)?.block),
            isInlineWidget: w.isInline,
            isBlockInTable: Boolean((w as any).isBlockInTable),
          });
        }
      });

      expect(found.length).toBe(2);

      // Outside block equation: must be block: true
      const outside = found.find((f) => f.code.includes('outside'))!;
      expect(outside.isBlockDecoration).toBe(true);
      expect(outside.isInlineWidget).toBe(false);

      // Inside table equation: MUST be block: false
      const inside = found.find((f) => f.code.includes('inside'))!;
      expect(inside.isBlockDecoration).toBe(false);
      expect(inside.isInlineWidget || inside.isBlockInTable).toBe(true);
    });

    it('Stress 2.3: Multiple equations of different syntaxes across cells in the same row', () => {
      const rowContent =
        '| $x_1$ | $$y_1$$ | <math><mi>z_1</mi></math> | ```math-word<br><math><mi>w_1</mi></math><br>``` |';
      const docContent = ['| C1 | C2 | C3 | C4 |', '| --- | --- | --- | --- |', rowContent].join('\n');

      const state = EditorState.create({ doc: docContent });
      const decorations = buildEquationDecorations(state);

      const widgets: WordEquationWidget[] = [];
      decorations.between(0, state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widgets.push(w);
      });

      expect(widgets.length).toBe(4);
      expect(widgets.every((w) => w.isInline === true || (w as any).isBlockInTable === true)).toBe(true);
    });

    it('Stress 2.4: protectPipesInTableXml handles single, paired, and nested absolute value pipes', () => {
      // 1. Simple absolute value
      const absXml = '<math><mo>|</mo><mi>x</mi><mo>|</mo></math>';
      const p1 = protectPipesInTableXml(absXml);
      expect(p1).toBe('<math><mo>&#124;</mo><mi>x</mi><mo>&#124;</mo></math>');

      // 2. Double absolute values / norms
      const normXml = '<math><mo>|</mo><mo>|</mo><mi>v</mi><mo>|</mo><mo>|</mo></math>';
      const p2 = protectPipesInTableXml(normXml);
      expect(p2).toBe('<math><mo>&#124;</mo><mo>&#124;</mo><mi>v</mi><mo>&#124;</mo><mo>&#124;</mo></math>');

      // 3. Matrix with pipes
      const matXml = '<math><mo>|</mo><mtable><mtr><mtd><mn>1</mn></mtd></mtr></mtable><mo>|</mo></math>';
      const p3 = protectPipesInTableXml(matXml);
      expect(p3).toContain('<mo>&#124;</mo>');
      expect(p3).not.toContain('<mo>|</mo>');
    });

    it('Stress 2.5: isInsideTableRow edge cases with whitespace, partial rows, and multiple columns', () => {
      const doc = Text.of([
        '   | leading spaces | cell |   ',
        '|no spaces|cell|',
        'a | b | c',
        'single pipe | not table',
        '||',
        '| --- |:---:|',
      ]);

      expect(isInsideTableRow(doc, doc.line(1).from)).toBe(true);
      expect(isInsideTableRow(doc, doc.line(2).from)).toBe(true);
      expect(isInsideTableRow(doc, doc.line(3).from)).toBe(true);
      expect(isInsideTableRow(doc, doc.line(4).from)).toBe(false);
      expect(isInsideTableRow(doc, doc.line(5).from)).toBe(true);
      expect(isInsideTableRow(doc, doc.line(6).from)).toBe(true);
    });
  });

  // =========================================================================
  // BUG 3 ADVERSARIAL STRESS: Layered Double Highlights on Matrix and Math Elements
  // =========================================================================
  describe('Bug 3: Layered Double Highlights on Matrix and Math Elements', () => {
    it('Stress 3.1: CSS stylesheet guarantees universal child highlight suppression on all descendants', () => {
      const cssPath = path.resolve(__dirname, '../../styles.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      // Check structure suppression
      expect(css).toMatch(/\.eq-selected-structure\s+\*/);
      expect(css).toMatch(/\.eq-selected-structure\s+\.eq-selected-structure/);
      expect(css).toMatch(/\.eq-selected-structure\s+\.eq-placeholder/);
      expect(css).toMatch(/\.eq-selected-structure\s+\.eq-slot/);
      expect(css).toMatch(/\.eq-selected-structure\s+\.eq-token/);

      // Check slot and partial suppression
      expect(css).toMatch(/\.eq-selected-slot\s+\*/);
      expect(css).toMatch(/\.eq-partial-selected\s+\.eq-selected-token/);
      expect(css).toMatch(/background-color:\s*transparent\s*!important/);
    });

    it('Stress 3.2: Selecting an outer matrix containing a nested inner matrix leaves no child highlight classes', () => {
      // Create nested 2x2 matrix: cell (0, 0) has an inner 2x2 matrix
      const innerMatrix = createMatrix([
        [createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [createToken('2', 'mn')])],
        [createSlot('cell', [createToken('3', 'mn')]), createSlot('cell', [createToken('4', 'mn')])],
      ]);
      const outerMatrix = createMatrix([
        [createSlot('cell', [innerMatrix]), createSlot('cell', [createToken('0', 'mn')])],
        [createSlot('cell', [createToken('0', 'mn')]), createSlot('cell', [createToken('1', 'mn')])],
      ]);
      const rootSlot = createSlot('root', [outerMatrix]);

      const renderer = new DomRenderer();
      const dom = renderer.render(rootSlot);
      container.appendChild(dom);

      const matrices = dom.querySelectorAll('.eq-matrix');
      expect(matrices.length).toBe(2);

      // Select outer matrix structure in root
      const selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, rootSlot, selection, null);

      const outerEl = matrices[0] as HTMLElement;
      const innerEl = matrices[1] as HTMLElement;

      // Outer matrix MUST have .eq-selected-structure
      expect(outerEl.classList.contains('eq-selected-structure')).toBe(true);

      // Inner matrix MUST NOT have .eq-selected-structure (suppressed duplicate parent class)
      expect(innerEl.classList.contains('eq-selected-structure')).toBe(false);

      // None of the inner matrix child slots or tokens should have highlight classes
      const childTokens = outerEl.querySelectorAll('.eq-selected-token');
      const childSlots = outerEl.querySelectorAll('.eq-selected-slot, .eq-partial-selected');
      expect(childTokens.length).toBe(0);
      expect(childSlots.length).toBe(0);
    });

    it('Stress 3.3: Nested fraction inside radical inside fraction leaves no descendant highlight classes', () => {
      // Construct: fraction with numerator = sqrt(1/2) and denominator = 3
      const innerFrac = createFraction(
        createSlot('numerator', [createToken('1', 'mn')]),
        createSlot('denominator', [createToken('2', 'mn')])
      );
      const radNode = createRadical(createSlot('radicand', [innerFrac]));
      const outerFrac = createFraction(
        createSlot('numerator', [radNode]),
        createSlot('denominator', [createToken('3', 'mn')])
      );
      const rootSlot = createSlot('root', [outerFrac]);

      const renderer = new DomRenderer();
      const dom = renderer.render(rootSlot);
      container.appendChild(dom);

      const selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, rootSlot, selection, null);

      const outerFracEl = dom.querySelector('.eq-fraction') as HTMLElement;
      expect(outerFracEl.classList.contains('eq-selected-structure')).toBe(true);

      // Check radical and inner fraction
      const radEl = dom.querySelector('.eq-radical') as HTMLElement;
      expect(radEl.classList.contains('eq-selected-structure')).toBe(false);

      // Zero descendant selection classes
      const descendantHighlights = outerFracEl.querySelectorAll(
        '.eq-selected-token, .eq-selected-slot, .eq-partial-selected'
      );
      expect(descendantHighlights.length).toBe(0);
    });

    it('Stress 3.4: Pre-existing descendant selection classes are systematically purged when parent structure becomes selected', () => {
      const matrix = createMatrix([
        [createSlot('cell', [createToken('a', 'mi')]), createSlot('cell', [createToken('b', 'mi')])],
        [createSlot('cell', [createToken('c', 'mi')]), createSlot('cell', [createToken('d', 'mi')])],
      ]);
      const rootSlot = createSlot('root', [matrix]);

      const renderer = new DomRenderer();
      const dom = renderer.render(rootSlot);
      container.appendChild(dom);

      const tableEl = dom.querySelector('.eq-matrix') as HTMLElement;
      const tokens = tableEl.querySelectorAll('.eq-token');
      const slots = tableEl.querySelectorAll('.eq-slot');

      // Artificially dirty child elements with selection classes
      tokens[0].classList.add('eq-selected-token');
      tokens[1].classList.add('eq-selected-token');
      slots[0].classList.add('eq-selected-slot', 'eq-partial-selected');
      slots[1].classList.add('eq-selected-slot');

      // Now parent structure is selected
      const selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, rootSlot, selection, null);

      expect(tableEl.classList.contains('eq-selected-structure')).toBe(true);

      // Verify all artificial classes were pruned
      expect(tableEl.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect(tableEl.querySelectorAll('.eq-selected-slot').length).toBe(0);
      expect(tableEl.querySelectorAll('.eq-partial-selected').length).toBe(0);
    });
  });

  // =========================================================================
  // BUG 4 ADVERSARIAL STRESS: Matrix Selection Delete via Shift+Arrow
  // =========================================================================
  describe('Bug 4: Matrix Selection Delete via Shift+Arrow from First Cell', () => {
    it('Stress 4.1: Delete key dissolves a 2x2 matrix when highlightedSlotId is set on first cell', () => {
      const docStr = '```math-word\n<math><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);
      const firstCell = (widget!.ast.children[0] as any).rows[0][0];
      widget!.caret = { slotId: firstCell.id, offset: 0 };

      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);

      // Shift+ArrowLeft on first cell sets highlightedSlotId
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(widget!.highlightedSlotId).toBe(firstCell.id);

      // Press Delete
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // Matrix must be dissolved
      expect(widget!.ast.children.find((child) => child.type === 'matrix')).toBeUndefined();
      expect(widget!.highlightedSlotId).toBeNull();

      view.destroy();
      c.remove();
    });

    it('Stress 4.2: Backspace key dissolves a 2x2 matrix when highlightedSlotId is set on first cell', () => {
      const docStr = '```math-word\n<math><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);
      const firstCell = (widget!.ast.children[0] as any).rows[0][0];
      widget!.caret = { slotId: firstCell.id, offset: 0 };

      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(widget!.highlightedSlotId).toBe(firstCell.id);

      // Press Backspace
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget!.ast.children.find((child) => child.type === 'matrix')).toBeUndefined();
      expect(widget!.highlightedSlotId).toBeNull();

      view.destroy();
      c.remove();
    });

    it('Stress 4.3: 3x3 matrix (9 cells) deletion via Shift+ArrowLeft from first cell and Delete', () => {
      const row = '<mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr>';
      const docStr = `\`\`\`math-word\n<math><mtable>${row}${row}${row}</mtable></math>\n\`\`\``;
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);
      const matrixNode = widget!.ast.children[0] as any;
      expect(matrixNode.rows.length).toBe(3);
      expect(matrixNode.rows[0].length).toBe(3);

      const firstCell = matrixNode.rows[0][0];
      widget!.caret = { slotId: firstCell.id, offset: 0 };

      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);

      // Shift+ArrowLeft on first cell
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(widget!.highlightedSlotId).toBe(firstCell.id);

      // Press Delete
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // 3x3 Matrix must be dissolved
      expect(widget!.ast.children.find((child) => child.type === 'matrix')).toBeUndefined();

      view.destroy();
      c.remove();
    });

    it('Stress 4.4: Pressing Shift+ArrowLeft twice elevates to structure selection, then Delete deletes the matrix node', () => {
      const docStr = '```math-word\n<math><mtable><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr><mtr><mtd><mrow></mrow></mtd><mtd><mrow></mrow></mtd></mtr></mtable></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, view.state.doc.length, (from, to, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      expect(widget).not.toBeNull();

      widget!.enterFromStart(view);
      const firstCell = (widget!.ast.children[0] as any).rows[0][0];
      widget!.caret = { slotId: firstCell.id, offset: 0 };

      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);

      // 1. First Shift+ArrowLeft: sets highlightedSlotId on firstCell
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(widget!.highlightedSlotId).toBe(firstCell.id);

      // 2. Second Shift+ArrowLeft: elevates to parent root slot selection covering matrix node
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(widget!.highlightedSlotId).toBeNull();
      expect(widget!.selection).not.toBeNull();
      expect(widget!.selection!.anchor.slotId).toBe(widget!.ast.id);
      expect(widget!.selection!.head.slotId).toBe(widget!.ast.id);

      // 3. Press Delete
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // Matrix must be deleted
      expect(widget!.ast.children.find((child) => child.type === 'matrix')).toBeUndefined();

      view.destroy();
      c.remove();
    });

    it('Stress 4.5: Populated matrix whole-selection deletion vs single-cell non-empty sibling preservation', () => {
      // 1. Populated matrix selected in parent slot: whole matrix is deleted
      const populatedMatrix = createMatrix([
        [createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [createToken('2', 'mn')])],
        [createSlot('cell', [createToken('3', 'mn')]), createSlot('cell', [createToken('4', 'mn')])],
      ]);
      const rootSlot = createSlot('root', [populatedMatrix]);

      const sel = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };
      const res = deleteSelection(rootSlot, sel);
      expect(res.root.children.length).toBe(0);

      // 2. When only the first cell is empty in a matrix with non-empty sibling cells:
      // deleteParentStructure MUST NOT dissolve the matrix; it moves caret to non-empty sibling!
      const semiMatrix = createMatrix([
        [createSlot('cell', []), createSlot('cell', [createToken('5', 'mn')])],
        [createSlot('cell', []), createSlot('cell', [])],
      ]);
      const semiRoot = createSlot('root', [semiMatrix]);
      const emptyFirstCell = (semiMatrix.rows[0][0]);

      const delRes = deleteParentStructure(semiRoot, emptyFirstCell.id);
      expect(delRes.handled).toBe(true);
      // Parent matrix must still exist
      expect(delRes.root.children[0].type).toBe('matrix');
      // Caret moved to the non-empty sibling slot (cell 0, 1)
      const nonEmptyCell = semiMatrix.rows[0][1];
      expect(delRes.caret.slotId).toBe(nonEmptyCell.id);
      expect(delRes.caret.offset).toBe(1);
    });
  });
});
