import { describe, it, expect, beforeEach } from 'vitest';
import { Text } from '@codemirror/state';
import {
  wordEquationStateField,
  buildEquationDecorations,
} from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  createSlot,
  createToken,
  createFraction,
  createSuperscript,
  createSubscript,
  createSubSup,
  createRadical,
  createRoot,
  createMatrix,
  createUnderOver,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import {
  handleArrowKey,
  handleTabKey,
} from '../../src/editor/navigation';
import { handleMouseClick } from '../../src/editor/hit-testing';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { setMockRect, mockSlotLayout } from '../helpers/dom-mock';
import { createMockEditor } from '../helpers/cm6-mock';
import { setLivePreviewEffect } from '../mocks/obsidian';

describe('R1 & R2 Empirical Challenger Stress Test Suite', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  /* =======================================================================
   * R1: Inline Mode & Source Mode Visibility Stress Tests
   * ======================================================================= */
  describe('R1 Stress: Inline Delimiters, Document Boundaries & Edge Cases', () => {
    it('handles inline equation at pos 0 (document start)', () => {
      const docStr = `/weq_inline <math><mi>x</mi></math> /weq_inline is at start`;
      const { state, view, container } = createMockEditor(docStr, [], true);
      const decs = state.field(wordEquationStateField);

      expect(decs.size).toBe(1);
      let foundWidget: WordEquationWidget | null = null;
      let fromPos = -1;
      let isBlock: boolean | undefined;

      decs.between(0, state.doc.length, (from, to, dec) => {
        fromPos = from;
        isBlock = (dec.spec as any).block;
        foundWidget = (dec.spec as any).widget;
      });

      expect(fromPos).toBe(0);
      expect(isBlock).toBe(false);
      expect(foundWidget).not.toBeNull();
      expect(foundWidget!.isInline).toBe(true);

      const dom = foundWidget!.toDOM(view);
      expect(dom.tagName.toLowerCase()).toBe('span');
      expect(dom.classList.contains('word-equation-inline')).toBe(true);

      view.destroy();
      container.remove();
    });

    it('handles inline equation at exact document end', () => {
      const docStr = `Text ending with /weq_inline <math><mi>y</mi></math> /weq_inline`;
      const { state, view, container } = createMockEditor(docStr, [], true);
      const decs = state.field(wordEquationStateField);

      expect(decs.size).toBe(1);
      let toPos = -1;
      let isBlock: boolean | undefined;

      decs.between(0, state.doc.length, (from, to, dec) => {
        toPos = to;
        isBlock = (dec.spec as any).block;
      });

      expect(toPos).toBe(docStr.length);
      expect(isBlock).toBe(false);

      view.destroy();
      container.remove();
    });

    it('handles document containing ONLY an inline equation', () => {
      const docStr = `$weq <math><mn>42</mn></math> $weq`;
      const { state, view, container } = createMockEditor(docStr, [], true);
      const decs = state.field(wordEquationStateField);

      expect(decs.size).toBe(1);
      decs.between(0, state.doc.length, (from, to, dec) => {
        expect(from).toBe(0);
        expect(to).toBe(docStr.length);
        expect((dec.spec as any).block).toBe(false);
      });

      view.destroy();
      container.remove();
    });

    it('handles back-to-back inline equations without spacing between them', () => {
      const docStr = `/weq_inline <math><mi>a</mi></math> /weq_inline/weq_inline <math><mi>b</mi></math> /weq_inline`;
      const { state, view, container } = createMockEditor(docStr, [], true);
      const decs = state.field(wordEquationStateField);

      expect(decs.size).toBe(2);
      const ranges: { from: number; to: number; block: boolean }[] = [];
      decs.between(0, state.doc.length, (from, to, dec) => {
        ranges.push({ from, to, block: (dec.spec as any).block });
      });

      expect(ranges.length).toBe(2);
      expect(ranges[0].block).toBe(false);
      expect(ranges[1].block).toBe(false);
      expect(ranges[0].to).toBe(ranges[1].from);

      view.destroy();
      container.remove();
    });

    it('handles multiline MathML inside inline syntax without breaking', () => {
      const docStr = `Inline multiline: /weq_inline\n<math>\n  <mfrac>\n    <mi>a</mi>\n    <mi>b</mi>\n  </mfrac>\n</math>\n/weq_inline and more text.`;
      const { state, view, container } = createMockEditor(docStr, [], true);
      const decs = state.field(wordEquationStateField);

      expect(decs.size).toBe(1);
      decs.between(0, state.doc.length, (from, to, dec) => {
        expect((dec.spec as any).block).toBe(false);
        const widget = (dec.spec as any).widget as WordEquationWidget;
        expect(widget.isInline).toBe(true);
      });

      view.destroy();
      container.remove();
    });

    it('gracefully ignores unclosed inline delimiter without crashing', () => {
      const docStr = `Here is unclosed /weq_inline <math><mi>x</mi></math> without ending delimiter`;
      const { state, view, container } = createMockEditor(docStr, [], true);
      const decs = state.field(wordEquationStateField);

      // Should not match because delimiter is not closed
      expect(decs.size).toBe(0);

      view.destroy();
      container.remove();
    });

    it('syncToDocument with $weq retains $weq delimiter syntax', () => {
      const docStr = `$weq <math><mi>x</mi></math> $weq`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromEnd(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));

      const updatedDoc = view.state.doc.toString();
      expect(updatedDoc).toContain('$weq');
      expect(updatedDoc).not.toContain('/weq_inline');
      expect(updatedDoc).not.toContain('```');

      view.destroy();
      container.remove();
    });
  });

  describe('R1 Stress: Source Mode Visibility & Rapid Toggling', () => {
    it('guarantees Source Mode NEVER creates replacing widgets for both block and inline equations', () => {
      const docStr = `# Document\n\n\`\`\`math-word\n<math><mi>X</mi></math>\n\`\`\`\n\nInline: /weq_inline <math><mi>Y</mi></math> /weq_inline\n\nEnd.`;
      const { state, view, container } = createMockEditor(docStr, [], false); // Source mode = false

      const decs = state.field(wordEquationStateField);
      expect(decs.size).toBe(0);

      // Ensure DOM has no widgets rendered
      expect(view.contentDOM.querySelector('.word-equation-block')).toBeNull();
      expect(view.contentDOM.querySelector('.word-equation-inline')).toBeNull();

      // Ensure raw text is displayed verbatim
      expect(view.contentDOM.textContent).toContain('```math-word');
      expect(view.contentDOM.textContent).toContain('/weq_inline');
      expect(view.contentDOM.textContent).toContain('<math><mi>X</mi></math>');
      expect(view.contentDOM.textContent).toContain('<math><mi>Y</mi></math>');

      view.destroy();
      container.remove();
    });

    it('survives rapid toggling between Live Preview and Source mode without state corruption', () => {
      const docStr = `\`\`\`math-word\n<math><mi>a</mi></math>\n\`\`\`\n$weq <math><mi>b</mi></math> $weq`;
      const { view, container } = createMockEditor(docStr, [], true);

      // Initial: Live Preview (2 decorations: 1 block, 1 inline)
      expect(view.state.field(wordEquationStateField).size).toBe(2);

      // Rapid toggle cycle: LP -> Source -> LP -> Source -> LP
      for (let i = 0; i < 3; i++) {
        view.dispatch({ effects: setLivePreviewEffect.of(false) });
        expect(view.state.field(wordEquationStateField).size).toBe(0);

        view.dispatch({ effects: setLivePreviewEffect.of(true) });
        expect(view.state.field(wordEquationStateField).size).toBe(2);
      }

      view.destroy();
      container.remove();
    });

    it('edits text in Source Mode, then toggles to Live Preview and parses updated equation correctly', () => {
      const initialDoc = `\`\`\`math-word\n<math><mi>x</mi></math>\n\`\`\``;
      const { view, container } = createMockEditor(initialDoc, [], false); // Start in Source mode

      expect(view.state.field(wordEquationStateField).size).toBe(0);

      // In Source Mode, edit '<mi>x</mi>' to '<mi>z</mi>'
      const replaceFrom = initialDoc.indexOf('<mi>x</mi>');
      view.dispatch({
        changes: { from: replaceFrom, to: replaceFrom + '<mi>x</mi>'.length, insert: '<mi>z</mi>' },
      });

      // Still in Source Mode -> decorations must remain 0
      expect(view.state.field(wordEquationStateField).size).toBe(0);

      // Now toggle to Live Preview
      view.dispatch({ effects: setLivePreviewEffect.of(true) });
      const decs = view.state.field(wordEquationStateField);
      expect(decs.size).toBe(1);

      let widget: WordEquationWidget | null = null;
      decs.between(0, view.state.doc.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });

      expect(widget).not.toBeNull();
      expect(widget!.code).toContain('<mi>z</mi>');
      const dom = widget!.toDOM(view);
      expect(dom.textContent).toContain('z');

      view.destroy();
      container.remove();
    });
  });

  /* =======================================================================
   * R2: Keyboard Navigation Stress Tests
   * ======================================================================= */
  describe('R2 Stress: Keyboard Navigation Entering & Exiting Equations', () => {
    it('enters inline equation from start via ArrowRight and exits after via ArrowRight', () => {
      const docStr = `Before /weq_inline <math><mi>k</mi></math> /weq_inline after`;
      const { view, container } = createMockEditor(docStr, [], true);

      const eqStart = docStr.indexOf('/weq_inline');
      const eqEnd = docStr.lastIndexOf('/weq_inline') + '/weq_inline'.length;

      // Position cursor right before the inline equation
      view.dispatch({ selection: { anchor: eqStart } });

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(eqStart, eqStart + 1, (from, to, dec) => {
        if (from === eqStart) widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Press ArrowRight at boundary -> enters widget at offset 0
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.offset).toBe(0);

      // Inside widget: step past 'k'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(widget!.caret.offset).toBe(1);

      // Step at end of inline widget -> exits to surrounding text at eqEnd
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.head).toBe(eqEnd);

      view.destroy();
      container.remove();
    });

    it('enters inline equation from end via ArrowLeft and exits before via ArrowLeft', () => {
      const docStr = `Before /weq_inline <math><mi>m</mi></math> /weq_inline after`;
      const { view, container } = createMockEditor(docStr, [], true);

      const eqStart = docStr.indexOf('/weq_inline');
      const eqEnd = docStr.lastIndexOf('/weq_inline') + '/weq_inline'.length;

      // Position cursor right after the inline equation
      view.dispatch({ selection: { anchor: eqEnd } });

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(eqStart, eqStart + 1, (from, to, dec) => {
        if (from === eqStart) widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Press ArrowLeft at boundary -> enters widget at end
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.offset).toBe(1);

      // Step back before 'm'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(widget!.caret.offset).toBe(0);

      // Step at start of inline widget -> exits before equation at eqStart
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.head).toBe(eqStart);

      view.destroy();
      container.remove();
    });

    it('exits equation via Backspace at offset 0 without deleting text outside', () => {
      const docStr = `/weq_inline <math><mi>a</mi></math> /weq_inline`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.caret.offset).toBe(0);

      // Press Backspace at offset 0
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));

      // Exits equation and places cursor at widget.from (0)
      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.head).toBe(0);
      // Doc content preserved
      expect(view.state.doc.toString()).toBe(docStr);

      view.destroy();
      container.remove();
    });
  });

  describe('R2 Stress: Deep Structural Traversals (Fractions, Radicals, Roots, Scripts, Matrices, UnderOver)', () => {
    it('navigates root with index: index slot <-> radicand slot', () => {
      const index = createSlot('index', [createToken('3', 'mn')]);
      const radicand = createSlot('radicand', [createToken('x', 'mi')]);
      const rootNode = createRoot(radicand, index);
      const root = createSlot('root', [rootNode]);
      updateParentPointers(root);

      // Start at root offset 0 -> ArrowRight enters radicand first
      let res = handleArrowKey(root, { slotId: root.id, offset: 0 }, 'ArrowRight');
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(radicand.id);
      expect(res.caret.offset).toBe(0);

      // Step past 'x' in radicand
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(radicand.id);
      expect(res.caret.offset).toBe(1);

      // At end of radicand -> steps to next sibling: index slot
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(index.id);
      expect(res.caret.offset).toBe(0);

      // Step past '3' in index
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(index.id);
      expect(res.caret.offset).toBe(1);

      // At end of index -> exits rootNode to parent root slot past rootNode
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(root.id);
      expect(res.caret.offset).toBe(1);

      // Backward traversal: ArrowLeft from root offset 1 enters index at end
      res = handleArrowKey(root, { slotId: root.id, offset: 1 }, 'ArrowLeft');
      expect(res.caret.slotId).toBe(index.id);
      expect(res.caret.offset).toBe(1);

      // Step before '3' in index
      res = handleArrowKey(root, res.caret, 'ArrowLeft');
      expect(res.caret.slotId).toBe(index.id);
      expect(res.caret.offset).toBe(0);

      // At start of index -> step back to radicand at end
      res = handleArrowKey(root, res.caret, 'ArrowLeft');
      expect(res.caret.slotId).toBe(radicand.id);
      expect(res.caret.offset).toBe(1);
    });

    it('navigates subsup structure (both subscript and superscript)', () => {
      const base = createSlot('base', [createToken('x', 'mi')]);
      const sub = createSlot('sub', [createToken('i', 'mi')]);
      const sup = createSlot('sup', [createToken('2', 'mn')]);
      const subsup = createSubSup(base, sub, sup);
      const root = createSlot('root', [subsup]);
      updateParentPointers(root);

      // Forward navigation: base -> sub -> sup -> exit
      let res = handleArrowKey(root, { slotId: root.id, offset: 0 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(base.id);

      res = handleArrowKey(root, { slotId: base.id, offset: 1 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(sub.id);
      expect(res.caret.offset).toBe(0);

      res = handleArrowKey(root, { slotId: sub.id, offset: 1 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(sup.id);
      expect(res.caret.offset).toBe(0);

      res = handleArrowKey(root, { slotId: sup.id, offset: 1 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(root.id);
      expect(res.caret.offset).toBe(1);

      // Vertical navigation in subsup:
      // In sub -> ArrowUp -> sup
      const vUp = handleArrowKey(root, { slotId: sub.id, offset: 1 }, 'ArrowUp');
      expect(vUp.handled).toBe(true);
      expect(vUp.caret.slotId).toBe(sup.id);

      // In sup -> ArrowDown -> sub
      const vDown = handleArrowKey(root, { slotId: sup.id, offset: 1 }, 'ArrowDown');
      expect(vDown.handled).toBe(true);
      expect(vDown.caret.slotId).toBe(sub.id);
    });

    it('navigates underover structure (limits / sums): base, under, over', () => {
      const base = createSlot('base', [createToken('∑', 'mo')]);
      const under = createSlot('under', [createToken('i', 'mi'), createToken('=', 'mo'), createToken('0', 'mn')]);
      const over = createSlot('over', [createToken('n', 'mi')]);
      const underover = createUnderOver(base, under, over);
      const root = createSlot('root', [underover]);
      updateParentPointers(root);

      // Forward: base -> under -> over -> exit
      let res = handleArrowKey(root, { slotId: root.id, offset: 0 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(base.id);

      res = handleArrowKey(root, { slotId: base.id, offset: 1 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(under.id);

      res = handleArrowKey(root, { slotId: under.id, offset: 3 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(over.id);

      res = handleArrowKey(root, { slotId: over.id, offset: 1 }, 'ArrowRight');
      expect(res.caret.slotId).toBe(root.id);
      expect(res.caret.offset).toBe(1);

      // Vertical navigation:
      // under -> ArrowUp -> base
      const up1 = handleArrowKey(root, { slotId: under.id, offset: 1 }, 'ArrowUp');
      expect(up1.handled).toBe(true);
      expect(up1.caret.slotId).toBe(base.id);

      // base -> ArrowUp -> over
      const up2 = handleArrowKey(root, { slotId: base.id, offset: 1 }, 'ArrowUp');
      expect(up2.handled).toBe(true);
      expect(up2.caret.slotId).toBe(over.id);

      // over -> ArrowDown -> base
      const down1 = handleArrowKey(root, { slotId: over.id, offset: 1 }, 'ArrowDown');
      expect(down1.handled).toBe(true);
      expect(down1.caret.slotId).toBe(base.id);

      // base -> ArrowDown -> under
      const down2 = handleArrowKey(root, { slotId: base.id, offset: 1 }, 'ArrowDown');
      expect(down2.handled).toBe(true);
      expect(down2.caret.slotId).toBe(under.id);
    });

    it('navigates completely empty structural boxes without hanging or erroring', () => {
      // Fraction with empty numerator and denominator
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // ArrowRight from root offset 0 enters numerator at 0
      let res = handleArrowKey(root, { slotId: root.id, offset: 0 }, 'ArrowRight');
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(num.id);
      expect(res.caret.offset).toBe(0);

      // ArrowRight in empty numerator advances to denominator at 0
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(den.id);
      expect(res.caret.offset).toBe(0);

      // ArrowRight in empty denominator exits fraction to root offset 1
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(root.id);
      expect(res.caret.offset).toBe(1);

      // Backward traversal:
      // ArrowLeft from root offset 1 enters denominator at 0
      let leftRes = handleArrowKey(root, { slotId: root.id, offset: 1 }, 'ArrowLeft');
      expect(leftRes.handled).toBe(true);
      expect(leftRes.caret.slotId).toBe(den.id);
      expect(leftRes.caret.offset).toBe(0);

      // ArrowLeft from empty denominator moves to numerator at 0
      leftRes = handleArrowKey(root, leftRes.caret, 'ArrowLeft');
      expect(leftRes.handled).toBe(true);
      expect(leftRes.caret.slotId).toBe(num.id);
      expect(leftRes.caret.offset).toBe(0);

      // ArrowLeft from empty numerator exits fraction to root offset 0
      leftRes = handleArrowKey(root, leftRes.caret, 'ArrowLeft');
      expect(leftRes.handled).toBe(true);
      expect(leftRes.caret.slotId).toBe(root.id);
      expect(leftRes.caret.offset).toBe(0);
    });

    it('stress tests deeply nested structure: fraction inside radical inside matrix cell', () => {
      // Cell (0,0): Fraction (1 / 2)
      const num = createSlot('numerator', [createToken('1', 'mn')]);
      const den = createSlot('denominator', [createToken('2', 'mn')]);
      const frac = createFraction(num, den);
      const rad = createRadical(createSlot('radicand', [frac]));
      const cell00 = createSlot('cell', [rad]);

      // Cell (0,1): Token 'k'
      const cell01 = createSlot('cell', [createToken('k', 'mi')]);

      const mat = createMatrix([[cell00, cell01]]);
      const root = createSlot('root', [mat]);
      updateParentPointers(root);

      // Traversal from start:
      // Enter matrix -> enter cell00 -> enter radical -> enter frac numerator
      let cur: { slotId: string; offset: number } = { slotId: root.id, offset: 0 };
      const visitedSlots: string[] = [];

      for (let step = 0; step < 20; step++) {
        const next = handleArrowKey(root, cur, 'ArrowRight');
        if (!next.handled) break;
        cur = next.caret;
        if (!visitedSlots.includes(cur.slotId)) {
          visitedSlots.push(cur.slotId);
        }
      }

      // Visited order must include cell00, radical radicand, fraction numerator, fraction denominator, cell01
      expect(visitedSlots).toContain(cell00.id);
      expect(visitedSlots).toContain(rad.radicand.id);
      expect(visitedSlots).toContain(num.id);
      expect(visitedSlots).toContain(den.id);
      expect(visitedSlots).toContain(cell01.id);
    });
  });

  /* =======================================================================
   * R2: Mouse Hit-Testing Stress Tests
   * ======================================================================= */
  describe('R2 Stress: Mouse Hit-Testing Accuracy, Placeholders & Direct Editing', () => {
    it('accurately hits empty placeholder box in a nested fraction and allows immediate typing', () => {
      const docStr = `\`\`\`math-word\n<math><mfrac><mrow></mrow><mn>5</mn></mfrac></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      const frac = widget!.ast.children[0] as any;
      const emptyNumSlot = frac.numerator;
      expect(emptyNumSlot.children.length).toBe(0);

      // Locate rendered empty placeholder element in numerator
      const placeholder = dom.querySelector('.eq-numerator .eq-placeholder') as HTMLElement;
      expect(placeholder).not.toBeNull();
      expect(placeholder.getAttribute('data-placeholder-for')).toBe(emptyNumSlot.id);

      // Set mock rect for placeholder
      setMockRect(placeholder, { left: 50, top: 10, width: 20, height: 20 });

      // Click directly on placeholder
      placeholder.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: 60,
          clientY: 20,
        })
      );

      // Caret must be placed exactly in empty numerator slot at offset 0
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.slotId).toBe(emptyNumSlot.id);
      expect(widget!.caret.offset).toBe(0);

      // Immediately type '7'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true }));

      // Numerator now has child token '7'
      const updatedFrac = widget!.ast.children[0] as any;
      expect(updatedFrac.numerator.children.length).toBe(1);
      expect((updatedFrac.numerator.children[0] as any).text).toBe('7');

      view.destroy();
      container.remove();
    });

    it('navigates seamlessly across two consecutive inline equations separated by text', () => {
      const docStr = `Word /weq_inline <math><mi>x</mi></math> /weq_inline middle /weq_inline <math><mi>y</mi></math> /weq_inline end`;
      const { view, container } = createMockEditor(docStr, [], true);

      const decs = view.state.field(wordEquationStateField);
      expect(decs.size).toBe(2);

      const widgets: WordEquationWidget[] = [];
      decs.between(0, docStr.length, (from, to, dec) => {
        widgets.push((dec.spec as any).widget);
      });
      expect(widgets.length).toBe(2);
      const dom1 = widgets[0].toDOM(view);
      const dom2 = widgets[1].toDOM(view);

      // 1. Enter first equation from start
      view.dispatch({ selection: { anchor: widgets[0].from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widgets[0].isFocused).toBe(true);

      // 2. Step through first equation and exit after
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); // past 'x'
      dom1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); // exits
      expect(widgets[0].isFocused).toBe(false);
      expect(view.state.selection.main.head).toBe(widgets[0].to);

      // 3. Move caret to before second equation
      view.dispatch({ selection: { anchor: widgets[1].from } });
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widgets[1].isFocused).toBe(true);

      // 4. Step through second equation and exit
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); // past 'y'
      dom2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); // exits
      expect(widgets[1].isFocused).toBe(false);
      expect(view.state.selection.main.head).toBe(widgets[1].to);

      view.destroy();
      container.remove();
    });

    it('handles block equation at document start (pos 0) without negative index errors', () => {
      const docStr = `\`\`\`math-word\n<math><mi>u</mi></math>\n\`\`\`\nTrailing text`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Enter from start
      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.offset).toBe(0);

      // ArrowLeft at start of equation at pos 0 -> exits before without negative pos error
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.head).toBe(0);

      // ArrowUp at start of equation at pos 0 -> exits up gracefully
      widget!.enterFromStart(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(0);

      view.destroy();
      container.remove();
    });

    it('handles block equation at exact document end without overflow errors', () => {
      const docStr = `Leading text\n\`\`\`math-word\n<math><mi>v</mi></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Enter from end
      widget!.enterFromEnd(view);
      expect(widget!.isFocused).toBe(true);

      // ArrowRight at end of equation -> exits after without exceeding doc.length
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(view.state.doc.length);

      // ArrowDown at end of equation -> exits down gracefully
      widget!.enterFromEnd(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(view.state.doc.length);

      view.destroy();
      container.remove();
    });

    it('Tab navigation cycles among empty slots in a partially filled matrix', () => {
      // 2x2 matrix where (0,0) has '1', (0,1) is empty, (1,0) is empty, (1,1) has '4'
      const c00 = createSlot('cell', [createToken('1', 'mn')]);
      const c01 = createSlot('cell', []); // empty
      const c10 = createSlot('cell', []); // empty
      const c11 = createSlot('cell', [createToken('4', 'mn')]);
      const mat = createMatrix([[c00, c01], [c10, c11]]);
      const root = createSlot('root', [mat]);
      updateParentPointers(root);

      // Tab key should cycle between empty slots: c01 and c10
      let res = handleTabKey(root, { slotId: c00.id, offset: 0 }, false);
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(c01.id);

      res = handleTabKey(root, res.caret, false);
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(c10.id);

      // Wrap around back to first empty slot
      res = handleTabKey(root, res.caret, false);
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(c01.id);

      // Shift-Tab backwards
      res = handleTabKey(root, res.caret, true);
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(c10.id);
    });

    it('targets radical surd symbol click to the radicand slot', () => {
      const radicand = createSlot('radicand', [createToken('x', 'mi')]);
      const rad = createRadical(radicand);
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      const surdEl = dom.querySelector('.eq-radical-surd') as HTMLElement;
      expect(surdEl).not.toBeNull();

      setMockRect(surdEl, { left: 10, top: 10, width: 15, height: 25 });
      const caret = handleMouseClick(root, dom, 15, 20, surdEl);

      // Radical click routes to radicand slot
      expect(caret.slotId).toBe(radicand.id);
    });

    it('accurately targets specific cell in a 3x3 matrix on click', () => {
      const row1 = [createSlot('cell', [createToken('1', 'mn')]), createSlot('cell', [createToken('2', 'mn')]), createSlot('cell', [createToken('3', 'mn')])];
      const row2 = [createSlot('cell', [createToken('4', 'mn')]), createSlot('cell', [createToken('5', 'mn')]), createSlot('cell', [createToken('6', 'mn')])];
      const row3 = [createSlot('cell', [createToken('7', 'mn')]), createSlot('cell', [createToken('8', 'mn')]), createSlot('cell', [createToken('9', 'mn')])];
      const mat = createMatrix([row1, row2, row3]);
      const root = createSlot('root', [mat]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);

      // We want to target cell (1, 1) containing '5'
      const targetCell = row2[1];
      const cellEls = Array.from(dom.querySelectorAll('.eq-matrix-cell')) as HTMLElement[];
      expect(cellEls.length).toBe(9);

      const cell5El = cellEls[4]; // 5th cell is (1,1)
      const token5El = cell5El.querySelector('.eq-token') as HTMLElement;
      expect(token5El.textContent).toBe('5');

      setMockRect(token5El, { left: 100, top: 100, width: 20, height: 20 });
      const caret = handleMouseClick(root, dom, 105, 110, token5El);

      expect(caret.slotId).toBe(targetCell.id);
      expect(caret.offset).toBe(0);
    });

    it('falls back gracefully to closest slot when clicking outside equation bounds', () => {
      const root = createSlot('root', [createToken('z', 'mi')]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);
      const slotEl = dom.querySelector('.eq-slot') as HTMLElement;
      setMockRect(slotEl, { left: 100, top: 100, width: 50, height: 20 });

      // Click way outside (x=500, y=500) without target element
      const caret = handleMouseClick(root, dom, 500, 500, null);

      expect(caret.slotId).toBe(root.id);
      // Offset clamped to end of slot
      expect(caret.offset).toBe(1);
    });
  });
});
