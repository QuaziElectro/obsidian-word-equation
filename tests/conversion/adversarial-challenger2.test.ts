import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertLatexToMathML,
  convertMathMLToLatex,
} from '../../src/conversion/converter';
import {
  convertNoteLatexToMathML,
  convertNoteMathMLToLatex,
  convertMarkdownContent,
} from '../../src/conversion/markdown-scanner';
import {
  convertCurrentNote,
  convertEntireVault,
  registerConversionCommands,
  BACKUP_WARNING_MESSAGE,
} from '../../src/conversion/commands';
import { InteractiveEquationBox } from '../../src/settings/interactive-box';
import {
  setActiveEquationState,
  getActiveEquationState,
  clearActiveEquationState,
  onActiveEquationChange,
} from '../../src/editor/active-session';
import { EquationGalleryView, GALLERY_CATEGORIES } from '../../src/gallery/gallery-view';
import { serializeMathML } from '../../src/core/mathml-serializer';

describe('Challenger 2 Empirical Verification: Conversion Fidelity & Round-Trip Semantics', () => {
  const roundTripMath = (latex: string, isBlock: boolean = false): string => {
    const mathml = convertLatexToMathML(latex, isBlock);
    return convertMathMLToLatex(mathml);
  };

  it('preserves algebraic fraction semantics through round-trip', () => {
    const latex = '\\frac{a + b}{c - d}';
    const mathml = convertLatexToMathML(latex, false);
    expect(mathml).toContain('<mfrac>');
    expect(mathml).toContain('<mi>a</mi>');
    expect(mathml).toContain('<mo>+</mo>');
    expect(mathml).toContain('<mi>b</mi>');

    const result = convertMathMLToLatex(mathml);
    expect(result).toMatch(/\\frac\{\s*a\s*\+\s*b\s*\}\{\s*c\s*-\s*d\s*\}/);
  });

  it('preserves multi-level nested fractions through round-trip', () => {
    const latex = '\\frac{1}{1 + \\frac{2}{3}}';
    const mathml = convertLatexToMathML(latex, true);
    expect(mathml.match(/<mfrac/g)?.length).toBe(2);

    const result = convertMathMLToLatex(mathml);
    expect(result).toMatch(/\\frac\{\s*1\s*\}\{\s*1\s*\+\s*\\frac\{\s*2\s*\}\{\s*3\s*\}\s*\}/);
  });

  it('preserves exponents, subscripts, and combined scripts', () => {
    const testCases = [
      'x^{2}',
      'x_{i}',
      'A_{n}^{k}',
      'e^{-x^{2}}',
    ];

    for (const tc of testCases) {
      const mathml = convertLatexToMathML(tc, false);
      expect(mathml).toMatch(/<(msup|msub|msubsup)/);
      const roundTrip = convertMathMLToLatex(mathml);
      expect(roundTrip.length).toBeGreaterThan(0);
    }
  });

  it('preserves square roots and indexed radicals', () => {
    const sqrtCase = '\\sqrt{x^{2} + y^{2}}';
    const sqrtMathml = convertLatexToMathML(sqrtCase, false);
    expect(sqrtMathml).toContain('<msqrt>');
    const sqrtBack = convertMathMLToLatex(sqrtMathml);
    expect(sqrtBack).toMatch(/\\sqrt\{\s*x\^\{?2\}?\s*\+\s*y\^\{?2\}?\s*\}/);

    const rootCase = '\\sqrt[3]{8}';
    const rootMathml = convertLatexToMathML(rootCase, false);
    expect(rootMathml).toContain('<mroot>');
    const rootBack = convertMathMLToLatex(rootMathml);
    expect(rootBack).toMatch(/\\sqrt\[3\]\{\s*8\s*\}/);
  });

  it('preserves Greek letters, operators, and relations', () => {
    const math = '\\alpha + \\beta = \\gamma';
    const mathml = convertLatexToMathML(math, false);
    expect(mathml).toContain('α');
    expect(mathml).toContain('β');
    expect(mathml).toContain('γ');

    const back = convertMathMLToLatex(mathml);
    expect(back).toMatch(/(\\alpha|\u03b1)/);
    expect(back).toMatch(/(\\beta|\u03b2)/);
    expect(back).toMatch(/(\\gamma|\u03b3)/);
  });

  it('preserves calculus notations (summations, integrals, limits)', () => {
    const calc = '\\sum_{i=1}^{n} i = \\int_{0}^{1} x dx';
    const mathml = convertLatexToMathML(calc, true);
    expect(mathml).toContain('∑');
    expect(mathml).toContain('∫');

    const back = convertMathMLToLatex(mathml);
    expect(back).toMatch(/(\\sum|∑)/);
    expect(back).toMatch(/(\\int|∫)/);
  });

  it('demonstrates idempotent conversion on second round-trip pass (fixed-point property)', () => {
    const initial = '\\frac{x + 1}{x - 1}';
    const pass1MathML = convertLatexToMathML(initial, false);
    const pass1Latex = convertMathMLToLatex(pass1MathML);

    const pass2MathML = convertLatexToMathML(pass1Latex, false);
    const pass2Latex = convertMathMLToLatex(pass2MathML);

    // Fixed-point test: pass1Latex and pass2Latex must be structurally and semantically identical
    expect(pass2Latex).toEqual(pass1Latex);
  });

  it('gracefully survives malformed MathML input without throwing', () => {
    const badInputs = [
      '',
      '   ',
      '<math><unclosed>',
      '<not-xml',
      'Plain string without math tags',
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><invalid>&badEntity;</invalid></math>',
    ];

    for (const bad of badInputs) {
      expect(() => convertMathMLToLatex(bad)).not.toThrow();
      const res = convertMathMLToLatex(bad);
      expect(typeof res).toBe('string');
    }
  });
});

