import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';
import {
  createSlot,
  createToken,
  resetIdCounter,
  findSlotById,
  extractSelectionAST,
  normalizeSelection,
} from '../../src/core/ast';
import { CaretPosition, SelectionRange, SlotNode } from '../../src/core/types';
import { WordEquationWidget } from '../../src/editor/widget';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import {
  clearActiveEquationState,
  setActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';
import { createMockEditor } from '../helpers/cm6-mock';

describe('Bugs 1 to 3 Acceptance Test Suite (R4 Criteria)', () => {
  let container: HTMLElement;
  let styleEl: HTMLStyleElement;
  let mockView: EditorView;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);

    const editorResult = createMockEditor(' '.repeat(200));
    mockView = editorResult.view;
    mockContainer = editorResult.container;

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
    if (mockView) mockView.destroy();
    if (mockContainer) mockContainer.remove();
    if (styleEl) styleEl.remove();
    document.body.innerHTML = '';
  });

  function createMockClipboardEvent(initialData: Record<string, string> = {}): {
    event: ClipboardEvent;
    storage: Record<string, string>;
  } {
    const storage: Record<string, string> = { ...initialData };
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: {
        types: Object.keys(storage),
        setData: vi.fn((type: string, val: string) => {
          storage[type] = val;
        }),
        getData: vi.fn((type: string) => storage[type] || ''),
      },
    } as unknown as ClipboardEvent;
    return { event, storage };
  }

  // =========================================================================
  // BUG 1: Arrow after selection collapses directly to boundary without extra step
  // =========================================================================
  describe('Bug 1: Arrow Key Selection Collapse (ArrowLeft -> start, ArrowRight -> end)', () => {
    it('Scenario 1.1: Forward selection inside equation collapses to left edge on ArrowLeft without extra step', () => {
      // Equation: "abc"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Select "bc": forward selection from offset 1 to offset 3
      widget.isFocused = true;
      widget.caret = { slotId, offset: 3 };
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 3 },
      };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Press ArrowLeft (unshifted)
      const handled = widget.handleArrowNavigation('ArrowLeft', false, mockView);

      expect(handled).toBe(true);
      // Must collapse directly to left edge (offset 1), NOT move one extra character left (offset 0)
      expect(widget.caret).toEqual({ slotId, offset: 1 });
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
      expect(getActiveEquationState()?.selection).toBeNull();
    });

    it('Scenario 1.2: Forward selection inside equation collapses to right edge on ArrowRight without extra step', () => {
      // Equation: "abc"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Select "b": forward selection from offset 1 to offset 2
      widget.isFocused = true;
      widget.caret = { slotId, offset: 2 };
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 2 },
      };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Press ArrowRight (unshifted)
      const handled = widget.handleArrowNavigation('ArrowRight', false, mockView);

      expect(handled).toBe(true);
      // Must collapse directly to right edge (offset 2), NOT advance an extra step to offset 3
      expect(widget.caret).toEqual({ slotId, offset: 2 });
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
    });

    it('Scenario 1.3: Backward selection inside equation collapses to right edge on ArrowRight (opposite to expansion)', () => {
      // Equation: "abc"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Backward selection: Anchor at offset 3, Head at offset 1 (selected "bc" backwards)
      widget.isFocused = true;
      widget.caret = { slotId, offset: 1 };
      widget.selection = {
        anchor: { slotId, offset: 3 },
        head: { slotId, offset: 1 },
      };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Press ArrowRight (unshifted)
      const handled = widget.handleArrowNavigation('ArrowRight', false, mockView);

      expect(handled).toBe(true);
      // Must collapse directly to the right edge (offset 3), NOT step to offset 2
      expect(widget.caret).toEqual({ slotId, offset: 3 });
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
    });

    it('Scenario 1.4: Backward selection inside equation collapses to left edge on ArrowLeft without overshoot', () => {
      // Equation: "abc"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Backward selection: Anchor at offset 3, Head at offset 1
      widget.isFocused = true;
      widget.caret = { slotId, offset: 1 };
      widget.selection = {
        anchor: { slotId, offset: 3 },
        head: { slotId, offset: 1 },
      };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      // Press ArrowLeft (unshifted)
      const handled = widget.handleArrowNavigation('ArrowLeft', false, mockView);

      expect(handled).toBe(true);
      // Must collapse directly to left edge (offset 1), NOT overshoot to offset 0
      expect(widget.caret).toEqual({ slotId, offset: 1 });
      expect(widget.selection).toBeNull();
      expect(widget.highlightedSlotId).toBeNull();
    });

    it('Scenario 1.5: Placeholder highlight collapses to start on ArrowLeft and end on ArrowRight', () => {
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Highlight the entire slot
      widget.isFocused = true;
      widget.highlightedSlotId = slotId;
      widget.selection = null;

      // ArrowLeft collapses to offset 0
      const handledLeft = widget.handleArrowNavigation('ArrowLeft', false, mockView);
      expect(handledLeft).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: 0 });
      expect(widget.highlightedSlotId).toBeNull();

      // Reset highlight, ArrowRight collapses to slot length (3)
      widget.highlightedSlotId = slotId;
      const handledRight = widget.handleArrowNavigation('ArrowRight', false, mockView);
      expect(handledRight).toBe(true);
      expect(widget.caret).toEqual({ slotId, offset: widget.ast.children.length });
      expect(widget.highlightedSlotId).toBeNull();
    });

    it('Scenario 1.6: InteractiveEquationBox mirrors ArrowLeft and ArrowRight collapse behavior', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>',
        onChange: () => {},
      });
      box.focus();

      const slotId = box.ast.id;

      // Set forward selection (offset 1 to 3)
      box.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 3 },
      };
      box.updateVisualState();

      // Press ArrowLeft
      const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
      box.dom.dispatchEvent(leftEvent);
      expect(box.caret.offset).toBe(1);
      expect(box.selection).toBeNull();

      // Set backward selection (offset 3 to 1)
      box.selection = {
        anchor: { slotId, offset: 3 },
        head: { slotId, offset: 1 },
      };
      box.updateVisualState();

      // Press ArrowRight
      const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
      box.dom.dispatchEvent(rightEvent);
      expect(box.caret.offset).toBe(3);
      expect(box.selection).toBeNull();
    });
  });

  // =========================================================================
  // BUG 2: Shift+Arrow stuck at equation boundary (Regression)
  // =========================================================================
  describe('Bug 2: Shift+Arrow Boundary Traversals & Surrounding Text Extension', () => {
    it('Scenario 2.1: Shift+ArrowRight from before equation selects across equation and extends past it into subsequent text', () => {
      const doc = 'Prefix text\n/weq_inline <math><mi>x</mi></math> /weq_inlineSuffix text';
      const fallbackKeymap: Extension = EditorView.domEventHandlers({
        keydown: (evt, v) => {
          if (evt.shiftKey && evt.key === 'ArrowRight' && !evt.defaultPrevented) {
            v.dispatch({
              selection: {
                anchor: v.state.selection.main.anchor,
                head: Math.min(v.state.doc.length, v.state.selection.main.head + 1),
              },
            });
            return true;
          }
          return false;
        },
      });

      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);
      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('Suffix text');

      // 1. Position cursor immediately before equation
      view.dispatch({ selection: { anchor: eqStart, head: eqStart } });
      expect(view.state.selection.main.anchor).toBe(eqStart);
      expect(view.state.selection.main.head).toBe(eqStart);

      // 2. First Shift+ArrowRight press: atomically jumps selection across equation
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(eqStart);
      expect(view.state.selection.main.head).toBeGreaterThanOrEqual(eqEnd);

      const headAfterEq = view.state.selection.main.head;

      // 3. Second Shift+ArrowRight press: extends past the equation into "Suffix text"
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);

      expect(view.state.selection.main.anchor).toBe(eqStart);
      expect(view.state.selection.main.head).toBe(headAfterEq + 1);

      // 4. Multiple consecutive Shift+ArrowRight presses: smoothly extends further
      for (let step = 2; step <= 5; step++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);
        expect(view.state.selection.main.head).toBe(headAfterEq + step);
      }

      view.destroy();
      c.remove();
    });

    it('Scenario 2.2: Shift+ArrowLeft from after equation selects across equation backward and extends past it into preceding text', () => {
      const doc = 'Prefix text\n/weq_inline <math><mi>x</mi></math> /weq_inlineSuffix text';
      const fallbackKeymap: Extension = EditorView.domEventHandlers({
        keydown: (evt, v) => {
          if (evt.shiftKey && evt.key === 'ArrowLeft' && !evt.defaultPrevented) {
            v.dispatch({
              selection: {
                anchor: v.state.selection.main.anchor,
                head: Math.max(0, v.state.selection.main.head - 1),
              },
            });
            return true;
          }
          return false;
        },
      });

      const { view, container: c } = createMockEditor(doc, [fallbackKeymap], true);
      const eqStart = doc.indexOf('/weq_inline');
      const eqEnd = doc.indexOf('Suffix text');

      // 1. Position cursor immediately after equation
      view.dispatch({ selection: { anchor: eqEnd, head: eqEnd } });
      expect(view.state.selection.main.anchor).toBe(eqEnd);
      expect(view.state.selection.main.head).toBe(eqEnd);

      // 2. First Shift+ArrowLeft press: atomically jumps backward across equation
      const keyEvt1 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt1);

      expect(view.state.selection.main.anchor).toBe(eqEnd);
      expect(view.state.selection.main.head).toBeLessThanOrEqual(eqStart);

      const headBeforeEq = view.state.selection.main.head;

      // 3. Second Shift+ArrowLeft press: extends past the equation into "Prefix text"
      const keyEvt2 = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvt2);

      expect(view.state.selection.main.anchor).toBe(eqEnd);
      expect(view.state.selection.main.head).toBe(headBeforeEq - 1);

      // 4. Consecutive Shift+ArrowLeft presses smoothly extend further backwards
      for (let step = 2; step <= 5; step++) {
        const keyEvt = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(keyEvt);
        expect(view.state.selection.main.head).toBe(headBeforeEq - step);
      }

      view.destroy();
      c.remove();
    });
  });

  // =========================================================================
  // BUG 3: Partial selection copies entire equation
  // =========================================================================
  describe('Bug 3: Partial Selection MathML Serialization, Clipboard Copy, Paste & Cut', () => {
    it('Scenario 3.1: extractSelectionAST extracts only selected sub-tree intra-slot', () => {
      // Equation: "a b c d"
      const root = createSlot('root', [
        createToken('a', 'mi'),
        createToken('b', 'mi'),
        createToken('c', 'mi'),
        createToken('d', 'mi'),
      ]);

      // Select tokens "b" and "c" (offsets 1 to 3)
      const sel: SelectionRange = {
        anchor: { slotId: root.id, offset: 1 },
        head: { slotId: root.id, offset: 3 },
      };

      const extracted = extractSelectionAST(root, sel);
      expect(extracted.role).toBe('root');
      expect(extracted.children.length).toBe(2);
      expect((extracted.children[0] as any).text).toBe('b');
      expect((extracted.children[1] as any).text).toBe('c');

      const serialized = serializeMathML(extracted, { display: 'inline', pretty: false });
      expect(serialized).toContain('<mi>b</mi><mi>c</mi>');
      expect(serialized).not.toContain('<mi>a</mi>');
      expect(serialized).not.toContain('<mi>d</mi>');
    });

    it('Scenario 3.2: Copying a partial fraction in equation copies ONLY the fraction, not surrounding tokens', () => {
      // Equation: \frac{a}{asd}aas
      const fullXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mfrac>
    <mi>a</mi>
    <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
  </mfrac>
  <mi>a</mi>
  <mi>a</mi>
  <mi>s</mi>
</math>`;
      const widget = new WordEquationWidget(fullXml, 0, 200, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      // Select ONLY the fraction (root slot offset 0 to 1)
      const rootSlot = widget.ast;
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId: rootSlot.id, offset: 0 },
        head: { slotId: rootSlot.id, offset: 1 },
      };
      widget.caret = { slotId: rootSlot.id, offset: 1 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      const { event: copyEvt, storage } = createMockClipboardEvent();
      widget.handleCopyEvent(copyEvt, false);

      expect(copyEvt.preventDefault).toHaveBeenCalled();
      const mathml = storage['application/mathml+xml'];
      expect(mathml).toBeDefined();
      expect(mathml).toContain('<mfrac>');
      expect(mathml).toContain('<mi>a</mi>');
      // Must NOT contain the unselected suffix tokens 'aas'
      expect(mathml).not.toContain('<mi>s</mi></math>');
      // Length must be strictly less than full equation length
      expect(mathml.length).toBeLessThan(fullXml.length);
    });

    it('Scenario 3.3: Copying a highlighted slot copies only that slot children', () => {
      const fullXml = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mfrac>
    <mi>a</mi>
    <mrow><mi>a</mi><mi>s</mi><mi>d</mi></mrow>
  </mfrac>
  <mi>x</mi>
</math>`;
      const widget = new WordEquationWidget(fullXml, 0, 200, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const fracNode = widget.ast.children[0] as any;
      const numSlot = fracNode.numerator;

      // Highlight the numerator slot
      widget.isFocused = true;
      widget.selection = null;
      widget.highlightedSlotId = numSlot.id;
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: { slotId: numSlot.id, offset: 1 },
        selection: null,
        highlightedSlotId: numSlot.id,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      const { event: copyEvt, storage } = createMockClipboardEvent();
      widget.handleCopyEvent(copyEvt, false);

      const mathml = storage['application/mathml+xml'];
      expect(mathml).toBeDefined();
      expect(mathml).toContain('<mi>a</mi>');
      expect(mathml).not.toContain('<mfrac>');
      expect(mathml).not.toContain('<mi>x</mi>');
    });

    it('Scenario 3.4: Cut with partial selection deletes only the selected nodes and leaves surrounding nodes intact', () => {
      // Equation: "a b c d"
      const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>a</mi><mi>b</mi><mi>c</mi><mi>d</mi></mrow></math>';
      const widget = new WordEquationWidget(xml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;

      // Select tokens "b" and "c" (offsets 1 to 3)
      widget.isFocused = true;
      widget.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 3 },
      };
      widget.caret = { slotId, offset: 3 };
      setActiveEquationState({
        from: widget.from,
        to: widget.to,
        caret: widget.caret,
        selection: widget.selection,
        highlightedSlotId: null,
        isFocused: true,
        ast: widget.ast,
      }, widget);

      const { event: cutEvt, storage } = createMockClipboardEvent();
      widget.handleCopyEvent(cutEvt, true);

      // Clipboard has only "bc"
      expect(storage['application/mathml+xml']).toContain('<mi>b</mi>');
      expect(storage['application/mathml+xml']).toContain('<mi>c</mi>');
      expect(storage['application/mathml+xml']).not.toContain('<mi>a</mi>');
      expect(storage['application/mathml+xml']).not.toContain('<mi>d</mi>');

      // AST after cut has only "a" and "d" remaining
      const updatedSlot = findSlotById(widget.ast, slotId);
      expect(updatedSlot).toBeDefined();
      expect(updatedSlot!.children.length).toBe(2);
      expect((updatedSlot!.children[0] as any).text).toBe('a');
      expect((updatedSlot!.children[1] as any).text).toBe('d');
      expect(widget.caret.offset).toBe(1);
      expect(widget.selection).toBeNull();
    });

    it('Scenario 3.5: Pasting partial MathML into equation embeds only that partial structure', () => {
      const initialXml = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mrow><mi>x</mi></mrow></math>';
      const widget = new WordEquationWidget(initialXml, 0, 100, false);
      const dom = widget.toDOM(mockView);
      container.appendChild(dom);

      const slotId = widget.ast.id;
      widget.isFocused = true;
      widget.caret = { slotId, offset: 1 }; // after 'x'

      // Paste a partial fraction snippet
      const partialSnippet = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>1</mi><mi>2</mi></mfrac></math>';
      const { event: pasteEvt } = createMockClipboardEvent({
        'application/mathml+xml': partialSnippet,
        'text/plain': partialSnippet,
      });

      widget.handlePasteEvent(pasteEvt);

      // Now target slot has 'x' followed by the fraction
      expect(widget.ast.children.length).toBe(2);
      expect(widget.ast.children[0].type).toBe('token');
      expect(widget.ast.children[1].type).toBe('fraction');
    });

    it('Scenario 3.6: InteractiveEquationBox copies and cuts partial selection accurately', () => {
      const box = new InteractiveEquationBox({
        container,
        initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mi>b</mi><mi>c</mi></mrow></math>',
        onChange: () => {},
      });
      box.focus();

      const slotId = box.ast.id;

      // Select 'b' (offset 1 to 2)
      box.selection = {
        anchor: { slotId, offset: 1 },
        head: { slotId, offset: 2 },
      };
      box.caret = { slotId, offset: 2 };
      box.updateVisualState();

      // Copy
      const { event: copyEvt, storage: copyStorage } = createMockClipboardEvent();
      box.handleCopyEvent(copyEvt, false);
      expect(copyStorage['application/mathml+xml']).toContain('<mi>b</mi>');
      expect(copyStorage['application/mathml+xml']).not.toContain('<mi>a</mi>');
      expect(copyStorage['application/mathml+xml']).not.toContain('<mi>c</mi>');

      // Cut
      const { event: cutEvt, storage: cutStorage } = createMockClipboardEvent();
      box.handleCopyEvent(cutEvt, true);
      expect(cutStorage['application/mathml+xml']).toContain('<mi>b</mi>');

      // Remaining AST is 'ac'
      const updatedSlot = findSlotById(box.ast, slotId);
      expect(updatedSlot!.children.length).toBe(2);
      expect((updatedSlot!.children[0] as any).text).toBe('a');
      expect((updatedSlot!.children[1] as any).text).toBe('c');
      expect(box.caret.offset).toBe(1);
    });
  });
});
