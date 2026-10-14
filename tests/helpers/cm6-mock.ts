/**
 * CM6 Headless Editor Mock Harness
 */

import { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { wordEquationStateField } from '../../src/editor/state-field';
import { createMarkdownShortcutExtension } from '../../src/shortcuts/markdown-filter';
import { createEquationNavigationExtension } from '../../src/editor/navigation-extension';

export function createMockEditor(
  initialDoc: string,
  extraExtensions: Extension[] = [],
  isLivePreview: boolean = true
): { state: EditorState; view: EditorView; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const extensions: Extension[] = [
    editorLivePreviewField.init(() => isLivePreview),
    wordEquationStateField,
    createMarkdownShortcutExtension(),
    createEquationNavigationExtension(),
    ...extraExtensions,
  ];

  const state = EditorState.create({
    doc: initialDoc,
    extensions,
  });

  const view = new EditorView({
    state,
    parent: container,
  });

  return { state, view, container };
}

