import { describe, it, expect, beforeEach } from 'vitest';
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
  createFenced,
  createUnderOver,
  createPlaceholder,
  findSlotById,
  findNodeById,
  findParentSlotOfNode,
  findParentNodeOfSlot,
  cloneSlot,
  cloneNode,
  areSlotsEqual,
  areNodesEqual,
  slotToPlainText,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML, escapeXml } from '../../src/core/mathml-serializer';
import { parseLinearEquation, LinearParser } from '../../src/core/linear-parser';
import { MATHML_NAMESPACE } from '../../src/core/types';

describe('Core AST & Parser Test Suite', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('AST Construction, Tree Manipulation, and Traversal', () => {
    it('creates tokens with correct kind and properties', () => {
      const tokMi = createToken('x', 'mi');
      expect(tokMi.type).toBe('token');
      expect(tokMi.tokenKind).toBe('mi');
      expect(tokMi.text).toBe('x');

      const tokMn = createToken('42', 'mn');
      expect(tokMn.tokenKind).toBe('mn');
      expect(tokMn.text).toBe('42');

      const tokMo = createToken('+', 'mo', { fence: 'true' });
      expect(tokMo.tokenKind).toBe('mo');
      expect(tokMo.attributes?.fence).toBe('true');
    });

    it('creates fraction node with numerator and denominator slots', () => {
      const num = createSlot('numerator', [createToken('1', 'mn')]);
      const den = createSlot('denominator', [createToken('2', 'mn')]);
      const frac = createFraction(num, den, '2px');

      expect(frac.type).toBe('fraction');
      expect(frac.numerator.role).toBe('numerator');
      expect(frac.denominator.role).toBe('denominator');
      expect(frac.linethickness).toBe('2px');
      expect(frac.numerator.parentNodeId).toBe(frac.id);
      expect(frac.denominator.parentNodeId).toBe(frac.id);
    });

    it('creates script nodes (superscript, subscript, subsup)', () => {
      const base = createSlot('base', [createToken('x', 'mi')]);
      const sup = createSlot('sup', [createToken('2', 'mn')]);
      const sNode = createSuperscript(base, sup);
      expect(sNode.type).toBe('superscript');

      const subBase = createSlot('base', [createToken('a', 'mi')]);
      const sub = createSlot('sub', [createToken('i', 'mi')]);
      const subNode = createSubscript(subBase, sub);
      expect(subNode.type).toBe('subscript');

      const subsupBase = createSlot('base', [createToken('y', 'mi')]);
      const subSlot = createSlot('sub', [createToken('1', 'mn')]);
      const supSlot = createSlot('sup', [createToken('k', 'mi')]);
      const subsupNode = createSubSup(subsupBase, subSlot, supSlot);
      expect(subsupNode.type).toBe('subsup');
    });

    it('creates radicals, roots, matrices, fenced, and underover nodes', () => {
      const rad = createRadical(createSlot('radicand', [createToken('x', 'mi')]));
      expect(rad.type).toBe('radical');

      const root = createRoot(
        createSlot('radicand', [createToken('x', 'mi')]),
        createSlot('index', [createToken('3', 'mn')])
      );
      expect(root.type).toBe('root');

      const cell1 = createSlot('cell', [createToken('a', 'mi')]);
      const cell2 = createSlot('cell', [createToken('b', 'mi')]);
      const matrix = createMatrix([[cell1, cell2]], '[', ']');
      expect(matrix.type).toBe('matrix');
      expect(matrix.rows.length).toBe(1);
      expect(matrix.rows[0].length).toBe(2);

      const fenced = createFenced(createSlot('fenced', [createToken('x', 'mi')]), '(', ')');
      expect(fenced.type).toBe('fenced');

      const underOver = createUnderOver(
        createSlot('base', [createToken('∑', 'mo')]),
        createSlot('under', [createToken('i=0', 'mtext')]),
        createSlot('over', [createToken('n', 'mi')]),
        false
      );
      expect(underOver.type).toBe('underover');
    });

    it('finds slots and nodes by id and checks structural equality', () => {
      const num = createSlot('numerator', [createToken('a', 'mi')]);
      const den = createSlot('denominator', [createToken('b', 'mi')]);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      expect(findSlotById(root, num.id)).toBe(num);
      expect(findSlotById(root, den.id)).toBe(den);
      expect(findSlotById(root, 'non-existent')).toBeNull();

      expect(findNodeById(root, frac.id)).toBe(frac);
      expect(findParentNodeOfSlot(root, num.id)).toBe(frac);
      expect(findParentSlotOfNode(root, frac.id)).toBe(root);

      const cloned = cloneSlot(root);
      expect(areSlotsEqual(root, cloned)).toBe(true);

      cloned.children.push(createToken('c', 'mi'));
      expect(areSlotsEqual(root, cloned)).toBe(false);
    });

    it('converts slot AST to plain text linear representation', () => {
      const num = createSlot('numerator', [createToken('1', 'mn')]);
      const den = createSlot('denominator', [createToken('x', 'mi')]);
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);

      const plain = slotToPlainText(root);
      expect(plain).toBe('(1)/(x)');
    });
  });

  describe('MathML Parser & Serializer Roundtrip', () => {
    it('escapes XML special characters correctly', () => {
      expect(escapeXml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&apos;');
    });

    it('parses empty or whitespace XML into empty root slot', () => {
      const empty1 = parseMathML('');
      expect(empty1.children.length).toBe(0);

      const empty2 = parseMathML('   \n\t  ');
      expect(empty2.children.length).toBe(0);
    });

    it('parses simple tokens and builds AST', () => {
      const xml = `<math xmlns="${MATHML_NAMESPACE}"><mi>x</mi><mo>+</mo><mn>1</mn></math>`;
      const ast = parseMathML(xml);

      expect(ast.children.length).toBe(3);
      expect(ast.children[0].type).toBe('token');
      expect((ast.children[0] as any).text).toBe('x');
      expect((ast.children[1] as any).text).toBe('+');
      expect((ast.children[2] as any).text).toBe('1');
    });

    it('parses and serializes fractions', () => {
      const xml = `<math xmlns="${MATHML_NAMESPACE}" display="block">
  <mfrac>
    <mi>a</mi>
    <mi>b</mi>
  </mfrac>
</math>`;
      const ast = parseMathML(xml);
      expect(ast.children.length).toBe(1);
      const frac = ast.children[0] as any;
      expect(frac.type).toBe('fraction');
      expect(frac.numerator.children[0].text).toBe('a');
      expect(frac.denominator.children[0].text).toBe('b');

      const serialized = serializeMathML(ast, { pretty: false });
      expect(serialized).toContain('<mfrac><mi>a</mi><mi>b</mi></mfrac>');
    });

    it('parses sub, sup, and subsup structures', () => {
      const xml = `<math xmlns="${MATHML_NAMESPACE}">
  <msub><mi>x</mi><mn>1</mn></msub>
  <msup><mi>y</mi><mn>2</mn></msup>
  <msubsup><mi>z</mi><mi>i</mi><mn>3</mn></msubsup>
</math>`;
      const ast = parseMathML(xml);
      expect(ast.children.length).toBe(3);
      expect(ast.children[0].type).toBe('subscript');
      expect(ast.children[1].type).toBe('superscript');
      expect(ast.children[2].type).toBe('subsup');
    });

    it('parses radicals and roots', () => {
      const xml = `<math xmlns="${MATHML_NAMESPACE}">
  <msqrt><mi>x</mi></msqrt>
  <mroot><mi>y</mi><mn>3</mn></mroot>
</math>`;
      const ast = parseMathML(xml);
      expect(ast.children.length).toBe(2);
      expect(ast.children[0].type).toBe('radical');
      expect(ast.children[1].type).toBe('root');
    });

    it('parses matrices with mtable, mtr, and mtd', () => {
      const xml = `<math xmlns="${MATHML_NAMESPACE}">
  <mrow>
    <mo fence="true" stretchy="true">[</mo>
    <mtable>
      <mtr>
        <mtd><mn>1</mn></mtd>
        <mtd><mn>2</mn></mtd>
      </mtr>
      <mtr>
        <mtd><mn>3</mn></mtd>
        <mtd><mn>4</mn></mtd>
      </mtr>
    </mtable>
    <mo fence="true" stretchy="true">]</mo>
  </mrow>
</math>`;
      const ast = parseMathML(xml);
      const matrix = (ast.children.find((n) => n.type === 'matrix') ||
        (ast.children[0] as any).content?.children?.find((n: any) => n.type === 'matrix') ||
        ast.children[0]) as any;

      expect(matrix).toBeDefined();
      const mNode = matrix.type === 'matrix' ? matrix : (ast.children[0] as any);
      expect(mNode.type === 'matrix' || mNode.rows !== undefined).toBe(true);
    });

    it('parses underover / mover / munder expressions', () => {
      const xml = `<math xmlns="${MATHML_NAMESPACE}">
  <munderover>
    <mo>∑</mo>
    <mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow>
    <mi>n</mi>
  </munderover>
</math>`;
      const ast = parseMathML(xml);
      expect(ast.children.length).toBe(1);
      const uo = ast.children[0] as any;
      expect(uo.type).toBe('underover');
      expect(uo.base.children[0].text).toBe('∑');
    });

    it('guarantees round-trip serialization preservation', () => {
      const originalXml = `<math xmlns="${MATHML_NAMESPACE}" display="block">
  <mrow>
    <mfrac>
      <mrow>
        <msup>
          <mi>x</mi>
          <mn>2</mn>
        </msup>
        <mo>+</mo>
        <mn>1</mn>
      </mrow>
      <mrow>
        <mn>2</mn>
        <mi>x</mi>
      </mrow>
    </mfrac>
  </mrow>
</math>`;
      const ast1 = parseMathML(originalXml);
      const serialized = serializeMathML(ast1, { pretty: true });
      const ast2 = parseMathML(serialized);

      expect(areSlotsEqual(ast1, ast2)).toBe(true);
    });
  });

  describe('Linear Syntax Parser', () => {
    it('parses basic arithmetic and identifiers', () => {
      const ast = parseLinearEquation('a + b - 3 * c');
      expect(ast.children.length).toBe(7);
      expect((ast.children[0] as any).text).toBe('a');
      expect((ast.children[1] as any).text).toBe('+');
      expect((ast.children[2] as any).text).toBe('b');
      expect((ast.children[3] as any).text).toBe('-');
      expect((ast.children[4] as any).text).toBe('3');
      expect((ast.children[5] as any).text).toBe('*');
      expect((ast.children[6] as any).text).toBe('c');
    });

    it('parses simple fraction a/b', () => {
      const ast = parseLinearEquation('a/b');
      expect(ast.children.length).toBe(1);
      expect(ast.children[0].type).toBe('fraction');
      const frac = ast.children[0] as any;
      expect(frac.numerator.children[0].text).toBe('a');
      expect(frac.denominator.children[0].text).toBe('b');
    });

    it('parses grouped fraction (a+b)/(c+d)', () => {
      const ast = parseLinearEquation('(a+b)/(c+d)');
      expect(ast.children.length).toBe(1);
      const frac = ast.children[0] as any;
      expect(frac.type).toBe('fraction');
      expect(frac.numerator.children.length).toBe(3);
      expect(frac.denominator.children.length).toBe(3);
    });

    it('parses powers and subscripts: x^2 and x_i', () => {
      const astPow = parseLinearEquation('x^2');
      expect(astPow.children[0].type).toBe('superscript');

      const astSub = parseLinearEquation('x_i');
      expect(astSub.children[0].type).toBe('subscript');

      const astSubSup = parseLinearEquation('x_i^2');
      expect(astSubSup.children[0].type).toBe('subsup');
    });

    it('parses radicals: \\sqrt(x^2 + 1) and \\sqrt[3](8)', () => {
      const astSqrt = parseLinearEquation('\\sqrt(x^2 + 1)');
      expect(astSqrt.children[0].type).toBe('radical');

      const astRoot = parseLinearEquation('\\sqrt[3](8)');
      expect(astRoot.children[0].type).toBe('root');
    });

    it('parses matrix syntax [a & b ; c & d]', () => {
      const ast = parseLinearEquation('[a & b ; c & d]');
      expect(ast.children.length).toBe(1);
      const mat = ast.children[0] as any;
      expect(mat.type).toBe('matrix');
      expect(mat.rows.length).toBe(2);
      expect(mat.rows[0].length).toBe(2);
      expect(mat.rows[1].length).toBe(2);
      expect(mat.rows[0][0].children[0].text).toBe('a');
      expect(mat.rows[0][1].children[0].text).toBe('b');
      expect(mat.rows[1][0].children[0].text).toBe('c');
      expect(mat.rows[1][1].children[0].text).toBe('d');
    });

    it('parses big operators: \\sum_{i=1}^n and \\int_0^\\infty', () => {
      const astSum = parseLinearEquation('\\sum_{i=1}^n');
      expect(astSum.children[0].type).toBe('underover');
      const uo = astSum.children[0] as any;
      expect(uo.base.children[0].text).toBe('∑');

      const astInt = parseLinearEquation('\\int_0^\\infty');
      expect(astInt.children[0].type).toBe('underover');
      const uoInt = astInt.children[0] as any;
      expect(uoInt.base.children[0].text).toBe('∫');
    });

    it('distinguishes known functions like sin, cos, log from variable letters', () => {
      const ast = parseLinearEquation('\\sin(x) + \\cos(y)');
      const first = ast.children[0] as any;
      expect(first.type).toBe('token');
      expect(first.text).toBe('sin');
    });

    it('parses complex quadratic formula', () => {
      const input = 'x = (-b \\pm \\sqrt(b^2 - 4ac))/(2a)';
      const ast = parseLinearEquation(input);
      expect(ast.children.length).toBe(3); // x, =, frac
      expect(ast.children[0].type).toBe('token');
      expect(ast.children[1].type).toBe('token');
      expect(ast.children[2].type).toBe('fraction');
    });
  });
});
