/**
 * CodeMirror 6 Transaction Filter / Input Handler for Markdown Shortcuts
 * Enables typing \alpha + Space -> α and $$$ + Space -> equation block in markdown.
 */

import { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { expandShortcutInMarkdown } from './engine';

export function createMarkdownShortcutExtension(): Extension {
  return keymap.of([
    {
      key: 'Space',
      run: (view: EditorView) => {
        const sel = view.state.selection.main;
        if (!sel.empty) return false;

        const line = view.state.doc.lineAt(sel.head);
        const textBefore = line.text.slice(0, sel.head - line.from);

        const match = expandShortcutInMarkdown(textBefore);
        if (match) {
          const from = sel.head - match.triggerLength;
          const to = sel.head;
          view.dispatch({
            changes: { from, to, insert: match.replacement },
            selection: { anchor: from + match.replacement.length },
          });
          return true;
        }

        return false;
      },
    },
  ]);
}
