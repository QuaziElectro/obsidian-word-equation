import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { keymap } from '@codemirror/view';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import { clearActiveEquationState, getActiveEquationState } from '../../src/editor/active-session';
import { resetIdCounter } from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Milestone M2: Verification of Horizontal Boundary Navigation Fix', () => {
  let container: HTMLElement;

  // Fallback default navigation keymap mimicking CM6 standard cursorCharRight / cursorCharLeft
  const defaultCursorKeymap = keymap.of([
    {
      key: 'ArrowRight',
      run: (v) => {
        const head = v.state.selection.main.head;
        if (head < v.state.doc.length) {
          v.dispatch({ selection: { anchor: head + 1 } });
          return true;
        }
        return false;
      },
    },
    {
      key: 'ArrowLeft',
      run: (v) => {
        const head = v.state.selection.main.head;
        if (head > 0) {
          v.dispatch({ selection: { anchor: head - 1 } });
          return true;
        }
        return false;
      },
    },
  ]);

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    clearActiveEquationState();
    container.remove();
    document.body.innerHTML = '';
  });

  it('ArrowRight through TEXT1 does NOT enter equation until immediately adjacent (pos === from)', () => {
    const doc = 'TEXT1/weq_inline <math><mi>x</mi></math> /weq_inlineTEXT2';
    const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
    const from = doc.indexOf('/weq_inline'); // 5

    // 1. Position cursor at from - 2 (pos = 3, between 'X' and 'T')
    view.dispatch({ selection: { anchor: from - 2 } });
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(getActiveEquationState()?.isFocused).toBeFalsy();
    expect(view.state.selection.main.head).toBe(from - 1);

    // 2. Position cursor at from - 1 (pos = 4, between 'T' and '1')
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(getActiveEquationState()?.isFocused).toBeFalsy();
    expect(view.state.selection.main.head).toBe(from);

    // 3. Position cursor at from (pos = 5, immediately preceding equation)
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(getActiveEquationState()?.isFocused).toBe(true);
    expect(getActiveEquationState()?.caret.offset).toBe(0);

    view.destroy();
    c.remove();
  });

  it('ArrowLeft through TEXT2 does NOT enter equation until immediately adjacent (pos === to)', () => {
    const doc = 'TEXT1/weq_inline <math><mi>x</mi></math> /weq_inlineTEXT2';
    const { view, container: c } = createMockEditor(doc, [defaultCursorKeymap], true);
    const to = doc.indexOf('TEXT2');

    // 1. Position cursor at to + 2 (pos = to + 2, after 'E' in TEXT2)
    view.dispatch({ selection: { anchor: to + 2 } });
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(getActiveEquationState()?.isFocused).toBeFalsy();
    expect(view.state.selection.main.head).toBe(to + 1);

    // 2. Position cursor at to + 1 (pos = to + 1, after 'T' in TEXT2)
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(getActiveEquationState()?.isFocused).toBeFalsy();
    expect(view.state.selection.main.head).toBe(to);

    // 3. Position cursor at to (pos = to, immediately following equation)
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(getActiveEquationState()?.isFocused).toBe(true);
    expect(getActiveEquationState()?.caret.offset).toBe(1);

    view.destroy();
    c.remove();
  });
});
