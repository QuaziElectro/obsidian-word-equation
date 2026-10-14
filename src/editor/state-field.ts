/**
 * CodeMirror 6 StateField for Word-like Equation Block and Inline Replacement
 * - In Source Mode: displays raw Markdown/MathML without visual replacement (returns Decoration.none).
 * - In Live Preview: replaces block equations (```math-word, ```weq) and inline equations
 *   (/weq_inline ... /weq_inline, $weq ... $weq) with interactive visual widgets.
 */

import { StateField, RangeSetBuilder, Text, EditorState } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { WordEquationWidget } from './widget';
import { convertLatexToMathML } from '../conversion/converter';
import { EquationDisplayMode } from '../core/types';

export function isLivePreviewActive(state: EditorState): boolean {
  try {
    if (editorLivePreviewField) {
      const val = state.field(editorLivePreviewField, false);
      if (val !== undefined) {
        return Boolean(val);
      }
    }
  } catch {
    // In headless test environments where editorLivePreviewField may not be registered
  }
  return true;
}

export function isTableRowLine(line: { text: string }): boolean {
  const lineText = line.text.trim();
  if (lineText.length === 0) return false;
  return lineText.startsWith('|') || (lineText.includes('|') && lineText.endsWith('|')) || lineText.split('|').length >= 3;
}

export function isInsideTableRow(doc: Text, from: number, to?: number): boolean {
  const line = doc.lineAt(from);
  return isTableRowLine(line);
}

export function protectPipesInTableXml(xml: string): string {
  return xml.replace(/<mo>\|<\/mo>/g, '<mo>&#124;</mo>');
}

export interface EquationRange {
  from: number;
  to: number;
  code: string;
  inline: boolean;
  delimiter: string;
  displayMode?: EquationDisplayMode;
}


