/**
 * Markdown Post-Processor for Table and Inline Equations
 * Ensures equations inside Markdown table cells and preview documents
 * remain rendered as styled visual widgets when cells exit or lose focus.
 */

import { MarkdownPostProcessorContext } from 'obsidian';
import { DomRenderer } from '../editor/dom-renderer';
import { parseMathML } from '../core/mathml-parser';
import { parseLinearEquation } from '../core/linear-parser';
import { convertLatexToMathML } from '../conversion/converter';
import { SlotNode, MATHML_NAMESPACE } from '../core/types';




export function createTableInlinePostProcessor() {
  const renderer = new DomRenderer();

  return (el: HTMLElement, ctx?: MarkdownPostProcessorContext): void => {
    if (!el) return;

    // 1. Identify candidate containers: table cells, table headers, wrappers, paragraphs, list items
    const targetElements = el.querySelectorAll('td, th, .table-cell-wrapper, p, li, blockquote');
    const containers: HTMLElement[] = targetElements.length > 0
      ? (Array.from(targetElements) as HTMLElement[])
      : [el];

    for (const container of containers) {
      processContainer(container, renderer);
    }

    // Also process root if it wasn't in the list
    if (containers.indexOf(el) === -1) {
      processContainer(el, renderer);
    }
  };
}