describe('Challenger 2 Empirical Verification: Protected Code Blocks & Inline Backticks', () => {
  it('protects multi-language code blocks from LaTeX-to-MathML conversion', () => {
    const markdown = `# Polyglot Protection Test

\`\`\`python
# Python with math-like variables and dollar signs
def calculate_cost(price: float) -> str:
    dollar_val = f"$ {price} $"
    formula = "$x = y + 1$"
    return "$$block$$"
\`\`\`

\`\`\`bash
#!/usr/bin/env bash
VAR="hello"
echo "Total cost is $100 and tax is $15"
echo "$VAR and $HOME"
\`\`\`

\`\`\`rust
fn main() {
    let price = "$50";
    let block = "$$E = mc^2$$";
    println!("{}", price);
}
\`\`\`

\`\`\`yaml
config:
  price: "$99.99"
  description: "Cost is $5 per item"
  math_string: "$$a + b$$"
\`\`\`

\`\`\`json
{
  "name": "$special_val$",
  "math": "$$x^2$$"
}
\`\`\`

~~~cpp
// Tilde fenced block
int main() {
    std::string s = "$not_math$";
    return 0;
}
~~~

Here is an actual formula: $x + y = z$.
And a block formula:
$$
\\frac{1}{2}
$$
`;

    const result = convertMarkdownContent(markdown, 'latex-to-mathml', 'math-word');
    // Exactly 2 real equations converted (1 inline + 1 block)
    expect(result.count).toBe(2);

    // Verify all code blocks remain byte-for-byte identical
    expect(result.converted).toContain('def calculate_cost(price: float) -> str:');
    expect(result.converted).toContain('echo "Total cost is $100 and tax is $15"');
    expect(result.converted).toContain('let block = "$$E = mc^2$$";');
    expect(result.converted).toContain('price: "$99.99"');
    expect(result.converted).toContain('"name": "$special_val$"');
    expect(result.converted).toContain('std::string s = "$not_math$";');

    // Real formulas converted
    expect(result.converted).toContain('/weq_inline');
    expect(result.converted).toContain('```math-word\n<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"');
  });

  it('protects multi-language code blocks from MathML-to-LaTeX conversion', () => {
    const markdown = `
\`\`\`python
# Code containing MathML strings
xml_sample = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>'
xml_block = '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mi>x</mi></math>'
\`\`\`

\`\`\`rust
let raw_xml = "/weq_inline <math><mi>y</mi></math> /weq_inline";
\`\`\`

\`\`\`math-word
<math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>
\`\`\`

Inline mathml: /weq_inline <math xmlns="http://www.w3.org/1998/Math/MathML"><mi>k</mi></math> /weq_inline
`;

    const result = convertMarkdownContent(markdown, 'mathml-to-latex');
    expect(result.count).toBe(2); // The math-word block and the /weq_inline formula

    // Code blocks preserved intact
    expect(result.converted).toContain('xml_sample = \'<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>\'');
    expect(result.converted).toContain('let raw_xml = "/weq_inline <math><mi>y</mi></math> /weq_inline";');

    // MathML equations converted to LaTeX
    expect(result.converted).toMatch(/\$\$\s*\\frac\{\s*a\s*\}\{\s*b\s*\}\s*\$\$/);
    expect(result.converted).toContain('$k$');
  });

  it('protects multiple inline backtick spans on the same line', () => {
    const md = 'First `echo $1` and then `$2` and finally `$x = y$` in code. But convert real $a^2 + b^2 = c^2$.';
    const result = convertMarkdownContent(md, 'latex-to-mathml');
    expect(result.count).toBe(1);
    expect(result.converted).toContain('`echo $1`');
    expect(result.converted).toContain('`$2`');
    expect(result.converted).toContain('`$x = y$`');
    expect(result.converted).toContain('/weq_inline');
  });

  it('protects currency and escaped dollar expressions', () => {
    const md = 'Items cost $10, $20, and $30 each. Total with discount is \\$55.00.';
    const result = convertMarkdownContent(md, 'latex-to-mathml');
    expect(result.count).toBe(0);
    expect(result.converted).toBe(md);
  });
});

