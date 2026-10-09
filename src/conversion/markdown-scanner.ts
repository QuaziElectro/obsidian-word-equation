/**
 * Markdown Scanner & Segment Replacer for LaTeX <-> MathML Conversion
 * Protects code blocks (python, bash, etc.) and inline backtick spans from false conversion.
 */

import { convertLatexToMathML, convertMathMLToLatex } from './converter';

export interface ConversionResult {
  converted: string;
  count: number;
}

/**
 * Converts all standard Obsidian LaTeX equations in a Markdown document to MathML equations.
 * - Block LaTeX: `$$...$$` -> ```` ```{delimiter}\n<math ... display="block">...</math>\n``` ````
 * - Inline LaTeX: `$math$` -> `/weq_inline <math ...>...</math> /weq_inline`
 *
 * Strictly protects:
 * - Fenced code blocks of all languages (python, bash, etc.)
 * - Existing MathML equation blocks (math-word, weq)
 * - Existing inline MathML equations (/weq_inline, $weq)
 * - Inline backtick code spans (`...`)
 * - Escaped dollar signs (\$...)
 *
 * @param content The original Markdown document content
 * @param delimiter The block equation delimiter ('math-word' or 'weq')
 * @returns The converted Markdown document string
 */
export function convertNoteLatexToMathML(
  content: string,
  delimiter: 'math-word' | 'weq' = 'math-word'
): string {
  return convertMarkdownContent(content, 'latex-to-mathml', delimiter).converted;
}

/**
 * Converts all Word-like MathML equations in a Markdown document to standard Obsidian LaTeX equations.
 * - Block MathML: ```` ```(math-word|weq)\n<math ...>...</math>\n``` ```` -> `$$\n{latex}\n$$`
 * - Inline MathML: `/weq_inline <math ...>...</math> /weq_inline` -> `${latex}$`
 * - Inline MathML: `$weq <math ...>...</math> $weq` -> `${latex}$`
 *
 * Strictly protects:
 * - Non-equation fenced code blocks (python, bash, etc.)
 * - Inline backtick code spans (`...`)
 * - Existing LaTeX blocks and inline math
 *
 * @param content The original Markdown document content
 * @returns The converted Markdown document string
 */
export function convertNoteMathMLToLatex(content: string): string {
  return convertMarkdownContent(content, 'mathml-to-latex').converted;
}

/**
 * Unified Markdown conversion engine returning both the converted content and equation count.
 */
export function convertMarkdownContent(
  content: string,
  direction: 'latex-to-mathml' | 'mathml-to-latex',
  delimiter: 'math-word' | 'weq' = 'math-word'
): ConversionResult {
  if (!content) {
    return { converted: '', count: 0 };
  }

  const protectedTokens: string[] = [];
  const tokenPlaceholder = (idx: number) => `%%WEQ_PROTECTED_${idx}%%`;

  let masked = content;
  let count = 0;

  // Regex for any markdown fenced code block (supports ``` and ~~~ fences)
  const codeBlockRegex = /(^|\r?\n)(`{3,}|~{3,})([^\r\n]*)\r?\n([\s\S]*?)\r?\n\2(?=\r?\n|$)/g;

  if (direction === 'latex-to-mathml') {
    // 1. Protect all fenced code blocks (python, bash, json, existing math-word/weq, etc.)
    masked = masked.replace(codeBlockRegex, (match) => {
      const idx = protectedTokens.length;
      protectedTokens.push(match);
      return tokenPlaceholder(idx);
    });

    // 2. Protect existing inline MathML equations (/weq_inline ... /weq_inline and $weq ... $weq)
    masked = masked.replace(
      /(\/weq_inline[\s\S]*?\/weq_inline|\$weq(?:_inline)?[\s\S]*?\$weq(?:_inline)?)/g,
      (match) => {
        const idx = protectedTokens.length;
        protectedTokens.push(match);
        return tokenPlaceholder(idx);
      }
    );

    // 3. Protect inline code spans (`...`)
    masked = masked.replace(/(`+[^`\n]*?`+)/g, (match) => {
      const idx = protectedTokens.length;
      protectedTokens.push(match);
      return tokenPlaceholder(idx);
    });

    // 4. Protect escaped dollar signs (\$...)
    masked = masked.replace(/(\\\$)/g, (match) => {
      const idx = protectedTokens.length;
      protectedTokens.push(match);
      return tokenPlaceholder(idx);
    });

    // 5. Convert Block LaTeX: $$...$$
    masked = masked.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
      try {
        const xml = convertLatexToMathML(tex, true);
        count++;
        return `\`\`\`${delimiter}\n${xml}\n\`\`\``;
      } catch {
        return match;
      }
    });

    // 6. Convert Inline LaTeX: $...$
    const inlineLatexRegex =
      /\$(?:(?!\s)([^$\n]+?)(?<!\s)|\s*(\\[a-zA-Z]+[^$\n]*?)\s*)\$/g;

    masked = masked.replace(inlineLatexRegex, (match, textNormal, textCommand) => {
      const rawTex = textNormal !== undefined ? textNormal : textCommand;
      if (!rawTex || !rawTex.trim()) {
        return match;
      }
      try {
        const xml = convertLatexToMathML(rawTex, false);
        count++;
        return `/weq_inline ${xml} /weq_inline`;
      } catch {
        return match;
      }
    });

    // 7. Restore protected tokens
    const converted = masked.replace(/%%WEQ_PROTECTED_(\d+)%%/g, (_m, id) => {
      return protectedTokens[Number(id)] ?? _m;
    });

    return { converted, count };
  } else {
    // MathML -> LaTeX direction

    // 1. Convert or protect fenced code blocks
    masked = masked.replace(codeBlockRegex, (match, leadingNewline, _fence, langInfo, body) => {
      const lang = (langInfo || '').trim().toLowerCase();
      if (lang === 'math-word' || lang === 'weq') {
        try {
          const tex = convertMathMLToLatex(body);
          if (!tex && body.trim()) {
            return match;
          }
          count++;
          return `${leadingNewline}$$\n${tex}\n$$`;
        } catch {
          return match;
        }
      } else {
        // Protect non-equation code block (python, bash, etc.)
        const idx = protectedTokens.length;
        protectedTokens.push(match);
        return tokenPlaceholder(idx);
      }
    });

    // 2. Protect inline code spans (`...`)
    masked = masked.replace(/(`+[^`\n]*?`+)/g, (match) => {
      const idx = protectedTokens.length;
      protectedTokens.push(match);
      return tokenPlaceholder(idx);
    });

    // 3. Convert Inline MathML:
    // (a) /weq_inline ... /weq_inline
    // (b) $weq ... $weq and $weq_inline ... $weq_inline
    const inlineMathmlRegex =
      /(?:\/weq_inline|\$weq(?:_inline)?)\s*((?:(?!\n\s*\n)[\s\S])*?)\s*(?:\/weq_inline|\$weq(?:_inline)?)/g;

    masked = masked.replace(inlineMathmlRegex, (match, xml) => {
      try {
        const tex = convertMathMLToLatex(xml);
        if (!tex && xml.trim()) {
          return match;
        }
        count++;
        return `$${tex}$`;
      } catch {
        return match;
      }
    });

    // 4. Restore protected tokens
    const converted = masked.replace(/%%WEQ_PROTECTED_(\d+)%%/g, (_m, id) => {
      return protectedTokens[Number(id)] ?? _m;
    });

    return { converted, count };
  }
}