function processContainer(container: HTMLElement, renderer: DomRenderer): void {
  // If this container is already a rendered equation or contains one, check if unrendered equation tokens remain
  if (container.classList.contains('word-equation-math') || container.classList.contains('word-equation-inline')) {
    return;
  }

  // 1. Process any native <math> elements in DOM not yet wrapped in WordEquation
  const mathElements = Array.from(container.querySelectorAll('math, .math, span.math-inline, span.math-block'));
  for (const mathEl of mathElements) {
    if (mathEl.closest('.word-equation-math')) continue;
    try {
      const xml = (mathEl as HTMLElement).tagName.toLowerCase() === 'math'
        ? (mathEl as HTMLElement).outerHTML
        : (mathEl.getAttribute('data-math') || mathEl.textContent || '');
      const ast = parseMathML(xml.startsWith('<math') ? xml : `<math xmlns="${MATHML_NAMESPACE}"><mrow>${xml}</mrow></math>`);
      // Check if equation was explicitly delimited as inline
      let isInlineDelimited = false;
      let pCheck = mathEl.previousSibling;
      while (pCheck) {
        if (pCheck.nodeType === Node.TEXT_NODE) {
          if (/(?:[/\\]weq_inline|\$weq(?:_inline)?)\s*$/i.test(pCheck.nodeValue || '')) {
            isInlineDelimited = true;
          }
          break;
        } else if ((pCheck as HTMLElement).tagName === 'BR') {
          pCheck = pCheck.previousSibling;
          continue;
        }
        break;
      }
      if (!isInlineDelimited) {
        let nCheck = mathEl.nextSibling;
        while (nCheck) {
          if (nCheck.nodeType === Node.TEXT_NODE) {
            if (/^\s*(?:[/\\]weq_inline|\$weq(?:_inline)?)/i.test(nCheck.nodeValue || '')) {
              isInlineDelimited = true;
            }
            break;
          } else if ((nCheck as HTMLElement).tagName === 'BR') {
            nCheck = nCheck.nextSibling;
            continue;
          }
          break;
        }
      }
      if (mathEl.classList.contains('math-inline') || mathEl.getAttribute('display') === 'inline') {
        isInlineDelimited = true;
      }

      const isBlockMath = !isInlineDelimited && (mathEl.classList.contains('math-block') || mathEl.getAttribute('display') === 'block');
      const isFullPage = mathEl.getAttribute('display') === 'full-page' || mathEl.getAttribute('data-display-mode') === 'full-page';
      const isInsideTable = Boolean(container.closest('table, tr, td, th') || container.matches('td, th, .table-cell-wrapper'));
      const rendered = renderer.render(ast, { readOnly: true, isFocused: false, inline: !(isBlockMath && isInsideTable) && !isFullPage });

      // Strip flanking delimiter text (Bug 2: delimiter leaks)
      let prev = mathEl.previousSibling;
      while (prev && (prev.nodeType === Node.TEXT_NODE || (prev as HTMLElement).tagName === 'BR')) {
        if (prev.nodeType === Node.TEXT_NODE) {
          const prevText = prev.nodeValue || '';
          const cleaned = prevText.replace(/(?:[/\\]weq_inline|\$weq(?:_inline)?|(?:```)?(?:math-word|weq|math-page|weq-page)(?:<br\s*\/?>|\s)*)\s*$/i, '');
          if (cleaned !== prevText) {
            prev.nodeValue = cleaned;
          }
          if (!prev.nodeValue?.trim()) {
            const toRemove = prev;
            prev = prev.previousSibling;
            toRemove.parentNode?.removeChild(toRemove);
            continue;
          }
          break;
        } else if ((prev as HTMLElement).tagName === 'BR') {
          let candidate = prev.previousSibling;
          while (candidate && ((candidate.nodeType === Node.TEXT_NODE && !candidate.nodeValue?.trim()) || (candidate as HTMLElement).tagName === 'BR')) {
            candidate = candidate.previousSibling;
          }
          if (candidate && candidate.nodeType === Node.TEXT_NODE && /(?:math-word|weq|math-page|weq-page|[/\\]weq_inline|\$weq(?:_inline)?)$/i.test(candidate.nodeValue?.trim() || '')) {
            const toRemove = prev;
            prev = prev.previousSibling;
            toRemove.parentNode?.removeChild(toRemove);
            continue;
          }
          break;
        }
      }

      let next = mathEl.nextSibling;
      while (next && (next.nodeType === Node.TEXT_NODE || (next as HTMLElement).tagName === 'BR')) {
        if (next.nodeType === Node.TEXT_NODE) {
          const nextText = next.nodeValue || '';
          let cleaned = nextText.replace(/^\s*(?:[/\\]weq_inline|\$weq(?:_inline)?|(?:<br\s*\/?>|\s)*(?:```)?)/i, '');
          if (cleaned && !cleaned.startsWith(' ') && (nextText.includes(' ') || isInlineDelimited)) {
            cleaned = ' ' + cleaned;
          }
          if (cleaned !== nextText) {
            next.nodeValue = cleaned;
          }
          if (!next.nodeValue?.trim()) {
            const toRemove = next;
            next = next.nextSibling;
            toRemove.parentNode?.removeChild(toRemove);
            continue;
          }
          break;
        } else if ((next as HTMLElement).tagName === 'BR') {
          let candidate = next.nextSibling;
          while (candidate && ((candidate.nodeType === Node.TEXT_NODE && !candidate.nodeValue?.trim()) || (candidate as HTMLElement).tagName === 'BR')) {
            candidate = candidate.nextSibling;
          }
          if (candidate && candidate.nodeType === Node.TEXT_NODE && /^(?:```|[/\\]weq_inline|\$weq(?:_inline)?)/i.test(candidate.nodeValue?.trim() || '')) {
            const toRemove = next;
            next = next.nextSibling;
            toRemove.parentNode?.removeChild(toRemove);
            continue;
          }
          break;
        }
      }

      if (isInsideTable && isFullPage) {
        // Bug 3: Full-page math block takes entire cell and hides outside text
        rendered.classList.add('word-equation-full-page');
        rendered.style.width = '100%';
        rendered.style.height = '100%';
        rendered.style.minHeight = '100%';
        rendered.style.display = 'flex';
        rendered.style.alignItems = 'center';
        rendered.style.justifyContent = 'center';
        const mathBox = rendered.querySelector('.word-equation-math') as HTMLElement | null;
        if (mathBox) {
          mathBox.classList.add('eq-full-page');
          mathBox.style.width = '100%';
          mathBox.style.height = '100%';
          mathBox.style.minHeight = '100%';
          mathBox.style.borderRadius = '0';
        }
        const cell = container.closest('td, th') || (container.matches('td, th') ? container : null);
        if (cell) {
          cell.classList.add('table-cell-has-fullpage-equation');
          (cell as HTMLElement).style.padding = '0';
          for (const child of Array.from(cell.childNodes)) {
            if (child !== mathEl && child !== rendered) {
              if (child.nodeType === Node.TEXT_NODE) {
                child.nodeValue = '';
              } else if (child.nodeType === Node.ELEMENT_NODE) {
                (child as HTMLElement).style.display = 'none';
              }
            }
          }
        }
      } else if (isInsideTable && isBlockMath) {
        rendered.classList.add('word-equation-table-block');
        rendered.style.width = '100%';
        rendered.style.display = 'flex';
        rendered.style.alignItems = 'center';
        rendered.style.justifyContent = 'center';
        const mathBox = rendered.querySelector('.word-equation-math') as HTMLElement | null;
        if (mathBox) {
          mathBox.style.display = 'inline-flex';
          mathBox.style.alignItems = 'center';
          mathBox.style.justifyContent = 'center';
          mathBox.style.borderRadius = '6px';
          mathBox.style.padding = '6px 12px';
          mathBox.style.minHeight = '2.2em';
        }
        const cell = container.closest('td, th') || (container.matches('td, th') ? container : null);
        if (cell) {
          cell.classList.add('table-cell-has-block-equation');
        }
      }
      mathEl.parentNode?.replaceChild(rendered, mathEl);
    } catch {
      // Keep original element if parsing fails
    }
  }

  // 2. Process text nodes containing inline equation tokens
  processTextNodesInElement(container, renderer);
}

function processTextNodesInElement(container: HTMLElement, renderer: DomRenderer): void {
  const isInsideTable = Boolean(container.closest('table, tr, td, th') || container.matches('td, th, .table-cell-wrapper'));

  // Collect text nodes
  const textNodes: Text[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('word-equation-math') || el.classList.contains('word-equation-block') || el.classList.contains('word-equation-inline')) {
        return; // Don't descend into already rendered equation widgets
      }
      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }
    }
  };

  walk(container);

  for (const textNode of textNodes) {
    if (!textNode.parentNode) continue;
    processSingleTextNode(textNode, renderer, isInsideTable);
  }

  // Clean up any remaining orphaned leaked delimiter text nodes inside table cells
  if (isInsideTable) {
    const remainingTextNodes: Text[] = [];
    const walkRemaining = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        remainingTextNodes.push(node as Text);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (!el.classList.contains('word-equation-math')) {
          for (let i = 0; i < el.childNodes.length; i++) {
            walkRemaining(el.childNodes[i]);
          }
        }
      }
    };
    walkRemaining(container);

    for (const tn of remainingTextNodes) {
      if (tn.nodeValue) {
        const cleaned = tn.nodeValue
          .replace(/[/\\]weq_inline/gi, '')
          .replace(/```(?:math-word|weq|math-page|weq-page)(?:<br\s*\/?>)?/gi, '')
          .replace(/```/g, '');
        if (cleaned !== tn.nodeValue) {
          tn.nodeValue = cleaned;
          if (!cleaned.trim() && tn.parentNode) {
            tn.parentNode.removeChild(tn);
          }
        }
      }
    }
  }
}

// Regex patterns for matching equation tokens in text
const INLINE_WEQ_REGEX = /(?:[/\\]weq_inline|\$weq(?:_inline)?)\s*([\s\S]*?)\s*(?:[/\\]weq_inline|\$weq(?:_inline)?)/;
const RAW_MATHML_REGEX = /<math[\s\S]*?<\/math>/i;
const FENCED_BLOCK_IN_TABLE_REGEX = /```(?:math-word|weq|math-page|weq-page)(?:[ \t]*(?:<br\s*\/?>|\r?\n)\s*)([\s\S]*?)(?:(?:\r?\n|<br\s*\/?>)```(?:\r?\n|<br\s*\/?>)?|```(?:\r?\n|<br\s*\/?>)?|$)/;

const TABLE_UNFENCED_BLOCK_REGEX = /(?:math-word|weq)(?:[ \t]*(?:<br\s*\/?>|\r?\n)\s*)(?:\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$|(<math[\s\S]*?<\/math>)|([^<\r\n|]+?))(?:\s*<br\s*\/?>[ \t]*\r?\n|\s*<br\s*\/?>|\r?\n|$)/i;
const TABLE_DOLLAR_DOUBLE_REGEX = /\$\$([\s\S]*?)\$\$/;
const TABLE_DOLLAR_SINGLE_REGEX = /\$([^\$\n]+?)\$/;

function processSingleTextNode(textNode: Text, renderer: DomRenderer, isInsideTable: boolean): void {
  const text = textNode.nodeValue || '';
  if (!text) return;

  // Find earliest matching equation token
  type TokenMatch = {
    index: number;
    length: number;
    code: string;
    type: 'mathml' | 'linear' | 'latex';
    isBlock: boolean;
  };

  let bestMatch: TokenMatch | null = null;

  const testRegex = (
    regex: RegExp,
    type: 'mathml' | 'linear' | 'latex',
    isBlock: boolean,
    codeExtractor: (m: RegExpExecArray) => string
  ) => {
    const match = regex.exec(text);
    if (match) {
      const index = match.index;
      if (
        !bestMatch ||
        index < bestMatch.index ||
        (index === bestMatch.index && match[0].length > bestMatch.length)
      ) {
        bestMatch = {
          index,
          length: match[0].length,
          code: codeExtractor(match),
          type,
          isBlock,
        };
      }
    }
  };

  // Check /weq_inline ... /weq_inline and \weq_inline ... \weq_inline
  testRegex(INLINE_WEQ_REGEX, 'mathml', false, (m) => m[1]);

  // Check raw <math>...</math>
  testRegex(RAW_MATHML_REGEX, 'mathml', false, (m) => m[0]);

  // In table cells, check fenced and unfenced block equations and dollar signs
  if (isInsideTable) {
    testRegex(FENCED_BLOCK_IN_TABLE_REGEX, 'mathml', true, (m) => m[1]);
    testRegex(TABLE_UNFENCED_BLOCK_REGEX, 'mathml', true, (m) => (m[1] || m[2] || m[3] || m[4] || m[0]));
    testRegex(TABLE_DOLLAR_DOUBLE_REGEX, 'latex', false, (m) => m[1]);
    testRegex(TABLE_DOLLAR_SINGLE_REGEX, 'latex', false, (m) => m[1]);
  }

  if (!bestMatch) return;

  const match = bestMatch as TokenMatch;
  let rawCode = match.code.trim();

  // Strip surrounding dollar signs if present inside delimiters
  rawCode = rawCode.replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1').trim();

  // Decode common HTML entities
  rawCode = rawCode
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#124;/g, '|')
    .replace(/&quot;/g, '"');

  // Replace HTML <br> tags with newlines
  rawCode = rawCode.replace(/<br\s*\/?>/gi, '\n');

  let ast: SlotNode | null = null;

  try {
    if (match.type === 'latex' || (!rawCode.startsWith('<math') && !rawCode.includes('</math>') && !rawCode.startsWith('<m'))) {
      if (rawCode.startsWith('<math') || rawCode.includes('</math>')) {
        ast = parseMathML(rawCode);
      } else {
        // Try converting latex or linear equation
        try {
          const mathml = convertLatexToMathML(rawCode, false, { throwOnError: false });
          if (mathml && (mathml.startsWith('<math') || mathml.startsWith('<m'))) {
            ast = parseMathML(mathml);
          } else {
            ast = parseLinearEquation(rawCode);
          }
        } catch {
          ast = parseLinearEquation(rawCode);
        }
      }
    } else {
      ast = parseMathML(rawCode);
    }
  } catch (err) {
    // If parsing fails, fall back to linear parser or leave unparsed
    try {
      ast = parseLinearEquation(rawCode);
    } catch {
      return;
    }
  }

  if (!ast) return;

  const isBlock = match.isBlock;

  const rendered = renderer.render(ast, {
    readOnly: true,
    isFocused: false,
    inline: !isBlock,
  });

  if (isInsideTable && isBlock) {
    rendered.classList.add('word-equation-table-block');
    rendered.style.width = '100%';
    rendered.style.display = 'flex';
    rendered.style.alignItems = 'center';
    rendered.style.justifyContent = 'center';

    const mathEl = rendered.querySelector('.word-equation-math') as HTMLElement | null;
    if (mathEl) {
      mathEl.style.display = 'inline-flex';
      mathEl.style.alignItems = 'center';
      mathEl.style.justifyContent = 'center';
      mathEl.style.borderRadius = '6px';
      mathEl.style.padding = '6px 12px';
      mathEl.style.minHeight = '2.2em';
    }

    const cell = textNode.parentElement?.closest('td, th') || (textNode.parentElement?.matches?.('td, th') ? textNode.parentElement : null);
    if (cell) {
      (cell as HTMLElement).classList.add('table-cell-has-block-equation');
    }
  }

  // Split text node and insert rendered widget
  const parent = textNode.parentNode;
  if (!parent) return;

  const textBefore = text.slice(0, match.index);
  let textAfter = text.slice(match.index + match.length);
  if (!match.isBlock && textAfter.length > 0 && !textAfter.startsWith(' ')) {
    textAfter = ' ' + textAfter;
  }

  if (textBefore.length > 0) {
    parent.insertBefore(document.createTextNode(textBefore), textNode);
  }

  parent.insertBefore(rendered, textNode);

  if (textAfter.length > 0) {
    const remainingNode = document.createTextNode(textAfter);
    parent.insertBefore(remainingNode, textNode);
    // Recursively process the remainder for additional equations
    processSingleTextNode(remainingNode, renderer, isInsideTable);
  }

  parent.removeChild(textNode);
}
