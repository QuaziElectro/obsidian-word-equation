/**
/**
 * Challenger Gen 62 Adversarial Stress Test Suite
 * Author: teamwork_preview_challenger_p2_1_gen62
 *
 * Rigorous empirical stress-testing covering:
 * 1. Bug 1 Stress Scenarios:
 *    - Clusters of 3, 4, and 5 consecutive block equations without empty lines.
 *    - Rapid back-and-forth arrow traversal through consecutive block equations (checking newline stability & no desync).
 *    - Exiting into the collapsed gap line, typing text (verifying gap line expands and loses collapsed class), then backspacing to empty (verifying gap line re-collapses).
 *    - Enter/exit sequences with mixed inline and consecutive block equations.
 * 2. Bug 2 Stress Scenarios:
 *    - Deeply nested fractions inside InteractiveEquationBox: Shift+Arrow selection expanding across nested levels.
 *    - Selection collapse with ArrowLeft/ArrowRight from reversed selections (anchor > head, single-slot & multi-slot).
 *    - Rapid drag selection sequences, selection cancellation via click outside, multi-click selections.
 *    - Partial copy of nested subtrees and pasting into empty and non-empty slots.
 * 3. Bug 3 Stress Scenarios:
 *    - Command palette inspection: verify listCommands() contains strictly 1 command with name 'Insert Block Equation' (case-insensitive) and 1 with name 'Insert Inline Equation' (case-insensitive) across Map and plain-object command maps.
 *    - Legacy command ID execution: verify calling executeCommandById('insert-word-equation') and executeCommandById('insert-word-equation-inline') (and namespaced variants) still functions cleanly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createMockEditor } from '../helpers/cm6-mock';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { wordEquationStateField, buildCollapsedGapDecorations } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import WordEquationPlugin, { DEFAULT_SETTINGS } from '../../src/main';
import { findSlotById, getAllSlotsInOrder, normalizeSelection } from '../../src/core/ast';
import { SlotNode } from '../../src/core/types';

describe('Challenger Gen 62 Adversarial Stress Suite', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  function createMockClipboardEvent(
    type: 'copy' | 'cut' | 'paste',
    data: Record<string, string> = {}
  ): ClipboardEvent {
    const store: Record<string, string> = { ...data };
    const event = new Event(type, { bubbles: true, cancelable: true }) as any;

    const clipboardData = {
      getData: (format: string) => store[format] || '',
      setData: (format: string, val: string) => {
        store[format] = val;
        return true;
      },
      clearData: (format?: string) => {
        if (format) delete store[format];
        else {
          for (const k of Object.keys(store)) delete store[k];
        }
      },
      types: Object.keys(store),
    };

    Object.defineProperty(event, 'clipboardData', {
      value: clipboardData,
      writable: true,
    });

    return event as ClipboardEvent;
  }

  function getWidgets(view: any): WordEquationWidget[] {
    const widgets: WordEquationWidget[] = [];
    const decorations = view.state.field(wordEquationStateField, false);
    decorations?.between(0, view.state.doc.length, (from: number, to: number, dec: any) => {
      const w = dec?.widget || (dec.spec as any)?.widget;
      if (w instanceof WordEquationWidget) {
        widgets.push(w);
      }
    });
    return widgets;
  }

  beforeEach(() => {
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
  // BUG 1 STRESS TESTING: Consecutive Block Equations
  // =========================================================================
  describe('Bug 1 Adversarial Stress Testing', () => {
    it('Cluster of 3 consecutive block equations without empty lines: sequential forward traversal', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```\n' +
        '```math-word\n<math><mi>C</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const widgets = getWidgets(view);
      expect(widgets.length).toBe(3);
      const [w1, w2, w3] = widgets;

      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || w1.toDOM(view);
      const dom2 = (view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement) || w2.toDOM(view);
      const dom3 = (view.dom.querySelectorAll('.word-equation-block')[2] as HTMLElement) || w3.toDOM(view);

      // 1. Enter Equation 1
      w1.enterFromStart(view);
      expect(w1.isFocused).toBe(true);

      // 2. ArrowRight to pass 'A' then exit forward
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Caret must land on gap line between Eq 1 and Eq 2
      expect(w1.isFocused).toBe(false);
      let curPos = view.state.selection.main.anchor;
      let curLine = view.state.doc.lineAt(curPos);
      expect(curLine.length).toBe(0);

      let gapDecs = buildCollapsedGapDecorations(view.state);
      let foundGap = false;
      gapDecs.between(curLine.from, curLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) foundGap = true;
      });
      expect(foundGap).toBe(true);

      // 3. ArrowRight from gap line enters Equation 2
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('B');

      // 4. ArrowRight past 'B' and exit forward from Eq 2
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Caret must land on gap line between Eq 2 and Eq 3
      curPos = view.state.selection.main.anchor;
      curLine = view.state.doc.lineAt(curPos);
      expect(curLine.length).toBe(0);

      gapDecs = buildCollapsedGapDecorations(view.state);
      foundGap = false;
      gapDecs.between(curLine.from, curLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) foundGap = true;
      });
      expect(foundGap).toBe(true);

      // 5. ArrowRight from gap line enters Equation 3
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('C');

      // 6. ArrowRight past 'C' and exit forward from Eq 3
      dom3.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom3.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Now exited past Eq 3 (end of document)
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Cluster of 4 consecutive block equations without empty lines: full traversal across all 4 equations', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```\n' +
        '```math-word\n<math><mi>C</mi></math>\n```\n' +
        '```math-word\n<math><mi>D</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const widgets = getWidgets(view);
      expect(widgets.length).toBe(4);

      // Enter Equation 1
      widgets[0].enterFromStart(view);
      expect(widgets[0].isFocused).toBe(true);

      for (let i = 0; i < 3; i++) {
        const dom = (view.dom.querySelectorAll('.word-equation-block')[i] as HTMLElement) || widgets[i].toDOM(view);
        // Step through character and exit forward
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

        // Verify intermediate gap line
        const curPos = view.state.selection.main.anchor;
        const curLine = view.state.doc.lineAt(curPos);
        expect(curLine.length).toBe(0);

        const gapDecs = buildCollapsedGapDecorations(view.state);
        let foundGap = false;
        gapDecs.between(curLine.from, curLine.to, (f, t, d) => {
          if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) foundGap = true;
        });
        expect(foundGap).toBe(true);

        // ArrowRight enters next equation
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(getActiveEquationState()?.isFocused).toBe(true);
      }

      // Inside Eq 4 (D)
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('D');

      view.destroy();
      c.remove();
    });

    it('Cluster of 5 consecutive block equations without empty lines: full backward traversal from Eq 5 to Eq 1', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```\n' +
        '```math-word\n<math><mi>C</mi></math>\n```\n' +
        '```math-word\n<math><mi>D</mi></math>\n```\n' +
        '```math-word\n<math><mi>E</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const widgets = getWidgets(view);
      expect(widgets.length).toBe(5);

      // 1. Enter Equation 5 from end
      widgets[4].enterFromEnd(view);
      expect(widgets[4].isFocused).toBe(true);

      const expectedLetters = ['E', 'D', 'C', 'B', 'A'];

      for (let i = 4; i > 0; i--) {
        const dom = (view.dom.querySelectorAll('.word-equation-block')[i] as HTMLElement) || widgets[i].toDOM(view);

        // Step past char to the left and exit backward
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

        // Caret lands on gap line between equations
        const curPos = view.state.selection.main.anchor;
        const curLine = view.state.doc.lineAt(curPos);
        expect(curLine.length).toBe(0);

        const gapDecs = buildCollapsedGapDecorations(view.state);
        let foundGap = false;
        gapDecs.between(curLine.from, curLine.to, (f, t, d) => {
          if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) foundGap = true;
        });
        expect(foundGap).toBe(true);

        // ArrowLeft enters previous equation from end
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(getActiveEquationState()?.isFocused).toBe(true);
        expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe(expectedLetters[5 - i]);
      }

      // Now inside Eq 1 (A)
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('A');

      view.destroy();
      c.remove();
    });

    it('Rapid back-and-forth arrow traversal does not proliferate newlines or cause desync', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const initialLineCount = view.state.doc.lines;

      let widgets = getWidgets(view);
      widgets[0].enterFromStart(view);

      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || widgets[0].toDOM(view);

      // Exit Eq 1 forward into gap line
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Exactly 1 line added for gap
      expect(view.state.doc.lines).toBe(initialLineCount + 1);

      // Perform 8 rapid back-and-forth oscillations across gap line
      for (let cycle = 0; cycle < 8; cycle++) {
        // ArrowLeft: re-enter Eq 1 from end
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(getActiveEquationState()?.isFocused).toBe(true);
        expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('A');

        // ArrowRight: exit Eq 1 forward to gap line
        dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(getActiveEquationState()?.isFocused).toBeFalsy();

        // ArrowRight: enter Eq 2 from start
        view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(getActiveEquationState()?.isFocused).toBe(true);
        expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('B');

        const activeW2 = getWidgets(view).find((w) => w.code.includes('B'));
        const dom2 = (view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement) || activeW2!.toDOM(view);

        // ArrowLeft: exit Eq 2 backward to gap line
        dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(getActiveEquationState()?.isFocused).toBeFalsy();

        // Total lines must remain invariant across repeated oscillations
        expect(view.state.doc.lines).toBe(initialLineCount + 1);
      }

      view.destroy();
      c.remove();
    });

    it('Exiting into gap line, typing text (expands/removes collapsed gap), then backspacing to empty (re-collapses gap)', () => {
      const docStr =
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const widgets = getWidgets(view);
      widgets[0].enterFromStart(view);
      const dom1 = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || widgets[0].toDOM(view);

      // 1. Exit forward into gap line
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const gapPos = view.state.selection.main.anchor;
      let gapLine = view.state.doc.lineAt(gapPos);
      expect(gapLine.length).toBe(0);

      // Verify collapsed gap decoration present initially
      let gapDecs = buildCollapsedGapDecorations(view.state);
      let hasCollapsed = false;
      gapDecs.between(gapLine.from, gapLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) hasCollapsed = true;
      });
      expect(hasCollapsed).toBe(true);

      // 2. User types text on the gap line
      view.dispatch({
        changes: { from: gapPos, insert: 'Adversarial Test Text' },
        selection: { anchor: gapPos + 21 },
      });

      gapLine = view.state.doc.lineAt(view.state.selection.main.anchor);
      expect(gapLine.length).toBe(21);

      // Verify collapsed gap decoration is REMOVED
      gapDecs = buildCollapsedGapDecorations(view.state);
      let hasCollapsedAfterTyping = false;
      gapDecs.between(gapLine.from, gapLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) hasCollapsedAfterTyping = true;
      });
      expect(hasCollapsedAfterTyping).toBe(false);

      // 3. User backspaces all characters until line is empty again
      view.dispatch({
        changes: { from: gapLine.from, to: gapLine.to, insert: '' },
        selection: { anchor: gapLine.from },
      });

      gapLine = view.state.doc.lineAt(gapLine.from);
      expect(gapLine.length).toBe(0);

      // Verify collapsed gap decoration RE-COLLAPSES
      gapDecs = buildCollapsedGapDecorations(view.state);
      let hasCollapsedAfterBackspace = false;
      gapDecs.between(gapLine.from, gapLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) hasCollapsedAfterBackspace = true;
      });
      expect(hasCollapsedAfterBackspace).toBe(true);

      // 4. ArrowRight from re-collapsed gap line still successfully enters Equation 2
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('B');

      view.destroy();
      c.remove();
    });

    it('Enter/exit sequences with mixed inline and consecutive block equations', () => {
      const docStr =
        'Prefix line with inline /weq_inline <math><mi>x</mi></math> /weq_inline equation.\n' +
        '```math-word\n<math><mi>A</mi></math>\n```\n' +
        '```math-word\n<math><mi>B</mi></math>\n```\n' +
        'Suffix line with inline /weq_inline <math><mi>y</mi></math> /weq_inline equation.';
      const { view, container: c } = createMockEditor(docStr, [], true);

      const widgets = getWidgets(view);
      const inlineWidgets = widgets.filter((w) => w.isInline);
      const blockWidgets = widgets.filter((w) => !w.isInline);

      expect(inlineWidgets.length).toBe(2);
      expect(blockWidgets.length).toBe(2);

      // 1. Exiting block Eq A forward creates collapsed gap line before block Eq B
      blockWidgets[0].enterFromStart(view);
      const domA = (view.dom.querySelectorAll('.word-equation-block')[0] as HTMLElement) || blockWidgets[0].toDOM(view);
      domA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      domA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const gapPos = view.state.selection.main.anchor;
      const gapLine = view.state.doc.lineAt(gapPos);
      expect(gapLine.length).toBe(0);

      const gapDecs = buildCollapsedGapDecorations(view.state);
      let hasGap = false;
      gapDecs.between(gapLine.from, gapLine.to, (f, t, d) => {
        if ((d.spec as any)?.class?.includes('word-equation-collapsed-gap')) hasGap = true;
      });
      expect(hasGap).toBe(true);

      // 2. ArrowRight enters block Eq B
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(getActiveEquationState()?.isFocused).toBe(true);
      expect((getActiveEquationState()?.ast?.children[0] as any)?.text).toBe('B');

      // 3. Exiting block Eq B forward exits into suffix line (does NOT insert implicit gap line because suffix is text)
      const domB = (view.dom.querySelectorAll('.word-equation-block')[1] as HTMLElement) || blockWidgets[1].toDOM(view);
      domB.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      domB.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      const suffixPos = view.state.selection.main.anchor;
      const suffixLine = view.state.doc.lineAt(suffixPos);
      expect(suffixLine.text).toContain('Suffix line');

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 2 STRESS TESTING: Settings InteractiveEquationBox Feature Parity
  // =========================================================================
  describe('Bug 2 Adversarial Stress Testing', () => {
    let boxContainer: HTMLElement;
    let box: InteractiveEquationBox;

    beforeEach(() => {
      boxContainer = document.createElement('div');
      container.appendChild(boxContainer);
    });

    afterEach(() => {
      if (box) box.destroy();
      boxContainer.remove();
    });

    it('Deeply nested 3-level fractions: Shift+Arrow expands across nested structural levels', () => {
      // 3-level fraction: 1 / (2 / (3 / 4))
      const nestedXml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac>' +
        '<mn>1</mn>' +
        '<mfrac>' +
        '<mn>2</mn>' +
        '<mfrac>' +
        '<mn>3</mn>' +
        '<mn>4</mn>' +
        '</mfrac>' +
        '</mfrac>' +
        '</mfrac>' +
        '</math>';

      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: nestedXml,
        onChange: () => {},
      });

      box.focus();

      // Find innermost slot containing '4'
      const allSlots = getAllSlotsInOrder(box.ast);
      const slot4 = allSlots.find((s) => s.children.some((c: any) => c.text === '4'));
      expect(slot4).toBeDefined();

      box.caret = { slotId: slot4!.id, offset: 0 };
      box.selection = null;

      // 1. Shift+ArrowRight inside slot '4' selects '4'
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.slotId).toBe(slot4!.id);
      expect(box.selection!.head.offset).toBe(1);

      // 2. Next Shift+ArrowRight steps selection to parent structure
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      expect(box.selection).not.toBeNull();
      // Selection or highlightedSlotId should elevate
      const sel2 = box.selection as any;
      const isElevated =
        sel2?.anchor?.slotId !== slot4!.id ||
        sel2?.head?.slotId !== slot4!.id ||
        Boolean(box.highlightedSlotId);
      expect(isElevated).toBe(true);
    });

    it('Deeply nested fractions: Shift+ArrowLeft expands backwards across nested structural levels', () => {
      // 3-level fraction: ((1 / 2) / 3) / 4
      const nestedXml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
        '<mfrac>' +
        '<mfrac>' +
        '<mfrac>' +
        '<mn>1</mn>' +
        '<mn>2</mn>' +
        '</mfrac>' +
        '<mn>3</mn>' +
        '</mfrac>' +
        '<mn>4</mn>' +
        '</mfrac>' +
        '</math>';

      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: nestedXml,
        onChange: () => {},
      });

      box.focus();

      // Find innermost slot containing '1'
      const allSlots = getAllSlotsInOrder(box.ast);
      const slot1 = allSlots.find((s) => s.children.some((c: any) => c.text === '1'));
      expect(slot1).toBeDefined();

      box.caret = { slotId: slot1!.id, offset: 1 };
      box.selection = null;

      // 1. Shift+ArrowLeft inside slot '1' selects '1' backward
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.slotId).toBe(slot1!.id);
      expect(box.selection!.head.offset).toBe(0);

      // 2. Next Shift+ArrowLeft steps selection backwards to parent structure
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
      expect(box.selection).not.toBeNull();
      const selBack = box.selection as any;
      const isElevated =
        selBack?.anchor?.slotId !== slot1!.id ||
        selBack?.head?.slotId !== slot1!.id ||
        Boolean(box.highlightedSlotId);
      expect(isElevated).toBe(true);
    });

    it('Selection collapse with ArrowLeft/ArrowRight from reversed selections (anchor > head)', () => {
      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: '<math><mi>a</mi><mo>+</mo><mi>b</mi><mo>+</mo><mi>c</mi></math>',
        onChange: () => {},
      });

      box.focus();

      // 1. Establish reversed selection in root slot: anchor=4 ('+'), head=1 ('+')
      // Span covers 'a+b+' (indices 1 to 4)
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 4 },
        head: { slotId: box.ast.id, offset: 1 },
      };

      // Unshifted ArrowLeft MUST collapse to the leftmost boundary (offset 1)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.slotId).toBe(box.ast.id);
      expect(box.caret.offset).toBe(1);

      // 2. Re-establish reversed selection: anchor=4, head=1
      box.selection = {
        anchor: { slotId: box.ast.id, offset: 4 },
        head: { slotId: box.ast.id, offset: 1 },
      };

      // Unshifted ArrowRight MUST collapse to the rightmost boundary (offset 4)
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: false, bubbles: true }));
      expect(box.selection).toBeNull();
      expect(box.caret.slotId).toBe(box.ast.id);
      expect(box.caret.offset).toBe(4);
    });

    it('Rapid drag selection sequences, selection cancellation via click outside, multi-click selections', () => {
      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: '<math><mi>x</mi><mo>+</mo><mfrac><mn>1</mn><mn>2</mn></mfrac></math>',
        onChange: () => {},
      });

      box.focus();

      // 1. Multi-click: Double-click selects slot
      const token1 = box.dom.querySelector('.eq-token') as HTMLElement;
      expect(token1).not.toBeNull();
      token1.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
      expect(box.selection).not.toBeNull();

      // 2. Click outside equation clears selection and unfocuses
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(box.isFocused).toBe(false);
      expect(box.selection).toBeNull();

      // 3. Multi-click: Triple-click selects entire root placeholder
      box.focus();
      token1.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 3 }));
      expect(box.selection).not.toBeNull();
      expect(box.selection!.anchor.slotId).toBe(box.ast.id);
      expect(box.selection!.anchor.offset).toBe(0);
      expect(box.selection!.head.offset).toBe(box.ast.children.length);

      // 4. Click outside cancels again
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(box.selection).toBeNull();

      // 5. Pointer drag sequence
      box.focus();
      box.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 10, buttons: 1 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 150, clientY: 10 }));

      expect(box.isFocused).toBe(true);

      // 6. Arrow collapse after drag
      box.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(box.selection).toBeNull();
    });

    it('Partial copy of nested subtrees and pasting into empty and non-empty slots', () => {
      box = new InteractiveEquationBox({
        container: boxContainer,
        initialContent: '<math><mfrac><mn>1</mn><mfrac><mn>2</mn><mn>3</mn></mfrac></mfrac></math>',
        onChange: () => {},
      });

      box.focus();

      // Select inner fraction 2/3
      const allSlots = getAllSlotsInOrder(box.ast);
      const slot2 = allSlots.find((s) => s.children.some((c: any) => c.text === '2'));
      expect(slot2).toBeDefined();

      // Parent of slot2 is the inner fraction
      const fracSlot = allSlots.find((s) =>
        s.children.some((c: any) => c.type === 'fraction' && c.numerator?.id === slot2?.id)
      );
      expect(fracSlot).toBeDefined();

      const fracIndex = fracSlot!.children.findIndex(
        (c: any) => c.type === 'fraction' && c.numerator?.id === slot2?.id
      );
      expect(fracIndex).not.toBe(-1);

      box.selection = {
        anchor: { slotId: fracSlot!.id, offset: fracIndex },
        head: { slotId: fracSlot!.id, offset: fracIndex + 1 },
      };

      // 1. Copy selected inner fraction
      const copyEvt = createMockClipboardEvent('copy');
      box.dom.dispatchEvent(copyEvt);

      const mathml = copyEvt.clipboardData!.getData('application/mathml+xml');
      expect(mathml).toContain('<mfrac>');
      expect(mathml).toContain('<mn>2</mn>');
      expect(mathml).toContain('<mn>3</mn>');

      // 2. Paste into a new empty box
      const box2Container = document.createElement('div');
      container.appendChild(box2Container);
      const box2 = new InteractiveEquationBox({
        container: box2Container,
        initialContent: '',
        onChange: () => {},
      });
      box2.focus();

      const pasteEvt = createMockClipboardEvent('paste', {
        'application/mathml+xml': mathml,
      });
      box2.dom.dispatchEvent(pasteEvt);

      const xml2 = box2.getXml();
      expect(xml2).toContain('<mfrac>');
      expect(xml2).toContain('<mn>2</mn>');
      expect(xml2).toContain('<mn>3</mn>');
      box2.destroy();
      box2Container.remove();

      // 3. Paste over existing selection in a non-empty slot (replacement)
      const box3Container = document.createElement('div');
      container.appendChild(box3Container);
      const box3 = new InteractiveEquationBox({
        container: box3Container,
        initialContent: '<math><mi>x</mi><mo>+</mo><mi>y</mi></math>',
        onChange: () => {},
      });
      box3.focus();

      // Select 'y' (offset 2 to 3)
      box3.selection = {
        anchor: { slotId: box3.ast.id, offset: 2 },
        head: { slotId: box3.ast.id, offset: 3 },
      };

      const pasteEvt3 = createMockClipboardEvent('paste', {
        'application/mathml+xml': mathml,
      });
      box3.dom.dispatchEvent(pasteEvt3);

      const xml3 = box3.getXml();
      // 'x' and '+' must remain, 'y' replaced by '<mfrac>'
      expect(xml3).toContain('<mi>x</mi>');
      expect(xml3).toContain('<mo>+</mo>');
      expect(xml3).toContain('<mfrac>');
      expect(xml3).not.toContain('<mi>y</mi>');

      box3.destroy();
      box3Container.remove();

      // 4. Paste subtree into an empty placeholder slot of a fraction
      const box4Container = document.createElement('div');
      container.appendChild(box4Container);
      const box4 = new InteractiveEquationBox({
        container: box4Container,
        initialContent: '<math><mfrac><mrow></mrow><mn>5</mn></mfrac></math>',
        onChange: () => {},
      });
      box4.focus();
      const numSlot = getAllSlotsInOrder(box4.ast).find((s) => s.role === 'numerator');
      expect(numSlot).toBeDefined();
      box4.caret = { slotId: numSlot!.id, offset: 0 };
      box4.selection = null;

      const pasteEvt4 = createMockClipboardEvent('paste', {
        'application/mathml+xml': mathml,
      });
      box4.dom.dispatchEvent(pasteEvt4);

      const xml4 = box4.getXml();
      expect(xml4).toContain('<mfrac>');
      expect(xml4).toContain('<mn>2</mn>');
      expect(xml4).toContain('<mn>3</mn>');
      expect(xml4).toContain('<mn>5</mn>');
      box4.destroy();
      box4Container.remove();
    });
  });

  // =========================================================================
  // BUG 3 STRESS TESTING: Command Palette Deduplication & Execution
  // =========================================================================
  describe('Bug 3 Adversarial Stress Testing', () => {
    it('Command palette inspection: listCommands() contains strictly 1 block and 1 inline command', async () => {
      const app: any = new App();
      const plugin = new WordEquationPlugin(app, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();

      const allCommands = app.commands.listCommands();

      // Case-insensitive inspection for 'insert block equation'
      const blockCmds = allCommands.filter((c: any) =>
        c.name.toLowerCase().includes('insert block equation')
      );
      expect(blockCmds.length).toBe(1);

      // Case-insensitive inspection for 'insert inline equation'
      const inlineCmds = allCommands.filter((c: any) =>
        c.name.toLowerCase().includes('insert inline equation')
      );
      expect(inlineCmds.length).toBe(1);

      // Verify no duplicates under legacy wording 'insert word equation'
      const legacyBlock = allCommands.filter((c: any) =>
        c.name.toLowerCase() === 'insert word equation'
      );
      const legacyInline = allCommands.filter((c: any) =>
        c.name.toLowerCase() === 'insert word equation inline'
      );
      expect(legacyBlock.length).toBe(0);
      expect(legacyInline.length).toBe(0);

      plugin.onunload();
    });

    it('Desktop plain-object command palette inspection: Object.keys and Object.values have zero duplicate legacy entries', async () => {
      const desktopApp: any = new App();
      const plainCommandsMap: Record<string, any> = {};

      desktopApp.commands = {
        commands: plainCommandsMap,
        listCommands: () => Object.values(plainCommandsMap),
        executeCommandById: (id: string) => {
          const cmd = plainCommandsMap[id];
          if (cmd?.callback) return cmd.callback();
          if (cmd?.editorCallback) {
            const view = desktopApp.workspace.getActiveViewOfType(MarkdownView);
            if (view) return cmd.editorCallback((view as any).editor);
          }
        },
      };

      const plugin = new WordEquationPlugin(desktopApp, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();

      const enumeratedKeys = Object.keys(desktopApp.commands.commands);
      const paletteCommands = desktopApp.commands.listCommands();

      // Strictly 1 block command and 1 inline command in command palette
      const blockEntries = paletteCommands.filter((c: any) => c.name?.toLowerCase().includes('insert block equation'));
      const inlineEntries = paletteCommands.filter((c: any) => c.name?.toLowerCase().includes('insert inline equation'));
      expect(blockEntries.length).toBe(1);
      expect(inlineEntries.length).toBe(1);

      // Legacy keys must NOT be enumerable in desktop command map
      expect(enumeratedKeys.includes('insert-word-equation')).toBe(false);
      expect(enumeratedKeys.includes('insert-word-equation-inline')).toBe(false);
      expect(enumeratedKeys.includes('obsidian-word-equation:insert-word-equation')).toBe(false);
      expect(enumeratedKeys.includes('obsidian-word-equation:insert-word-equation-inline')).toBe(false);

      // But direct indexing access to legacy aliases still works
      expect(desktopApp.commands.commands['insert-word-equation']).toBeDefined();
      expect(desktopApp.commands.commands['insert-word-equation-inline']).toBeDefined();
      expect(desktopApp.commands.commands['obsidian-word-equation:insert-word-equation']).toBeDefined();
      expect(desktopApp.commands.commands['obsidian-word-equation:insert-word-equation-inline']).toBeDefined();

      plugin.onunload();
    });

    it('Legacy command ID execution: executes both short and namespaced legacy IDs cleanly', async () => {
      const app: any = new App();
      const plugin = new WordEquationPlugin(app, {} as any);
      plugin.settings = { ...DEFAULT_SETTINGS };
      await plugin.onload();

      const leaf = new (WorkspaceLeaf as any)(app);
      const mdView = new MarkdownView(leaf);
      app.workspace.activeLeaf = leaf;
      app.workspace.activeView = mdView;

      let insertedContent = '';
      mdView.editor = {
        getSelection: () => '',
        getCursor: () => ({ line: 0, ch: 0 }),
        replaceSelection: (t: string) => {
          insertedContent += t;
        },
        replaceRange: (t: string) => {
          insertedContent += t;
        },
      } as any;

      // 1. Short legacy block ID
      insertedContent = '';
      app.commands.executeCommandById('insert-word-equation');
      expect(insertedContent).toContain('```math-word');

      // 2. Namespaced legacy block ID
      insertedContent = '';
      app.commands.executeCommandById('obsidian-word-equation:insert-word-equation');
      expect(insertedContent).toContain('```math-word');

      // 3. Short legacy inline ID
      insertedContent = '';
      app.commands.executeCommandById('insert-word-equation-inline');
      expect(insertedContent).toContain('/weq');

      // 4. Namespaced legacy inline ID
      insertedContent = '';
      app.commands.executeCommandById('obsidian-word-equation:insert-word-equation-inline');
      expect(insertedContent).toContain('/weq');

      // 5. Canonical block ID
      insertedContent = '';
      app.commands.executeCommandById('insert-block-equation');
      expect(insertedContent).toContain('```math-word');

      // 6. Canonical inline ID
      insertedContent = '';
      app.commands.executeCommandById('insert-inline-equation');
      expect(insertedContent).toContain('/weq');

      plugin.onunload();
    });
  });
});