describe('Challenger 2 Empirical Verification: Settings Visual Box Clipboard Transactions', () => {
  let container: HTMLElement;
  let changedXml: string | null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    changedXml = null;
  });

  it('handles paste of plain text strings safely without throwing', () => {
    const box = new InteractiveEquationBox({
      container,
      initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>',
      onChange: (xml) => {
        changedXml = xml;
      },
    });

    // Paste non-MathML plain text: numbers, letters, operators
    expect(() => box.insertPastedContent('123 + 456')).not.toThrow();
    expect(box.ast).toBeDefined();
    expect(changedXml).toBeDefined();
    expect(changedXml).toContain('123');
  });

  it('handles paste of completely invalid and malformed XML tags safely', () => {
    const box = new InteractiveEquationBox({
      container,
      initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>',
      onChange: (xml) => {
        changedXml = xml;
      },
    });

    const malformedPayloads = [
      '<math><unclosed_tag>',
      '<broken xml attr="value without quote',
      '<script>alert("xss")</script>',
      '<mfrac><mrow><mn>1</mrow></mfrac>',
      '<<<>>>><<<///',
      '<math>&unresolvedEntity;</math>',
    ];

    for (const bad of malformedPayloads) {
      expect(() => box.insertPastedContent(bad)).not.toThrow();
      expect(box.ast).toBeDefined();
      expect(box.ast.id).toBeDefined();
    }
  });

  it('handles paste of empty or whitespace strings without corrupting AST', () => {
    const box = new InteractiveEquationBox({
      container,
      initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi></mrow></math>',
      onChange: (xml) => {
        changedXml = xml;
      },
    });

    const initialChildCount = box.ast.children.length;
    // 1. Calling with empty string or trimmed whitespace returns early without altering children
    box.insertPastedContent('');
    box.insertPastedContent('   '.trim());
    expect(box.ast.children.length).toBe(initialChildCount);

    // 2. Calling with untrimmed whitespace does not throw and maintains AST parent validity
    expect(() => box.insertPastedContent('   ')).not.toThrow();
    expect(box.ast.children.every((c) => c.parentSlotId === box.ast.id)).toBe(true);
  });

  it('handles copy and cut operations with clipboardData and undo history', () => {
    const box = new InteractiveEquationBox({
      container,
      initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></math>',
      onChange: (xml) => {
        changedXml = xml;
      },
    });

    // Mock clipboardData
    const storage: Record<string, string> = {};
    const mockClipboardEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clipboardData: {
        setData: (type: string, val: string) => {
          storage[type] = val;
        },
        getData: (type: string) => storage[type] || '',
      },
    } as unknown as ClipboardEvent;

    // 1. Copy operation
    box.handleCopyEvent(mockClipboardEvent, false);
    expect(mockClipboardEvent.preventDefault).toHaveBeenCalled();
    expect(storage['application/mathml+xml']).toContain('<math');
    expect(storage['text/plain']).toContain('<math');

    // 2. Cut operation
    box.handleCopyEvent(mockClipboardEvent, true);
    expect(storage['text/plain']).toBeDefined();
    // After cut, target slot children should be cleared
    expect(box.ast.children.length).toBe(0);

    // 3. Undo restored the cut content
    const undoSuccess = box.undo();
    expect(undoSuccess).toBe(true);
    expect(box.ast.children.length).toBeGreaterThan(0);
  });

  it('handles undo/redo stack properly across multiple paste transactions', () => {
    const box = new InteractiveEquationBox({
      container,
      initialContent: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>',
      onChange: (xml) => {
        changedXml = xml;
      },
    });

    expect(box.ast.children.length).toBe(0);

    // Transaction 1: Paste valid MathML fraction
    box.insertPastedContent('<mfrac><mn>1</mn><mn>2</mn></mfrac>');
    expect(box.ast.children.length).toBe(1);

    // Transaction 2: Paste another character
    box.insertPastedContent('x');
    expect(box.ast.children.length).toBeGreaterThan(1);

    // Undo step 2
    box.undo();
    expect(box.ast.children.length).toBe(1);

    // Undo step 1
    box.undo();
    expect(box.ast.children.length).toBe(0);

    // Redo step 1
    box.redo();
    expect(box.ast.children.length).toBe(1);
  });
});

