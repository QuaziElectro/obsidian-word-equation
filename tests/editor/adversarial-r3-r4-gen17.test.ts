/**
 * Gen17 Adversarial Stress Suite:
 * - R3 Clean EOF Exit: equations at EOF without trailing newlines, rapid ArrowRight/Down bursts, zero teleportation to headings.
 * - R4 Deletion Behaviors: post-equation Backspace (CRLF, inline, multiple blocks), inner Delete (empty, multi-character tokens, nested structures), inner Backspace at start (equation selection, subsequent deletion, empty immediate deletion).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  createMatrix,
  createSuperscript,
  createSubscript,
  createSubSup,
  updateParentPointers,
  resetIdCounter,
  isEquationEmpty,
  findSlotById,
} from '../../src/core/ast';
import { handleDelete, handleBackspace } from '../../src/editor/selection';
import {
  setupAccurateDomEnvironment,
  computeAndApplyLayout,
} from '../helpers/dom-layout-engine';

describe('Gen17 Adversarial Stress Suite: R3 (EOF Clean Exit) & R4 (Deletion Behaviors)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    document.body.innerHTML = '';
  });

  function getWidgets(view: EditorView): WordEquationWidget[] {
    const widgets: WordEquationWidget[] = [];
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(0, view.state.doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widgets.push((dec.spec as any).widget);
        }
      });
    }
    return widgets;
  }

  function getSingleWidgetAndDom(view: EditorView): { widget: WordEquationWidget; dom: HTMLElement } {
    const widgets = getWidgets(view);
    if (widgets.length === 0) throw new Error('No WordEquationWidget found');
    const widget = widgets[0];
    const dom = (view.dom.querySelector('.word-equation-block') ||
      view.dom.querySelector('.word-equation-inline')) as HTMLElement || widget.toDOM(view);
    return { widget, dom };
  }

  // =========================================================================
  // R3: Clean EOF Exit & Boundary Teleportation Bugs
  // =========================================================================
  describe('R3: Clean EOF Exit & Teleportation Immunity', () => {
    it('exits block equation at absolute EOF without trailing newline via ArrowRight without teleporting to headings', () => {
      // Exactly at EOF: no newline after closing backticks
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow>\n</math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      expect(widget.to).toBe(docStr.length);
      const initialDocLength = view.state.doc.length;

      // Enter from end
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // Press ArrowRight at EOF
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Focus must leave widget
      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();

      // Trailing newline must have been appended cleanly
      expect(view.state.doc.length).toBe(initialDocLength + 1);
      expect(view.state.doc.sliceString(initialDocLength, initialDocLength + 1)).toBe('\n');

      // Selection must be at EOF
      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);
      expect(view.state.selection.main.head).toBe(view.state.doc.length);

      // Zero teleportation: cursor must be strictly after the heading
      const headingLine = view.state.doc.line(1);
      expect(view.state.selection.main.anchor).toBeGreaterThan(headingLine.to);

      view.destroy();
      c.remove();
    });

    it('exits block equation at absolute EOF without trailing newline via ArrowDown without teleporting to headings', () => {
      const docStr = '## 1. Intro\n## 6. Shortcut Expansion Target\n```math-word\n<math><mrow><mi>z</mi></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromEnd(view);
      const initialDocLength = view.state.doc.length;

      // Press ArrowDown inside widget
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect(widget.isFocused).toBe(false);
      expect(view.state.doc.length).toBe(initialDocLength + 1);
      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);

      // Selection must not teleport to either heading 1 or heading 2
      const heading2 = view.state.doc.line(2);
      expect(view.state.selection.main.anchor).toBeGreaterThan(heading2.to);

      view.destroy();
      c.remove();
    });

    it('exits cleanly from an isolated equation on line 1 of an empty document (no headings, no trailing newline)', () => {
      // Document consists SOLELY of the equation block
      const docStr = '```math-word\n<math><mrow><mi>a</mi></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      expect(widget.from).toBe(0);
      expect(widget.to).toBe(docStr.length);

      widget.enterFromEnd(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(widget.isFocused).toBe(false);
      expect(view.state.doc.length).toBe(docStr.length + 1);
      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);

      view.destroy();
      c.remove();
    });

    it('exits cleanly from an isolated inline equation on line 1 of an empty document', () => {
      const docStr = '/weq_inline <math><mi>b</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromEnd(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(widget.isFocused).toBe(false);
      expect(view.state.selection.main.anchor).toBe(docStr.length);

      view.destroy();
      c.remove();
    });

    it('survives rapid repeated ArrowRight bursts at EOF (20 cycles) without teleporting or generating duplicate lines', () => {
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math><mrow><mi>k</mi></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromEnd(view);
      const initialDocLength = view.state.doc.length;

      // 1. First ArrowRight exits equation and appends '\n'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(view.state.doc.length).toBe(initialDocLength + 1);

      // 2. Rapid burst of 20 ArrowRight events on CodeMirror contentDOM at EOF
      for (let i = 0; i < 20; i++) {
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        // Ensure cursor does not teleport to heading
        const headingLine = view.state.doc.line(1);
        expect(view.state.selection.main.anchor, `Cycle ${i}: selection must not teleport to heading`).toBeGreaterThan(headingLine.to);
      }

      // Cursor must remain at EOF without throwing errors or corrupting document
      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);

      view.destroy();
      c.remove();
    });

    it('survives rapid repeated ArrowDown bursts at EOF (20 cycles) without teleporting', () => {
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math><mrow><mi>k</mi></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromEnd(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      for (let i = 0; i < 20; i++) {
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        const headingLine = view.state.doc.line(1);
        expect(view.state.selection.main.anchor, `Cycle ${i}: selection must not teleport to heading`).toBeGreaterThan(headingLine.to);
      }

      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);

      view.destroy();
      c.remove();
    });

    it('traverses back-to-back equations at EOF cleanly and exits to EOF without heading teleportation', () => {
      // Two back-to-back equations at EOF
      const docStr =
        '## 6. Shortcut Expansion Target\n' +
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const widgets = getWidgets(view);
      expect(widgets.length).toBe(2);

      const [w1, w2] = widgets;
      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || w1.toDOM(view);
      const dom2 = (view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement) || w2.toDOM(view);

      // 1. Enter first equation from start
      w1.enterFromStart(view);
      expect(w1.isFocused).toBe(true);

      // 2. ArrowRight inside first equation to exit it
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // pass 'A'
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // exit after

      // Cursor should land at start of line of w2
      expect(w1.isFocused).toBe(false);
      expect(view.state.selection.main.anchor).toBe(w2.from);

      // 3. ArrowRight from w2.from enters w2
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(w2.isFocused).toBe(true);

      // 4. ArrowRight inside w2 to exit it at EOF
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // pass 'B'
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // exit after at EOF

      expect(w2.isFocused).toBe(false);
      // Trailing newline appended and cursor at EOF
      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);
      expect(view.state.doc.sliceString(view.state.doc.length - 1, view.state.doc.length)).toBe('\n');

      // Heading untouched
      const headingLine = view.state.doc.line(1);
      expect(headingLine.text).toBe('## 6. Shortcut Expansion Target');
      expect(view.state.selection.main.anchor).toBeGreaterThan(headingLine.to);

      view.destroy();
      c.remove();
    });

    it('exits inline equation at EOF without trailing newline or space', () => {
      const docStr = '## Section Heading\nHere is inline: /weq_inline <math><mi>x</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromEnd(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(widget.isFocused).toBe(false);
      expect(view.state.selection.main.anchor).toBe(docStr.length);

      const headingLine = view.state.doc.line(1);
      expect(view.state.selection.main.anchor).toBeGreaterThan(headingLine.to);

      view.destroy();
      c.remove();
    });

    it('guarantees zero teleportation across a multi-heading document with complex sections', () => {
      const docStr =
        '# Document Title\n\n' +
        '## 1. Introduction\nSome text.\n\n' +
        '## 2. Methodology\nMore text.\n\n' +
        '## 6. Shortcut Expansion Target\n' +
        '```math-word\n<math><mrow><mi>f</mi><mo>(</mo><mi>x</mi><mo>)</mo></mrow></math>\n```';

      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromEnd(view);
      // ArrowRight exit at EOF
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const headings = [view.state.doc.line(1), view.state.doc.line(3), view.state.doc.line(6), view.state.doc.line(9)];
      for (const h of headings) {
        expect(view.state.selection.main.anchor).toBeGreaterThan(h.to);
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // R4: Deletion Behaviors & Teleportation
  // =========================================================================
  describe('R4: Deletion Behaviors — Rule 1: Post-Equation Backspace', () => {
    it('deletes block equation when Backspace is pressed with CRLF (\\r\\n) line endings', () => {
      const docStr = '## 6. Shortcut Expansion Target\r\n```math-word\r\n<math><mi>x</mi></math>\r\n```\r\nFollowing text';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget } = getSingleWidgetAndDom(view);
      const eqFrom = widget.from;

      // Position cursor at the beginning of "Following text"
      const curLine = view.state.doc.line(view.state.doc.lines);
      expect(curLine.text).toBe('Following text');
      view.dispatch({ selection: { anchor: curLine.from } });

      // Press Backspace in CodeMirror
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation block should be deleted cleanly, leaving heading and following text without corruption
      expect(view.state.doc.toString()).toBe('## 6. Shortcut Expansion Target\nFollowing text');
      expect(view.state.selection.main.anchor).toBe(eqFrom);

      // No equation decorations remain
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('deletes block equation with CRLF line endings at EOF with empty trailing line', () => {
      const docStr = '## 6. Shortcut Expansion Target\r\n```math-word\r\n<math><mi>x</mi></math>\r\n```\r\n';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget } = getSingleWidgetAndDom(view);
      const eqFrom = widget.from;

      // Position cursor at EOF (the empty line after equation)
      view.dispatch({ selection: { anchor: view.state.doc.length } });

      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(view.state.doc.toString()).toBe('## 6. Shortcut Expansion Target\n');
      expect(view.state.selection.main.anchor).toBe(eqFrom);
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('deletes inline equation cleanly when Backspace is pressed immediately after it', () => {
      const docStr = 'Prefix /weq_inline <math><mi>x</mi></math> /weq_inline suffix';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget } = getSingleWidgetAndDom(view);
      const eqFrom = widget.from;
      const eqTo = widget.to;

      // Position cursor immediately after inline equation
      view.dispatch({ selection: { anchor: eqTo } });

      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(view.state.doc.toString()).toBe('Prefix  suffix');
      expect(view.state.selection.main.anchor).toBe(eqFrom);
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('deletes three consecutive equations sequentially with post-equation Backspace', () => {
      const docStr =
        '## Heading\n' +
        '```math-word\n<math><mn>1</mn></math>\n```\n' +
        '```math-word\n<math><mn>2</mn></math>\n```\n' +
        '```math-word\n<math><mn>3</mn></math>\n```\n' +
        'End';

      const { view, container: c } = createMockEditor(docStr, [], true);
      expect(getWidgets(view).length).toBe(3);

      // 1. Delete Equation 3 from start of "End" line
      let lastLine = view.state.doc.line(view.state.doc.lines);
      expect(lastLine.text).toBe('End');
      view.dispatch({ selection: { anchor: lastLine.from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(getWidgets(view).length).toBe(2);
      expect(view.state.doc.toString()).not.toContain('<mn>3</mn>');

      // 2. Delete Equation 2 from start of "End" line
      lastLine = view.state.doc.line(view.state.doc.lines);
      view.dispatch({ selection: { anchor: lastLine.from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(getWidgets(view).length).toBe(1);
      expect(view.state.doc.toString()).not.toContain('<mn>2</mn>');

      // 3. Delete Equation 1 from start of "End" line
      lastLine = view.state.doc.line(view.state.doc.lines);
      view.dispatch({ selection: { anchor: lastLine.from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(getWidgets(view).length).toBe(0);
      expect(view.state.doc.toString()).toBe('## Heading\nEnd');

      view.destroy();
      c.remove();
    });

    it('deletes block equation at line 1 (no heading) with post-equation Backspace', () => {
      const docStr = '```math-word\n<math><mi>x</mi></math>\n```\nFollowing text';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const lastLine = view.state.doc.line(view.state.doc.lines);
      view.dispatch({ selection: { anchor: lastLine.from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(view.state.doc.toString()).toBe('Following text');
      expect(view.state.selection.main.anchor).toBe(0);

      view.destroy();
      c.remove();
    });
  });

  describe('R4: Deletion Behaviors — Rule 2: Inner Delete on Empty Equation', () => {
    it('deletes completely empty block equation when Delete is pressed inside it', () => {
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);
      const eqFrom = widget.from;

      widget.enterFromStart(view);
      expect(isEquationEmpty(widget.ast)).toBe(true);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(view.state.doc.toString()).toBe('## 6. Shortcut Expansion Target\n');
      expect(view.state.selection.main.anchor).toBe(eqFrom);
      expect(getActiveEquationState()).toBeNull();
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('deletes completely empty inline equation when Delete is pressed inside it', () => {
      const docStr = 'Prefix /weq_inline <math><mrow></mrow></math> /weq_inline suffix';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);
      const eqFrom = widget.from;

      widget.enterFromStart(view);
      expect(isEquationEmpty(widget.ast)).toBe(true);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(view.state.doc.toString()).toBe('Prefix  suffix');
      expect(view.state.selection.main.anchor).toBe(eqFrom);
      expect(getActiveEquationState()).toBeNull();
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('deletes equation with only an empty token or placeholder when Delete is pressed inside it', () => {
      const docStr = '```math-word\n<math><mrow><mo></mo></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(isEquationEmpty(widget.ast)).toBe(true);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(view.state.doc.toString()).toBe('');
      expect(getActiveEquationState()).toBeNull();

      view.destroy();
      c.remove();
    });
  });

  describe('R4: Deletion Behaviors — Rule 3: Inner Delete on Non-Empty Equation', () => {
    it('deletes character-by-character from multi-character token using handleDelete', () => {
      const root = createSlot('root', [createToken('123', 'mn')]);
      const caret = { slotId: root.id, offset: 0 };

      // Delete at offset 0 deletes '1' -> leaves '23'
      let res = handleDelete(root, caret);
      expect(res.handled).toBe(true);
      expect((res.root.children[0] as any).text).toBe('23');
      expect(res.caret.offset).toBe(0);

      // Next Delete at offset 0 deletes '2' -> leaves '3'
      res = handleDelete(res.root, caret);
      expect(res.handled).toBe(true);
      expect((res.root.children[0] as any).text).toBe('3');
      expect(res.caret.offset).toBe(0);

      // Next Delete at offset 0 deletes '3' -> deletes token entirely
      res = handleDelete(res.root, caret);
      expect(res.handled).toBe(true);
      expect(res.root.children.length).toBe(0);
      expect(res.caret.offset).toBe(0);
    });

    it('deletes nested structural box (fraction) inside equation without corrupting remaining siblings', () => {
      const frac = createFraction(
        createSlot('numerator', [createToken('1', 'mn')]),
        createSlot('denominator', [createToken('2', 'mn')])
      );
      const root = createSlot('root', [
        createToken('a', 'mi'),
        createToken('+', 'mo'),
        frac,
        createToken('=', 'mo'),
        createToken('0', 'mn'),
      ]);
      updateParentPointers(root);

      // Caret right before fraction (offset 2)
      const caret = { slotId: root.id, offset: 2 };
      const res = handleDelete(root, caret);

      expect(res.handled).toBe(true);
      expect(res.root.children.length).toBe(4);
      expect((res.root.children[0] as any).text).toBe('a');
      expect((res.root.children[1] as any).text).toBe('+');
      expect((res.root.children[2] as any).text).toBe('=');
      expect((res.root.children[3] as any).text).toBe('0');
      expect(res.caret.offset).toBe(2);
    });

    it('deletes elements inside multi-level nested fraction', () => {
      // 1 / (2 / 3)
      const innerNum = createSlot('numerator', [createToken('2', 'mn')]);
      const innerDen = createSlot('denominator', [createToken('3', 'mn')]);
      const innerFrac = createFraction(innerNum, innerDen);
      const outerNum = createSlot('numerator', [createToken('1', 'mn')]);
      const outerDen = createSlot('denominator', [innerFrac]);
      const outerFrac = createFraction(outerNum, outerDen);
      const root = createSlot('root', [outerFrac]);
      updateParentPointers(root);

      // Caret inside innerNum at offset 0
      const innerNumSlot = findSlotById(root, innerNum.id)!;
      expect(innerNumSlot).not.toBeNull();
      let caret = { slotId: innerNum.id, offset: 0 };

      // Delete inside innerNum deletes '2'
      let res = handleDelete(root, caret);
      expect(res.handled).toBe(true);
      const updatedInnerNum = findSlotById(res.root, innerNum.id)!;
      expect(updatedInnerNum.children.length).toBe(0);

      // Now caret inside innerDen at offset 0
      caret = { slotId: innerDen.id, offset: 0 };
      res = handleDelete(res.root, caret);
      expect(res.handled).toBe(true);
      const updatedInnerDen = findSlotById(res.root, innerDen.id)!;
      expect(updatedInnerDen.children.length).toBe(0);
    });

    it('deletes elements inside 2x2 matrix cell cleanly', () => {
      const cell00 = createSlot('cell', [createToken('a', 'mi')]);
      const cell01 = createSlot('cell', [createToken('b', 'mi')]);
      const cell10 = createSlot('cell', [createToken('c', 'mi')]);
      const cell11 = createSlot('cell', [createToken('d', 'mi')]);
      const matrix = createMatrix([[cell00, cell01], [cell10, cell11]]);
      const root = createSlot('root', [matrix]);
      updateParentPointers(root);

      // Delete in cell00 at offset 0
      const caret = { slotId: cell00.id, offset: 0 };
      const res = handleDelete(root, caret);

      expect(res.handled).toBe(true);
      const updatedCell00 = findSlotById(res.root, cell00.id)!;
      expect(updatedCell00.children.length).toBe(0);

      // Other cells remain intact
      const updatedCell01 = findSlotById(res.root, cell01.id)!;
      expect((updatedCell01.children[0] as any).text).toBe('b');
    });


    it('deletes elements inside square root / radical structure', () => {
      const radicand = createSlot('radicand', [
        createToken('x', 'mi'),
        createToken('+', 'mo'),
        createToken('1', 'mn'),
      ]);
      const rad = createRadical(radicand);
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      // Delete inside radicand at offset 1 ('+')
      const caret = { slotId: radicand.id, offset: 1 };
      const res = handleDelete(root, caret);

      expect(res.handled).toBe(true);
      const updatedRadicand = findSlotById(res.root, radicand.id)!;
      expect(updatedRadicand.children.length).toBe(2);
      expect((updatedRadicand.children[0] as any).text).toBe('x');
      expect((updatedRadicand.children[1] as any).text).toBe('1');
    });

    it('handles Delete gracefully at empty child slots and at end of slots without crashing', () => {
      const emptySlot = createSlot('numerator', []);
      const denSlot = createSlot('denominator', [createToken('y', 'mi')]);
      const frac = createFraction(emptySlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Caret in empty slot
      const caret = { slotId: emptySlot.id, offset: 0 };
      const res = handleDelete(root, caret);

      expect(res.handled).toBe(false);
      expect(res.root).toBe(root);
    });
  });

  describe('R4: Deletion Behaviors — Rule 4: Inner Backspace at Start', () => {
    it('selects the entire equation in CodeMirror when Backspace is pressed at start of non-empty equation', () => {
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow>\n</math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);
      expect(isEquationEmpty(widget.ast)).toBe(false);

      // Press Backspace inside at offset 0
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Focus leaves widget
      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();

      // Selection must span the entire equation
      const sel = view.state.selection.main;
      expect(sel.empty).toBe(false);
      expect(sel.from).toBe(widget.from);
      expect(sel.to).toBe(widget.to);

      // Selection head must be at widget.from (NOT at heading)
      expect(sel.head).toBe(widget.from);
      const headingLine = view.state.doc.line(1);
      expect(sel.head).toBeGreaterThan(headingLine.to);

      // Subsequent Backspace on CodeMirror deletes the selected equation
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(view.state.doc.toString()).toBe('## 6. Shortcut Expansion Target\n');
      expect(view.state.selection.main.anchor).toBe(widget.from);
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('immediately deletes empty equation when Backspace is pressed at start without needing second Backspace', () => {
      const docStr = '## Heading\n```math-word\n<math><mrow></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);
      const eqFrom = widget.from;

      widget.enterFromStart(view);
      expect(isEquationEmpty(widget.ast)).toBe(true);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(view.state.doc.toString()).toBe('## Heading\n');
      expect(view.state.selection.main.anchor).toBe(eqFrom);
      expect(getActiveEquationState()).toBeNull();
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('navigates internally when Backspace is pressed at start of nested slot instead of selecting entire equation', () => {
      // Fraction with numerator '1' and denominator '2'
      const numSlot = createSlot('numerator', [createToken('1', 'mn')]);
      const denSlot = createSlot('denominator', [createToken('2', 'mn')]);
      const frac = createFraction(numSlot, denSlot);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Backspace at offset 0 of denominator should move caret to numerator, NOT select equation
      const caret = { slotId: denSlot.id, offset: 0 };
      const res = handleBackspace(root, caret);

      expect(res.handled).toBe(true);
      expect(res.exitDirection).toBeUndefined();
      expect(res.caret.slotId).toBe(numSlot.id);
      expect(res.caret.offset).toBe(1);
    });

    it('dissolves empty superscript when Backspace is pressed at offset 0 of sup slot', () => {
      const baseSlot = createSlot('base', [createToken('x', 'mi')]);
      const supSlot = createSlot('sup', []);
      const sup = createSuperscript(baseSlot, supSlot);
      const root = createSlot('root', [sup]);
      updateParentPointers(root);

      const caret = { slotId: supSlot.id, offset: 0 };
      const res = handleBackspace(root, caret);

      expect(res.handled).toBe(true);
      // Sup is dissolved into base 'x'
      expect(res.root.children.length).toBe(1);
      expect((res.root.children[0] as any).text).toBe('x');
    });
  });

  // =========================================================================
  // Rapid Burst Stress Testing
  // =========================================================================
  describe('Rapid Burst Stress Testing', () => {
    it('survives rapid Backspace bursts (30 cycles) from within a non-empty equation down to total deletion', () => {
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // Fire 3 Backspaces inside equation to delete c, b, a
      for (let i = 0; i < 3; i++) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      }

      // Now equation is empty! Next Backspace should immediately delete it
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(getActiveEquationState()).toBeNull();
      expect(view.state.doc.toString()).toBe('## 6. Shortcut Expansion Target\n');

      // Subsequent 20 Backspaces on CodeMirror contentDOM must not throw or corrupt document
      for (let i = 0; i < 20; i++) {
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      }

      view.destroy();
      c.remove();
    });

    it('survives rapid Delete bursts (30 cycles) from within a non-empty equation down to total deletion', () => {
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math><mrow><mi>x</mi><mi>y</mi><mi>z</mi></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);

      // Fire 3 Deletes inside equation to delete x, y, z
      for (let i = 0; i < 3; i++) {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      }

      // Equation is now empty. Next Delete deletes the equation
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(getActiveEquationState()).toBeNull();
      expect(view.state.doc.toString()).toBe('## 6. Shortcut Expansion Target\n');

      // Subsequent 20 Deletes on CodeMirror contentDOM
      for (let i = 0; i < 20; i++) {
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      }

      view.destroy();
      c.remove();
    });

    it('survives alternating ArrowRight and Backspace stress bursts without unhandled exceptions', () => {
      const docStr = '## 6. Shortcut Expansion Target\n```math-word\n<math><mrow><mi>m</mi></mrow></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromStart(view);

      // Alternating ArrowRight and ArrowLeft
      for (let i = 0; i < 20; i++) {
        const key = i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
        dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }

      expect(widget.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });

    it('selects and subsequently deletes an inline equation when Backspace is pressed at offset 0', () => {
      const docStr = 'Prefix /weq_inline <math><mi>x</mi></math> /weq_inline suffix';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget, dom } = getSingleWidgetAndDom(view);

      widget.enterFromStart(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.caret.offset).toBe(0);

      // Backspace inside inline equation at start selects it in CodeMirror
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(widget.isFocused).toBe(false);
      expect(view.state.selection.main.empty).toBe(false);
      expect(view.state.selection.main.from).toBe(widget.from);
      expect(view.state.selection.main.to).toBe(widget.to);

      // Subsequent Backspace in CodeMirror deletes it
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(view.state.doc.toString()).toBe('Prefix  suffix');
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('deletes block equation when Delete is pressed in CodeMirror immediately before it', () => {
      const docStr = '## Heading\n```math-word\n<math><mi>x</mi></math>\n```\nFollowing text';
      const { view, container: c } = createMockEditor(docStr, [], true);
      const { widget } = getSingleWidgetAndDom(view);

      // Position cursor at the end of "## Heading" (immediately before the block)
      const headingLine = view.state.doc.line(1);
      view.dispatch({ selection: { anchor: headingLine.to } });

      // Press Delete in CodeMirror
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(view.state.doc.toString()).toBe('## Heading\nFollowing text');
      expect(getWidgets(view).length).toBe(0);

      view.destroy();
      c.remove();
    });
  });
});

