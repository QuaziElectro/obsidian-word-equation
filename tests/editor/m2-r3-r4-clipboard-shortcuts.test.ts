import { describe, it, expect, beforeEach } from 'vitest';
import { WordEquationWidget } from '../../src/editor/widget';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { createEquationNavigationExtension } from '../../src/editor/navigation-extension';
import { setCustomShortcuts, getCustomShortcuts, lookupCustomOrCatalog } from '../../src/shortcuts/catalog';
import { expandShortcutInSlot, expandShortcutInMarkdown } from '../../src/shortcuts/engine';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import { FractionNode, RadicalNode } from '../../src/core/types';

function createMockClipboardEvent(type: 'copy' | 'cut' | 'paste', data: Record<string, string> = {}): ClipboardEvent {
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

describe('Milestone 2 (R3 & R4): Copy/Paste MathML Integration & Complex Shortcut Expansions', () => {
  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setCustomShortcuts([]);
  });

  // =========================================================================
  // REQUIREMENT R3: COPY/PASTE MATHML INTEGRATION
  // =========================================================================
  describe('R3: Clipboard Copy & Cut within WordEquationWidget', () => {
    it('copy event serializes entire equation AST to raw MathML XML in clipboardData', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      // Focus equation
      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);

      // Dispatch copy event
      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      expect(copyEvent.defaultPrevented).toBe(true);
      const mathmlData = copyEvent.clipboardData?.getData('application/mathml+xml');
      const textData = copyEvent.clipboardData?.getData('text/plain');

      expect(mathmlData).toBeDefined();
      expect(mathmlData).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML"');
      expect(mathmlData).toContain('<mfrac>');
      expect(mathmlData).toContain('<mn>1</mn>');
      expect(mathmlData).toContain('<mn>2</mn>');
      expect(mathmlData).toContain('</mfrac>');
      expect(mathmlData).toContain('</math>');

      expect(textData).toBe(mathmlData);

      view.destroy();
      container.remove();
    });

    it('copy event serializes inline equation with display="inline"', () => {
      const doc = '/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math> /weq_inline';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      const mathmlData = copyEvent.clipboardData?.getData('application/mathml+xml');
      expect(mathmlData).toContain('display="inline"');
      expect(mathmlData).toContain('<mi>x</mi>');

      view.destroy();
      container.remove();
    });

    it('cut event serializes equation to clipboard and clears the active slot content', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mi>b</mi></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.ast.children.length).toBe(3);

      const cutEvent = createMockClipboardEvent('cut');
      dom.dispatchEvent(cutEvent);

      expect(cutEvent.defaultPrevented).toBe(true);
      expect(cutEvent.clipboardData?.getData('text/plain')).toContain('<math');
      expect(cutEvent.clipboardData?.getData('text/plain')).toContain('<mi>a</mi>');

      // Active slot children should be cleared
      expect(widget!.ast.children.length).toBe(0);
      expect(widget!.caret.offset).toBe(0);

      // Document synced
      expect(view.state.doc.toString()).not.toContain('<mi>a</mi>');

      view.destroy();
      container.remove();
    });
  });

  describe('R3: Clipboard Paste into Normal Markdown', () => {
    it('pasting raw MathML XML in Markdown creates a fenced math-word block and replaces it with widget', () => {
      const doc = '# Header\n\nSome introductory text.\n\n';
      const navExt = createEquationNavigationExtension();
      const { view, container } = createMockEditor(doc, [navExt], true);

      // Place cursor at the end of the document
      view.dispatch({ selection: { anchor: doc.length } });

      const rawMathML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>3</mn><mn>4</mn></mfrac></math>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': rawMathML,
        'application/mathml+xml': rawMathML,
      });

      // Dispatch on view content DOM
      const handled = view.contentDOM.dispatchEvent(pasteEvent);
      // Even if domEventHandlers intercepts it, let's verify document update
      const updatedDoc = view.state.doc.toString();
      expect(updatedDoc).toContain('```math-word');
      expect(updatedDoc).toContain('<mfrac>');
      expect(updatedDoc).toContain('<mn>3</mn>');
      expect(updatedDoc).toContain('<mn>4</mn>');
      expect(updatedDoc).toContain('```');

      // Decorations should now contain a WordEquationWidget
      let widgetCount = 0;
      view.state.field(wordEquationStateField).between(0, updatedDoc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widgetCount++;
        }
      });
      expect(widgetCount).toBe(1);

      view.destroy();
      container.remove();
    });

    it('pasting raw MathML with display="inline" in middle of line creates /weq_inline equation', () => {
      const doc = 'The formula is ';
      const navExt = createEquationNavigationExtension();
      const { view, container } = createMockEditor(doc, [navExt], true);

      view.dispatch({ selection: { anchor: doc.length } });

      const rawMathML = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': rawMathML,
      });

      view.contentDOM.dispatchEvent(pasteEvent);
      const updatedDoc = view.state.doc.toString();
      expect(updatedDoc).toContain('/weq_inline');
      expect(updatedDoc).toContain('<mi>E</mi>');
      expect(updatedDoc).toContain('/weq_inline');

      view.destroy();
      container.remove();
    });
  });

  describe('R3: Clipboard Paste Inside an Active Equation Slot', () => {
    it('pasting raw MathML fraction into an empty slot cleanly embeds the visual fraction', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      expect(widget!.isFocused).toBe(true);

      const mathmlToPaste = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>7</mn><mn>9</mn></mfrac></math>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'application/mathml+xml': mathmlToPaste,
        'text/plain': mathmlToPaste,
      });

      dom.dispatchEvent(pasteEvent);
      expect(pasteEvent.defaultPrevented).toBe(true);

      // Verify AST updated: root slot now has a FractionNode
      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('fraction');
      const frac = widget!.ast.children[0] as FractionNode;
      expect((frac.numerator.children[0] as any).text).toBe('7');
      expect((frac.denominator.children[0] as any).text).toBe('9');

      // Verify document synced with new fraction
      expect(view.state.doc.toString()).toContain('<mfrac>');
      expect(view.state.doc.toString()).toContain('<mn>7</mn>');
      expect(view.state.doc.toString()).toContain('<mn>9</mn>');

      view.destroy();
      container.remove();
    });

    it('pasting MathML fragment into nested fraction slot embeds structure inside target slot', () => {
      // Equation with fraction: 1 / [empty]
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mrow/></mfrac></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);

      widget!.enterFromStart(view);
      const fracNode = widget!.ast.children[0] as FractionNode;
      // Position caret in denominator slot
      widget!.caret = { slotId: fracNode.denominator.id, offset: 0 };
      setActiveEquationState({
        from: widget!.from,
        to: widget!.to,
        caret: widget!.caret,
        isFocused: true,
        ast: widget!.ast,
      });

      const nestedFracXml = '<mfrac><mn>2</mn><mn>3</mn></mfrac>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': nestedFracXml,
      });

      dom.dispatchEvent(pasteEvent);

      // Verify denominator now contains the nested fraction
      const updatedFrac = widget!.ast.children[0] as FractionNode;
      expect(updatedFrac.denominator.children.length).toBe(1);
      expect(updatedFrac.denominator.children[0].type).toBe('fraction');
      const nested = updatedFrac.denominator.children[0] as FractionNode;
      expect((nested.numerator.children[0] as any).text).toBe('2');
      expect((nested.denominator.children[0] as any).text).toBe('3');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // REQUIREMENT R4: COMPLEX SHORTCUT EXPANSIONS
  // =========================================================================
  describe('R4: Immediate Custom Shortcut Expansion on Typing', () => {
    it('typing \\ss (mapped to aa) inside equation immediately replaces trigger with aa on typing second s', () => {
      setCustomShortcuts([{ trigger: '\\ss', expansion: 'aa' }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type '\\'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      expect(widget!.ast.children.length).toBe(1);
      expect((widget!.ast.children[0] as any).text).toBe('\\');

      // Type 's'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      expect(widget!.ast.children.length).toBe(2);

      // Type 's' -> Immediately triggers custom shortcut expansion!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

      // Trigger '\ss' must be completely consumed and replaced by 'a' and 'a' tokens!
      expect(widget!.ast.children.length).toBe(2);
      expect((widget!.ast.children[0] as any).text).toBe('a');
      expect((widget!.ast.children[1] as any).text).toBe('a');
      expect(widget!.caret.offset).toBe(2);

      // Document synced
      expect(view.state.doc.toString()).toContain('<mi>a</mi>');
      expect(view.state.doc.toString()).not.toContain('\\');

      view.destroy();
      container.remove();
    });

    it('typing \\ss when trigger is configured as "ss" (without backslash) cleanly removes the leading backslash', () => {
      // User configures trigger without backslash in settings
      setCustomShortcuts([{ trigger: 'ss', expansion: 'aa' }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type '\\', then 's', then 's'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

      // Leading backslash must be cleanly consumed
      expect(widget!.ast.children.length).toBe(2);
      expect((widget!.ast.children[0] as any).text).toBe('a');
      expect((widget!.ast.children[1] as any).text).toBe('a');
      expect(widget!.ast.children.some((n: any) => n.text === '\\')).toBe(false);

      view.destroy();
      container.remove();
    });

    it('typing ss (without backslash) when trigger is configured as "\\ss" expands cleanly', () => {
      setCustomShortcuts([{ trigger: '\\ss', expansion: 'aa' }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type 's', then 's'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

      expect(widget!.ast.children.length).toBe(2);
      expect((widget!.ast.children[0] as any).text).toBe('a');
      expect((widget!.ast.children[1] as any).text).toBe('a');

      view.destroy();
      container.remove();
    });
  });

  describe('R4: MathML Shortcut Expansion & Caret Placement in Child Slot', () => {
    it('typing \\ss (mapped to MathML fraction) expands into visual fraction and places caret in numerator at offset 0', () => {
      const fracMathML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>';
      setCustomShortcuts([{ trigger: '\\ss', expansion: fracMathML }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type '\\', then 's', then 's'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

      // Structure must now be a FractionNode
      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('fraction');
      const frac = widget!.ast.children[0] as FractionNode;

      // Caret MUST be placed inside the numerator at offset 0
      expect(widget!.caret.slotId).toBe(frac.numerator.id);
      expect(widget!.caret.offset).toBe(0);

      // Active state reflects the caret in numerator
      const active = getActiveEquationState();
      expect(active?.caret.slotId).toBe(frac.numerator.id);

      // Immediately typing next character types into the numerator!
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
      const currentFrac = widget!.ast.children[0] as FractionNode;
      expect(currentFrac.numerator.children.length).toBe(1);
      expect((currentFrac.numerator.children[0] as any).text).toBe('5');
      expect(widget!.caret.slotId).toBe(currentFrac.numerator.id);
      expect(widget!.caret.offset).toBe(1);

      view.destroy();
      container.remove();
    });

    it('typing custom shortcut mapped to radical places caret into radicand slot at offset 0', () => {
      const radMathML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mrow/></msqrt></math>';
      setCustomShortcuts([{ trigger: '\\rad', expansion: radMathML }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type '\\', 'r', 'a', 'd'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));

      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('radical');
      const rad = widget!.ast.children[0] as RadicalNode;

      expect(widget!.caret.slotId).toBe(rad.radicand.id);
      expect(widget!.caret.offset).toBe(0);

      view.destroy();
      container.remove();
    });

    it('built-in shortcuts (like \\alpha or 1/2) do not prematurely expand on typing without delimiter', () => {
      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('a', 'mi'),
        createToken('l', 'mi'),
        createToken('p', 'mi'),
        createToken('h', 'mi'),
        createToken('a', 'mi'),
      ]);

      // Expand triggered by typing 'a' (non-delimiter)
      const resAlphaChar = expandShortcutInSlot(slot, 6, 'a');
      expect(resAlphaChar.expanded).toBe(false);

      // Expand triggered by delimiter Space
      const resAlphaSpace = expandShortcutInSlot(slot, 6, ' ');
      expect(resAlphaSpace.expanded).toBe(true);
      expect((resAlphaSpace.newSlot?.children[0] as any).text).toBe('α');
    });
  });
});