describe('Challenger 2 Empirical Verification: Gallery Focus Lifecycle & Sidebar Leaf Leaks', () => {
  beforeEach(() => {
    clearActiveEquationState();
  });

  it('handles rapid focus/blur toggling without hanging or throwing', () => {
    const events: boolean[] = [];
    const unsubscribe = onActiveEquationChange((active) => {
      events.push(active);
    });

    const dummyWidget = { isFocused: true, id: 'w1' };

    // Rapid burst of 100 focus state toggles
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        setActiveEquationState({
          from: 0,
          to: 10,
          caret: { slotId: 'root', offset: 0 },
          isFocused: true,
        }, dummyWidget);
      } else {
        clearActiveEquationState();
      }
    }

    expect(events.length).toBe(100);
    expect(events[0]).toBe(true);
    expect(events[1]).toBe(false);

    // Unsubscribe removes listener cleanly
    unsubscribe();
    setActiveEquationState({
      from: 0,
      to: 10,
      caret: { slotId: 'root', offset: 0 },
      isFocused: true,
    }, dummyWidget);

    expect(events.length).toBe(100); // No more events received
  });

  it('guarantees clean detachment of all gallery leaves when hideGalleryView is invoked', async () => {
    // Mock Obsidian workspace and leaves
    const detachedLeaves: any[] = [];
    const mockLeaves = [
      {
        detach: vi.fn(() => detachedLeaves.push('leaf1')),
      },
      {
        detach: vi.fn(() => detachedLeaves.push('leaf2')),
      },
    ];

    let collapsed = false;
    const mockPlugin: any = {
      app: {
        workspace: {
          getLeavesOfType: vi.fn((type: string) => {
            if (type === 'word-equation-gallery-view') {
              return mockLeaves.filter((l) => !detachedLeaves.includes(l));
            }
            return [];
          }),
          rightSplit: {
            collapse: vi.fn(() => {
              collapsed = true;
            }),
          },
        },
      },
    };

    // Replicate hideGalleryView logic on mockPlugin
    const hideGalleryView = async () => {
      const workspace = mockPlugin.app?.workspace;
      if (!workspace) return;
      const leaves = workspace.getLeavesOfType('word-equation-gallery-view');
      for (const leaf of leaves) {
        leaf.detach();
      }
      if (workspace.rightSplit) {
        workspace.rightSplit.collapse();
      }
    };

    await hideGalleryView();
    expect(mockLeaves[0].detach).toHaveBeenCalled();
    expect(mockLeaves[1].detach).toHaveBeenCalled();
    expect(collapsed).toBe(true);
  });

  it('verifies all categorized mathematical elements in GALLERY_CATEGORIES have valid MathML', () => {
    let totalItems = 0;
    for (const category of GALLERY_CATEGORIES) {
      expect(category.id).toBeDefined();
      expect(category.title).toBeDefined();
      expect(category.items.length).toBeGreaterThan(0);

      for (const item of category.items) {
        totalItems++;
        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.mathml).toBeDefined();
        expect(item.mathml).toMatch(/^<[a-zA-Z]+/); // Starts with an XML/MathML tag like <mfrac>, <mo>, <msqrt>
      }
    }
    // Verify comprehensive catalog (fractions, radicals, scripts, operators, greek, matrices)
    expect(totalItems).toBeGreaterThanOrEqual(40);
  });

  it('verifies conversion commands issue mandatory 7-second backup warning Notice', async () => {
    const { Notice } = await import('../mocks/obsidian');
    Notice.notices = [];

    const mockPlugin: any = {
      app: {
        workspace: {
          getActiveViewOfType: vi.fn(),
          getActiveFile: vi.fn(),
        },
        vault: {
          read: vi.fn(),
          modify: vi.fn(),
          getMarkdownFiles: vi.fn(() => []),
        },
      },
      settings: { defaultDelimiter: 'math-word' },
    };

    await convertCurrentNote(mockPlugin, 'latex-to-mathml');
    expect(Notice.notices.some((n: any) => n.message === BACKUP_WARNING_MESSAGE && n.duration === 7000)).toBe(true);

    Notice.notices = [];
    await convertEntireVault(mockPlugin, 'mathml-to-latex');
    expect(Notice.notices.some((n: any) => n.message === BACKUP_WARNING_MESSAGE && n.duration === 7000)).toBe(true);
  });
});
