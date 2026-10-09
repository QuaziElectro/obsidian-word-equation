import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMathML } from '../../src/core/mathml-parser';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { resetIdCounter } from '../../src/core/ast';
import { SelectionRange } from '../../src/core/types';
import { updatePartialSelectionDom } from '../../src/editor/selection';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';

describe('Adversarial Challenger 2 (Gen 57): Comprehensive Empirical Verification Suite for Bugs 1 to 5', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

  // Standard fallback keymap simulating CodeMirror 6 default character selection in normal text
  const standardEditorFallbackKeymap: Extension = EditorView.domEventHandlers({
    keydown: (evt, v) => {
      if (evt.defaultPrevented) return false;
      const sel = v.state.selection.main;
      if (evt.shiftKey && evt.key === 'ArrowRight') {
        v.dispatch({
          selection: {
            anchor: sel.anchor,
            head: Math.min(v.state.doc.length, sel.head + 1),
          },
        });
        return true;
      }
      if (evt.shiftKey && evt.key === 'ArrowLeft') {
        v.dispatch({
          selection: {
            anchor: sel.anchor,
            head: Math.max(0, sel.head - 1),
          },
        });
        return true;
      }
      return false;
    },
  });

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const cssPath = path.resolve(__dirname, '../../styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    styleEl = document.createElement('style');
    styleEl.textContent = cssContent;
    document.head.appendChild(styleEl);

    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = function () {
        return [] as any;
      };
    }
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // BUG 3: Shift+Arrow Stuck at Equation Boundary (Adversarial Focus)
  // =========================================================================
  describe('Bug 3 Adversarial Challenge: Boundary Shift+Arrow Selection Extension', () => {
    it('Scenario 3.1: Shift+ArrowRight extends smoothly from before equation, past boundary, across 10 suffix characters', () => {
      const prefix = 'Intro ';
      const eqText = '/weq_inline <math><mi>x</mi></math> /weq_inline';
      const suffix = 'ABCDEFGHIJKLMNOPQRST';
      const doc = prefix + eqText + suffix;

      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);
      const eqStart = prefix.length;
      const eqEnd = eqStart + eqText.length;

      // Cursor before equation
      view.dispatch({ selection: { anchor: eqStart, head: eqStart } });

      // In CM6, initial Shift-ArrowRight jumps over atomic widget to eqEnd
      view.dispatch({ selection: { anchor: eqStart, head: eqEnd } });
      expect(view.state.selection.main.anchor).toBe(eqStart);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // Continue pressing Shift-ArrowRight 10 consecutive times
      for (let i = 1; i <= 10; i++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);

        // Verification: selection head must extend into suffix text
        expect(view.state.selection.main.anchor).toBe(eqStart);
        expect(view.state.selection.main.head).toBe(eqEnd + i);
      }

      view.destroy();
      c.remove();
    });

    it('Scenario 3.2: Shift+ArrowLeft extends smoothly from after equation, backward past boundary, across prefix characters', () => {
      const prefix = 'ABCDEFGHIJ';
      const eqText = '/weq_inline <math><mi>y</mi></math> /weq_inline';
      const suffix = ' Suffix';
      const doc = prefix + eqText + suffix;

      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);
      const eqStart = prefix.length;
      const eqEnd = eqStart + eqText.length;

      // Position after equation and select backward over widget to eqStart
      view.dispatch({ selection: { anchor: eqEnd, head: eqStart } });
      expect(view.state.selection.main.anchor).toBe(eqEnd);
      expect(view.state.selection.main.head).toBe(eqStart);

      // Press Shift-ArrowLeft 5 consecutive times
      for (let i = 1; i <= 5; i++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);

        // Verification: selection head retreats backward into prefix text
        expect(view.state.selection.main.anchor).toBe(eqEnd);
        expect(view.state.selection.main.head).toBe(eqStart - i);
      }

      view.destroy();
      c.remove();
    });

    it('Scenario 3.3: Reversal stress: Shift+ArrowRight past equation, then Shift+ArrowLeft reverses selection', () => {
      const prefix = 'Start ';
      const eqText = '/weq_inline <math><mi>z</mi></math> /weq_inline';
      const suffix = 'ABCDE';
      const doc = prefix + eqText + suffix;

      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);
      const eqStart = prefix.length;
      const eqEnd = eqStart + eqText.length;

      // Select forward over equation
      view.dispatch({ selection: { anchor: eqStart, head: eqEnd } });

      // Extend forward 2 characters past boundary
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
      const extendedHead = view.state.selection.main.head;
      expect(extendedHead).toBe(eqEnd + 2);

      // Now reverse direction with Shift+ArrowLeft
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );

      // Selection head must retreat toward the anchor
      expect(view.state.selection.main.head).toBe(eqEnd + 1);
      expect(view.state.selection.main.anchor).toBe(eqStart);

      view.destroy();
      c.remove();
    });

    it('Scenario 3.4: Block equation boundary Shift+ArrowRight extends into following lines', () => {
      const doc = 'Intro\n```math-word\n<math><mi>A</mi></math>\n```\nLine after equation\nAnother line';
      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);

      let blockWidget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) blockWidget = w;
      });
      expect(blockWidget).not.toBeNull();

      const eqStart = blockWidget!.from;
      const eqEnd = blockWidget!.to;

      // Select across block widget to eqEnd
      view.dispatch({ selection: { anchor: eqStart, head: eqEnd } });

      // Press Shift-ArrowRight at block boundary
      const keyEvt = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt);

      // Verification: head extends past eqEnd into trailing newline/text
      expect(view.state.selection.main.head).toBeGreaterThan(eqEnd);
      expect(view.state.selection.main.anchor).toBe(eqStart);

      view.destroy();
      c.remove();
    });

    it('Scenario 3.5: Multi-equation chain: Shift+ArrowRight traverses from prefix across Equation 1, middle text, and Equation 2', () => {
      const doc = 'Prefix /weq_inline <math><mi>a</mi></math> /weq_inline Middle /weq_inline <math><mi>b</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [standardEditorFallbackKeymap], true);

      const secondEqEnd = doc.lastIndexOf('/weq_inline') + '/weq_inline'.length;

      // Extend forward past second equation
      view.dispatch({ selection: { anchor: 0, head: secondEqEnd } });

      const keyEvt = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt);

      expect(view.state.selection.main.head).toBeGreaterThan(secondEqEnd);
      expect(view.state.selection.main.anchor).toBe(0);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 4: Up Arrow Skips Line After Equation (Adversarial Focus)
  // =========================================================================
  describe('Bug 4 Adversarial Challenge: Up Arrow Multi-line Adjacency & Non-skipping', () => {
    it('Scenario 4.1: Standard 2-line post-equation structure: ArrowUp on Line 5 moves to Line 4 without entering equation', () => {
      // Line 1: ```math-word
      // Line 2: <math><mi>x</mi></math>
      // Line 3: ```
      // Line 4: First line after equation
      // Line 5: Second line after equation
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\nFirst line after equation\nSecond line after equation';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line5 = view.state.doc.line(5);
      view.dispatch({ selection: { anchor: line5.from + 4, head: line5.from + 4 } });
      expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(5);

      // Press ArrowUp on Line 5
      const upEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(upEvt);

      // Equation must NOT be active!
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.2: Intermediate line is completely empty (blank line): ArrowUp on Line 5 must NOT skip Line 4', () => {
      // Line 1: ```math-word
      // Line 2: <math><mi>x</mi></math>
      // Line 3: ```
      // Line 4: (empty line: "")
      // Line 5: Text on Line 5
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\n\nText on Line 5';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line5 = view.state.doc.line(5);
      view.dispatch({ selection: { anchor: line5.from + 2, head: line5.from + 2 } });
      expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(5);

      // Press ArrowUp on Line 5
      const upEvt = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        code: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(upEvt);

      // CRITICAL: Even though Line 4 is empty (length 0), ArrowUp must NOT jump into equation!
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.3: Multiple consecutive empty lines: Line 4 empty, Line 5 empty, Line 6 text', () => {
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\n\n\nText on Line 6';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line6 = view.state.doc.line(6);
      view.dispatch({ selection: { anchor: line6.from, head: line6.from } });

      // First ArrowUp: from Line 6
      const upEvt1 = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true });
      view.contentDOM.dispatchEvent(upEvt1);
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      // Second ArrowUp: from Line 5
      const upEvt2 = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true });
      view.contentDOM.dispatchEvent(upEvt2);
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.4: Intermediate line is a single character: ArrowUp does not skip single-char line', () => {
      // Line 1: ```math-word
      // Line 2: <math><mi>x</mi></math>
      // Line 3: ```
      // Line 4: a
      // Line 5: Some text
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\na\nSome text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line5 = view.state.doc.line(5);
      view.dispatch({ selection: { anchor: line5.from + 2, head: line5.from + 2 } });

      const upEvt = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true });
      view.contentDOM.dispatchEvent(upEvt);

      // Must not jump into equation
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.5: Intermediate line has only whitespace: ArrowUp does not skip whitespace-only line', () => {
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\n   \nSome text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line5 = view.state.doc.line(5);
      view.dispatch({ selection: { anchor: line5.from + 2, head: line5.from + 2 } });

      const upEvt = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true });
      view.contentDOM.dispatchEvent(upEvt);

      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });

    it('Scenario 4.6: ArrowUp from line N+1 immediately below equation enters equation smoothly', () => {
      const doc = '```math-word\n<math><mi>x</mi></math>\n```\nDirectly adjacent line';
      const { view, container: c } = createMockEditor(doc, [], true);

      // Line 4 is directly adjacent (blockLine.number + 1)
      const line4 = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: line4.from, head: line4.from } });

      const upEvt = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true });
      view.contentDOM.dispatchEvent(upEvt);

      // Directly adjacent line MUST enter the equation
      expect(getActiveEquationState()?.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });

    it('Scenario 4.7: Navigation before equation is preserved: ArrowDown from Line 1 to Line 2 does not jump into equation on Line 3', () => {
      const doc = 'Line 1 before\nLine 2 before\n```math-word\n<math><mi>x</mi></math>\n```';
      const { view, container: c } = createMockEditor(doc, [], true);

      const line1 = view.state.doc.line(1);
      view.dispatch({ selection: { anchor: line1.from, head: line1.from } });

      const downEvt = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true });
      view.contentDOM.dispatchEvent(downEvt);

      // Should not enter equation yet
      expect(getActiveEquationState()?.isFocused).toBeFalsy();

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 1: Nested Structure Highlight Brightness Stacking (Adversarial Focus)
  // =========================================================================
  describe('Bug 1 Adversarial Challenge: Deep & Sibling Nested Hierarchies', () => {
    // 4-level deep nesting: Fraction -> Radical -> Fraction -> Superscript
    const deep4LevelXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac>
        <mrow>
          <msqrt>
            <mfrac>
              <mrow>
                <msup>
                  <mi>x</mi>
                  <mn>2</mn>
                </msup>
              </mrow>
              <mrow><mi>y</mi></mrow>
            </mfrac>
          </msqrt>
        </mrow>
        <mrow><mi>z</mi></mrow>
      </mfrac>
    </math>`;

    it('Scenario 1.1: 4-level deep hierarchy: selecting outer fraction applies .eq-selected-structure to outer element only', () => {
      const ast = parseMathML(deep4LevelXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const structList = dom.querySelectorAll('.eq-selected-structure');
      // Exactly ONE element must receive .eq-selected-structure in the entire tree
      expect(structList.length).toBe(1);

      // Verify no inner structure (radical, inner fraction, superscript) has .eq-selected-structure
      const radical = dom.querySelector('.eq-radical');
      expect(radical?.classList.contains('eq-selected-structure')).toBe(false);

      const innerFrac = dom.querySelector('.eq-radical .eq-fraction');
      expect(innerFrac?.classList.contains('eq-selected-structure')).toBe(false);

      const script = dom.querySelector('.eq-script-box');
      expect(script?.classList.contains('eq-selected-structure')).toBe(false);
    });

    it('Scenario 1.2: Sibling nested fractions in numerator and denominator: selecting root fraction leaves siblings unhighlighted', () => {
      // Fraction with fraction in numerator AND fraction in denominator
      const siblingFracXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow>
            <mfrac>
              <mrow><mn>1</mn></mrow>
              <mrow><mn>2</mn></mrow>
            </mfrac>
          </mrow>
          <mrow>
            <mfrac>
              <mrow><mn>3</mn></mrow>
              <mrow><mn>4</mn></mrow>
            </mfrac>
          </mrow>
        </mfrac>
      </math>`;

      const ast = parseMathML(siblingFracXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const structList = dom.querySelectorAll('.eq-selected-structure');
      expect(structList.length).toBe(1);

      const numFrac = dom.querySelector('.eq-numerator .eq-fraction');
      const denFrac = dom.querySelector('.eq-denominator .eq-fraction');
      expect(numFrac?.classList.contains('eq-selected-structure')).toBe(false);
      expect(denFrac?.classList.contains('eq-selected-structure')).toBe(false);
    });

    it('Scenario 1.3: CSS cascading suppression rule inspection for child highlights inside .eq-selected-structure', () => {
      const rules = Array.from(styleEl.sheet?.cssRules || []);
      const suppressionRule = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-selected-structure')
      );

      expect(suppressionRule).toBeDefined();
      expect(suppressionRule?.cssText).toContain('transparent');

      // Also verify child token and child slot suppression rules exist
      const tokenSuppressionRule = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-selected-token')
      );
      expect(tokenSuppressionRule).toBeDefined();
      expect(tokenSuppressionRule?.cssText).toContain('transparent');
    });
  });

  // =========================================================================
  // BUG 2: Mouse Click Outside Equation Clears Selection (Adversarial Focus)
  // =========================================================================
  describe('Bug 2 Adversarial Challenge: Mouse Click Selection Clearing & Isolation', () => {
    it('Scenario 2.1: Cross-boundary partial selection inside equation is completely wiped on outside click', () => {
      const doc = 'Before\n/weq_inline <math><mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac></math> /weq_inline\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');

      // Select cross-boundary
      const numSlot = (widget.ast.children[0] as any).numerator;
      const denSlot = (widget.ast.children[0] as any).denominator;
      widget.selection = {
        anchor: { slotId: numSlot.id, offset: 0 },
        head: { slotId: denSlot.id, offset: 1 },
      };
      widget.updateCaretOnly();

      const dom = (widget as any).containerEl as HTMLElement;
      expect(dom.querySelectorAll('.eq-partial-selected').length).toBeGreaterThan(0);

      // Outside pointerdown
      const outsideEvt = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(outsideEvt);

      // Full reset verified
      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
      expect(dom.querySelectorAll('.eq-partial-selected').length).toBe(0);
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect(dom.querySelectorAll('.eq-selected-structure').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: Single click inside equation clears existing selection rather than sticking', () => {
      const doc = '/weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 0 },
        head: { slotId: widget.ast.id, offset: 2 },
      };
      widget.updateCaretOnly();

      const dom = (widget as any).containerEl as HTMLElement;
      expect(dom.querySelectorAll('.eq-selected-token').length).toBeGreaterThan(0);

      // Single click inside equation (clickCount = 1)
      const insideClickEvt = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: 50,
        clientY: 10,
        detail: 1,
      });
      dom.dispatchEvent(insideClickEvt);

      // Selection must be cleared, only caret placed
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.3: Rapid alternation (5 cycles) of inside selection and outside click causes 0 state leaks', () => {
      const doc = 'Lead\n/weq_inline <math><mi>k</mi></math> /weq_inline\nTail';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      const dom = (widget as any).containerEl as HTMLElement;

      for (let cycle = 0; cycle < 5; cycle++) {
        // 1. Enter and select
        widget.enterFromStart(view, 'ArrowRight');
        widget.selection = {
          anchor: { slotId: widget.ast.id, offset: 0 },
          head: { slotId: widget.ast.id, offset: 1 },
        };
        widget.updateCaretOnly();
        expect(widget.selection).not.toBeNull();

        // 2. Click outside
        const outsideEvt = new MouseEvent('pointerdown', { bubbles: true });
        view.contentDOM.dispatchEvent(outsideEvt);

        expect(widget.isFocused).toBe(false);
        expect(widget.selection).toBeNull();
        expect(getActiveEquationState()).toBeNull();
        expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 5: Escape Key Dual Carets Avoidance (Adversarial Focus)
  // =========================================================================
  describe('Bug 5 Adversarial Challenge: Escape Key Cleanup & Flawless Re-entry', () => {
    it('Scenario 5.1: Escape from empty fraction placeholder removes .eq-caret and restores CM cursor', () => {
      const emptyFracXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac><mrow></mrow><mrow></mrow></mfrac>
      </math>`;
      const doc = `Intro\n\`\`\`math-word\n${emptyFracXml}\n\`\`\`\nOutro`;
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      const dom = (widget as any).containerEl as HTMLElement;
      expect(dom.querySelectorAll('.eq-caret').length).toBe(1);

      // Press Escape
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      dom.dispatchEvent(escEvt);

      // Exactly 0 carets in DOM, 1 in document
      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect(dom.querySelectorAll('.eq-caret').length).toBe(0);
      expect(view.state.selection.ranges.length).toBe(1);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.2: Flawless re-entry after Escape: equation can be re-entered and edited without lockup', () => {
      const doc = 'Before\n/weq_inline <math><mi>x</mi></math> /weq_inline\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      const dom = (widget as any).containerEl as HTMLElement;

      // 1. Enter first time
      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);

      // 2. Escape
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      dom.dispatchEvent(escEvt);
      expect(widget.isFocused).toBe(false);
      expect(dom.querySelectorAll('.eq-caret').length).toBe(0);

      // 3. Re-enter second time
      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);
      expect(dom.querySelectorAll('.eq-caret').length).toBe(1);

      // 4. Edit (type character)
      const inputEvt = new KeyboardEvent('keydown', { key: '7', code: 'Digit7', bubbles: true });
      dom.dispatchEvent(inputEvt);

      // Caret remains functional, no freeze or lockup
      expect(widget.isFocused).toBe(true);
      expect(dom.querySelectorAll('.eq-caret').length).toBe(1);

      view.destroy();
      c.remove();
    });
  });
});
