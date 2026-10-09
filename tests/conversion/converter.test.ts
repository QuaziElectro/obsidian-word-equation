import { describe, it, expect } from 'vitest';
import {
  convertLatexToMathML,
  convertLatexToMathml,
  convertMathMLToLatex,
  convertMathmlToLatex,
} from '../../src/conversion/converter';

describe('Converter: LaTeX to MathML', () => {
  it('converts simple fraction to MathML', () => {
    const mathml = convertLatexToMathML('\\frac{a}{b}', false);
    expect(mathml).toContain('<mfrac>');
    expect(mathml).toContain('<mi>a</mi>');
    expect(mathml).toContain('<mi>b</mi>');
    expect(mathml).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
  });

  it('converts block displayMode correctly', () => {
    const blockMathml = convertLatexToMathML('\\frac{1}{2}', true);
    expect(blockMathml).toContain('display="block"');
    const inlineMathml = convertLatexToMathML('\\frac{1}{2}', false);
    expect(inlineMathml).not.toContain('display="block"');
  });

  it('converts square roots and nth roots', () => {
    const sqrtMathml = convertLatexToMathML('\\sqrt{x}', false);
    expect(sqrtMathml).toContain('<msqrt>');
    expect(sqrtMathml).toContain('<mi>x</mi>');

    const nthRootMathml = convertLatexToMathML('\\sqrt[3]{x}', false);
    expect(nthRootMathml).toContain('<mroot>');
  });

  it('converts superscripts and subscripts', () => {
    const scriptMathml = convertLatexToMathML('x_i^2', false);
    expect(scriptMathml).toMatch(/<(msup|msub|msubsup)/);
  });

  it('converts Greek letters and operators', () => {
    const mathml = convertLatexToMathML('\\alpha + \\beta = \\gamma', false);
    expect(mathml).toContain('α');
    expect(mathml).toContain('β');
    expect(mathml).toContain('γ');
  });

  it('converts matrices', () => {
    const mathml = convertLatexToMathML('\\begin{matrix} a & b \\\\ c & d \\end{matrix}', true);
    expect(mathml).toContain('<mtable>');
    expect(mathml).toContain('<mtr>');
    expect(mathml).toMatch(/<mtd[\s>]/);
  });

  it('handles empty input gracefully', () => {
    const emptyInline = convertLatexToMathML('', false);
    expect(emptyInline).toContain('<math');
    expect(emptyInline).toContain('</math>');

    const emptyBlock = convertLatexToMathML('   ', true);
    expect(emptyBlock).toContain('display="block"');
  });

  it('supports casing alias convertLatexToMathml', () => {
    expect(convertLatexToMathml('\\frac{1}{2}', false)).toEqual(
      convertLatexToMathML('\\frac{1}{2}', false)
    );
  });
});

describe('Converter: MathML to LaTeX', () => {
  it('converts MathML fraction to LaTeX', () => {
    const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>';
    const latex = convertMathMLToLatex(xml);
    expect(latex).toContain('\\frac{a}{b}');
  });

  it('converts square roots and exponents', () => {
    const xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msqrt><mi>x</mi></msqrt></math>';
    const latex = convertMathMLToLatex(xml);
    expect(latex).toContain('\\sqrt{x}');

    const supXml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math>';
    const supLatex = convertMathMLToLatex(supXml);
    expect(supLatex).toMatch(/x\^\{?2\}?/);
  });

  it('handles empty MathML gracefully', () => {
    expect(convertMathMLToLatex('')).toBe('');
    expect(convertMathMLToLatex('   ')).toBe('');
  });

  it('supports casing alias convertMathmlToLatex', () => {
    const xml = '<math><mi>x</mi></math>';
    expect(convertMathmlToLatex(xml)).toEqual(convertMathMLToLatex(xml));
  });

  it('performs round-trip conversion LaTeX -> MathML -> LaTeX', () => {
    const originalLatex = '\\frac{1}{2} + x^{2}';
    const mathml = convertLatexToMathML(originalLatex, false);
    const roundTripLatex = convertMathMLToLatex(mathml);
    expect(roundTripLatex).toContain('\\frac{1}{2}');
    expect(roundTripLatex).toContain('x^{2}');
  });

  it('handles invalid MathML gracefully without crashing', () => {
    expect(convertMathMLToLatex('<math><broken>')).toBe('');
    expect(convertMathMLToLatex('not even xml')).toBe('');
  });

  it('respects throwOnError option in convertLatexToMathML', () => {
    // When throwOnError is true (default), it throws on invalid LaTeX command
    expect(() => convertLatexToMathML('\\unknownCommandNotInTeX', false, { throwOnError: true })).toThrow();

    // When throwOnError is false, it returns a styled error block instead of throwing
    const result = convertLatexToMathML('\\unknownCommandNotInTeX', false, { throwOnError: false });
    expect(result).toContain('color:#b22222');
  });

  it('converts summations and integrals correctly', () => {
    const latex = '\\sum_{i=1}^{n} i = \\int_{0}^{1} x dx';
    const mathml = convertLatexToMathML(latex, true);
    expect(mathml).toContain('display="block"');
    expect(mathml).toContain('∑');
    expect(mathml).toContain('∫');
  });
});

