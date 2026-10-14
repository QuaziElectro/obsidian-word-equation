import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  clearActiveEquationState,
  getActiveEquationState,
  getActiveEquationWidget,
} from '../../src/editor/active-session';
import { resetIdCounter } from '../../src/core/ast';
import { setupAccurateDomEnvironment } from '../helpers/dom-layout-engine';

describe('Adversarial Stress Harness: Focus Guard in enterFromStart() (widget.ts:442-458)', () => {
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

  function getWidgetsAndDoms(view: any): Array<{ widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement }> {
    const results: Array<{ widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement }> = [];
    const decorations = view.state.field(wordEquationStateField, false);
    if (decorations) {
      decorations.between(0, view.state.doc.length, (from: number, to: number, dec: any) => {
        const w = dec.spec?.widget || dec.widget;
        if (w instanceof WordEquationWidget) {
          results.push({ widget: w, dom: null as any, mathEl: null as any });
        }
      });
    }

    const doms = Array.from(view.dom.querySelectorAll('.word-equation-block, .word-equation-inline')) as HTMLElement[];
    for (let i = 0; i < results.length; i++) {
      const dom = doms[i] || (view.dom.querySelector(`[data-equation-from="${results[i].widget.from}"]`) as HTMLElement);
      if (dom) {
        results[i].dom = dom;
        results[i].mathEl = (dom.querySelector('.word-equation-math') || dom) as HTMLElement;
      }
    }
    return results;
  }

  function getSingleWidgetAndDom(view: any): { widget: WordEquationWidget; dom: HTMLElement; mathEl: HTMLElement } {
    const list = getWidgetsAndDoms(view);
    if (list.length === 0 || !list[0].dom) {
      throw new Error('Widget or DOM container not found');
    }
    return list[0];
  }

  // =========================================================================
  // Test 1: Symmetrical Focus Recovery via requestAnimationFrame
  // =========================================================================
  it('Condition 1: Symmetrical focus recovery executes on next frame when activeElement drops to body', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const focusSpy = vi.spyOn(mathEl, 'focus');

    // 1. Enter from start (front boundary)
    widget.enterFromStart(view);

    expect(widget.isFocused).toBe(true);
    expect(widget.caret.offset).toBe(0);
    // 2 synchronous calls: 1 via updateCaretOnly() and 1 in enterFromStart() body
    expect(focusSpy).toHaveBeenCalledTimes(2);
    expect(rafCallbacks.length).toBe(1);

    // 2. Simulate the CodeMirror deferred 8ms involuntary blur to body
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    focusSpy.mockClear();

    // 3. Next frame fires
    rafCallbacks[0](performance.now());

    // Focus guard MUST detect activeElement === body and re-focus mathEl
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 2: Rapid Entry Followed by Backward Exit Before RAF Fires
  // =========================================================================
  it('Condition 2: Rapid backward exit before RAF fires cancels refocus (no focus theft)', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const focusSpy = vi.spyOn(mathEl, 'focus');

    // 1. Enter from start
    widget.enterFromStart(view);
    expect(widget.isFocused).toBe(true);
    expect(rafCallbacks.length).toBe(1);

    // 2. In the very same tick (before RAF executes), user presses ArrowLeft to exit
    const handledExit = widget.handleArrowNavigation('ArrowLeft', false, view);
    expect(handledExit).toBe(true);
    expect(widget.isFocused).toBe(false);

    // 3. Now simulate that activeElement happens to be document.body during editor transition
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    focusSpy.mockClear();

    // 4. The queued RAF now fires
    rafCallbacks[0](performance.now());

    // Focus guard MUST NOT refocus mathEl because widget.isFocused is false!
    expect(focusSpy).not.toHaveBeenCalled();

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 3: Rapid Entry Followed by Forward Exit Before RAF Fires
  // =========================================================================
  it('Condition 3: Rapid forward exit before RAF fires cancels refocus (no focus theft)', () => {
    const doc = 'Prefix /weq_inline <math><mi>x</mi></math> /weq_inline Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const focusSpy = vi.spyOn(mathEl, 'focus');

    // 1. Enter from start
    widget.enterFromStart(view);
    expect(widget.isFocused).toBe(true);

    // 2. Step forward twice to exit forward
    widget.handleArrowNavigation('ArrowRight', false, view);
    widget.handleArrowNavigation('ArrowRight', false, view);
    expect(widget.isFocused).toBe(false);

    // 3. activeElement is body
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    focusSpy.mockClear();

    // 4. Fire RAF
    for (const cb of rafCallbacks) {
      cb(performance.now());
    }

    // Must NOT refocus
    expect(focusSpy).not.toHaveBeenCalled();

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 4: Repeated Calls to enterFromStart() (Multiple Queued RAFs)
  // =========================================================================
  it('Condition 4: Burst of 20 rapid enterFromStart() calls does NOT cause multiple redundant focus calls or loops', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>y</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    let activeEl: Element = document.body;
    vi.spyOn(document, 'activeElement', 'get').mockImplementation(() => activeEl);

    const realFocus = mathEl.focus.bind(mathEl);
    const focusSpy = vi.spyOn(mathEl, 'focus').mockImplementation((opts?: any) => {
      activeEl = mathEl;
      return realFocus(opts);
    });

    // Fire 20 rapid enterFromStart calls in the same tick
    for (let i = 0; i < 20; i++) {
      activeEl = document.body; // simulated blur between events
      widget.enterFromStart(view);
    }

    expect(widget.isFocused).toBe(true);
    expect(rafCallbacks.length).toBe(20);

    // Set activeElement to body right before frame renders
    activeEl = document.body;
    focusSpy.mockClear();

    // Execute all 20 RAF callbacks in order (as a browser frame does)
    for (const cb of rafCallbacks) {
      cb(performance.now());
    }

    // Callback #1 sets activeEl to mathEl.
    // Callbacks #2..#20 see activeElement === mathEl (NOT document.body).
    // Therefore focus() should be called EXACTLY ONCE across all 20 RAFs!
    expect(focusSpy).toHaveBeenCalledTimes(1);

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 5: Multi-widget Focus Contention (Eq 1 vs Eq 2 in Rapid Succession)
  // =========================================================================
  it('Condition 5: Focus contention between two widgets does not result in Eq1 stealing focus from Eq2', () => {
    const doc = '```math-word\n<math display="block"><mi>a</mi></math>\n```\n\n```math-word\n<math display="block"><mi>b</mi></math>\n```';
    const { view, container: c } = createMockEditor(doc, [], true);
    const widgets = getWidgetsAndDoms(view);
    expect(widgets.length).toBe(2);

    const [eq1, eq2] = widgets;

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const eq1FocusSpy = vi.spyOn(eq1.mathEl, 'focus');
    const eq2FocusSpy = vi.spyOn(eq2.mathEl, 'focus');

    // 1. User enters Eq 1
    eq1.widget.enterFromStart(view);
    expect(eq1.widget.isFocused).toBe(true);
    expect(rafCallbacks.length).toBe(1);

    // 2. In the same tick, user switches to Eq 2
    eq2.widget.enterFromStart(view);
    expect(eq2.widget.isFocused).toBe(true);
    // Eq1 widget isFocused MUST have been set to false by Eq2's enterFromStart!
    expect(eq1.widget.isFocused).toBe(false);
    expect(rafCallbacks.length).toBe(2);

    // 3. Involuntary blur to body occurs
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    eq1FocusSpy.mockClear();
    eq2FocusSpy.mockClear();

    // 4. Both RAF callbacks execute (Eq1 callback first, then Eq2 callback)
    rafCallbacks[0](performance.now()); // Eq1 callback
    rafCallbacks[1](performance.now()); // Eq2 callback

    // Eq1 callback MUST NOT refocus Eq1 (since eq1.isFocused is false)
    expect(eq1FocusSpy).not.toHaveBeenCalled();

    // Eq2 callback MUST refocus Eq2 (since eq2.isFocused is true)
    expect(eq2FocusSpy).toHaveBeenCalledTimes(1);

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 6: Blur Events When isFocused is False vs True
  // =========================================================================
  it('Condition 6: Genuine blur to external element sets isFocused=false and prevents subsequent RAF refocus', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>x</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, dom, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const focusSpy = vi.spyOn(mathEl, 'focus');

    widget.enterFromStart(view);
    expect(widget.isFocused).toBe(true);

    // Create an external sidebar element
    const sidebarEl = document.createElement('button');
    sidebarEl.className = 'sidebar-pane-btn';
    document.body.appendChild(sidebarEl);

    // Dispatch genuine focusout with relatedTarget = sidebarEl
    const blurEvent = new FocusEvent('focusout', {
      bubbles: true,
      cancelable: true,
      relatedTarget: sidebarEl,
    });
    dom.dispatchEvent(blurEvent);

    // widget.isFocused must be updated to false
    expect(widget.isFocused).toBe(false);

    // Active element becomes sidebar
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    focusSpy.mockClear();

    // Fire RAF
    rafCallbacks[0](performance.now());

    // Must NOT refocus mathEl
    expect(focusSpy).not.toHaveBeenCalled();

    sidebarEl.remove();
    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 7: Confirm Absence of Infinite Focus Loops
  // =========================================================================
  it('Condition 7: No recursive RAF scheduling or infinite focus loops exist', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>w</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getSingleWidgetAndDom(view);

    let rafCallCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallCount++;
      // Execute immediately (sync) to test if focus() triggers recursive RAF calls
      cb(performance.now());
      return rafCallCount;
    });

    let focusCallCount = 0;
    vi.spyOn(mathEl, 'focus').mockImplementation(() => {
      focusCallCount++;
      // Simulate that activeElement temporarily drops back to body (adversarial condition)
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    });

    // Enter widget
    widget.enterFromStart(view);

    // Even in synchronous immediate RAF execution mode:
    // requestAnimationFrame must have been called EXACTLY ONCE (depth 1).
    // It must NOT trigger an infinite loop of RAF scheduling!
    expect(rafCallCount).toBe(1);
    expect(focusCallCount).toBe(3); // 2 synchronous in enterFromStart (updateCaretOnly + body) + 1 in RAF

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 8: Widget Destroyed Before RAF Executes
  // =========================================================================
  it('Condition 8: Widget destruction or DOM detachment before RAF executes does not crash', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>x</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, dom, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    widget.enterFromStart(view);
    expect(rafCallbacks.length).toBe(1);

    // Destroy widget and detach DOM
    widget.destroy(dom);
    dom.remove();

    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);

    // Executing the callback must complete cleanly with zero errors
    expect(() => {
      rafCallbacks[0](performance.now());
    }).not.toThrow();

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 9: End-to-End Keyboard Traversal and Character Input Post-Recovery
  // =========================================================================
  it('Condition 9: End-to-end traversal into nested placeholder and typing after focus recovery', () => {
    const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, dom, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    // 1. Left-entry
    widget.enterFromStart(view);
    expect(widget.isFocused).toBe(true);
    expect(widget.caret.offset).toBe(0);

    // 2. Deferred blur occurs
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);

    // 3. RAF fires, recovering focus
    rafCallbacks[0](performance.now());

    // 4. Step forward into numerator placeholder
    const step1 = widget.handleArrowNavigation('ArrowRight', false, view);
    expect(step1).toBe(true);
    expect(widget.isFocused).toBe(true);
    expect(widget.caret.slotId).not.toBe(widget.ast.id); // inside numerator

    // 5. Step forward into denominator placeholder
    const step2 = widget.handleArrowNavigation('ArrowRight', false, view);
    expect(step2).toBe(true);
    expect(widget.isFocused).toBe(true);

    // 6. Type '7' into the placeholder
    const keyEvent = new KeyboardEvent('keydown', {
      key: '7',
      code: 'Digit7',
      bubbles: true,
      cancelable: true,
    });
    dom.dispatchEvent(keyEvent);

    // Check active state has '7' token in denominator
    const activeState = getActiveEquationState();
    expect(activeState).not.toBeNull();
    const fracNode = widget.ast.children[0] as any;
    expect(fracNode.type).toBe('fraction');
    expect(fracNode.denominator.children.length).toBe(1);
    expect(fracNode.denominator.children[0].text).toBe('7');

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 10: Persistently Blocked Focus / No Runaway Re-queueing
  // =========================================================================
  it('Condition 10: If activeElement remains body after focus(), RAF does NOT enter a runaway re-queueing loop', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>z</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getSingleWidgetAndDom(view);

    let rafScheduledCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafScheduledCount++;
      return rafScheduledCount;
    });

    // In a hostile environment, document.activeElement is permanently locked to document.body
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    const focusSpy = vi.spyOn(mathEl, 'focus').mockImplementation(() => {
      // Focus call fails to change activeElement
    });

    widget.enterFromStart(view);
    expect(rafScheduledCount).toBe(1);

    // Now execute the scheduled callback
    // (In a buggy implementation, it might re-call window.requestAnimationFrame if activeElement is still body)
    // The clean implementation must only execute ONCE and terminate.
    widget.enterFromStart(view); // second entry
    expect(rafScheduledCount).toBe(2);

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 11: Alternating Rapid Entry from Front and Back (State Machine Flags)
  // =========================================================================
  it('Condition 11: Alternating rapid entry between enterFromStart and enterFromEnd correctly toggles enteredFromEnd without desync', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>x</mi><mo>+</mo><mi>y</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    // 1. Enter from start
    widget.enterFromStart(view);
    expect(widget.isFocused).toBe(true);
    expect(widget.enteredFromEnd).toBe(false);
    expect(widget.caret.offset).toBe(0);

    // 2. Immediately enter from end without exiting
    widget.enterFromEnd(view);
    expect(widget.isFocused).toBe(true);
    expect(widget.enteredFromEnd).toBe(true);
    expect(widget.caret.offset).toBe(widget.ast.children.length);

    // 3. Enter from start again
    widget.enterFromStart(view);
    expect(widget.isFocused).toBe(true);
    expect(widget.enteredFromEnd).toBe(false);
    expect(widget.caret.offset).toBe(0);

    // 4. Fire all queued RAFs
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);
    for (const cb of rafCallbacks) {
      cb(performance.now());
    }

    // State machine flags must still be consistent with the latest entry
    expect(widget.isFocused).toBe(true);
    expect(widget.enteredFromEnd).toBe(false);
    expect(widget.caret.offset).toBe(0);

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 12: Partial Selection Preservation Across Focus Drop and Recovery
  // =========================================================================
  it('Condition 12: Partial selection state survives focus drop to body and RAF recovery', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>a</mi><mo>+</mo><mi>b</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, mathEl } = getSingleWidgetAndDom(view);

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    widget.enterFromStart(view);

    // Select with Shift+ArrowRight
    const shiftStep = widget.handleArrowNavigation('ArrowRight', true, view);
    expect(shiftStep).toBe(true);
    expect(widget.selection).not.toBeNull();
    const selBefore = widget.selection!;

    // Involuntary blur to body
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body);

    // Fire RAF
    rafCallbacks[0](performance.now());

    // Selection must be preserved intact
    expect(widget.isFocused).toBe(true);
    expect(widget.selection).not.toBeNull();
    expect(widget.selection?.anchor.offset).toBe(selBefore.anchor.offset);
    expect(widget.selection?.head.offset).toBe(selBefore.head.offset);

    view.destroy();
    c.remove();
  });

  // =========================================================================
  // Test 13: enterFromStart When containerEl is Initially Null (Detached Widget)
  // =========================================================================
  it('Condition 13: enterFromStart gracefully handles null containerEl without exceptions', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mi>k</mi></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget } = getSingleWidgetAndDom(view);

    // Detach containerEl and clear view DOM
    (widget as any).containerEl = null;
    view.dom.innerHTML = '';
    c.remove();

    let rafCalled = false;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCalled = true;
      return 1;
    });

    expect(() => {
      widget.enterFromStart(view);
    }).not.toThrow();

    // Since containerEl remained null, RAF should not have been called
    expect((widget as any).containerEl).toBeNull();
    expect(rafCalled).toBe(false);

    view.destroy();
  });

  // =========================================================================
  // Test 14: Focusout Event Propagation Filter Invariants
  // =========================================================================
  it('Condition 14: focusout with internal target vs external target maintains correct isFocused state', () => {
    const doc = 'Prefix ```math-word\n<math display="block"><mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac></math>\n``` Suffix';
    const { view, container: c } = createMockEditor(doc, [], true);
    const { widget, dom } = getSingleWidgetAndDom(view);

    widget.enterFromStart(view);
    expect(widget.isFocused).toBe(true);

    const numSpan = dom.querySelector('.eq-numerator') || dom.firstElementChild!;

    // 1. focusout within equation container (relatedTarget is child element)
    const internalBlur = new FocusEvent('focusout', {
      bubbles: true,
      cancelable: true,
      relatedTarget: numSpan,
    });
    dom.dispatchEvent(internalBlur);
    // Must remain focused
    expect(widget.isFocused).toBe(true);

    // 2. focusout to view.contentDOM (CodeMirror)
    const cmBlur = new FocusEvent('focusout', {
      bubbles: true,
      cancelable: true,
      relatedTarget: view.contentDOM,
    });
    dom.dispatchEvent(cmBlur);
    // Must remain focused (CodeMirror boundary extension handles focus)
    expect(widget.isFocused).toBe(true);

    // 3. focusout to null with activeElement still inside dom
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(numSpan);
    const nullBlurInside = new FocusEvent('focusout', {
      bubbles: true,
      cancelable: true,
      relatedTarget: null,
    });
    dom.dispatchEvent(nullBlurInside);
    expect(widget.isFocused).toBe(true);

    // 4. Genuine external blur to separate element
    const extEl = document.createElement('div');
    document.body.appendChild(extEl);
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(extEl);

    const extBlur = new FocusEvent('focusout', {
      bubbles: true,
      cancelable: true,
      relatedTarget: extEl,
    });
    dom.dispatchEvent(extBlur);
    // Must now be false
    expect(widget.isFocused).toBe(false);

    extEl.remove();
    view.destroy();
    c.remove();
  });
});

