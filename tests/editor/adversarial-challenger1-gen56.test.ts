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

describe('Adversarial Challenger 1 (Gen 56): Empirical Stress Suite for Bugs 1, 2, 5', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;

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
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    styleEl.remove();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // BUG 1: Nested Structure Highlight Brightness Compounding & Stacking Stress
  // =========================================================================
  describe('Bug 1 Empirical Challenge: Deeply Nested Hierarchies & Highlight Non-Compounding', () => {
    // 3-level nesting: Fraction inside Square Root inside Fraction
    const nestedFracInRootInFracXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
      <mfrac>
        <mrow>
          <msqrt>
            <mfrac>
              <mrow><mi>a</mi></mrow>
              <mrow><mi>b</mi></mrow>
            </mfrac>
          </msqrt>
        </mrow>
        <mrow><mi>c</mi></mrow>
      </mfrac>
    </math>`;

    it('Scenario 1.1: Root selection of fraction containing root containing fraction applies .eq-selected-structure strictly to outermost structure', () => {
      const ast = parseMathML(nestedFracInRootInFracXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      const rootSlot = ast;
      const selection: SelectionRange = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const allSelectedStructures = dom.querySelectorAll('.eq-selected-structure');
      // Exactly ONE element must receive .eq-selected-structure (the outermost fraction)
      expect(allSelectedStructures.length).toBe(1);

      const outerFraction = dom.querySelector('.eq-fraction');
      expect(outerFraction).not.toBeNull();
      expect(outerFraction?.classList.contains('eq-selected-structure')).toBe(true);

      // Deeply nested radical must NOT receive .eq-selected-structure
      const radical = dom.querySelector('.eq-radical');
      expect(radical).not.toBeNull();
      expect(radical?.classList.contains('eq-selected-structure')).toBe(false);

      // Deeply nested inner fraction must NOT receive .eq-selected-structure
      const innerFraction = radical?.querySelector('.eq-fraction');
      expect(innerFraction).not.toBeNull();
      expect(innerFraction?.classList.contains('eq-selected-structure')).toBe(false);

      // Child structures must NOT receive .eq-selected-structure
      expect(dom.querySelectorAll('.eq-selected-structure').length).toBe(1);
      expect(dom.querySelectorAll('.eq-radical.eq-selected-structure').length).toBe(0);
      expect(dom.querySelectorAll('.eq-numerator .eq-fraction.eq-selected-structure').length).toBe(0);

      // Child tokens inside the selected structure are protected by CSS suppression
      const rules = Array.from(styleEl.sheet?.cssRules || []);
      const tokenSuppression = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-selected-token')
      );
      expect(tokenSuppression?.cssText).toContain('transparent');
    });

    it('Scenario 1.2: 4-Level Deep Nesting: Subscript -> Fraction -> Radical -> Fraction', () => {
      const fourLevelXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msub>
          <mi>X</mi>
          <mrow>
            <mfrac>
              <mrow>
                <msqrt>
                  <mfrac>
                    <mrow><mi>u</mi></mrow>
                    <mrow><mi>v</mi></mrow>
                  </mfrac>
                </msqrt>
              </mrow>
              <mrow><mn>2</mn></mrow>
            </mfrac>
          </mrow>
        </msub>
      </math>`;

      const ast = parseMathML(fourLevelXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      // Select outer subscript at root slot
      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const allSelectedStructures = dom.querySelectorAll('.eq-selected-structure');
      // Exactly ONE element receives .eq-selected-structure across all 4 levels
      expect(allSelectedStructures.length).toBe(1);

      const scriptBox = dom.querySelector('.eq-script-box');
      expect(scriptBox).not.toBeNull();
      expect(scriptBox?.classList.contains('eq-selected-structure')).toBe(true);

      // Verify none of the deeper descendants have .eq-selected-structure
      const descendantStructs = scriptBox?.querySelectorAll(
        '.eq-fraction, .eq-radical'
      );
      expect(descendantStructs?.length).toBeGreaterThanOrEqual(3);
      descendantStructs?.forEach((el) => {
        expect(el.classList.contains('eq-selected-structure')).toBe(false);
      });
    });

    it('Scenario 1.3: Intermediate nested selection (selecting radical inside fraction numerator)', () => {
      const ast = parseMathML(nestedFracInRootInFracXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      // Find the numerator slot of outer fraction
      const outerFrac = ast.children[0] as any;
      expect(outerFrac.type).toBe('fraction');
      const numSlot = outerFrac.numerator as SlotNode;

      // Select only the radical in the numerator slot (offset 0 to 1)
      const selection: SelectionRange = {
        anchor: { slotId: numSlot.id, offset: 0 },
        head: { slotId: numSlot.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const allSelectedStructures = dom.querySelectorAll('.eq-selected-structure');
      // Only the radical gets .eq-selected-structure
      expect(allSelectedStructures.length).toBe(1);

      const radical = dom.querySelector('.eq-radical');
      expect(radical?.classList.contains('eq-selected-structure')).toBe(true);

      // Outer fraction does NOT get .eq-selected-structure
      const outerFraction = dom.querySelector('.eq-fraction');
      expect(outerFraction?.classList.contains('eq-selected-structure')).toBe(false);

      // Innermost fraction inside radical does NOT get .eq-selected-structure
      const innerFraction = radical?.querySelector('.eq-fraction');
      expect(innerFraction?.classList.contains('eq-selected-structure')).toBe(false);
    });

    it('Scenario 1.4: Matrix inside Fraction inside Radical nesting', () => {
      const matrixInFracInRootXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <msqrt>
          <mfrac>
            <mrow>
              <mfenced open="[" close="]">
                <mtable>
                  <mtr>
                    <mtd><mn>1</mn></mtd>
                    <mtd><mn>2</mn></mtd>
                  </mtr>
                </mtable>
              </mfenced>
            </mrow>
            <mrow><mn>3</mn></mrow>
          </mfrac>
        </msqrt>
      </math>`;

      const ast = parseMathML(matrixInFracInRootXml);
      const renderer = new DomRenderer();
      const dom = renderer.render(ast);
      container.appendChild(dom);

      // Select outer radical at root
      const selection: SelectionRange = {
        anchor: { slotId: ast.id, offset: 0 },
        head: { slotId: ast.id, offset: 1 },
      };

      updatePartialSelectionDom(dom, ast, selection, null);

      const selectedStructures = dom.querySelectorAll('.eq-selected-structure');
      expect(selectedStructures.length).toBe(1);

      const radical = dom.querySelector('.eq-radical');
      expect(radical?.classList.contains('eq-selected-structure')).toBe(true);

      const frac = dom.querySelector('.eq-fraction');
      expect(frac?.classList.contains('eq-selected-structure')).toBe(false);

      const matrix = dom.querySelector('.eq-matrix');
      expect(matrix?.classList.contains('eq-selected-structure')).toBe(false);
    });

    it('Scenario 1.5: CSS stylesheet suppression rules guarantee background-color transparency on nested elements', () => {
      const rules = Array.from(styleEl.sheet?.cssRules || []);

      const structSuppression = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-selected-structure')
      );
      expect(structSuppression).toBeDefined();
      expect(structSuppression?.cssText).toContain('transparent');
      expect(structSuppression?.cssText).toContain('!important');

      const tokenSuppression = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-selected-token')
      );
      expect(tokenSuppression).toBeDefined();
      expect(tokenSuppression?.cssText).toContain('transparent');

      const slotSuppression = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-selected-slot')
      );
      expect(slotSuppression).toBeDefined();
      expect(slotSuppression?.cssText).toContain('transparent');

      const partialSuppression = rules.find((r) =>
        r.cssText.includes('.eq-selected-structure .eq-partial-selected')
      );
      expect(partialSuppression).toBeDefined();
      expect(partialSuppression?.cssText).toContain('transparent');
    });
  });

  // =========================================================================
  // BUG 2: Mouse Click Outside Equation Clearing State Stress
  // =========================================================================
  describe('Bug 2 Empirical Challenge: External Clicks Across Diverse Document Positions', () => {
    it('Scenario 2.1: Click preceding text in editor clears selection, focus, and DOM classes', () => {
      const doc = 'Heading 1\nPreceding markdown line with ample text\n/weq_inline <math><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></math> /weq_inline\nFollowing line';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });

      expect(widget).not.toBeNull();
      widget = widget!;

      // 1. Enter and select tokens
      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 0 },
        head: { slotId: widget.ast.id, offset: 2 },
      };
      widget.updateCaretOnly();

      expect(widget.isFocused).toBe(true);
      expect(widget.selection).not.toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBeGreaterThan(0);

      // 2. Click preceding text on line 1
      const line1 = view.state.doc.line(1);
      view.dispatch({ selection: { anchor: line1.from + 2, head: line1.from + 2 } });
      const pointerEvt = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(pointerEvt);

      // 3. Verify absolute cleanup
      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
      expect(getActiveEquationState()).toBeNull();

      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-structure').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-slot').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-partial-selected').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: Click subsequent text on later line clears selection completely', () => {
      const doc = 'Line 1\n/weq_inline <math><mi>x</mi><mo>=</mo><mn>42</mn></math> /weq_inline\nLine 3 markdown text\nLine 4 markdown text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });

      expect(widget).not.toBeNull();
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 0 },
        head: { slotId: widget.ast.id, offset: 3 },
      };
      widget.updateCaretOnly();

      expect(widget.selection).not.toBeNull();

      // Click on Line 4
      const line4 = view.state.doc.line(4);
      view.dispatch({ selection: { anchor: line4.from + 3, head: line4.from + 3 } });
      const pointerEvt = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(pointerEvt);

      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.3: Inter-Equation Handshake: Clicking Equation 2 clears Equation 1 selection', () => {
      const doc = 'Prefix\n/weq_inline <math><mi>a</mi><mo>+</mo><mi>b</mi></math> /weq_inline\nMiddle text\n/weq_inline <math><mi>c</mi><mo>+</mo><mi>d</mi></math> /weq_inline\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      const widgets: WordEquationWidget[] = [];
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widgets.push(w);
      });

      expect(widgets.length).toBe(2);
      const [w1, w2] = widgets;

      // 1. Focus Equation 1 and select tokens
      w1.enterFromStart(view, 'ArrowRight');
      w1.selection = {
        anchor: { slotId: w1.ast.id, offset: 0 },
        head: { slotId: w1.ast.id, offset: 2 },
      };
      w1.updateCaretOnly();

      expect(w1.isFocused).toBe(true);
      expect(w1.selection).not.toBeNull();
      expect((w1 as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBeGreaterThan(0);
      expect(getActiveEquationState()?.from).toBe(w1.from);

      // 2. Click directly into Equation 2
      const w2MathBox = (w2 as any).containerEl?.querySelector('.word-equation-math') as HTMLElement;
      expect(w2MathBox).not.toBeNull();

      // Simulate mouse activation on w2
      w2.enterFromStart(view, 'ArrowRight');

      // 3. Verification: Equation 1 must have selection and highlights wiped
      expect(w1.isFocused).toBe(false);
      expect(w1.selection).toBeNull();
      expect(w1.highlightedSlotId).toBeNull();
      expect((w1 as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect((w1 as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);

      // Equation 2 is now active
      expect(w2.isFocused).toBe(true);
      expect(getActiveEquationState()?.from).toBe(w2.from);

      view.destroy();
      c.remove();
    });

    it('Scenario 2.4: External blur to document.body clears selection and detaches observers', () => {
      const doc = '/weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
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

      // Dispatch genuine focusout event to external element outside editor
      const externalEl = document.createElement('button');
      document.body.appendChild(externalEl);

      const focusoutEvt = new FocusEvent('focusout', {
        bubbles: true,
        cancelable: true,
        relatedTarget: externalEl,
      });
      dom.dispatchEvent(focusoutEvt);

      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect(getActiveEquationState()).toBeNull();
      expect(dom.querySelectorAll('.eq-selected-token').length).toBe(0);

      externalEl.remove();
      view.destroy();
      c.remove();
    });

    it('Scenario 2.5: Hostile re-render / updateCaretOnly after click outside does NOT revive ghost highlights', () => {
      const doc = 'Text\n/weq_inline <math><mi>k</mi></math> /weq_inline';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 0 },
        head: { slotId: widget.ast.id, offset: 1 },
      };
      widget.updateCaretOnly();

      // Outside click
      const pointerEvt = new MouseEvent('pointerdown', { bubbles: true });
      view.contentDOM.dispatchEvent(pointerEvt);

      // Now call updateCaretOnly() and rerender() multiple times while unfocused
      widget.updateCaretOnly();
      widget.rerender();
      widget.updateCaretOnly();

      expect(widget.selection).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-structure').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 5: Escape Key Caret Cleanup & Zero Ghost Caret Stress
  // =========================================================================
  describe('Bug 5 Empirical Challenge: Escape Key Cleanup Across Varied Configurations', () => {
    it('Scenario 5.1: Escape from innermost slot of 3-level deep nested fraction leaves exactly 0 .eq-caret and 1 CM caret outside', () => {
      // 3-level fraction: 1 / (2 / (3 / 4))
      const nestedXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
        <mfrac>
          <mrow><mn>1</mn></mrow>
          <mrow>
            <mfrac>
              <mrow><mn>2</mn></mrow>
              <mrow>
                <mfrac>
                  <mrow><mn>3</mn></mrow>
                  <mrow><mn>4</mn></mrow>
                </mfrac>
              </mrow>
            </mfrac>
          </mrow>
        </mfrac>
      </math>`;

      const doc = `Intro\n\`\`\`math-word\n${nestedXml}\n\`\`\`\nOutro`;
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });

      expect(widget).not.toBeNull();
      widget = widget!;

      // 1. Enter equation and navigate to deepest slot (number 4)
      widget.enterFromStart(view, 'ArrowRight');
      const allSlots = (widget as any).ast;
      // Position caret at end of deepest slot
      widget.caret = { slotId: allSlots.id, offset: 0 };
      widget.updateCaretOnly();

      expect(widget.isFocused).toBe(true);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(1);

      // 2. Dispatch Escape key on widget container DOM
      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      // 3. Strict verification
      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();

      // Zero ghost carets inside equation DOM
      const domCarets = (widget as any).containerEl?.querySelectorAll('.eq-caret');
      expect(domCarets?.length).toBe(0);

      // Exactly ONE cursor in CodeMirror document positioned outside equation
      expect(view.state.selection.ranges.length).toBe(1);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(widget.from);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.2: Escape while active partial selection exists wipes selection and eliminates carets', () => {
      const doc = 'Line\n/weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi><mo>+</mo><mi>z</mi></math> /weq_inline\nEnd';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 1 },
        head: { slotId: widget.ast.id, offset: 4 },
      };
      widget.updateCaretOnly();

      expect(widget.selection).not.toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBeGreaterThan(0);

      // Dispatch Escape
      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      // Wiped selection and zero carets
      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-token').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      expect(getActiveEquationState()).toBeNull();

      view.destroy();
      c.remove();
    });

    it('Scenario 5.3: Escape while composite structure is selected clears structure highlight and caret', () => {
      const doc = 'Line\n/weq_inline <math><mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac></math> /weq_inline\nEnd';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      widget.selection = {
        anchor: { slotId: widget.ast.id, offset: 0 },
        head: { slotId: widget.ast.id, offset: 1 },
      };
      widget.updateCaretOnly();

      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-structure').length).toBe(1);

      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect(widget.selection).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-selected-structure').length).toBe(0);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.4: Escape from completely empty equation gracefully exits with 0 carets', () => {
      const doc = 'Prefix\n/weq_inline <math><mrow></mrow></math> /weq_inline\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);

      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      expect(view.state.selection.ranges.length).toBe(1);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.5: Escape from single empty placeholder equation exits cleanly', () => {
      const doc = 'Prefix\n/weq_inline <math><mi></mi></math> /weq_inline\nSuffix';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');
      expect(widget.isFocused).toBe(true);

      const escEvt = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.6: Boundary position distinction: inline targets widget.from, block targets Math.max(0, widget.from - 1)', () => {
      // 1. Inline equation
      const inlineDoc = 'Line\n/weq_inline <math><mi>x</mi></math> /weq_inline\nTail';
      const { view: vInline, container: c1 } = createMockEditor(inlineDoc, [], true);
      let inlineWidget: WordEquationWidget | null = null;
      vInline.state.field(wordEquationStateField, false)?.between(0, inlineDoc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) inlineWidget = w;
      });
      inlineWidget!.enterFromStart(vInline, 'ArrowRight');

      const escEvt1 = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      (inlineWidget as any).containerEl?.dispatchEvent(escEvt1);

      expect(vInline.state.selection.main.head).toBe(inlineWidget!.from);

      // 2. Block equation
      const blockDoc = 'Line\n```math-word\n<math><mi>y</mi></math>\n```\nTail';
      const { view: vBlock, container: c2 } = createMockEditor(blockDoc, [], true);
      let blockWidget: WordEquationWidget | null = null;
      vBlock.state.field(wordEquationStateField, false)?.between(0, blockDoc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) blockWidget = w;
      });
      blockWidget!.enterFromStart(vBlock, 'ArrowRight');

      const escEvt2 = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      (blockWidget as any).containerEl?.dispatchEvent(escEvt2);

      expect(vBlock.state.selection.main.head).toBe(Math.max(0, blockWidget!.from - 1));

      vInline.destroy();
      c1.remove();
      vBlock.destroy();
      c2.remove();
    });

    it('Scenario 5.7: CodeMirror keymap Escape dispatch catches active widget cleanly', () => {
      const doc = 'Prefix text\n/weq_inline <math><mi>x</mi></math> /weq_inline\nSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);

      const decorations = view.state.field(wordEquationStateField, false);
      let widget: WordEquationWidget | null = null;
      decorations?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
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
      expect(view.state.selection.main.head).toBe(widget.from);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.8: Repeated Escape keypresses (triple Escape) remain stable and idempotent', () => {
      const doc = 'Before\n/weq_inline <math><mi>x</mi></math> /weq_inline\nAfter';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');

      for (let i = 0; i < 3; i++) {
        const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
        (widget as any).containerEl?.dispatchEvent(escEvt);
        view.contentDOM.dispatchEvent(escEvt);

        expect(widget.isFocused).toBe(false);
        expect(getActiveEquationState()).toBeNull();
        expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      }

      view.destroy();
      c.remove();
    });

    it('Scenario 5.9: Escape after entering via enterFromEnd (ArrowLeft) leaves single caret outside and zero ghost carets', () => {
      const doc = 'Prefix text\n/weq_inline <math><mi>y</mi></math> /weq_inlineSuffix text';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      // Enter from behind via ArrowLeft
      widget.enterFromEnd(view, 'ArrowLeft');
      expect(widget.isFocused).toBe(true);
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(1);

      // Press Escape
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      expect(view.state.selection.ranges.length).toBe(1);

      view.destroy();
      c.remove();
    });

    it('Scenario 5.10: Escape after typing input inside equation restores document caret cleanly', () => {
      const doc = 'Start\n/weq_inline <math><mi>x</mi></math> /weq_inline\nFinish';
      const { view, container: c } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField, false)?.between(0, doc.length, (f, t, dec) => {
        const w = (dec.spec as any)?.widget;
        if (w instanceof WordEquationWidget) widget = w;
      });
      widget = widget!;

      widget.enterFromStart(view, 'ArrowRight');

      // Dispatch character input
      const keyEvt = new KeyboardEvent('keydown', { key: '9', code: 'Digit9', bubbles: true });
      (widget as any).containerEl?.dispatchEvent(keyEvt);

      // Now press Escape
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      (widget as any).containerEl?.dispatchEvent(escEvt);

      expect(widget.isFocused).toBe(false);
      expect(getActiveEquationState()).toBeNull();
      expect((widget as any).containerEl?.querySelectorAll('.eq-caret').length).toBe(0);
      expect(view.state.selection.ranges.length).toBe(1);
      expect(view.state.selection.main.head).toBe(widget.from);

      view.destroy();
      c.remove();
    });
  });
});