export function buildEquationDecorations(input: EditorState | Text): DecorationSet {
  if ('field' in input && typeof (input as EditorState).field === 'function') {
    if (!isLivePreviewActive(input as EditorState)) {
      return Decoration.none;
    }
  }

  const doc = 'doc' in input ? (input as EditorState).doc : (input as Text);
  const docText = doc.toString();
  const ranges: EquationRange[] = [];

  // 1. Match fenced block equations: ```math-word ... ``` or ```weq ... ```
  // Enhanced to support HTML <br> linebreaks inside Markdown table cells
  const blockRegex = /```(math-word|weq)(?:[ \t]*(?:<br\s*\/?>|\r?\n)\s*)([\s\S]*?)(?:(?:\r?\n|<br\s*\/?>)```|$)/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const delimiter = match[1];
    let code = match[2] || '';
    if (code.includes('<br')) {
      code = code.replace(/<br\s*\/?>/gi, '\n');
    }
    ranges.push({ from, to, code, inline: false, delimiter });
  }

  // 1a. Match full-page equations: ```math-page ... ``` or ```weq-page ... ```
  const fullPageRegex = /```(math-page|weq-page)(?:[ \t]*(?:<br\s*\/?>|\r?\n)\s*)([\s\S]*?)(?:(?:\r?\n|<br\s*\/?>)```|$)/g;
  while ((match = fullPageRegex.exec(docText)) !== null) {
    let from = match.index;
    let to = from + match[0].length;
    const delimiter = match[1];
    let code = match[2] || '';
    if (code.includes('<br')) {
      code = code.replace(/<br\s*\/?>/gi, '\n');
    }
    const inTable = isInsideTableRow(doc, from, to);
    if (inTable) {
      // In table cells, full-page math block takes the entire table cell and hides outside text
      const line = doc.lineAt(from);
      const lineText = line.text;
      const relFrom = from - line.from;
      const relTo = to - line.from;
      const prevPipe = lineText.lastIndexOf('|', relFrom - 1);
      const nextPipe = lineText.indexOf('|', relTo);
      const cellStart = prevPipe !== -1 ? line.from + prevPipe + 1 : line.from;
      const cellEnd = nextPipe !== -1 ? line.from + nextPipe : line.to;
      from = cellStart;
      to = cellEnd;
    } else {
      const startLine = doc.lineAt(from);
      const endLine = doc.lineAt(to);
      from = startLine.from;
      to = endLine.to;
    }
    ranges.push({ from, to, code, inline: false, delimiter, displayMode: 'full-page' });
  }

  // 1b. Match unfenced block equations in table rows: math-word<br>$...$<br> or math-word<br>...<br>
  // Enhanced to match math-page and weq-page in table cells (e.g. math-page<br><br>)
  const tableUnfencedBlockRegex = /(math-word|weq|math-page|weq-page)(?:[ \t]*(?:<br\s*\/?>|\r?\n)\s*)(?:\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$|(<math[\s\S]*?<\/math>)|([^<\r\n|]*?))(?:\s*<br\s*\/?>[ \t]*\r?\n|\s*<br\s*\/?>|\r?\n|$)/gi;
  while ((match = tableUnfencedBlockRegex.exec(docText)) !== null) {
    let from = match.index;
    let to = from + match[0].length;
    if (isInsideTableRow(doc, from, to)) {
      const delimiter = match[1].toLowerCase();
      const isFullPage = delimiter === 'math-page' || delimiter === 'weq-page';
      const rawContent = match[2] ?? match[3] ?? match[4] ?? match[5] ?? '';
      let code = rawContent.trim();
      code = code.replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1').trim();
      if (code.includes('<br')) {
        code = code.replace(/<br\s*\/?>/gi, '\n');
      }
      if (!code) {
        code = `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${isFullPage ? 'full-page' : 'block'}"><mrow></mrow></math>`;
      } else if (!code.startsWith('<math')) {
        try {
          code = convertLatexToMathML(code, false, { throwOnError: false }) || code;
        } catch {
          // fallback
        }
      }
      if (isFullPage) {
        // In table cells, full-page math block takes the entire table cell and hides outside text
        const line = doc.lineAt(from);
        const lineText = line.text;
        const relFrom = from - line.from;
        const relTo = to - line.from;
        const prevPipe = lineText.lastIndexOf('|', relFrom - 1);
        const nextPipe = lineText.indexOf('|', relTo);
        const cellStart = prevPipe !== -1 ? line.from + prevPipe + 1 : line.from;
        const cellEnd = nextPipe !== -1 ? line.from + nextPipe : line.to;
        from = cellStart;
        to = cellEnd;
        ranges.push({ from, to, code, inline: false, delimiter, displayMode: 'full-page' });
      } else {
        ranges.push({ from, to, code, inline: false, delimiter });
      }
    }
  }

  // 2. Match inline equations:
  // (a) /weq_inline ... /weq_inline and \weq_inline ... \weq_inline
  const weqInlineRegex = /[/\\]weq_inline\s*([\s\S]*?)\s*[/\\]weq_inline/g;
  while ((match = weqInlineRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    let code = match[1] || '';
    code = code.trim().replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1').trim();
    if (!code.startsWith('<math')) {
      try {
        code = convertLatexToMathML(code, false, { throwOnError: false }) || code;
      } catch {
        // fallback
      }
    }
    ranges.push({ from, to, code, inline: true, delimiter: match[0].startsWith('\\') ? '\\weq_inline' : '/weq_inline' });
  }

  // (b) $weq ... $weq or $weq_inline ... $weq_inline
  const dollarInlineRegex = /\$weq(?:_inline)?\s*([\s\S]*?)\s*\$weq(?:_inline)?/g;
  while ((match = dollarInlineRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    let code = match[1] || '';
    code = code.trim().replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\$([\s\S]*)\$$/, '$1').trim();
    ranges.push({ from, to, code, inline: true, delimiter: '$weq' });
  }

  // (c) Raw MathML in table cells or markdown
  const rawMathRegex = /<math[\s\S]*?<\/math>/gi;
  while ((match = rawMathRegex.exec(docText)) !== null) {
    let from = match.index;
    let to = from + match[0].length;
    const inTable = isInsideTableRow(doc, from, to);
    if (inTable) {
      let code = match[0];
      if (code.includes('<br')) {
        code = code.replace(/<br\s*\/?>/gi, '\n');
      }
      const isFullPage = /display\s*=\s*["']full-page["']/i.test(code);
      if (isFullPage) {
        const line = doc.lineAt(from);
        const lineText = line.text;
        const relFrom = from - line.from;
        const relTo = to - line.from;
        const prevPipe = lineText.lastIndexOf('|', relFrom - 1);
        const nextPipe = lineText.indexOf('|', relTo);
        const cellStart = prevPipe !== -1 ? line.from + prevPipe + 1 : line.from;
        const cellEnd = nextPipe !== -1 ? line.from + nextPipe : line.to;
        ranges.push({ from: cellStart, to: cellEnd, code, inline: false, delimiter: 'math-page', displayMode: 'full-page' });
      } else {
        ranges.push({ from, to, code, inline: true, delimiter: 'math' });
      }
    }
  }


  // (d) $Equation$ and $$Equation$$ in table cells or markdown
  const dollarTableRegex = /(?:\$\$([\s\S]*?)\$\$|\$([^\$\n]+?)\$)/g;
  while ((match = dollarTableRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const rawContent = match[1] ?? match[2] ?? '';
    if (!rawContent.trim() || rawContent.startsWith('weq')) {
      continue;
    }
    const inTable = isInsideTableRow(doc, from, to);
    if (inTable) {
      let code = rawContent.trim();
      if (!code.startsWith('<math')) {
        try {
          code = convertLatexToMathML(code, false, { throwOnError: false });
        } catch {
          // fallback
        }
      }
      ranges.push({
        from,
        to,
        code,
        inline: true,
        delimiter: match[0].startsWith('$$') ? '$$' : '$',
      });
    }
  }

  // Sort ranges by start position; if start is equal, longer range first
  ranges.sort((a, b) => a.from - b.from || b.to - a.to);

  // Filter out any overlapping ranges (block ranges take precedence)
  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = 0;

  for (const r of ranges) {
    if (r.from < lastEnd) {
      continue;
    }
    lastEnd = r.to;

    const inTable = isInsideTableRow(doc, r.from, r.to);
    const isFullPage = r.displayMode === 'full-page' || r.delimiter === 'math-page' || r.delimiter === 'weq-page';
    const isBlockInTable = inTable && !r.inline && !isFullPage;
    const isInlineInTable = inTable && Boolean(r.inline);
    const isInlineDecoration = inTable || (!isFullPage && r.inline);

    const widget = new WordEquationWidget(
      r.code,
      r.from,
      r.to,
      r.inline,
      r.delimiter,
      isBlockInTable,
      isFullPage ? 'full-page' : (r.inline ? 'inline' : 'block'),
      isInlineInTable
    );
    builder.add(
      r.from,
      r.to,
      Decoration.replace({
        widget,
        block: !isInlineDecoration,
      })
    );
  }

  return builder.finish();
}

export const wordEquationCollapsedGapField = StateField.define<DecorationSet>({
  create(state) {
    return buildCollapsedGapDecorations(state);
  },
  update(decorations, tr) {
    const wasLP = isLivePreviewActive(tr.startState);
    const isLP = isLivePreviewActive(tr.state);

    if (tr.docChanged || wasLP !== isLP) {
      return buildCollapsedGapDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

export function buildCollapsedGapDecorations(input: EditorState | Text): DecorationSet {
  if ('field' in input && typeof (input as EditorState).field === 'function') {
    if (!isLivePreviewActive(input as EditorState)) {
      return Decoration.none;
    }
  }

  const doc = 'doc' in input ? (input as EditorState).doc : (input as Text);
  const docText = doc.toString();

  // 1. Collect block equations (including full-page equations)
  const blockRegex = /```(math-word|weq|math-page|weq-page)(?:[ \t]*(?:\r?\n|<br\s*\/?>))([\s\S]*?)(?:(?:\r?\n|<br\s*\/?>)```|$)/g;
  let match: RegExpExecArray | null;
  const blocks: Array<{ startLine: number; endLine: number }> = [];

  while ((match = blockRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (isInsideTableRow(doc, from, to)) {
      continue;
    }
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(Math.min(doc.length, to)).number;
    blocks.push({ startLine, endLine });
  }

  // 2. Collect table blocks (contiguous lines of table rows)
  let inTable = false;
  let tableStartLine = 0;
  let tableEndLine = 0;

  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    const line = doc.line(lineNum);
    const isTable = isTableRowLine(line);
    if (isTable) {
      if (!inTable) {
        inTable = true;
        tableStartLine = lineNum;
        tableEndLine = lineNum;
      } else {
        tableEndLine = lineNum;
      }
    } else {
      if (inTable) {
        blocks.push({ startLine: tableStartLine, endLine: tableEndLine });
        inTable = false;
      }
    }
  }
  if (inTable) {
    blocks.push({ startLine: tableStartLine, endLine: tableEndLine });
  }

  if (blocks.length === 0) {
    return Decoration.none;
  }

  // Sort blocks by startLine
  blocks.sort((a, b) => a.startLine - b.startLine);

  const builder = new RangeSetBuilder<Decoration>();

  // Check if first block begins on line 2 and line 1 is empty (Bug 1: collapsed gap at note start)
  if (blocks[0].startLine === 2) {
    const firstLine = doc.line(1);
    if (firstLine.length === 0) {
      builder.add(
        firstLine.from,
        firstLine.from,
        Decoration.line({ class: 'word-equation-collapsed-gap' })
      );
    }
  }

  for (let i = 0; i < blocks.length - 1; i++) {
    const prevBlock = blocks[i];
    const nextBlock = blocks[i + 1];

    if (nextBlock.startLine === prevBlock.endLine + 2) {
      const intermediateLine = doc.line(prevBlock.endLine + 1);
      if (intermediateLine.length === 0) {
        builder.add(
          intermediateLine.from,
          intermediateLine.from,
          Decoration.line({ class: 'word-equation-collapsed-gap' })
        );
      }
    }
  }

  return builder.finish();
}

export const wordEquationStateField = StateField.define<DecorationSet>({
  create(state) {
    return buildEquationDecorations(state);
  },
  update(decorations, tr) {
    const wasLP = isLivePreviewActive(tr.startState);
    const isLP = isLivePreviewActive(tr.state);

    if (tr.docChanged || wasLP !== isLP) {
      return buildEquationDecorations(tr.state);
    }
    return decorations.map(tr.changes);
  },
  provide(field) {
    return [
      EditorView.decorations.from(field),
      wordEquationCollapsedGapField,
    ];
  },
});


