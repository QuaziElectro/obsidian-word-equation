import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSlot,
  createToken,
  createFraction,
  createSuperscript,
  createSubscript,
  createSubSup,
  createRadical,
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
import {
  insertCharacter,
  handleBackspace,
  handleDelete,
} from '../../src/editor/selection';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { setMockRect, mockSlotLayout } from '../helpers/dom-mock';
import { WordEquationWidget } from '../../src/editor/widget';
import { wordEquationStateField } from '../../src/editor/state-field';
import { createMockEditor } from '../helpers/cm6-mock';

describe('Editor Navigation, Hit-Testing & Selection Test Suite', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('Horizontal Navigation (ArrowRight & ArrowLeft)', () => {
    it('steps sequentially through tokens in a slot via ArrowRight', () => {
      const root = createSlot('root', [
        createToken('a', 'mi'),
        createToken('+', 'mo'),
        createToken('b', 'mi'),
      ]);
      updateParentPointers(root);

      let caret = { slotId: root.id, offset: 0 };
      let res = handleArrowKey(root, caret, 'ArrowRight');
      expect(res.handled).toBe(true);
      expect(res.caret.offset).toBe(1);

      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.handled).toBe(true);
      expect(res.caret.offset).toBe(2);

      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.handled).toBe(true);
      expect(res.caret.offset).toBe(3);

      // At end of root slot
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.handled).toBe(false);
      expect(res.exitDirection).toBe('after');
    });

    it('descends into nested composite box (fraction) and exits cleanly', () => {
      const num = createSlot('numerator', [createToken('1', 'mn')]);
      const den = createSlot('denominator', [createToken('2', 'mn')]);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac, createToken('+', 'mo')]);
      updateParentPointers(root);

      // Caret at offset 0 before fraction
      let caret = { slotId: root.id, offset: 0 };
      let res = handleArrowKey(root, caret, 'ArrowRight');
      // Should enter fraction numerator at offset 0
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(num.id);
      expect(res.caret.offset).toBe(0);

      // Step past '1' in numerator
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(num.id);
      expect(res.caret.offset).toBe(1);

      // At end of numerator: move to denominator at offset 0
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(den.id);
      expect(res.caret.offset).toBe(0);

      // Step past '2' in denominator
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(den.id);
      expect(res.caret.offset).toBe(1);

      // At end of denominator: exit fraction to root slot past the fraction
      res = handleArrowKey(root, res.caret, 'ArrowRight');
      expect(res.caret.slotId).toBe(root.id);
      expect(res.caret.offset).toBe(1); // past frac (index 1 is before '+')
    });

    it('navigates backwards via ArrowLeft through tokens and enters nested boxes at their end', () => {
      const num = createSlot('numerator', [createToken('x', 'mi')]);
      const den = createSlot('denominator', [createToken('y', 'mi')]);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Start past fraction in root slot
      let caret = { slotId: root.id, offset: 1 };
      let res = handleArrowKey(root, caret, 'ArrowLeft');

      // Enters denominator at its end (offset 1)
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(den.id);
      expect(res.caret.offset).toBe(1);

      // Step before 'y' in denominator
      res = handleArrowKey(root, res.caret, 'ArrowLeft');
      expect(res.caret.slotId).toBe(den.id);
      expect(res.caret.offset).toBe(0);

      // At offset 0 of denominator: step back to numerator at its end
      res = handleArrowKey(root, res.caret, 'ArrowLeft');
      expect(res.caret.slotId).toBe(num.id);
      expect(res.caret.offset).toBe(1);

      // Step before 'x' in numerator
      res = handleArrowKey(root, res.caret, 'ArrowLeft');
      expect(res.caret.slotId).toBe(num.id);
      expect(res.caret.offset).toBe(0);

      // At offset 0 of numerator: exits fraction to root offset 0
      res = handleArrowKey(root, res.caret, 'ArrowLeft');
      expect(res.caret.slotId).toBe(root.id);
      expect(res.caret.offset).toBe(0);

      // ArrowLeft at root start: signals exit before
      res = handleArrowKey(root, res.caret, 'ArrowLeft');
      expect(res.handled).toBe(false);
      expect(res.exitDirection).toBe('before');
    });
  });

  describe('Vertical Navigation (ArrowUp & ArrowDown)', () => {
    it('hops vertically between fraction denominator and numerator', () => {
      const num = createSlot('numerator', [createToken('a', 'mi'), createToken('b', 'mi')]);
      const den = createSlot('denominator', [createToken('c', 'mi'), createToken('d', 'mi')]);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Denominator -> Numerator via ArrowUp
      const caretInDen = { slotId: den.id, offset: 2 };
      const resUp = handleArrowKey(root, caretInDen, 'ArrowUp');
      expect(resUp.handled).toBe(true);
      expect(resUp.caret.slotId).toBe(num.id);
      expect(resUp.caret.offset).toBe(2);

      // Numerator -> Denominator via ArrowDown
      const caretInNum = { slotId: num.id, offset: 1 };
      const resDown = handleArrowKey(root, caretInNum, 'ArrowDown');
      expect(resDown.handled).toBe(true);
      expect(resDown.caret.slotId).toBe(den.id);
      expect(resDown.caret.offset).toBe(1);
    });

    it('navigates vertically between matrix rows', () => {
      const cell00 = createSlot('cell', [createToken('1', 'mn')]);
      const cell01 = createSlot('cell', [createToken('2', 'mn')]);
      const cell10 = createSlot('cell', [createToken('3', 'mn')]);
      const cell11 = createSlot('cell', [createToken('4', 'mn')]);
      const mat = createMatrix([[cell00, cell01], [cell10, cell11]]);
      const root = createSlot('root', [mat]);
      updateParentPointers(root);

      // In row 0 col 1 -> down to row 1 col 1
      const resDown = handleArrowKey(root, { slotId: cell01.id, offset: 1 }, 'ArrowDown');
      expect(resDown.handled).toBe(true);
      expect(resDown.caret.slotId).toBe(cell11.id);
      expect(resDown.caret.offset).toBe(1);

      // In row 1 col 0 -> up to row 0 col 0
      const resUp = handleArrowKey(root, { slotId: cell10.id, offset: 0 }, 'ArrowUp');
      expect(resUp.handled).toBe(true);
      expect(resUp.caret.slotId).toBe(cell00.id);
      expect(resUp.caret.offset).toBe(0);
    });

    it('navigates vertically in subscript/superscript/underover', () => {
      const base = createSlot('base', [createToken('x', 'mi')]);
      const sub = createSlot('sub', [createToken('i', 'mi')]);
      const sup = createSlot('sup', [createToken('2', 'mn')]);
      const subsup = createSubSup(base, sub, sup);
      const root = createSlot('root', [subsup]);
      updateParentPointers(root);

      // From sub -> up to sup
      const resUp = handleArrowKey(root, { slotId: sub.id, offset: 1 }, 'ArrowUp');
      expect(resUp.handled).toBe(true);
      expect(resUp.caret.slotId).toBe(sup.id);

      // From sup -> down to sub
      const resDown = handleArrowKey(root, { slotId: sup.id, offset: 1 }, 'ArrowDown');
      expect(resDown.handled).toBe(true);
      expect(resDown.caret.slotId).toBe(sub.id);
    });
  });

  describe('Tab Key Navigation', () => {
    it('cycles directly between empty placeholder slots', () => {
      const num = createSlot('numerator', []); // empty
      const den = createSlot('denominator', []); // empty
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Start at numerator
      let res = handleTabKey(root, { slotId: num.id, offset: 0 }, false);
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(den.id);

      // From denominator, tab wraps around to numerator
      res = handleTabKey(root, { slotId: den.id, offset: 0 }, false);
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(num.id);

      // Shift-Tab backwards
      res = handleTabKey(root, { slotId: num.id, offset: 0 }, true);
      expect(res.handled).toBe(true);
      expect(res.caret.slotId).toBe(den.id);
    });
  });

  describe('Mouse Hit-Testing', () => {
    it('maps click inside a slot to correct character offset', () => {
      const root = createSlot('root', [
        createToken('a', 'mi'),
        createToken('+', 'mo'),
        createToken('b', 'mi'),
      ]);
      updateParentPointers(root);

      const renderer = new DomRenderer();
      const dom = renderer.render(root);
      const slotEl = dom.querySelector('.eq-slot') as HTMLElement;
      expect(slotEl).not.toBeNull();

      // Mock layout metrics: 'a' at 0..10, '+' at 10..20, 'b' at 20..30
      mockSlotLayout(slotEl, 0, 0, 10, 20);

      // Click at x=5 (midpoint of first token 'a') -> offset 0
      const c1 = handleMouseClick(root, dom, 5, 10);
      expect(c1.slotId).toBe(root.id);
      expect(c1.offset).toBe(0);

      // Click at x=8 (past midpoint of first token) -> offset 1
      const c2 = handleMouseClick(root, dom, 8, 10);
      expect(c2.slotId).toBe(root.id);
      expect(c2.offset).toBe(1);

      // Click at x=25 (midpoint of third token 'b') -> offset 2
      const c3 = handleMouseClick(root, dom, 25, 10);
      expect(c3.slotId).toBe(root.id);
      expect(c3.offset).toBe(2);

      // Click at x=50 (far to the right) -> end of slot (offset 3)
      const c4 = handleMouseClick(root, dom, 50, 10);
      expect(c4.slotId).toBe(root.id);
      expect(c4.offset).toBe(3);
    });

    it('clicking on empty placeholder returns offset 0 of target slot', () => {
      const root = createSlot('root', []);
      const renderer = new DomRenderer();
      const dom = renderer.render(root);
      const placeholder = dom.querySelector('.eq-placeholder') as HTMLElement;
      expect(placeholder).not.toBeNull();

      setMockRect(placeholder, { left: 10, top: 10, width: 20, height: 20 });
      const slotEl = dom.querySelector('.eq-slot') as HTMLElement;
      setMockRect(slotEl, { left: 10, top: 10, width: 20, height: 20 });

      // Click inside placeholder
      const caret = handleMouseClick(root, dom, 15, 15);
      expect(caret.slotId).toBe(root.id);
      expect(caret.offset).toBe(0);
    });
  });

  describe('Character Insertion, Backspace, and Dissolve', () => {
    it('inserts characters with appropriate token kind (mi, mn, mo)', () => {
      const root = createSlot('root', []);
      let res = insertCharacter(root, { slotId: root.id, offset: 0 }, 'x');
      expect(res.handled).toBe(true);
      expect(res.caret.offset).toBe(1);
      expect(res.root.children[0].type).toBe('token');
      expect((res.root.children[0] as any).tokenKind).toBe('mi');

      res = insertCharacter(res.root, res.caret, '+');
      expect(res.caret.offset).toBe(2);
      expect((res.root.children[1] as any).tokenKind).toBe('mo');

      res = insertCharacter(res.root, res.caret, '5');
      expect(res.caret.offset).toBe(3);
      expect((res.root.children[2] as any).tokenKind).toBe('mn');
    });

    it('deletes token characters via Backspace', () => {
      const root = createSlot('root', [createToken('x', 'mi'), createToken('y', 'mi')]);
      updateParentPointers(root);

      const res = handleBackspace(root, { slotId: root.id, offset: 2 });
      expect(res.handled).toBe(true);
      expect(res.caret.offset).toBe(1);
      expect(res.root.children.length).toBe(1);
      expect((res.root.children[0] as any).text).toBe('x');
    });

    it('dissolves empty composite box on backspace', () => {
      const num = createSlot('numerator', []);
      const den = createSlot('denominator', []);
      const frac = createFraction(num, den);
      const root = createSlot('root', [createToken('x', 'mi'), frac]);
      updateParentPointers(root);

      // Backspace right after empty fraction (offset 2)
      const res = handleBackspace(root, { slotId: root.id, offset: 2 });
      expect(res.handled).toBe(true);
      expect(res.root.children.length).toBe(1);
      expect((res.root.children[0] as any).text).toBe('x');
      expect(res.caret.offset).toBe(1);
    });

    it('dissolves empty superscript box and unwraps base', () => {
      const base = createSlot('base', [createToken('x', 'mi')]);
      const sup = createSlot('sup', []); // empty
      const supNode = createSuperscript(base, sup);
      const root = createSlot('root', [supNode]);
      updateParentPointers(root);

      // Backspace from inside the empty superscript
      const res = handleBackspace(root, { slotId: sup.id, offset: 0 });
      expect(res.handled).toBe(true);
      expect(res.root.children.length).toBe(1);
      expect((res.root.children[0] as any).text).toBe('x');
    });

    it('deletes forward with Delete key', () => {
      const root = createSlot('root', [createToken('a', 'mi'), createToken('b', 'mi')]);
      updateParentPointers(root);

      const res = handleDelete(root, { slotId: root.id, offset: 0 });
      expect(res.handled).toBe(true);
      expect(res.root.children.length).toBe(1);
      expect((res.root.children[0] as any).text).toBe('b');
    });
  });

  describe('R2 Acceptance Criteria: Seamless Caret Entry & Immediate Box Editing', () => {
    describe('Arrow Keys Enter Equation Block and Traverse Internal Structural Boxes', () => {
      it('ArrowRight enters equation from preceding text and traverses through fraction numerator to denominator', () => {
        const initialDoc = `Before text\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n\`\`\`\nAfter text`;
        const { view, container } = createMockEditor(initialDoc, [], true);

        const blockStart = initialDoc.indexOf('```math-word');
        const blockEnd = initialDoc.indexOf('```\nAfter text') + 3;

        // Position cursor in surrounding text immediately before equation block
        view.dispatch({ selection: { anchor: blockStart } });

        // Retrieve equation widget from state field decorations
        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField).between(blockStart, blockStart + 1, (from, to, dec) => {
          if (from === blockStart) widget = (dec.spec as any).widget;
        });
        expect(widget).not.toBeNull();
        const dom = widget!.toDOM(view);

        // Press ArrowRight at boundary -> enters equation block at start
        const arrowRightEvent = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(arrowRightEvent);

        expect(widget!.isFocused).toBe(true);
        expect(widget!.caret.offset).toBe(0);

        // Inside equation: step into fraction numerator ('a')
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        const frac = widget!.ast.children[0] as any;
        expect(widget!.caret.slotId).toBe(frac.numerator.id);
        expect(widget!.caret.offset).toBe(0);

        // Step past 'a' in numerator
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(widget!.caret.slotId).toBe(frac.numerator.id);
        expect(widget!.caret.offset).toBe(1);

        // Step from numerator into denominator ('b')
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(widget!.caret.slotId).toBe(frac.denominator.id);
        expect(widget!.caret.offset).toBe(0);

        // Step past 'b' in denominator
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(widget!.caret.slotId).toBe(frac.denominator.id);
        expect(widget!.caret.offset).toBe(1);

        // Step past fraction to root slot
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(widget!.caret.slotId).toBe(widget!.ast.id);
        expect(widget!.caret.offset).toBe(1);

        // Step at end of equation exits to surrounding text after equation block
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(widget!.isFocused).toBe(false);
        expect(view.state.selection.main.head).toBe(blockEnd + 1);

        view.destroy();
        container.remove();
      });

      it('ArrowLeft enters equation from succeeding text and navigates backwards through structural boxes', () => {
        const initialDoc = `Before text\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>\n\`\`\`\nAfter text`;
        const { view, container } = createMockEditor(initialDoc, [], true);

        const blockStart = initialDoc.indexOf('```math-word');
        const blockEnd = initialDoc.indexOf('```\nAfter text') + 3;

        // Position cursor immediately after equation block
        view.dispatch({ selection: { anchor: blockEnd } });

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField).between(blockStart, blockStart + 1, (from, to, dec) => {
          if (from === blockStart) widget = (dec.spec as any).widget;
        });
        expect(widget).not.toBeNull();
        const dom = widget!.toDOM(view);

        // Press ArrowLeft at boundary -> enters equation block at end
        view.contentDOM.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
        );

        expect(widget!.isFocused).toBe(true);
        expect(widget!.caret.offset).toBe(widget!.ast.children.length);

        // Step backwards into denominator
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        const frac = widget!.ast.children[0] as any;
        expect(widget!.caret.slotId).toBe(frac.denominator.id);
        expect(widget!.caret.offset).toBe(1);

        // Step before 'b'
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(widget!.caret.offset).toBe(0);

        // Step to numerator at end
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(widget!.caret.slotId).toBe(frac.numerator.id);
        expect(widget!.caret.offset).toBe(1);

        // Step before 'a'
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(widget!.caret.offset).toBe(0);

        // Step to root slot before fraction
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(widget!.caret.slotId).toBe(widget!.ast.id);
        expect(widget!.caret.offset).toBe(0);

        // Step before start of equation exits to surrounding text before equation block
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(widget!.isFocused).toBe(false);
        expect(view.state.selection.main.head).toBe(blockStart - 1);

        view.destroy();
        container.remove();
      });

      it('ArrowDown from line above and ArrowUp from line below enter equation block seamlessly', () => {
        const initialDoc = `Line 1\n\`\`\`math-word\n<math><mi>x</mi></math>\n\`\`\`\nLine 3`;
        const { view, container } = createMockEditor(initialDoc, [], true);

        const blockStart = initialDoc.indexOf('```math-word');
        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField).between(blockStart, blockStart + 1, (from, to, dec) => {
          if (from === blockStart) widget = (dec.spec as any).widget;
        });
        expect(widget).not.toBeNull();
        widget!.toDOM(view);

        // Place cursor on Line 1
        view.dispatch({ selection: { anchor: 2 } });
        view.contentDOM.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
        );

        // ArrowDown entered widget from start
        expect(widget!.isFocused).toBe(true);
        expect(widget!.caret.offset).toBe(0);

        // Exit widget
        widget!.isFocused = false;

        // Place cursor on Line 3
        const line3Pos = initialDoc.indexOf('Line 3') + 2;
        view.dispatch({ selection: { anchor: line3Pos } });
        view.contentDOM.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
        );

        // ArrowUp entered widget from end
        expect(widget!.isFocused).toBe(true);
        expect(widget!.caret.offset).toBe(widget!.ast.children.length);

        view.destroy();
        container.remove();
      });

      it('traverses complex equation boxes: radical and subscript sequentially', () => {
        const doc = `\`\`\`math-word\n<math><msqrt><msub><mi>x</mi><mn>1</mn></msub></msqrt></math>\n\`\`\``;
        const { view, container } = createMockEditor(doc, [], true);

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
          widget = (dec.spec as any).widget;
        });
        expect(widget).not.toBeNull();
        const dom = widget!.toDOM(view);

        // Enter from start
        widget!.enterFromStart(view);
        expect(widget!.isFocused).toBe(true);

        // Step into radical radicand
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        const rad = widget!.ast.children[0] as any;
        expect(rad.type).toBe('radical');
        expect(widget!.caret.slotId).toBe(rad.radicand.id);

        // Step into subscript base ('x')
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        const subNode = rad.radicand.children[0] as any;
        expect(subNode.type).toBe('subscript');
        expect(widget!.caret.slotId).toBe(subNode.base.id);

        // Step into subscript script ('1')
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(widget!.caret.slotId).toBe(subNode.sub.id);

        view.destroy();
        container.remove();
      });
    });

    describe('Mouse Hit-Testing and Immediate Field Editing', () => {
      it('clicking on a specific number in numerator places cursor at target and allows immediate editing', () => {
        const initialDoc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>42</mn><mi>x</mi></mfrac></math>\n\`\`\``;
        const { view, container } = createMockEditor(initialDoc, [], true);

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField).between(0, initialDoc.length, (from, to, dec) => {
          widget = (dec.spec as any).widget;
        });
        expect(widget).not.toBeNull();
        const dom = widget!.toDOM(view);

        const frac = widget!.ast.children[0] as any;
        expect(frac.type).toBe('fraction');
        const numSlot = frac.numerator;

        // Locate rendered numerator number token element
        const numTokenEl = dom.querySelector('.eq-numerator .eq-token') as HTMLElement;
        expect(numTokenEl).not.toBeNull();
        expect(numTokenEl.textContent).toBe('42');

        // Click on the numerator number token (simulate click at right side of token to place cursor after '42')
        setMockRect(numTokenEl, { left: 10, top: 10, width: 20, height: 20 });
        numTokenEl.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 25, // past midpoint
            clientY: 15,
          })
        );

        // Verify caret is focused and placed exactly in numerator slot after '42'
        expect(widget!.isFocused).toBe(true);
        expect(widget!.caret.slotId).toBe(numSlot.id);
        expect(widget!.caret.offset).toBe(1);

        // Immediately edit by typing '9' without any extra steps
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true }));

        // Verify numerator in updated AST now contains '9' inserted immediately
        const updatedFrac = widget!.ast.children[0] as any;
        expect(updatedFrac.numerator.children.length).toBe(2);
        expect((updatedFrac.numerator.children[1] as any).text).toBe('9');

        // Verify document is synchronized
        expect(view.state.doc.toString()).toContain('<mn>9</mn>');

        view.destroy();
        container.remove();
      });

      it('clicking on denominator field places cursor at target and allows immediate editing', () => {
        const initialDoc = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mn>100</mn></mfrac></math>\n\`\`\``;
        const { view, container } = createMockEditor(initialDoc, [], true);

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField).between(0, initialDoc.length, (from, to, dec) => {
          widget = (dec.spec as any).widget;
        });
        expect(widget).not.toBeNull();
        const dom = widget!.toDOM(view);

        const denTokenEl = dom.querySelector('.eq-denominator .eq-token') as HTMLElement;
        expect(denTokenEl).not.toBeNull();
        expect(denTokenEl.textContent).toBe('100');

        // Click on the denominator number token (left side -> offset 0 before '100')
        setMockRect(denTokenEl, { left: 10, top: 30, width: 30, height: 20 });
        denTokenEl.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 12, // before midpoint
            clientY: 35,
          })
        );

        const frac = widget!.ast.children[0] as any;
        const denSlot = frac.denominator;

        expect(widget!.isFocused).toBe(true);
        expect(widget!.caret.slotId).toBe(denSlot.id);
        expect(widget!.caret.offset).toBe(0);

        // Immediately type '-' at offset 0
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));

        const updatedFrac = widget!.ast.children[0] as any;
        expect(updatedFrac.denominator.children.length).toBe(2);
        expect((updatedFrac.denominator.children[0] as any).text).toBe('-');
        expect((updatedFrac.denominator.children[1] as any).text).toBe('100');

        view.destroy();
        container.remove();
      });

      it('clicking on radical radicand field allows immediate editing inside root', () => {
        const initialDoc = `\`\`\`math-word\n<math><msqrt><mi>x</mi></msqrt></math>\n\`\`\``;
        const { view, container } = createMockEditor(initialDoc, [], true);

        let widget: WordEquationWidget | null = null;
        view.state.field(wordEquationStateField).between(0, initialDoc.length, (from, to, dec) => {
          widget = (dec.spec as any).widget;
        });
        expect(widget).not.toBeNull();
        const dom = widget!.toDOM(view);

        const radTokenEl = dom.querySelector('.eq-radicand .eq-token') as HTMLElement;
        expect(radTokenEl).not.toBeNull();

        // Click on radicand token
        setMockRect(radTokenEl, { left: 10, top: 10, width: 20, height: 20 });
        radTokenEl.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            clientX: 25,
            clientY: 15,
          })
        );

        const rad = widget!.ast.children[0] as any;
        expect(widget!.caret.slotId).toBe(rad.radicand.id);

        // Immediately type '+' then '1'
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));

        const updatedRad = widget!.ast.children[0] as any;
        expect(updatedRad.radicand.children.length).toBe(3);
        expect(updatedRad.radicand.children.map((c: any) => c.text)).toEqual(['x', '+', '1']);

        view.destroy();
        container.remove();
      });
    });
  });
});
