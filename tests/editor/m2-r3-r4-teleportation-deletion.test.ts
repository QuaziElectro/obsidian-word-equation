/**
 * Milestone 2 Acceptance & Unit Tests:
 * - R3: Boundary Teleportation Bugs (clean exit at EOF via ArrowRight/ArrowDown without teleporting to earlier headings).
 * - R4: Deletion Behavior & Teleportation:
 *   1. Backspace immediately after equation deletes entire equation block.
 *   2. Inside equation: Delete on empty equation deletes entire equation.
 *   3. Inside equation: Delete on non-empty equation deletes element to right of caret.
 *   4. Inside equation: Backspace at start of non-empty equation selects the entire equation in CodeMirror (so next Backspace deletes it).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  createSlot,
  createToken,
  createFraction,
  resetIdCounter,
  isEquationEmpty,
} from '../../src/core/ast';
import { handleDelete } from '../../src/editor/selection';
import {
  getActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import { createMockEditor } from '../helpers/cm6-mock';

describe('Milestone 2: R3 (EOF Exit Teleportation) & R4 (Deletion Behaviors)', () => {
  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
  });

  afterEach(() => {
    clearActiveEquationState();
  });

  // =========================================================================
  // Helper: isEquationEmpty
  // =========================================================================
  describe('isEquationEmpty helper', () => {
    it('returns true for an empty root slot', () => {
      const root = createSlot('root', []);
      expect(isEquationEmpty(root)).toBe(true);
    });

    it('returns true for an empty token or placeholder only', () => {
      const root = createSlot('root', [createToken('', 'mi')]);
      expect(isEquationEmpty(root)).toBe(true);
    });

    it('returns false for a non-empty token', () => {
      const root = createSlot('root', [createToken('x', 'mi')]);
      expect(isEquationEmpty(root)).toBe(false);
    });

    it('returns false for a structural box (fraction)', () => {
      const frac = createFraction(createSlot('numerator', []), createSlot('denominator', []));
      const root = createSlot('root', [frac]);
      expect(isEquationEmpty(root)).toBe(false);
    });
  });

  // =========================================================================
  // R3: Boundary Teleportation Bugs (Clean EOF Exit)
  // =========================================================================
  describe('R3: Clean EOF Exit without Teleportation', () => {
    it('exits block equation at absolute EOF via ArrowRight by appending a trailing newline', () => {
      const docStr = `## 6. Shortcut Expansion Target\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Enter equation from end (at offset 0 of empty mrow)
      widget!.enterFromEnd(view);
      expect(widget!.isFocused).toBe(true);

      const initialDocLength = view.state.doc.length;

      // Simulate ArrowRight inside the equation to trigger exitDirection === 'after'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Widget should no longer be focused
      expect(widget!.isFocused).toBe(false);

      // Trailing newline must have been inserted so doc length increases by 1
      expect(view.state.doc.length).toBe(initialDocLength + 1);
      expect(view.state.doc.sliceString(initialDocLength, initialDocLength + 1)).toBe('\n');

      // Selection must be cleanly placed on the new line at EOF
      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);

      // Cursor must NOT have teleported to or before the heading
      const headingLine = view.state.doc.line(1);
      expect(view.state.selection.main.anchor).toBeGreaterThan(headingLine.to);
      expect(view.state.doc.sliceString(headingLine.from, headingLine.to)).toBe('## 6. Shortcut Expansion Target');

      view.destroy();
      container.remove();
    });

    it('exits block equation at absolute EOF via ArrowDown by appending a trailing newline', () => {
      const docStr = `## 6. Shortcut Expansion Target\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromEnd(view);
      const initialDocLength = view.state.doc.length;

      // Simulate ArrowDown inside equation to trigger exitDirection === 'down'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      expect(widget!.isFocused).toBe(false);
      expect(view.state.doc.length).toBe(initialDocLength + 1);
      expect(view.state.selection.main.anchor).toBe(view.state.doc.length);

      view.destroy();
      container.remove();
    });

    it('exits block equation not at EOF cleanly to the following line without adding newlines', () => {
      const docStr = `## 6. Shortcut Expansion Target\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n\`\`\`\nFollowing paragraph`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromEnd(view);
      const initialDocLength = view.state.doc.length;

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      // Document length must be completely unchanged
      expect(view.state.doc.length).toBe(initialDocLength);

      // Cursor must be placed at the start of the following line ("Following paragraph")
      const followingLine = view.state.doc.line(view.state.doc.lines);
      expect(followingLine.text).toBe('Following paragraph');
      expect(view.state.selection.main.anchor).toBe(followingLine.from);

      view.destroy();
      container.remove();
    });

    it('exits inline equation via ArrowRight to widget.to position', () => {
      const docStr = `Prefix /weq_inline <math><mi>x</mi></math> /weq_inline suffix`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromEnd(view);
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

      expect(widget!.isFocused).toBe(false);
      expect(view.state.selection.main.anchor).toBe(widget!.to);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // R4: Rule 1 — Backspace Immediately After Equation Deletes Block
  // =========================================================================
  describe('R4: Rule 1 — Backspace Immediately After Equation Deletes Entire Block', () => {
    it('deletes block equation when Backspace is pressed from the line immediately following it at EOF', () => {
      // Setup document with an equation at EOF that previously exited via ArrowRight
      const docStr = `## 6. Shortcut Expansion Target\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n\`\`\`\n`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const equationFrom = widget!.from;

      // Position cursor at the very end of the document (on the trailing empty line immediately after the block)
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      expect(view.state.selection.main.head).toBe(view.state.doc.length);

      // Press Backspace in CodeMirror
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // The entire equation block and following newline must be deleted
      expect(view.state.doc.toString()).toBe(`## 6. Shortcut Expansion Target\n`);
      expect(view.state.selection.main.anchor).toBe(equationFrom);

      // No equation decorations should remain
      const decsAfter = view.state.field(wordEquationStateField);
      expect(decsAfter.size).toBe(0);

      view.destroy();
      container.remove();
    });

    it('deletes block equation when Backspace is pressed from start of following paragraph', () => {
      const docStr = `## Heading\n\`\`\`math-word\n<math><mi>x</mi></math>\n\`\`\`\nFollowing text`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const equationFrom = widget!.from;

      // Place cursor at the start of "Following text"
      const curLine = view.state.doc.line(view.state.doc.lines);
      expect(curLine.text).toBe('Following text');
      view.dispatch({ selection: { anchor: curLine.from } });

      // Press Backspace in CodeMirror
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation block is deleted, "Following text" moves to equationFrom
      expect(view.state.doc.toString()).toBe(`## Heading\nFollowing text`);
      expect(view.state.selection.main.anchor).toBe(equationFrom);

      view.destroy();
      container.remove();
    });

    it('deletes inline equation when Backspace is pressed immediately after it', () => {
      const docStr = `Before /weq_inline <math><mi>x</mi></math> /weq_inline after`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const equationFrom = widget!.from;
      const equationTo = widget!.to;

      // Position cursor immediately after inline equation
      view.dispatch({ selection: { anchor: equationTo } });

      // Press Backspace in CodeMirror
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Inline equation is deleted
      expect(view.state.doc.toString()).toBe(`Before  after`);
      expect(view.state.selection.main.anchor).toBe(equationFrom);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // R4: Rule 2 — Inside Equation: Delete on Empty Equation Deletes Entire Equation
  // =========================================================================
  describe('R4: Rule 2 — Delete on Empty Equation Deletes Entire Equation', () => {
    it('deletes entire empty block equation when Delete is pressed inside it', () => {
      const docStr = `## 6. Shortcut Expansion Target\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const equationFrom = widget!.from;
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);
      expect(isEquationEmpty(widget!.ast)).toBe(true);

      // Press Delete inside the empty equation
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // The entire equation block must be deleted from document
      expect(view.state.doc.toString()).toBe(`## 6. Shortcut Expansion Target\n`);
      expect(view.state.selection.main.anchor).toBe(equationFrom);
      expect(getActiveEquationState()).toBeNull();

      view.destroy();
      container.remove();
    });

    it('deletes entire empty inline equation when Delete is pressed inside it', () => {
      const docStr = `Prefix /weq_inline <math><mrow></mrow></math> /weq_inline suffix`;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const equationFrom = widget!.from;
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(isEquationEmpty(widget!.ast)).toBe(true);

      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(view.state.doc.toString()).toBe(`Prefix  suffix`);
      expect(view.state.selection.main.anchor).toBe(equationFrom);

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // R4: Rule 3 — Inside Equation: Delete on Non-Empty Equation Deletes Element to Right
  // =========================================================================
  describe('R4: Rule 3 — Delete on Non-Empty Equation Deletes Element to Right of Caret', () => {
    it('deletes single token to right of caret without deleting equation', () => {
      const docStr = `\`\`\`math-word\n<math><mi>x</mi><mo>+</mo><mi>y</mi></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.caret.offset).toBe(0); // Before 'x'
      expect(widget!.ast.children.length).toBe(3);

      // Press Delete inside equation
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      // Equation must remain active and focused
      expect(widget!.isFocused).toBe(true);
      expect(widget!.ast.children.length).toBe(2);
      expect((widget!.ast.children[0] as any).text).toBe('+');
      expect((widget!.ast.children[1] as any).text).toBe('y');
      expect(widget!.caret.offset).toBe(0);

      // Document must be synchronized
      expect(view.state.doc.toString()).toContain('<mo>+</mo>');
      expect(view.state.doc.toString()).not.toContain('<mi>x</mi>');

      view.destroy();
      container.remove();
    });

    it('deletes single character from multi-character token to right of caret', () => {
      const root = createSlot('root', [createToken('123', 'mn')]);
      const caret = { slotId: root.id, offset: 0 };

      const res = handleDelete(root, caret);
      expect(res.handled).toBe(true);
      expect(res.root.children.length).toBe(1);
      expect((res.root.children[0] as any).text).toBe('23');
      expect(res.caret.offset).toBe(0);
    });

    it('deletes structural box to right of caret', () => {
      const frac = createFraction(createSlot('numerator', []), createSlot('denominator', []));
      const root = createSlot('root', [frac, createToken('z', 'mi')]);
      const caret = { slotId: root.id, offset: 0 };

      const res = handleDelete(root, caret);
      expect(res.handled).toBe(true);
      expect(res.root.children.length).toBe(1);
      expect(res.root.children[0].type).toBe('token');
      expect((res.root.children[0] as any).text).toBe('z');
    });
  });

  // =========================================================================
  // R4: Rule 4 — Inside Equation: Backspace at Start Selects Equation
  // =========================================================================
  describe('R4: Rule 4 — Backspace at Start of Non-Empty Equation Selects Equation', () => {
    it('selects the entire equation range in CodeMirror without jumping to earlier headings', () => {
      const docStr = `## 6. Shortcut Expansion Target\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow><mi>x</mi></mrow>\n</math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);
      expect(widget!.caret.offset).toBe(0);
      expect(isEquationEmpty(widget!.ast)).toBe(false);

      // Press Backspace at offset 0 of non-empty equation
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Equation active state is cleared
      expect(widget!.isFocused).toBe(false);

      // Selection must span the entire equation [from, to]
      const sel = view.state.selection.main;
      expect(sel.empty).toBe(false);
      expect(sel.from).toBe(widget!.from);
      expect(sel.to).toBe(widget!.to);

      // Selection head must be at widget.from (so cursor did not jump to heading)
      expect(sel.head).toBe(widget!.from);

      // Heading must be completely intact
      const headingLine = view.state.doc.line(1);
      expect(headingLine.text).toBe('## 6. Shortcut Expansion Target');

      // Subsequent Backspace on CodeMirror contentDOM deletes the selected equation
      view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // The entire equation is now deleted!
      expect(view.state.doc.toString()).toBe(`## 6. Shortcut Expansion Target\n`);
      expect(view.state.selection.main.anchor).toBe(widget!.from);

      view.destroy();
      container.remove();
    });

    it('immediately deletes empty equation when Backspace is pressed at start', () => {
      const docStr = `## Heading\n\`\`\`math-word\n<math><mrow></mrow></math>\n\`\`\``;
      const { view, container } = createMockEditor(docStr, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, docStr.length, (from, to, dec) => {
        widget = (dec.spec as any).widget;
      });
      expect(widget).not.toBeNull();
      const equationFrom = widget!.from;
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(isEquationEmpty(widget!.ast)).toBe(true);

      // Press Backspace inside empty equation
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      // Empty equation is directly deleted
      expect(view.state.doc.toString()).toBe(`## Heading\n`);
      expect(view.state.selection.main.anchor).toBe(equationFrom);

      view.destroy();
      container.remove();
    });
  });
});
