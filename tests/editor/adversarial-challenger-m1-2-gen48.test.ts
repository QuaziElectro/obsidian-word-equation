import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
  setActiveEquationState,
} from '../../src/editor/active-session';
import { resetIdCounter } from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Challenger M1-2 (Gen48): Empirical Verification of Boundary Navigation Predicates', () => {
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
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SUITE 1: Pure Predicate & Boundary Offset Simulation Oracle
  // =========================================================================
  describe('Suite 1: Predicate Mathematical Evaluation', () => {
    it('empirically proves line 507 condition (from === pos || from === pos + 1 || from === pos + 2) prematurely matches at pos = from - 1 and pos = from - 2', () => {
      const from = 100;
      const buggyPredicate = (pos: number) => from === pos || from === pos + 1 || from === pos + 2;
      const strictPredicate = (pos: number) => from === pos;

      // Distance from boundary: offset = pos - from
      // pos = from - 3 (3 chars before): neither matches
      expect(buggyPredicate(from - 3)).toBe(false);
      expect(strictPredicate(from - 3)).toBe(false);

      // pos = from - 2 (2 chars before): BUGGY MATCHES! (Premature by 2 characters)
      expect(buggyPredicate(from - 2)).toBe(true);
      expect(strictPredicate(from - 2)).toBe(false);

      // pos = from - 1 (1 char before): BUGGY MATCHES! (Premature by 1 character, e.g. before '1' in TEXT1)
      expect(buggyPredicate(from - 1)).toBe(true);
      expect(strictPredicate(from - 1)).toBe(false);

      // pos = from (boundary): BOTH MATCH!
      expect(buggyPredicate(from)).toBe(true);
      expect(strictPredicate(from)).toBe(true);

      // pos = from + 1 (inside): neither matches entry from start
      expect(buggyPredicate(from + 1)).toBe(false);
      expect(strictPredicate(from + 1)).toBe(false);
    });

    it('empirically proves line 554 condition (to === pos || to === pos - 1 || to === pos - 2) prematurely matches at pos = to + 1 and pos = to + 2', () => {
      const to = 200;
      const buggyPredicate = (pos: number) => to === pos || to === pos - 1 || to === pos - 2;
      const strictPredicate = (pos: number) => to === pos;

      // Distance from boundary: offset = pos - to
      // pos = to + 3 (3 chars after): neither matches
      expect(buggyPredicate(to + 3)).toBe(false);
      expect(strictPredicate(to + 3)).toBe(false);

      // pos = to + 2 (2 chars after): BUGGY MATCHES! (Premature by 2 characters)
      expect(buggyPredicate(to + 2)).toBe(true);
      expect(strictPredicate(to + 2)).toBe(false);

      // pos = to + 1 (1 char after): BUGGY MATCHES! (Premature by 1 character, e.g. after 'T' in TEXT2)
      expect(buggyPredicate(to + 1)).toBe(true);
      expect(strictPredicate(to + 1)).toBe(false);

      // pos = to (boundary): BOTH MATCH!
      expect(buggyPredicate(to)).toBe(true);
      expect(strictPredicate(to)).toBe(true);

      // pos = to - 1 (inside): neither matches entry from end
      expect(buggyPredicate(to - 1)).toBe(false);
      expect(strictPredicate(to - 1)).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 2: Live CodeMirror 6 Inline Equation Boundary Traversal
  // =========================================================================
  describe('Suite 2: CodeMirror 6 Inline Equation Navigation Extension Interception', () => {
    it('empirically verifies ArrowRight does NOT prematurely enter inline equation from pos = from - 1 and pos = from - 2', () => {
      // Document: "TEXT1/weq_inline <math><mi>x</mi></math> /weq_inlineTEXT2"
      const doc = 'TEXT1/weq_inline <math><mi>x</mi></math> /weq_inlineTEXT2';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      let widgetFrom = -1;
      let widgetTo = -1;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widget = w;
          widgetFrom = from;
          widgetTo = to;
        }
      });

      expect(widget).not.toBeNull();
      expect(widgetFrom).toBe(5); // "TEXT1" is length 5
      expect(widget!.isInline).toBe(true);

      // Case 2.1: Cursor at pos = from - 2 (pos = 3, between 'X' and 'T')
      clearActiveEquationState();
      setActiveEquationState({ from: widgetFrom, to: widgetTo, caret: { slotId: '', offset: 0 }, isFocused: false });
      view.dispatch({ selection: { anchor: widgetFrom - 2 } });
      expect(view.state.selection.main.head).toBe(3);
      expect(getActiveEquationState()?.isFocused).toBe(false);

      // Dispatch ArrowRight
      let event = new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);

      // Fix verification: Equation does NOT intercept keystroke before boundary!
      expect(getActiveEquationState()?.isFocused).toBe(false);
      expect(widget!.isFocused).toBe(false);

      // Case 2.2: Cursor at pos = from - 1 (pos = 4, between 'T' and '1')
      clearActiveEquationState();
      setActiveEquationState({ from: widgetFrom, to: widgetTo, caret: { slotId: '', offset: 0 }, isFocused: false });
      widget!.isFocused = false;
      view.dispatch({ selection: { anchor: widgetFrom - 1 } });
      expect(view.state.selection.main.head).toBe(4);
      expect(getActiveEquationState()?.isFocused).toBe(false);

      // Dispatch ArrowRight
      event = new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);

      // Fix verification: Equation does NOT intercept keystroke before boundary, '1' is preserved!
      expect(getActiveEquationState()?.isFocused).toBe(false);
      expect(widget!.isFocused).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('empirically verifies ArrowLeft does NOT prematurely enter inline equation from pos = to + 1 and pos = to + 2', () => {
      // Document: "TEXT1/weq_inline <math><mi>x</mi></math> /weq_inlineTEXT2"
      const doc = 'TEXT1/weq_inline <math><mi>x</mi></math> /weq_inlineTEXT2';
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      let widgetTo = -1;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widget = w;
          widgetTo = to;
        }
      });

      expect(widget).not.toBeNull();
      expect(widgetTo).toBeGreaterThan(0);

      // Case 2.3: Cursor at pos = to + 2 (e.g. after 'E' in TEXT2)
      clearActiveEquationState();
      setActiveEquationState({ from: 0, to: widgetTo, caret: { slotId: '', offset: 0 }, isFocused: false });
      view.dispatch({ selection: { anchor: widgetTo + 2 } });
      expect(view.state.selection.main.head).toBe(widgetTo + 2);
      expect(getActiveEquationState()?.isFocused).toBe(false);

      // Dispatch ArrowLeft
      let event = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);

      // Fix verification: Equation does NOT intercept keystroke before boundary!
      expect(getActiveEquationState()?.isFocused).toBe(false);
      expect(widget!.isFocused).toBe(false);

      // Case 2.4: Cursor at pos = to + 1 (e.g. after 'T' in TEXT2)
      clearActiveEquationState();
      setActiveEquationState({ from: 0, to: widgetTo, caret: { slotId: '', offset: 0 }, isFocused: false });
      widget!.isFocused = false;
      view.dispatch({ selection: { anchor: widgetTo + 1 } });
      expect(view.state.selection.main.head).toBe(widgetTo + 1);
      expect(getActiveEquationState()?.isFocused).toBe(false);

      // Dispatch ArrowLeft
      event = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);

      // Fix verification: Equation does NOT intercept keystroke before boundary, 'T' is preserved!
      expect(getActiveEquationState()?.isFocused).toBe(false);
      expect(widget!.isFocused).toBe(false);

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // SUITE 3: Block Equation Boundary Verification (Matching Telemetry Log)
  // =========================================================================
  describe('Suite 3: Block Equation Coordinates Matching Telemetry Citations', () => {
    it('empirically reproduces Telemetry Event #7/#12/#13 (from = 98, pos = 96) non-premature entry', () => {
      // Reconstruct doc layout where equation begins at offset 98
      // 97 characters of prefix text + newline
      const prefix = '## 1. Empty Fraction Placeholder Navigation (R2)\n'.padEnd(98, ' ');
      const blockEq = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mfrac><mrow></mrow><mrow></mrow></mfrac>\n</math>\n```\nasd';
      const doc = prefix + blockEq;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      let widgetFrom = -1;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widget = w;
          widgetFrom = from;
        }
      });

      expect(widget).not.toBeNull();
      expect(widgetFrom).toBe(98);

      // Position cursor at pos = 96 (as in Telemetry Event #1 & #7)
      clearActiveEquationState();
      setActiveEquationState({ from: widgetFrom, to: 0, caret: { slotId: '', offset: 0 }, isFocused: false });
      view.dispatch({ selection: { anchor: 96 } });
      expect(view.state.selection.main.head).toBe(96);
      expect(widgetFrom).toBe(98);
      // Verify from === pos + 2 (98 === 96 + 2) holds
      expect(widgetFrom === 96 + 2).toBe(true);

      // Dispatch ArrowRight
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);

      // Fix verification: Equation NOT entered at pos 96!
      expect(getActiveEquationState()?.isFocused).toBe(false);
      expect(widget!.isFocused).toBe(false);

      view.destroy();
      editorContainer.remove();
    });

    it('empirically reproduces Telemetry Event #121/#126/#127 (to = 245, pos = 247) non-premature entry', () => {
      const prefix = '## 1. Empty Fraction Placeholder Navigation (R2)\n'.padEnd(98, ' ');
      const blockEq = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mfrac><mrow></mrow><mrow></mrow></mfrac>\n</math>\n```\nasd';
      const doc = prefix + blockEq;
      const { view, container: editorContainer } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      let widgetTo = -1;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        const w = (dec as any).widget || (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widget = w;
          widgetTo = to;
        }
      });

      expect(widget).not.toBeNull();
      expect(widgetTo).toBeGreaterThan(0);

      // Position cursor at pos = widgetTo + 2 (as in Telemetry Event #119 & #121)
      clearActiveEquationState();
      setActiveEquationState({ from: 0, to: widgetTo, caret: { slotId: '', offset: 0 }, isFocused: false });
      const pos = widgetTo + 2;
      view.dispatch({ selection: { anchor: pos } });
      expect(view.state.selection.main.head).toBe(pos);
      // Verify to === pos - 2 holds
      expect(widgetTo === pos - 2).toBe(true);

      // Dispatch ArrowLeft
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);

      // Fix verification: Equation NOT entered at pos = widgetTo + 2!
      expect(getActiveEquationState()?.isFocused).toBe(false);
      expect(widget!.isFocused).toBe(false);

      view.destroy();
      editorContainer.remove();
    });
  });

  // =========================================================================
  // SUITE 4: Counterfactual / Remediation Proof
  // =========================================================================
  describe('Suite 4: Counterfactual Oracle for Strict Boundary Remediation', () => {
    it('proves that strict boundary predicate eliminates premature entry', () => {
      const from = 10;
      const to = 30;

      // Strict navigation handler simulation
      function simulateStrictArrowRight(pos: number, eqFrom: number): { entered: boolean; nextPos: number } {
        if (pos === eqFrom) {
          return { entered: true, nextPos: eqFrom };
        }
        return { entered: false, nextPos: pos + 1 }; // Default cursorRight step
      }

      function simulateStrictArrowLeft(pos: number, eqTo: number): { entered: boolean; nextPos: number } {
        if (pos === eqTo) {
          return { entered: true, nextPos: eqTo };
        }
        return { entered: false, nextPos: pos - 1 }; // Default cursorLeft step
      }

      // Step right towards equation: pos 8 -> 9 -> 10 -> enter
      let state = { entered: false, nextPos: from - 2 }; // 8
      state = simulateStrictArrowRight(state.nextPos, from);
      expect(state.entered).toBe(false);
      expect(state.nextPos).toBe(from - 1); // 9

      state = simulateStrictArrowRight(state.nextPos, from);
      expect(state.entered).toBe(false);
      expect(state.nextPos).toBe(from); // 10

      state = simulateStrictArrowRight(state.nextPos, from);
      expect(state.entered).toBe(true);
      expect(state.nextPos).toBe(from); // enters at exactly boundary!

      // Step left towards equation: pos 32 -> 31 -> 30 -> enter
      let leftState = { entered: false, nextPos: to + 2 }; // 32
      leftState = simulateStrictArrowLeft(leftState.nextPos, to);
      expect(leftState.entered).toBe(false);
      expect(leftState.nextPos).toBe(to + 1); // 31

      leftState = simulateStrictArrowLeft(leftState.nextPos, to);
      expect(leftState.entered).toBe(false);
      expect(leftState.nextPos).toBe(to); // 30

      leftState = simulateStrictArrowLeft(leftState.nextPos, to);
      expect(leftState.entered).toBe(true);
      expect(leftState.nextPos).toBe(to); // enters at exactly boundary!
    });
  });
});
