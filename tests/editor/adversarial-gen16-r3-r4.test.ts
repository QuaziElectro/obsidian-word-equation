import { describe, it, expect, beforeEach } from 'vitest';
import { WordEquationWidget } from '../../src/editor/widget';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import {
  setCustomShortcuts,
  getCustomShortcuts,
  lookupSymbol,
} from '../../src/shortcuts/catalog';
import {
  expandShortcutInSlot,
  expandShortcutInMarkdown,
} from '../../src/shortcuts/engine';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  createRoot,
  createMatrix,
  createSuperscript,
  createSubscript,
  createSubSup,
  updateParentPointers,
  resetIdCounter,
  cloneSlot,
  findSlotById,
} from '../../src/core/ast';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import {
  MATHML_NAMESPACE,
  FractionNode,
  RadicalNode,
  RootNode,
  MatrixNode,
  SuperscriptNode,
  SubSupNode,
} from '../../src/core/types';
import { serializeMathML } from '../../src/core/mathml-serializer';
import { parseMathML } from '../../src/core/mathml-parser';

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

function parseAndValidateXML(xmlString: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`XML Parsing error: ${parserError.textContent}\nXML was:\n${xmlString}`);
  }
  return doc;
}

describe('Adversarial Challenge Suite: R3 (MathML Clipboard) & R4 (Shortcut Expansions)', () => {
  beforeEach(() => {
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = function () {
        return [] as any;
      };
    }
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = function () {
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        } as any;
      };
    }
    resetIdCounter();
    clearActiveEquationState();
    setCustomShortcuts([]);
  });

  // =========================================================================
  // REQUIREMENT R3: ADVERSARIAL MATHML COPY & CUT
  // =========================================================================
  describe('R3 Adversarial: MathML Copy & Cut', () => {
    it('copies deeply nested complex formula (fraction in radical in matrix) to valid W3C MathML XML', () => {
      // 2x2 matrix with nested structures
      const matrixXml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n' +
        '  <mtable>\n' +
        '    <mtr>\n' +
        '      <mtd><msqrt><mfrac><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow><mn>2</mn></mfrac></msqrt></mtd>\n' +
        '      <mtd><msub><mi>y</mi><mi>i</mi></msub></mtd>\n' +
        '    </mtr>\n' +
        '    <mtr>\n' +
        '      <mtd><mn>0</mn></mtd>\n' +
        '      <mtd><mn>1</mn></mtd>\n' +
        '    </mtr>\n' +
        '  </mtable>\n' +
        '</math>';

      const doc = `\`\`\`math-word\n${matrixXml}\n\`\`\`\n`;
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

      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      expect(copyEvent.defaultPrevented).toBe(true);
      const mathml = copyEvent.clipboardData?.getData('application/mathml+xml');
      const plainText = copyEvent.clipboardData?.getData('text/plain');

      expect(mathml).toBeDefined();
      expect(plainText).toBe(mathml);

      // 1. Strict W3C XML Validation
      const parsedDoc = parseAndValidateXML(mathml!);
      expect(parsedDoc.documentElement.localName).toBe('math');
      expect(parsedDoc.documentElement.namespaceURI).toBe(MATHML_NAMESPACE);
      expect(parsedDoc.documentElement.getAttribute('display')).toBe('block');

      // 2. Structural integrity
      const table = parsedDoc.querySelector('mtable');
      expect(table).not.toBeNull();
      const rows = table!.querySelectorAll('mtr');
      expect(rows.length).toBe(2);

      const sqrt = table!.querySelector('msqrt');
      expect(sqrt).not.toBeNull();
      const frac = sqrt!.querySelector('mfrac');
      expect(frac).not.toBeNull();
      const sup = frac!.querySelector('msup');
      expect(sup).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('copies completely empty equation without crashing, producing well-formed W3C XML', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      expect(copyEvent.defaultPrevented).toBe(true);
      const mathml = copyEvent.clipboardData?.getData('application/mathml+xml');
      expect(mathml).toBeDefined();

      const parsedDoc = parseAndValidateXML(mathml!);
      expect(parsedDoc.documentElement.localName).toBe('math');
      expect(parsedDoc.documentElement.namespaceURI).toBe(MATHML_NAMESPACE);

      view.destroy();
      container.remove();
    });

    it('copies empty structures (empty fraction, empty radical, empty matrix) as well-formed XML', () => {
      const emptyStructsXml =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">\n' +
        '  <mfrac><mrow/><mrow/></mfrac>\n' +
        '  <msqrt><mrow/></msqrt>\n' +
        '  <mtable><mtr><mtd><mrow/></mtd></mtr></mtable>\n' +
        '</math>';
      const doc = `\`\`\`math-word\n${emptyStructsXml}\n\`\`\`\n`;
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      const mathml = copyEvent.clipboardData?.getData('application/mathml+xml');
      const parsedDoc = parseAndValidateXML(mathml!);

      expect(parsedDoc.querySelector('mfrac')).not.toBeNull();
      expect(parsedDoc.querySelector('msqrt')).not.toBeNull();
      expect(parsedDoc.querySelector('mtable')).not.toBeNull();

      view.destroy();
      container.remove();
    });

    it('copies specific selected sub-expression (highlighted fraction) rather than entire equation', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mfrac><mn>1</mn><mn>2</mn></mfrac><mo>=</mo><mi>b</mi></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      expect(widget).not.toBeNull();
      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);
      widget!.enterFromStart(view);

      const fracEl = view.dom.querySelector('.eq-fraction') as HTMLElement;
      expect(fracEl).not.toBeNull();
      const fracId = fracEl.getAttribute('data-node-id');
      expect(fracId).toBeTruthy();

      // Simulate range selection on the attached fraction element
      const range = document.createRange();
      range.selectNodeContents(fracEl);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      const mathml = copyEvent.clipboardData?.getData('application/mathml+xml');
      expect(mathml).toBeDefined();

      const parsedDoc = parseAndValidateXML(mathml!);
      expect(parsedDoc.querySelector('mfrac')).not.toBeNull();
      // Should NOT contain outer 'a', '+', '=', 'b'
      expect(mathml).not.toContain('<mi>a</mi>');
      expect(mathml).not.toContain('<mi>b</mi>');
      expect(mathml).toContain('<mn>1</mn>');
      expect(mathml).toContain('<mn>2</mn>');

      selection?.removeAllRanges();
      view.destroy();
      container.remove();
    });

    it('properly XML-escapes special characters (<, >, &, \", \') when copying', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mo>&lt;</mo><mo>&gt;</mo><mo>&amp;</mo></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      const mathml = copyEvent.clipboardData?.getData('application/mathml+xml');
      // Verifying XML validity with entities
      const parsedDoc = parseAndValidateXML(mathml!);
      const operators = Array.from(parsedDoc.querySelectorAll('mo')).map((m) => m.textContent);
      expect(operators).toEqual(['<', '>', '&']);

      view.destroy();
      container.remove();
    });

    it('cut event on nested slot clears that slot and syncs without deleting sibling structures', () => {
      // Equation: a + (1/2)
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      const fracNode = widget!.ast.children[2] as FractionNode;
      // Position caret in fraction numerator ('1')
      widget!.caret = { slotId: fracNode.numerator.id, offset: 1 };
      setActiveEquationState({
        from: widget!.from,
        to: widget!.to,
        caret: widget!.caret,
        isFocused: true,
        ast: widget!.ast,
      });

      const cutEvent = createMockClipboardEvent('cut');
      dom.dispatchEvent(cutEvent);

      expect(cutEvent.defaultPrevented).toBe(true);
      // Numerator was cleared
      expect(fracNode.numerator.children.length).toBe(0);
      // Sibling denominator still exists
      expect(fracNode.denominator.children.length).toBe(1);
      // Parent 'a +' still exists
      expect((widget!.ast.children[0] as any).text).toBe('a');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // REQUIREMENT R3: ADVERSARIAL MATHML PASTE
  // =========================================================================
  describe('R3 Adversarial: MathML Paste', () => {
    it('pastes complex composite MathML (matrix, superscript, subsup, radical) into an empty slot', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      const complexMathML =
        '<math xmlns="http://www.w3.org/1998/Math/MathML">\n' +
        '  <msubsup><mi>A</mi><mn>1</mn><mn>2</mn></msubsup>\n' +
        '  <mo>+</mo>\n' +
        '  <mroot><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mn>3</mn></mroot>\n' +
        '  <mo>+</mo>\n' +
        '  <mtable><mtr><mtd><mn>7</mn></mtd></mtr></mtable>\n' +
        '</math>';

      const pasteEvent = createMockClipboardEvent('paste', {
        'application/mathml+xml': complexMathML,
      });
      dom.dispatchEvent(pasteEvent);

      expect(pasteEvent.defaultPrevented).toBe(true);

      // Verify all node types cleanly embedded in the AST
      expect(widget!.ast.children.length).toBe(5);
      expect(widget!.ast.children[0].type).toBe('subsup');
      expect(widget!.ast.children[1].type).toBe('token');
      expect(widget!.ast.children[2].type).toBe('root');
      expect(widget!.ast.children[3].type).toBe('token');
      expect(widget!.ast.children[4].type).toBe('matrix');

      // Check subsup properties
      const subsup = widget!.ast.children[0] as SubSupNode;
      expect((subsup.base.children[0] as any).text).toBe('A');

      // Check root properties
      const root = widget!.ast.children[2] as RootNode;
      expect((root.index.children[0] as any).text).toBe('3');

      // Check matrix properties
      const mat = widget!.ast.children[4] as MatrixNode;
      expect(mat.rows.length).toBe(1);
      expect((mat.rows[0][0].children[0] as any).text).toBe('7');

      // Caret placed at the end of inserted nodes
      expect(widget!.caret.offset).toBe(5);

      // Document synced
      expect(view.state.doc.toString()).toContain('<msubsup>');
      expect(view.state.doc.toString()).toContain('<mroot>');
      expect(view.state.doc.toString()).toContain('<mtable>');

      view.destroy();
      container.remove();
    });

    it('pastes MathML at specific offsets in partially filled slot without corrupting surrounding tokens', () => {
      // Slot initially: [a, +, b]
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi><mo>+</mo><mi>b</mi></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Caret between 'a' and '+' (offset 1)
      widget!.caret = { slotId: widget!.ast.id, offset: 1 };
      setActiveEquationState({
        from: widget!.from,
        to: widget!.to,
        caret: widget!.caret,
        isFocused: true,
        ast: widget!.ast,
      });

      const fracXml = '<mfrac><mn>1</mn><mn>2</mn></mfrac>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': fracXml,
      });
      dom.dispatchEvent(pasteEvent);

      // Expected order: 'a', FractionNode, '+', 'b'
      expect(widget!.ast.children.length).toBe(4);
      expect((widget!.ast.children[0] as any).text).toBe('a');
      expect(widget!.ast.children[1].type).toBe('fraction');
      expect((widget!.ast.children[2] as any).text).toBe('+');
      expect((widget!.ast.children[3] as any).text).toBe('b');

      // Caret positioned after inserted fraction (offset 2)
      expect(widget!.caret.offset).toBe(2);

      view.destroy();
      container.remove();
    });

    it('pastes MathML into deeply nested 3-level fraction slot without breaking ancestor tree', () => {
      // 1 / (2 / (3 / 4))
      const nestedDoc =
        '```math-word\n' +
        '<math xmlns="http://www.w3.org/1998/Math/MathML">\n' +
        '  <mfrac>\n' +
        '    <mn>1</mn>\n' +
        '    <mfrac>\n' +
        '      <mn>2</mn>\n' +
        '      <mfrac>\n' +
        '        <mn>3</mn>\n' +
        '        <mn>4</mn>\n' +
        '      </mfrac>\n' +
        '    </mfrac>\n' +
        '  </mfrac>\n' +
        '</math>\n' +
        '```\n';

      const { view, container } = createMockEditor(nestedDoc, [], true);
      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, nestedDoc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      const f1 = widget!.ast.children[0] as FractionNode;
      const f2 = f1.denominator.children[0] as FractionNode;
      const f3 = f2.denominator.children[0] as FractionNode;

      // Position caret in denominator of f3 (after '4')
      expect((f3.denominator.children[0] as any).text).toBe('4');
      widget!.caret = { slotId: f3.denominator.id, offset: 1 };
      setActiveEquationState({
        from: widget!.from,
        to: widget!.to,
        caret: widget!.caret,
        isFocused: true,
        ast: widget!.ast,
      });

      // Paste a radical into this deep slot
      const radXml = '<msqrt><mi>k</mi></msqrt>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': radXml,
      });
      dom.dispatchEvent(pasteEvent);

      const updatedF1 = widget!.ast.children[0] as FractionNode;
      const updatedF2 = updatedF1.denominator.children[0] as FractionNode;
      const updatedF3 = updatedF2.denominator.children[0] as FractionNode;

      expect(updatedF3.denominator.children.length).toBe(2);
      expect((updatedF3.denominator.children[0] as any).text).toBe('4');
      expect(updatedF3.denominator.children[1].type).toBe('radical');

      view.destroy();
      container.remove();
    });

    it('pastes raw MathML fragment (without <math> root) into Markdown creating fenced block', () => {
      const doc = '## Chapter 1\n\n';
      const { view, container } = createMockEditor(doc, [], true);
      view.dispatch({ selection: { anchor: doc.length } });

      const snippet = '<math><mfrac><mn>5</mn><mn>6</mn></mfrac></math>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': snippet,
      });

      view.contentDOM.dispatchEvent(pasteEvent);

      const newDoc = view.state.doc.toString();
      expect(newDoc).toContain('```math-word');
      expect(newDoc).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
      expect(newDoc).toContain('<mfrac>');

      view.destroy();
      container.remove();
    });

    it('pastes plain non-MathML text into active equation without crashing (uses linear parser fallback)', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Paste linear equation text "x + y"
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': 'x + y',
      });
      dom.dispatchEvent(pasteEvent);

      expect(pasteEvent.defaultPrevented).toBe(true);
      expect(widget!.ast.children.length).toBeGreaterThan(0);
      expect(view.state.doc.toString()).toContain('x');

      view.destroy();
      container.remove();
    });

    it('does not intercept plain text paste in Markdown (does not create equation block)', () => {
      const doc = 'Some initial text ';
      const { view, container } = createMockEditor(doc, [], true);
      view.dispatch({ selection: { anchor: doc.length } });

      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': 'just ordinary text',
      });

      view.contentDOM.dispatchEvent(pasteEvent);
      // MathML handler should NOT convert ordinary text into an equation block
      expect(view.state.doc.toString()).not.toContain('```math-word');
      expect(view.state.doc.toString()).not.toContain('/weq_inline');

      view.destroy();
      container.remove();
    });
  });

  // =========================================================================
  // REQUIREMENT R4: ADVERSARIAL SHORTCUT EXPANSIONS
  // =========================================================================
  describe('R4 Adversarial: Shortcut Expansions', () => {
    it('expands multi-character shortcut with backslash (\\alpha, \\matrix) and without backslash cleanly', () => {
      // 1. Built-in symbol \\alpha on space
      const slot = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('a', 'mi'),
        createToken('l', 'mi'),
        createToken('p', 'mi'),
        createToken('h', 'mi'),
        createToken('a', 'mi'),
      ]);
      const resAlpha = expandShortcutInSlot(slot, 6, ' ');
      expect(resAlpha.expanded).toBe(true);
      expect((resAlpha.newSlot?.children[0] as any).text).toBe('α');
      expect(resAlpha.newCaret?.offset).toBe(1);

      // 2. Custom shortcut configured without backslash: "matrix" -> MathML table
      const matrixXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mtable><mtr><mtd><mn>1</mn></mtd></mtr></mtable></math>';
      setCustomShortcuts([{ trigger: 'matrix', expansion: matrixXml }]);

      // Typed with leading backslash: \\matrix
      const slotWithBackslash = createSlot('root', [
        createToken('\\', 'mo'),
        createToken('m', 'mi'),
        createToken('a', 'mi'),
        createToken('t', 'mi'),
        createToken('r', 'mi'),
        createToken('i', 'mi'),
        createToken('x', 'mi'),
      ]);
      const resMatrix = expandShortcutInSlot(slotWithBackslash, 7, 'x');
      expect(resMatrix.expanded).toBe(true);
      expect(resMatrix.newSlot?.children.length).toBe(1);
      expect(resMatrix.newSlot?.children[0].type).toBe('matrix');
      // Verify backslash was consumed
      expect(resMatrix.newSlot?.children.some((n: any) => n.text === '\\')).toBe(false);

      // Typed without leading backslash: matrix
      const slotWithoutBackslash = createSlot('root', [
        createToken('m', 'mi'),
        createToken('a', 'mi'),
        createToken('t', 'mi'),
        createToken('r', 'mi'),
        createToken('i', 'mi'),
        createToken('x', 'mi'),
      ]);
      const resMatrix2 = expandShortcutInSlot(slotWithoutBackslash, 6, 'x');
      expect(resMatrix2.expanded).toBe(true);
      expect(resMatrix2.newSlot?.children[0].type).toBe('matrix');
    });

    it('rapid consecutive typing: typing \\ss immediately followed by 1, 2, 3 types into child numerator slot', () => {
      const fracXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>';
      setCustomShortcuts([{ trigger: '\\ss', expansion: fracXml }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Rapid consecutive keystrokes: '\', 's', 's', '1', '2', '3'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true })); // Expands!

      // Immediately type '1', '2', '3'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));

      // Structural box must be FractionNode
      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('fraction');
      const frac = widget!.ast.children[0] as FractionNode;

      // Numerator must contain '1', '2', '3'
      expect(frac.numerator.children.length).toBe(3);
      const numTexts = frac.numerator.children.map((c: any) => c.text);
      expect(numTexts).toEqual(['1', '2', '3']);
      expect(widget!.caret.slotId).toBe(frac.numerator.id);
      expect(widget!.caret.offset).toBe(3);

      // Denominator should remain untouched/empty
      expect(frac.denominator.children.length).toBe(0);

      view.destroy();
      container.remove();
    });

    it('muscle-memory trailing space: swallows the first space after instant expansion without inserting whitespace', () => {
      setCustomShortcuts([{ trigger: '\\ss', expansion: 'aa' }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type '\', 's', 's' -> expands to 'a', 'a'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

      expect(widget!.ast.children.length).toBe(2);
      expect((widget!.ast.children[0] as any).text).toBe('a');
      expect((widget!.ast.children[1] as any).text).toBe('a');

      // User's muscle memory presses Space immediately after
      const spaceEvent1 = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      dom.dispatchEvent(spaceEvent1);

      // The trailing space MUST be prevented and NOT inserted!
      expect(spaceEvent1.defaultPrevented).toBe(true);
      expect(widget!.ast.children.length).toBe(2);
      expect(widget!.ast.children.some((n: any) => n.text === ' ')).toBe(false);

      view.destroy();
      container.remove();
    });

    it('expands custom radical shortcut, types in radicand, then navigates out to continue equation', () => {
      const radXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mrow/></msqrt></math>';
      setCustomShortcuts([{ trigger: '\\rad', expansion: radXml }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type '\\rad'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));

      // In radicand slot: type 'x'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      const rad = widget!.ast.children[0] as RadicalNode;
      expect((rad.radicand.children[0] as any).text).toBe('x');

      // Press ArrowRight to exit radical
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget!.caret.slotId).toBe(widget!.ast.id);
      expect(widget!.caret.offset).toBe(1);

      // Type '+'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
      expect(widget!.ast.children.length).toBe(2);
      expect(widget!.ast.children[0].type).toBe('radical');
      expect((widget!.ast.children[1] as any).text).toBe('+');

      view.destroy();
      container.remove();
    });

    it('handles overlapping triggers correctly (prioritizes longer trigger)', () => {
      setCustomShortcuts([
        { trigger: 's', expansion: 'single' },
        { trigger: 'ss', expansion: 'double' },
        { trigger: 'sss', expansion: 'triple' },
      ]);

      const slot = createSlot('root', [
        createToken('s', 'mi'),
        createToken('s', 'mi'),
        createToken('s', 'mi'),
      ]);

      const res = expandShortcutInSlot(slot, 3, 's');
      expect(res.expanded).toBe(true);
      expect(res.replacementText).toBe('triple');
    });

    it('markdown expansion triggers for custom shortcuts with both backslash and non-backslash', () => {
      setCustomShortcuts([
        { trigger: '\\gamma', expansion: 'γ' },
        { trigger: 'weqfrac', expansion: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>' },
      ]);

      // 1. Text ending with \gamma
      const exp1 = expandShortcutInMarkdown('The angle is \\gamma');
      expect(exp1).not.toBeNull();
      expect(exp1?.replacement).toBe('γ');

      // 2. Text ending with gamma (without backslash)
      const exp2 = expandShortcutInMarkdown('The angle is gamma');
      expect(exp2).not.toBeNull();
      expect(exp2?.replacement).toBe('γ');
    });

    it('expands custom fraction shortcut, types in numerator, navigates down to denominator, types denominator, and exits', () => {
      const fracXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mrow/><mrow/></mfrac></math>';
      setCustomShortcuts([{ trigger: '\\myfrac', expansion: fracXml }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type trigger: '\', 'm', 'y', 'f', 'r', 'a', 'c'
      for (const ch of '\\myfrac') {
        dom.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }

      // Should have expanded into fraction
      expect(widget!.ast.children.length).toBe(1);
      expect(widget!.ast.children[0].type).toBe('fraction');
      const frac = widget!.ast.children[0] as FractionNode;
      expect(widget!.caret.slotId).toBe(frac.numerator.id);
      expect(widget!.caret.offset).toBe(0);

      // Type 'u' in numerator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true }));
      const fracAfterU = widget!.ast.children[0] as FractionNode;
      expect(fracAfterU.numerator.children.length).toBe(1);
      expect((fracAfterU.numerator.children[0] as any).text).toBe('u');

      // Navigate down to denominator: ArrowDown
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(widget!.caret.slotId).toBe(fracAfterU.denominator.id);
      expect(widget!.caret.offset).toBe(0);

      // Type 'v' in denominator
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
      const fracAfterV = widget!.ast.children[0] as FractionNode;
      expect(fracAfterV.denominator.children.length).toBe(1);
      expect((fracAfterV.denominator.children[0] as any).text).toBe('v');

      // Navigate right to exit fraction: ArrowRight
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(widget!.caret.slotId).toBe(widget!.ast.id);
      expect(widget!.caret.offset).toBe(1);

      // Type '=' in root slot
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
      expect(widget!.ast.children.length).toBe(2);
      expect((widget!.ast.children[1] as any).text).toBe('=');

      view.destroy();
      container.remove();
    });

    it('copying from an inline equation produces valid MathML with display="inline"', () => {
      const doc = '/weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mi>z</mi></math> /weq_inline';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = (view.dom.querySelector('.word-equation-inline') as HTMLElement) || widget!.toDOM(view);
      widget!.enterFromStart(view);

      const copyEvent = createMockClipboardEvent('copy');
      dom.dispatchEvent(copyEvent);

      expect(copyEvent.defaultPrevented).toBe(true);
      const mathml = copyEvent.clipboardData?.getData('application/mathml+xml');
      expect(mathml).toBeDefined();

      const parsedDoc = parseAndValidateXML(mathml!);
      expect(parsedDoc.documentElement.getAttribute('display')).toBe('inline');

      view.destroy();
      container.remove();
    });

    it('pasting MathML with attributes (linethickness) preserves attributes in AST and serialization', () => {
      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);
      widget!.enterFromStart(view);

      const thickFrac = '<mfrac linethickness="3px"><mi>x</mi><mi>y</mi></mfrac>';
      const pasteEvent = createMockClipboardEvent('paste', {
        'text/plain': thickFrac,
      });
      dom.dispatchEvent(pasteEvent);

      expect(widget!.ast.children[0].type).toBe('fraction');
      const frac = widget!.ast.children[0] as FractionNode;
      expect(frac.linethickness).toBe('3px');
      expect(view.state.doc.toString()).toContain('linethickness="3px"');

      view.destroy();
      container.remove();
    });

    it('second consecutive space after muscle-memory trailing space is treated normally', () => {
      setCustomShortcuts([{ trigger: '\\ss', expansion: 'aa' }]);

      const doc = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>\n```\n';
      const { view, container } = createMockEditor(doc, [], true);

      let widget: WordEquationWidget | null = null;
      view.state.field(wordEquationStateField).between(0, doc.length, (from, to, dec) => {
        if ((dec.spec as any)?.widget instanceof WordEquationWidget) {
          widget = (dec.spec as any).widget;
        }
      });
      const dom = (view.dom.querySelector('.word-equation-block') as HTMLElement) || widget!.toDOM(view);
      widget!.enterFromStart(view);

      // Type '\', 's', 's'
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));

      // 1st Space: muscle-memory suppressed
      const space1 = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      dom.dispatchEvent(space1);
      expect(space1.defaultPrevented).toBe(true);

      // 2nd Space: not suppressed by justExpandedShortcut
      expect((widget as any).justExpandedShortcut).toBe(false);

      view.destroy();
      container.remove();
    });
  });
});
