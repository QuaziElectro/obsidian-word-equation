/**
 * LaTeX <-> MathML Mathematical Converter
 * Uses external libraries (temml and mathml-to-latex) per Requirement R4.
 */

import temml from 'temml';
import { MathMLToLaTeX } from 'mathml-to-latex';

export interface LatexToMathMLOptions {
  displayMode?: boolean;
  throwOnError?: boolean;
}

/**
 * Converts a LaTeX mathematical expression into a valid Presentation MathML XML string.
 * Uses temml with xml: true to output standard MathML.
 *
 * @param latex The input LaTeX math string
 * @param isBlock Whether the math is displayed in block/display mode
 * @returns Standard Presentation MathML XML string
 */
export function convertLatexToMathML(
  latex: string,
  isBlock: boolean = false,
  options?: LatexToMathMLOptions
): string {
  const trimmed = latex.trim();
  if (!trimmed) {
    return isBlock
      ? '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mrow></mrow>\n</math>'
      : '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow></mrow></math>';
  }

  return temml.renderToString(trimmed, {
    displayMode: options?.displayMode ?? isBlock,
    xml: true,
    annotate: false,
    throwOnError: options?.throwOnError ?? true,
  });
}

/**
 * Casing alias for PROJECT.md interface contract.
 */
export const convertLatexToMathml = convertLatexToMathML;

/**
 * Converts a Presentation MathML XML string into an equivalent LaTeX string.
 * Uses mathml-to-latex external library.
 *
 * @param mathml The input MathML XML string
 * @returns LaTeX math string (trimmed)
 */
export function convertMathMLToLatex(mathml: string): string {
  const trimmed = mathml.trim();
  if (!trimmed) {
    return '';
  }

  // Ensure XML has math wrapper if missing
  let xmlToParse = trimmed;
  if (!xmlToParse.startsWith('<math') && !xmlToParse.startsWith('<?xml')) {
    xmlToParse = `<math xmlns="http://www.w3.org/1998/Math/MathML">${xmlToParse}</math>`;
  }

  try {
    const result = MathMLToLaTeX.convert(xmlToParse);
    return (result || '').trim();
  } catch {
    // If standard parser failed, try stripping display attributes or class annotations
    try {
      const sanitized = xmlToParse.replace(/\s+(?:class|style|display)="[^"]*"/gi, '');
      const fallbackResult = MathMLToLaTeX.convert(sanitized);
      return (fallbackResult || '').trim();
    } catch {
      return '';
    }
  }
}

/**
 * Casing alias for PROJECT.md interface contract.
 */
export const convertMathmlToLatex = convertMathMLToLatex;
