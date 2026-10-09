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

interface EquationRange {
  from: number;
  to: number;
  code: string;
  inline: boolean;
  delimiter: string;
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
  const blockRegex = /```(math-word|weq)(?:[ \t]*\r?\n)([\s\S]*?)(?:\r?\n```|$)/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const delimiter = match[1];
    const code = match[2] || '';
    ranges.push({ from, to, code, inline: false, delimiter });
  }

  // 2. Match inline equations:
  // (a) /weq_inline ... /weq_inline
  const slashInlineRegex = /\/weq_inline\s*([\s\S]*?)\s*\/weq_inline/g;
  while ((match = slashInlineRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const code = match[1] || '';
    ranges.push({ from, to, code, inline: true, delimiter: '/weq_inline' });
  }

  // (b) $weq ... $weq or $weq_inline ... $weq_inline
  const dollarInlineRegex = /\$weq(?:_inline)?\s*([\s\S]*?)\s*\$weq(?:_inline)?/g;
  while ((match = dollarInlineRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const code = match[1] || '';
    ranges.push({ from, to, code, inline: true, delimiter: '$weq' });
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

    const widget = new WordEquationWidget(r.code, r.from, r.to, r.inline, r.delimiter);
    builder.add(
      r.from,
      r.to,
      Decoration.replace({
        widget,
        block: !r.inline,
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

  // Match fenced block equations: ```math-word ... ``` or ```weq ... ```
  const blockRegex = /```(math-word|weq)(?:[ \t]*\r?\n)([\s\S]*?)(?:\r?\n```|$)/g;
  let match: RegExpExecArray | null;
  const blockRanges: Array<{ from: number; to: number; startLine: number; endLine: number }> = [];

  while ((match = blockRegex.exec(docText)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(Math.min(doc.length, to)).number;
    blockRanges.push({ from, to, startLine, endLine });
  }

  if (blockRanges.length < 2) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();

  for (let i = 0; i < blockRanges.length - 1; i++) {
    const prevBlock = blockRanges[i];
    const nextBlock = blockRanges[i + 1];

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


