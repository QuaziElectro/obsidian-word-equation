import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseMathML } from '../../src/core/mathml-parser';
import { serializeMathML } from '../../src/core/mathml-serializer';
import { parseLinearEquation } from '../../src/core/linear-parser';
import { areSlotsEqual, resetIdCounter } from '../../src/core/ast';
import { DomRenderer } from '../../src/editor/dom-renderer';
import { createMockEditor } from '../helpers/cm6-mock';
import { handleArrowKey } from '../../src/editor/navigation';
import { insertCharacter } from '../../src/editor/selection';

const VAULT_DIR = path.resolve(__dirname, '../../test-vault');
const PLUGIN_DIR = path.join(VAULT_DIR, '.obsidian', 'plugins', 'obsidian-word-equation');

function extractEquationBlocks(markdown: string): { type: string; code: string }[] {
  const blocks: { type: string; code: string }[] = [];
  const regex = /```(math-word|weq)\r?\n([\s\S]*?)\r?\n```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push({
      type: match[1],
      code: match[2].trim(),
    });
  }
  return blocks;
}

describe('Test Vault & Real-World Application Workflows (Tier 4)', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('Plugin Installation Artifacts in Test Vault', () => {
    it('verifies manifest.json exists in test-vault plugin directory with valid config', () => {
      const manifestPath = path.join(PLUGIN_DIR, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const content = fs.readFileSync(manifestPath, 'utf8');
      const json = JSON.parse(content);
      expect(json.id).toBe('word-equation');
      expect(json.name).toBe('Word Equation');
      expect(json.isDesktopOnly).toBe(false);
    });

    it('verifies compiled main.js exists in test-vault and is non-empty', () => {
      const mainPath = path.join(PLUGIN_DIR, 'main.js');
      expect(fs.existsSync(mainPath)).toBe(true);

      const stats = fs.statSync(mainPath);
      expect(stats.size).toBeGreaterThan(10000); // production bundle should be substantial
    });

    it('verifies styles.css exists in test-vault and contains equation styling', () => {
      const stylesPath = path.join(PLUGIN_DIR, 'styles.css');
      expect(fs.existsSync(stylesPath)).toBe(true);

      const css = fs.readFileSync(stylesPath, 'utf8');
      expect(css).toContain('.word-equation-block');
      expect(css).toContain('.eq-slot');
      expect(css).toContain('.eq-placeholder');
      expect(css).toContain('.eq-caret');
    });
  });

  describe('Test Vault Note Equations Parsing & Round-Trip', () => {
    const noteFiles = [
      'R1-BasicEquations.md',
      'R2-NavigationAndShortcuts.md',
      'R3-ComplexFormulas.md',
      'R1-basic-fractions-and-scripts.md',
      'R2-matrices-and-operators.md',
      'R3-linear-shortcuts-and-roundtrip.md',
    ];

    it('verifies all expected test vault markdown files exist', () => {
      for (const noteFile of noteFiles) {
        const filePath = path.join(VAULT_DIR, noteFile);
        expect(fs.existsSync(filePath), `Note file ${noteFile} should exist`).toBe(true);
      }
    });

    for (const noteFile of noteFiles) {
      it(`parses and round-trips all equation blocks in ${noteFile}`, () => {
        const filePath = path.join(VAULT_DIR, noteFile);
        const content = fs.readFileSync(filePath, 'utf8');
        const blocks = extractEquationBlocks(content);

        expect(blocks.length).toBeGreaterThan(0);

        const renderer = new DomRenderer();

        for (let i = 0; i < blocks.length; i++) {
          const { code, type } = blocks[i];
          const ast = code.startsWith('<math') || code.startsWith('<m')
            ? parseMathML(code)
            : parseLinearEquation(code);

          expect(ast).toBeDefined();
          expect(ast.role).toBe('root');

          // Check serialization
          const serialized = serializeMathML(ast, { pretty: true });
          expect(serialized).toContain('<math');
          expect(serialized).toContain('</math>');

          // Check round-trip AST equivalence
          const roundTripAst = parseMathML(serialized);
          expect(
            areSlotsEqual(ast, roundTripAst),
            `Block ${i + 1} in ${noteFile} must round-trip accurately`
          ).toBe(true);

          // Check DOM rendering without errors
          const dom = renderer.render(ast);
          expect(dom).toBeInstanceOf(HTMLElement);
          expect(dom.querySelector('.word-equation-math')).not.toBeNull();
        }
      });
    }
  });

  describe('Tier 4 Real-World Application Scenarios (TEST_INFRA.md)', () => {
    const renderer = new DomRenderer();

    it('Scenario 1: Quadratic formula: x = (-b \\pm \\sqrt(b^2 - 4ac))/(2a)', () => {
      const linear = 'x = (-b \\pm \\sqrt(b^2 - 4ac))/(2a)';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('<mfrac>');
      expect(xml).toContain('<msqrt>');
      expect(xml).toContain('±');

      const dom = renderer.render(ast);
      expect(dom.querySelector('.eq-fraction')).not.toBeNull();
      expect(dom.querySelector('.eq-radical')).not.toBeNull();
    });

    it('Scenario 2: Gaussian normal distribution', () => {
      const linear = 'f(x) = 1/(\\sigma \\sqrt(2\\pi)) e^(-(x-\\mu)^2 / (2\\sigma^2))';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('σ');
      expect(xml).toContain('π');
      expect(xml).toContain('μ');
      expect(xml).toContain('<msup>');
    });

    it('Scenario 3: Euler identity: e^(i\\pi) + 1 = 0', () => {
      const linear = 'e^(i\\pi) + 1 = 0';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('π');
      expect(xml).toContain('<msup>');
      expect(xml).toContain('=');
    });

    it('Scenario 4: Cauchy-Schwarz inequality', () => {
      const linear = '(\\sum_{i=1}^n a_i b_i)^2 \\le (\\sum_{i=1}^n a_i^2) (\\sum_{i=1}^n b_i^2)';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∑');
      expect(xml).toContain('≤');
      expect(xml).toContain('<munderover>');
    });

    it('Scenario 5: Taylor series expansion of sin(x)', () => {
      const linear = '\\sum_{n=0}^\\infty (-1)^n / (2n+1)! x^(2n+1)';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∑');
      expect(xml).toContain('∞');
      expect(xml).toContain('<mfrac>');
    });

    it('Scenario 6: Maxwell equations in differential form', () => {
      const linear = '\\nabla \\cdot E = \\rho / \\epsilon_0';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∇');
      expect(xml).toContain('·');
      expect(xml).toContain('ρ');
      expect(xml).toContain('ε');
    });

    it('Scenario 7: Matrix multiplication formula', () => {
      const linear = 'C_(i,j) = \\sum_{k=1}^m A_(i,k) B_(k,j)';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∑');
      expect(xml).toContain('<msub>');
    });

    it('Scenario 8: Complex fraction with nested radicals and Greek symbols', () => {
      const linear = '(\\alpha + \\sqrt(\\beta + \\sqrt(\\gamma))) / (\\delta + \\epsilon)';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('α');
      expect(xml).toContain('β');
      expect(xml).toContain('γ');
      expect(xml).toContain('δ');
      expect(xml).toContain('ε');
      expect(xml).toContain('<mfrac>');
    });

    it('Scenario 9: Quantum harmonic oscillator Hamiltonian', () => {
      const linear = 'H = p^2/(2m) + 1/2 m \\omega^2 x^2';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('ω');
      expect(xml).toContain('<mfrac>');
      expect(xml).toContain('<msup>');
    });

    it('Scenario 10: Definite integral with integration bounds', () => {
      const linear = '\\int_0^\\infty e^(-x) dx = 1';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∫');
      expect(xml).toContain('∞');
      expect(xml).toContain('<munderover>');
    });

    it('Scenario 11: Limit definition of derivative', () => {
      const linear = 'f\'(x) = \\lim_{h \\to 0} (f(x+h) - f(x))/h';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('lim');
      expect(xml).toContain('→');
      expect(xml).toContain('<mfrac>');
    });

    it('Scenario 12: Logistic sigmoid function', () => {
      const linear = 'f(x) = 1/(1 + e^(-x))';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('<mfrac>');
      expect(xml).toContain('<msup>');
    });

    it('Scenario 13: Black-Scholes PDE equation', () => {
      const linear = '\\partial V / \\partial t + 1/2 \\sigma^2 S^2 (\\partial^2 V / \\partial S^2) + r S (\\partial V / \\partial S) - r V = 0';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∂');
      expect(xml).toContain('σ');
      expect(xml).toContain('<mfrac>');
    });

    it('Scenario 14: Schrödinger wave equation', () => {
      const linear = 'i \\hbar (\\partial / \\partial t) \\Psi(r, t) = H \\Psi(r, t)';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('ℏ');
      expect(xml).toContain('∂');
      expect(xml).toContain('Ψ');
    });

    it('Scenario 15: Fourier transform definition', () => {
      const linear = 'F(\\xi) = \\int_{-\\infty}^\\infty f(x) e^(-2\\pi i x \\xi) dx';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∫');
      expect(xml).toContain('π');
      expect(xml).toContain('ξ');
    });

    it('Scenario 16: Binomial theorem with sum and power', () => {
      const linear = '(x + y)^n = \\sum_{k=0}^n C_k^n x^(n-k) y^k';
      const ast = parseLinearEquation(linear);
      const xml = serializeMathML(ast);
      expect(xml).toContain('∑');
      expect(xml).toContain('<munderover>');
    });

    it('Scenario 17: Full note with mixed standard markdown, LaTeX $$, and Word equation', () => {
      const noteContent = `
# Physics Note

This note contains standard text and inline math: Let $x > 0$.

Standard Obsidian LaTeX block:
$$
E = mc^2
$$

And our custom Word-like equation block:
\`\`\`math-word
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
  <mrow>
    <mi>i</mi>
    <mi>ℏ</mi>
    <mfrac>
      <mrow><mo>∂</mo><mi>Ψ</mi></mrow>
      <mrow><mo>∂</mo><mi>t</mi></mrow>
    </mfrac>
    <mo>=</mo>
    <mover><mi>H</mi><mo>^</mo></mover>
    <mi>Ψ</mi>
  </mrow>
</math>
\`\`\`

Conclusion paragraph with $\\alpha$ symbol.
`;
      const blocks = extractEquationBlocks(noteContent);
      expect(blocks.length).toBe(1);
      const ast = parseMathML(blocks[0].code);
      expect(ast.children.length).toBeGreaterThan(0);
      const dom = renderer.render(ast);
      expect(dom.querySelector('.eq-fraction')).not.toBeNull();
    });

    it('Scenario 18: Real-world interactive editing workflow: insert block, type fraction, navigate into denominator, insert exponent', () => {
      const { view, container } = createMockEditor('');

      // Step 1: Insert block template via markdown trigger
      const template = '```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>\n```\n';
      view.dispatch({ changes: { from: 0, insert: template } });

      // Step 2: Parse and build AST for interactive session
      let ast = parseLinearEquation('a/b');
      expect(ast.children[0].type).toBe('fraction');
      const frac = ast.children[0] as any;
      const den = frac.denominator;

      // Step 3: Navigate down into denominator
      const navDown = handleArrowKey(ast, { slotId: frac.numerator.id, offset: 1 }, 'ArrowDown');
      expect(navDown.handled).toBe(true);
      expect(navDown.caret.slotId).toBe(den.id);

      // Step 4: Insert exponent ^2 in denominator
      const edit1 = insertCharacter(ast, navDown.caret, '^');
      const edit2 = insertCharacter(edit1.root, edit1.caret, '2');
      expect(edit2.handled).toBe(true);
      expect(edit2.root.children[0].type).toBe('fraction');

      // Step 5: Serialize and verify MathML reflects changes
      const updatedXml = serializeMathML(edit2.root);
      expect(updatedXml).toContain('<mfrac>');

      view.destroy();
      container.remove();
    });
  });
});
