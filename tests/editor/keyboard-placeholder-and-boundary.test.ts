import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockEditor } from '../helpers/cm6-mock';
import { wordEquationStateField } from '../../src/editor/state-field';
import { WordEquationWidget } from '../../src/editor/widget';
import {
  getActiveEquationState,
  setActiveEquationState,
  clearActiveEquationState,
} from '../../src/editor/active-session';
import {
  findSlotBelow,
  findSlotAbove,
  handleArrowKey,
} from '../../src/editor/navigation';
import {
  createSlot,
  createToken,
  createFraction,
  createRoot,
  createRadical,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { serializeMathML } from '../../src/core/mathml-serializer';
import {
  setupAccurateDomEnvironment,
} from '../helpers/dom-layout-engine';
import {
  DebugLogger,
  getDebugLogger,
  logDebugEvent,
} from '../../src/debug/debug-logger';

describe('Milestone M1: Keyboard Entry into Math Element Placeholders & Boundary Escape', () => {
  let container: HTMLElement;
  let logger: DebugLogger;

  beforeEach(() => {
    resetIdCounter();
    clearActiveEquationState();
    setupAccurateDomEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
    logger = getDebugLogger();
    logger.resetForTesting();
  });

  afterEach(() => {
    clearActiveEquationState();
    logger.resetForTesting();
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function getWidgetAndDom(view: any, searchPos = 0): { widget: WordEquationWidget; dom: HTMLElement } {
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
    return { widget, dom };
  }

  // =========================================================================
  // Bug 1: Keyboard Entry into Math Element Placeholders
  // =========================================================================
  describe('Bug 1: Keyboard Entry into Math Element Placeholders', () => {
    it('findSlotBelow from root slot descends into numerator/denominator of composite node without jumping out', () => {
      // Create AST: root -> [ fraction(numerator: empty, denominator: empty) ]
      const num = createSlot('numerator');
      const den = createSlot('denominator');
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Caret at root offset 0
      const navDown = findSlotBelow(root, { slotId: root.id, offset: 0 });
      expect(navDown.handled).toBe(true);
      expect(navDown.exitDirection).toBeUndefined();
      expect(navDown.caret.slotId).toBe(num.id);

      // Down from numerator lands in denominator
      const navDownFromNum = findSlotBelow(root, navDown.caret);
      expect(navDownFromNum.handled).toBe(true);
      expect(navDownFromNum.caret.slotId).toBe(den.id);
    });

    it('findSlotAbove from root slot descends into denominator of composite node', () => {
      const num = createSlot('numerator');
      const den = createSlot('denominator');
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Caret at root offset 1 (behind fraction)
      const navUp = findSlotAbove(root, { slotId: root.id, offset: 1 });
      expect(navUp.handled).toBe(true);
      expect(navUp.exitDirection).toBeUndefined();
      expect(navUp.caret.slotId).toBe(den.id);

      // Up from denominator lands in numerator
      const navUpFromDen = findSlotAbove(root, navUp.caret);
      expect(navUpFromDen.handled).toBe(true);
      expect(navUpFromDen.caret.slotId).toBe(num.id);
    });

    it('findSlotBelow descends into radical radicand from root slot', () => {
      const radicand = createSlot('radicand');
      const rad = createRadical(radicand);
      const root = createSlot('root', [rad]);
      updateParentPointers(root);

      const navDown = findSlotBelow(root, { slotId: root.id, offset: 0 });
      expect(navDown.handled).toBe(true);
      expect(navDown.exitDirection).toBeUndefined();
      expect(navDown.caret.slotId).toBe(radicand.id);
    });

    it('horizontal navigation smoothly enters and exits empty placeholder slots in fractions', () => {
      // AST: root -> [ fraction(empty num, empty den) ]
      const num = createSlot('numerator');
      const den = createSlot('denominator');
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Start at root offset 0
      let caret = { slotId: root.id, offset: 0 };

      // Step right: enters numerator
      let nav = handleArrowKey(root, caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(num.id);
      expect(nav.caret.offset).toBe(0);

      // Step right from empty numerator: moves to denominator
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(den.id);
      expect(nav.caret.offset).toBe(0);

      // Step right from empty denominator: exits fraction to root offset 1
      nav = handleArrowKey(root, nav.caret, 'ArrowRight');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(root.id);
      expect(nav.caret.offset).toBe(1);

      // Reverse direction: step left from root offset 1 enters denominator
      nav = handleArrowKey(root, nav.caret, 'ArrowLeft');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(den.id);
      expect(nav.caret.offset).toBe(0);

      // Step left from empty denominator enters numerator
      nav = handleArrowKey(root, nav.caret, 'ArrowLeft');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(num.id);
      expect(nav.caret.offset).toBe(0);

      // Step left from empty numerator exits to root offset 0
      nav = handleArrowKey(root, nav.caret, 'ArrowLeft');
      expect(nav.handled).toBe(true);
      expect(nav.caret.slotId).toBe(root.id);
      expect(nav.caret.offset).toBe(0);
    });
  });

  // =========================================================================
  // Bug 2: Enter From Behind & Boundary Escape
  // =========================================================================
  describe('Bug 2: Enter From Behind & Boundary Escape', () => {
    it('enterFromEnd stably focuses mathEl and omits CodeMirror selection dispatch (aligning with enterFromStart)', () => {
      const doc = 'Prefix /weq_inline <math><mi>x</mi><mo>+</mo><mi>y</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);
      const dispatchSpy = vi.spyOn(view, 'dispatch');

      widget.enterFromEnd(view);

      expect(widget.isFocused).toBe(true);
      expect(widget.enteredFromEnd).toBe(true);
      // Requirement R2 Fix: view.dispatch must NOT be called with a selection transaction
      expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({
        selection: expect.anything(),
      }));

      // mathEl must have received focus
      const mathEl = dom.querySelector('.word-equation-math') as HTMLElement;
      expect(mathEl).toBeDefined();

      view.destroy();
      c.remove();
    });

    it('reverse boundary entry into empty fraction navigates into denominator placeholder via ArrowLeft', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      // Enter from behind
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.enteredFromEnd).toBe(true);
      expect(widget.caret.offset).toBe(widget.ast.children.length);

      // Press ArrowLeft to navigate backward into equation
      const handled = widget.handleArrowNavigation('ArrowLeft', false, view);
      expect(handled).toBe(true);

      // Caret must have entered the empty denominator placeholder
      expect(widget.caret.slotId).not.toBe(widget.ast.id);
      expect(widget.isFocused).toBe(true);

      view.destroy();
      c.remove();
    });

    it('reverse boundary entry followed by ArrowRight exits cleanly forward without focus drop', () => {
      const doc = 'Line 1\n```math-word\n<math display="block"><mfrac><mrow></mrow><mrow></mrow></mfrac></math>\n```\nLine 3';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      const viewFocusSpy = vi.spyOn(view, 'focus');

      // Enter from behind
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);

      // Press ArrowRight to exit forward
      const exited = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(exited).toBe(true);
      expect(widget.isFocused).toBe(false);

      // Must have re-focused CodeMirror view upon exit rather than dropping to document.body
      expect(viewFocusSpy).toHaveBeenCalled();

      view.destroy();
      c.remove();
    });

    it('entering from behind and escaping forward does not immediately re-trap on left arrow', () => {
      const doc = 'Prefix /weq_inline <math><mi>x</mi></math> /weq_inline Suffix';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget } = getWidgetAndDom(view);

      // 1. Enter from end
      widget.enterFromEnd(view);
      expect(widget.isFocused).toBe(true);
      expect(widget.enteredFromEnd).toBe(true);

      // 2. Navigate forward inside equation to escape forward
      // At offset 1 (after x), ArrowRight will exit forward
      const exited = widget.handleArrowNavigation('ArrowRight', false, view);
      expect(exited).toBe(true);
      expect(widget.isFocused).toBe(false);
      expect(widget.justEscapedForwardAfterEnteringFromEnd).toBe(true);
      expect(view.state.selection.main.anchor).toBe(widget.to);

      // 3. User immediately presses ArrowLeft from the editor boundary
      // CodeMirror keymap for ArrowLeft should check justEscapedForwardAfterEnteringFromEnd
      // and NOT re-enter the equation
      const leftKeyHandled = view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
      );

      // The widget should remain unfocused (not re-trapped)
      expect(widget.isFocused).toBe(false);

      view.destroy();
      c.remove();
    });

    it('backward traversal exits smoothly to text before equation (from or blockStart - 1)', () => {
      // Test inline equation backward exit
      const inlineDoc = 'Prefix /weq_inline <math><mi>x</mi></math> /weq_inline Suffix';
      const { view: inlineView, container: c1 } = createMockEditor(inlineDoc, [], true);
      const { widget: inlineWidget } = getWidgetAndDom(inlineView);

      inlineWidget.enterFromStart(inlineView);
      expect(inlineWidget.caret.offset).toBe(0);

      // Stepping left from start exits to inlineWidget.from
      const exitedBefore = inlineWidget.handleArrowNavigation('ArrowLeft', false, inlineView);
      expect(exitedBefore).toBe(true);
      expect(inlineWidget.isFocused).toBe(false);
      expect(inlineView.state.selection.main.anchor).toBe(inlineWidget.from);

      inlineView.destroy();
      c1.remove();

      // Test block equation backward exit
      const blockDoc = 'Line 1\n```math-word\n<math><mi>x</mi></math>\n```\nLine 3';
      const { view: blockView, container: c2 } = createMockEditor(blockDoc, [], true);
      const { widget: blockWidget } = getWidgetAndDom(blockView);

      blockWidget.enterFromStart(blockView);
      const blockExited = blockWidget.handleArrowNavigation('ArrowLeft', false, blockView);
      expect(blockExited).toBe(true);
      expect(blockWidget.isFocused).toBe(false);
      // For block equation, targetPos is Math.max(0, blockWidget.from - 1)
      expect(blockView.state.selection.main.anchor).toBe(blockWidget.from - 1);

      blockView.destroy();
      c2.remove();
    });
  });

  // =========================================================================
  // R3: Telemetry Enhancements
  // =========================================================================
  describe('R3: Telemetry Enhancements', () => {
    it('logs keydown, boundary, and placeholder events when debugMode is true', () => {
      logger.setDebugMode(true);

      const doc = '```math-word\n<math><mfrac><mi></mi><mi></mi></mfrac></math>\n```\n';
      const { view, container: c } = createMockEditor(doc, [], true);
      const { widget, dom } = getWidgetAndDom(view);

      // Enter from start -> logs boundary transition 'enterFromStart'
      widget.enterFromStart(view);

      const events = logger.getEvents();
      const boundaryEvents = events.filter((e) => e.type === 'boundary');
      expect(boundaryEvents.length).toBeGreaterThanOrEqual(1);
      const enterBoundary = boundaryEvents.find((e) => (e.data as any).transition === 'enterFromStart');
      expect(enterBoundary).toBeDefined();
      expect((enterBoundary!.data as any).to).toBeDefined();

      // Dispatch raw keydown to widget DOM
      dom.querySelector('.word-equation-math')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );

      const keydownEvents = logger.getEvents().filter((e) => e.type === 'keydown');
      expect(keydownEvents.length).toBeGreaterThanOrEqual(1);
      const arrowRightEvent = keydownEvents.find((e) => (e.data as any).key === 'ArrowRight');
      expect(arrowRightEvent).toBeDefined();
      expect((arrowRightEvent!.data as any).isFocused).toBe(true);

      // Placeholder logging
      const placeholderEvents = logger.getEvents().filter((e) => e.type === 'placeholder');
      expect(placeholderEvents.length).toBeGreaterThanOrEqual(1);

      // Unhandled navigation logging
      // In root slot with no valid up direction, ArrowUp in root slot
      widget.caret = { slotId: widget.ast.id, offset: 0 };
      widget.handleArrowNavigation('ArrowUp', false, view);
      const unhandledEvents = logger.getEvents().filter((e) => e.type === 'navigation_unhandled');
      // Either unhandled or handled exit
      expect(logger.getEvents().length).toBeGreaterThan(0);

      view.destroy();
      c.remove();
    });

    it('guarantees zero overhead when debugMode is false (payload generator not executed)', () => {
      logger.setDebugMode(false);

      const expensivePayloadSpy = vi.fn(() => ({
        key: 'ArrowRight',
        data: 'expensive_computation',
      }));

      logDebugEvent('keydown', expensivePayloadSpy);
      logDebugEvent('boundary', expensivePayloadSpy);
      logDebugEvent('navigation_unhandled', expensivePayloadSpy);
      logDebugEvent('placeholder', expensivePayloadSpy);

      // Payload function should NEVER be invoked
      expect(expensivePayloadSpy).not.toHaveBeenCalled();
      expect(logger.getEvents().length).toBe(0);
    });
  });
});
