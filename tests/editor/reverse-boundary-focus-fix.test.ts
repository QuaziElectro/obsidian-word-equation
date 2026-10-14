import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
} from '../../src/editor/active-session';
import { resetIdCounter } from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Requirement R2 Fix: Reverse Boundary Entry & Focus Retention', () => {
  let container: HTMLElement;

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
    vi.restoreAllMocks();
  });

  function getWidgetAndDom(view: any, searchPos = 0): { widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement } {
    let widget: WordEquationWidget | null = null;
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(searchPos, view.state.doc.length, (from: number, to: number, dec: any) => {
        if (!widget && dec.spec?.widget instanceof WordEquationWidget) {
          widget = dec.spec.widget;
        }
      });
    }
    const dom = (view.dom.querySelector('.word-equation-block') ||
      view.dom.querySelector('.word-equation-inline')) as HTMLElement;
    if (!widget || !dom) {
      throw new Error('Widget or DOM container not found');
    }
    const mathEl = (dom.querySelector('.word-equation-math') || dom) as HTMLElement;
    return { widget, dom, mathEl };
  }

  it('enterFromEnd does NOT dispatch CodeMirror selection and focuses mathEl', () => {
    const doc = 'Prefix /weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi></math> /weq_inline Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getWidgetAndDom(view);

    const dispatchSpy = vi.spyOn(view, 'dispatch');
    const focusSpy = vi.spyOn(mathEl, 'focus');

    widget.enterFromEnd(view);

    expect(widget.isFocused).toBe(true);
    expect(widget.enteredFromEnd).toBe(true);

    // Requirement R2 Fix: view.dispatch must NOT have been called with selection: { anchor: widget.to }
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.anything(),
    }));

    // mathEl.focus must have been called
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

    view.destroy();
    c.remove();
  });

  it('defensive focus recovery fires requestAnimationFrame and re-focuses mathEl if focus blurred to body', async () => {
    const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getWidgetAndDom(view);

    // Track rAF callbacks
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return 1;
    });

    const focusSpy = vi.spyOn(mathEl, 'focus');

    widget.enterFromEnd(view);

    expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);

    // Simulate involuntary blur to document.body
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    focusSpy.mockClear();

    // Trigger rAF callback
    for (const cb of rafCallbacks) {
      cb(performance.now());
    }

    // Defensive recovery must re-focus mathEl
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

    view.destroy();
    c.remove();
  });

  it('reverse boundary entry into empty fraction denominator succeeds via ArrowLeft', () => {
    const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget } = getWidgetAndDom(view);

    // 1. Enter from trailing edge
    widget.enterFromEnd(view);
    expect(widget.isFocused).toBe(true);
    expect(widget.caret.slotId).toBe(widget.ast.id);
    expect(widget.caret.offset).toBe(1); // after the fraction

    // 2. Press ArrowLeft to step into the fraction from behind
    const leftHandled = widget.handleArrowNavigation('ArrowLeft', false, view);
    expect(leftHandled).toBe(true);

    // Caret must have entered the denominator placeholder
    const activeState = getActiveEquationState();
    expect(activeState?.isFocused).toBe(true);
    expect(widget.caret.slotId).not.toBe(widget.ast.id);

    // 3. ArrowUp moves to numerator placeholder
    const upHandled = widget.handleArrowNavigation('ArrowUp', false, view);
    expect(upHandled).toBe(true);
    expect(widget.isFocused).toBe(true);

    view.destroy();
    c.remove();
  });

  it('reverse boundary entry followed by ArrowRight exits cleanly forward and restores view focus', () => {
    const doc = 'Line 1\n```math-word\n<math display="block"><mi>z</mi></math>\n```\nLine 3';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget } = getWidgetAndDom(view);

    const viewFocusSpy = vi.spyOn(view, 'focus');
    const viewDispatchSpy = vi.spyOn(view, 'dispatch');

    // 1. Enter from end
    widget.enterFromEnd(view);
    expect(widget.isFocused).toBe(true);
    expect(widget.enteredFromEnd).toBe(true);

    // 2. Step forward (ArrowRight) from trailing edge to exit
    const exitHandled = widget.handleArrowNavigation('ArrowRight', false, view);
    expect(exitHandled).toBe(true);
    expect(widget.isFocused).toBe(false);

    // Active view must be focused and selection dispatched to next position
    expect(viewFocusSpy).toHaveBeenCalled();
    expect(viewDispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      selection: expect.anything(),
    }));

    view.destroy();
    c.remove();
  });
});
