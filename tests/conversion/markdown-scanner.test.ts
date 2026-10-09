import { describe, it, expect } from 'vitest';
import {
  convertNoteLatexToMathML,
  convertNoteMathMLToLatex,
  convertMarkdownContent,
} from '../../src/conversion/markdown-scanner';

describe('Markdown Scanner: LaTeX to MathML', () => {
  it('converts block LaTeX $$...$$ to fenced math-word block', () => {
    const md = `# Title\n$$\n\\frac{1}{2}\n$$\nEnd`;
    const converted = convertNoteLatexToMathML(md, 'math-word');
    expect(converted).toContain('```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"');
    expect(converted).toContain('<mfrac>');
    expect(converted).toContain('```\nEnd');
    expect(converted).not.toContain('$$\n\\frac{1}{2}\n$$');
  });

  it('supports custom delimiter like weq', () => {
    const md = `$$\n\\sqrt{x}\n$$`;
    const converted = convertNoteLatexToMathML(md, 'weq');
    expect(converted).toContain('```weq\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"');
    expect(converted).toContain('```');
  });

  it('converts inline LaTeX $math$ to /weq_inline ... /weq_inline', () => {
    const md = `The formula is $E = mc^2$ in physics.`;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toContain('The formula is /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(converted).toContain('/weq_inline in physics.');
    expect(converted).not.toContain('$E = mc^2$');
  });

  it('converts multiple inline formulas on the same line', () => {
    const md = `Given $a$ and $b$, compute $a + b$.`;
    const result = convertMarkdownContent(md, 'latex-to-mathml');
    expect(result.count).toBe(3);
    expect(result.converted).toContain('/weq_inline');
    expect(result.converted).not.toContain('$a$');
    expect(result.converted).not.toContain('$b$');
    expect(result.converted).not.toContain('$a + b$');
  });

  it('protects python fenced code blocks from conversion', () => {
    const md = `# Python Demo\n\`\`\`python\n# This has $math$ and $$block$$\nx = "$var_value"\n\`\`\`\n$$x + 1$$`;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toContain('```python\n# This has $math$ and $$block$$\nx = "$var_value"\n```');
    expect(converted).toContain('```math-word');
    expect(converted).not.toContain('$$x + 1$$');
  });

  it('protects bash fenced code blocks from conversion', () => {
    const md = `\`\`\`bash\necho "Cost is $5.00"\nexport FOO=$BAR\n\`\`\``;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toBe(md);
  });

  it('protects untagged fenced code blocks from conversion', () => {
    const md = `\`\`\`\n$$not_math$$\n$also_not_math$\n\`\`\``;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toBe(md);
  });

  it('protects inline code backticks from conversion', () => {
    const md = `Execute \`echo $VAR\` or look at \`$not_math$\` in code. But convert $x + y$.`;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toContain('`echo $VAR`');
    expect(converted).toContain('`$not_math$`');
    expect(converted).toContain('/weq_inline');
  });

  it('protects currency values like $5 and $10 from false conversion', () => {
    const md = `Apples cost $5 and oranges cost $10 at the market.`;
    const result = convertMarkdownContent(md, 'latex-to-mathml');
    expect(result.count).toBe(0);
    expect(result.converted).toBe(md);
  });

  it('protects escaped dollar signs', () => {
    const md = `Price is \\$100 total.`;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toBe(md);
  });

  it('protects already existing math-word and weq blocks', () => {
    const md = `\`\`\`math-word\n<math><mrow><mi>a</mi></mrow></math>\n\`\`\`\n$$b$$`;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toContain('```math-word\n<math><mrow><mi>a</mi></mrow></math>\n```');
    expect(converted).toContain('```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"');
  });

  it('protects already existing inline /weq_inline equations', () => {
    const md = `/weq_inline <math><mi>z</mi></math> /weq_inline and $w$`;
    const result = convertMarkdownContent(md, 'latex-to-mathml');
    expect(result.count).toBe(1);
    expect(result.converted).toContain('/weq_inline <math><mi>z</mi></math> /weq_inline');
  });
});

describe('Markdown Scanner: MathML to LaTeX', () => {
  it('converts block MathML to $$...$$', () => {
    const md = `\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\n\`\`\``;
    const converted = convertNoteMathMLToLatex(md);
    expect(converted).toContain('$$\n\\frac{1}{2}\n$$');
  });

  it('converts weq block MathML to $$...$$', () => {
    const md = `\`\`\`weq\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><msqrt><mi>x</mi></msqrt></math>\n\`\`\``;
    const converted = convertNoteMathMLToLatex(md);
    expect(converted).toContain('$$\n\\sqrt{x}\n$$');
  });

  it('converts /weq_inline to $...$', () => {
    const md = `Inline formula: /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math> /weq_inline in text.`;
    const converted = convertNoteMathMLToLatex(md);
    expect(converted).toContain('Inline formula: $x^{2}$ in text.');
  });

  it('converts $weq to $...$', () => {
    const md = `Inline: $weq <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>a</mi></math> $weq`;
    const converted = convertNoteMathMLToLatex(md);
    expect(converted).toContain('Inline: $a$');
  });

  it('protects python code containing MathML strings from conversion', () => {
    const md = `\`\`\`python\nxml = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>'\n\`\`\`\n\`\`\`math-word\n<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\n\`\`\``;
    const converted = convertNoteMathMLToLatex(md);
    expect(converted).toContain('```python\nxml = \'<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\'\n```');
    expect(converted).toContain('$$\n\\frac{1}{2}\n$$');
  });

  it('protects inline code containing MathML tags', () => {
    const md = `Use tag \`<math>\` in your document. But convert /weq_inline <math><mi>x</mi></math> /weq_inline.`;
    const converted = convertNoteMathMLToLatex(md);
    expect(converted).toContain('`<math>`');
    expect(converted).toContain('$x$');
  });
});

describe('Markdown Scanner: Comprehensive Round Trip & Mixed Scenarios', () => {
  it('converts complex mixed document back and forth without corrupting code', () => {
    const original = `# Physics & Mathematics

Here is a block equation:
$$
\\frac{1}{2} + \\sqrt{x}
$$

Inline math: $E = mc^2$.

Python block:
\`\`\`python
# This must not be touched
def calculate():
    val = "$not_math$"
    return "$also_not_math$"
\`\`\`

Bash block:
\`\`\`bash
echo "$PATH and $HOME"
\`\`\`

Inline code: \`$not_a_formula$\` and \`echo $TEST\`.
End of note.
`;

    // 1. LaTeX -> MathML
    const toMathmlResult = convertMarkdownContent(original, 'latex-to-mathml', 'math-word');
    expect(toMathmlResult.count).toBe(2); // 1 block + 1 inline
    expect(toMathmlResult.converted).toContain('```math-word');
    expect(toMathmlResult.converted).toContain('/weq_inline');
    expect(toMathmlResult.converted).toContain('```python\n# This must not be touched\ndef calculate():\n    val = "$not_math$"\n    return "$also_not_math$"\n```');
    expect(toMathmlResult.converted).toContain('echo "$PATH and $HOME"');
    expect(toMathmlResult.converted).toContain('`$not_a_formula$`');

    // 2. MathML -> LaTeX
    const toLatexResult = convertMarkdownContent(toMathmlResult.converted, 'mathml-to-latex');
    expect(toLatexResult.count).toBe(2);
    expect(toLatexResult.converted).toMatch(/\$\$\s*\\frac\{1\}\{2\}\s*\+\s*\\sqrt\{x\s*\}\s*\$\$/);
    expect(toLatexResult.converted).toMatch(/\$E\s*=\s*m\s*c\^\{?2\}?\$/);
    expect(toLatexResult.converted).toContain('```python\n# This must not be touched\ndef calculate():\n    val = "$not_math$"\n    return "$also_not_math$"\n```');
    expect(toLatexResult.converted).toContain('echo "$PATH and $HOME"');
    expect(toLatexResult.converted).toContain('`$not_a_formula$`');
  });

  it('protects tilde-fenced code blocks (~~~lang ... ~~~)', () => {
    const md = `~~~bash\necho "Cost is $100"\n~~~\n$$x^2$$\n~~~python\nx = "$math$"\n~~~`;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toContain('~~~bash\necho "Cost is $100"\n~~~');
    expect(converted).toContain('```math-word\n<math');
    expect(converted).toContain('~~~python\nx = "$math$"\n~~~');
    expect(converted).not.toContain('$$x^2$$');
  });

  it('preserves invalid LaTeX untouched without crashing', () => {
    const md = `Formula: $$\\unknownLaTeXCommandThatFailsParser$$\nValid: $$x + 1$$`;
    const converted = convertNoteLatexToMathML(md);
    expect(converted).toContain('$$\\unknownLaTeXCommandThatFailsParser$$');
    expect(converted).toContain('```math-word');
  });

  it('preserves invalid MathML block untouched without crashing', () => {
    const md = `\`\`\`math-word\n<broken><unclosed>\n\`\`\`\n\`\`\`math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>z</mi></math>\n\`\`\``;
    const converted = convertNoteMathMLToLatex(md);
    expect(converted).toContain('```math-word\n<broken><unclosed>\n```');
    expect(converted).toContain('$$\nz\n$$');
  });
});

