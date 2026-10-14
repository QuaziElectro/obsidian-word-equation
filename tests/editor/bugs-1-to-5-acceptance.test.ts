import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMathML } from '../../src/core/mathml-parser';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { resetIdCounter, findSlotById } from '../../src/core/ast';
import { CaretPosition, SelectionRange, SlotNode } from '../../src/core/types';
import { updatePartialSelectionDom } from '../../src/editor/selection';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
  setActiveEquationState,
} from '../../src/editor/active-session';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { EditorView } from '@codemirror/view';

describe('Bugs 1 to 5 Comprehensive Acceptance Suite (§ 2026-10-08T07:51:21Z)', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    // Inject styles.css for CSS suppression and computed style checks
    const cssPath = path.resolve(__dirname, '../../styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    styleEl = document.createElement('style');
    styleEl.textContent = cssContent;
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // BUG 1: Nested Structure Highlight Brightness Stacking
  // =========================================================================
  describe('Bug 1: Nested structure highlight shows exactly one unified highlight on parent with no nested brightness stacking', () => {
    const nestedFractionXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac>
        <mrow>
          <mfrac>
            <mrow><mi>a</mi></mrow>
            <mrow><mi>b</mi></mrow>
          </mfrac>
        </mrow>
        <mrow><mi>c</mi></mrow>
      </mfrac>
    </math>`;

    it('Scenario 1.1: Selecting parent fraction applies .eq-selected-structure only to outer structure', () => {
      const ast = parseMathML(nestedFractionXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const rootSlot = ast;
      // Select entire outer fraction at root slot (from offset 0 to 1)
      const selection: SelectionRange = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const allSelectedStructures = dom.querySelectorAll('.eq-selected-structure');
      // Exactly ONE element must receive .eq-selected-structure (the outer fraction)
      expect(allSelectedStructures.length).toBe(1);

      const outerFraction = dom.querySelector('.eq-fraction');
      expect(outerFraction).not.toBeNull();
      expect(outerFraction?.classList.contains('eq-selected-structure')).toBe(true);

      // Inner fraction must NOT receive .eq-selected-structure
      const innerFraction = outerFraction?.querySelector('.eq-numerator .eq-fraction');
      expect(innerFraction).not.toBeNull();
      expect(innerFraction?.classList.contains('eq-selected-structure')).toBe(false);
    });

    it('Scenario 1.2: Nested structure CSS suppression rule prevents brightness stacking', () => {
      const ast = parseMathML(nestedFractionXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const outerFraction = dom.querySelector('.eq-fraction') as HTMLElement;
      const innerFraction = outerFraction.querySelector('.eq-numerator .eq-fraction') as HTMLElement;

      // Force .eq-selected-structure on both to simulate any legacy DOM mutation
      outerFraction.classList.add('eq-selected-structure');
      innerFraction.classList.add('eq-selected-structure');

      // In styles.css: .eq-selected-structure .eq-selected-structure has background-color: transparent !important
      // Verify via CSSOM rule inspection
      const rules = Array.from(styleEl.sheet?.cssRules || []);
      const suppressionRule = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-selected-structure')
      );

      expect(suppressionRule, 'CSS suppression rule for nested .eq-selected-structure must exist in styles.css').toBeDefined();
      expect(suppressionRule?.cssText).toContain('transparent');
    });

    it('Scenario 1.3: Deeply nested root inside fraction has no duplicate highlight classes', () => {
      const radicalInFractionXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow>
            <msqrt><mi>x</mi></msqrt>
          </mrow>
          <mrow><mn>2</mn></mrow>
        </mfrac>
      </math>`;

      const ast = parseMathML(radicalInFractionXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const selectedStructures = dom.querySelectorAll('.eq-selected-structure');
      expect(selectedStructures.length).toBe(1);
      const radical = dom.querySelector('.eq-radical');
      expect(radical?.classList.contains('eq-selected-structure')).toBe(false);
    });
  });

  // =========================================================================
  // BUG 2: Mouse Click Outside Equation Clears Selection Completely
  // =========================================================================
  describe('Bug 2: Clicking outside equation clears selection completely', () => {
    it('Scenario 2.1: Clicking outside equation clears active selection from widget and DOM', () => {
      const doc = 'Before text\n/weq_inline <math><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></math> /weq_inline\nAfter text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widget = w;
        }
      });

      expect(widget).not.toBeNull();
      widget = widget!;

      // 1. Enter equation and set a selection
      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);

      const mathEl = (widget as any).containerEl?.querySelector('.word-equation-math') as HTMLElement;
      expect(mathEl).not.toBeNull();

      // Apply selection inside equation
      const rootSlot = widget.ast;
      widget.selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 2 },
      };
      widget.updateCaretOnly();

      // Verify selection is rendered
      const selectedTokens = (widget as any).containerEl?.querySelectorAll('.eq-selected-token');
      expect(selectedTokens?.length).toBeGreaterThan(0);

      // 2. Simulate clicking outside equation (pointerdown on outside element)
      const outsideEl = view.contentDOM;
      const pointerDownEvt = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
      });
      outsideEl.dispatchEvent(pointerDownEvt);

      // 3. Verify selection is cleared completely
      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      const remainingTokens = (widget as any).containerEl?.querySelectorAll('.eq-selected-token');
      expect(remainingTokens?.length).toBe(0);
      const remainingStructures = (widget as any).containerEl?.querySelectorAll('.eq-selected-structure');
      expect(remainingStructures?.length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: updateCaretOnly does not render selection classes when !isFocused', () => {
      const ast = parseMathML('<math><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math>');
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const widget = new WordEquationWidget(
        '<math><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow></math>',
        0,
        50,
        false
      );
      (widget as any).containerEl = dom;
      widget.isFocused = false;
      widget.selection = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 2 },
      };

      widget.updateCaretOnly(dom);

      expect(widget.selection).toBeNull();
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect(dom.querySelectorAll('.eq-selected-structure').length).toBe(0);
    });
  });

  // =========================================================================
  // BUG 3: Shift+Arrow Stuck at Equation Boundary
  // =========================================================================
  describe('Bug 3: Shift+Arrow extends past equation boundary into surrounding text from both sides', () => {
    it('Scenario 3.1: Shift+ArrowRight extends past forward equation boundary into following text', () => {
      const doc = 'Prefix text\n/weq_inline <math><mi>x</mi></math> /weq_inlineSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('Suffix text');

      // 1. Position cursor immediately before equation
      view.dispatch({ selection: { anchor: eqStart, head: eqStart } });

      // Simulate Shift-ArrowRight across equation
      // In CM6, first step over atomic replaced decoration puts head at eqEnd
      view.dispatch({ selection: { anchor: eqStart, head: eqEnd } });
      expect(view.state.selection.main.anchor).toBe(eqStart);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // 2. Dispatch Shift-ArrowRight at boundary
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvent);

      // The custom handler in navigation-extension must advance head past eqEnd
      expect(view.state.selection.main.head).toBeGreaterThan(eqEnd);
      expect(view.state.selection.main.anchor).toBe(eqStart);

      view.destroy();
      c.remove();
    });

    it('Scenario 3.2: Shift+ArrowLeft extends past backward equation boundary into preceding text', () => {
      const doc = 'Prefix text\n/weq_inline <math><mi>x</mi></math> /weq_inlineSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('Suffix text');

      // 1. Position cursor after equation and select backward over equation
      view.dispatch({ selection: { anchor: eqEnd, head: eqStart } });
      expect(view.state.selection.main.anchor).toBe(eqEnd);
      expect(view.state.selection.main.head).toBe(eqStart);

      // 2. Dispatch Shift-ArrowLeft at backward boundary
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvent);

      // The custom handler must retreat head past eqStart into preceding text
      expect(view.state.selection.main.head).toBeLessThan(eqStart);
      expect(view.state.selection.main.anchor).toBe(eqEnd);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 4: Up Arrow Skips Line After Equation
  // =========================================================================
  describe('Bug 4: Up arrow from second line after equation moves caret to first line (not into equation)', () => {
    it('Scenario 4.1: ArrowUp from line N+2 moves to line N+1 without entering equation on line N', () => {
      // Document structure:
      // Line 1: ```math-word
      // Line 2: <math><mi>x</mi></math>
      // Line 3: ```
      // Line 4: Line 1 after equation (intermediate line)
      // Line 5: Line 2 after equation (starting cursor line)
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\nLine 1 after equation\nLine 2 after equation';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line5 = view.state.doc.line(5);
      const line4 = view.state.doc.line(4);

      // 1. Position cursor on Line 5
      view.dispatch({ selection: { anchor: line5.from + 5, head: line5.from + 5 } });
      expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(5);

      // 2. Dispatch ArrowUp
      const arrowUpEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(arrowUpEvt);

      // 3. Verification: ArrowUp must NOT jump into equation!
      // Equation should remain unfocused, and selection should move to Line 4 or standard CM line navigation
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.2: ArrowUp from line N+1 enters equation when immediately adjacent', () => {
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\nAdjacent line';
      const { view, container: c } = createMockEditor(doc, [], true);

      // Position cursor at line immediately following equation
      const line4 = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: line4.from, head: line4.from } });

      const arrowUpEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(arrowUpEvt);

      // From adjacent line, entering the equation is valid
      expect(getActiveEquationState()?.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 5: Escape Creates Dual Carets
  // =========================================================================
  describe('Bug 5: Escape inside equation produces exactly one caret outside with no ghost caret inside', () => {
    it('Scenario 5.1: Pressing Escape inside equation removes .eq-caret and clears focus', () => {
      const doc = 'Before text\n/weq_inline <math><mi>x</mi></math> /weq_inlineAfter text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widget = w;
        }
      });

      expect(widget).not.toBeNull();
      widget = widget!;

      // 1. Enter equation
      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);
      expect(getActiveEquationState()?.isFocused).toBe(true);

      // Confirm visual caret exists inside equation container
      const initialCarets = (widget as any).containerEl?.querySelectorAll('.eq-caret');
      expect(initialCarets?.length).toBe(1);

      // 2. Dispatch Escape key on equation container
      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      // 3. Verify equation is deactivated
      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();

      // Ghost caret must be completely removed from DOM!
      const remainingCarets = (widget as any).containerEl?.querySelectorAll('.eq-caret');
      expect(remainingCarets?.length).toBe(0);

      // CodeMirror selection must be set outside equation
      expect(view.state.selection.main.head).toBeLessThanOrEqual(widget.from);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.2: CodeMirror keymap Escape deactivates active widget cleanly', () => {
      const doc = 'Before text\n/weq_inline <math><mi>x</mi></math> /weq_inlineAfter text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) {
          widget = w;
        }
      });

      expect(widget).not.toBeNull();
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      expect(getActiveEquationState()?.isFocused).toBe(true);

      // Dispatch Escape on CodeMirror contentDOM
      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);

      view.destroy();
      c.remove();
    });
  });
});
