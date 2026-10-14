import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EditorState, Transaction } from '@codemirror/state';
import {
  DebugLogger,
  getDebugLogger,
  isDebugEnabled,
  logDebugEvent,
  attachEquationMutationObserver,
  disconnectEquationMutationObserver,
  teardownGlobalTelemetry,
  getActiveMutationObserversCount,
  isGlobalTelemetryAttached,
  getActivePointerMouseListenersCount,
  POINTER_MOUSE_EVENTS,
} from '../../src/debug/debug-logger';
import { setActiveEquationState, clearActiveEquationState } from '../../src/editor/active-session';
import { createSlot, createToken, createFraction, updateParentPointers } from '../../src/core/ast';
import { handleArrowKey } from '../../src/editor/navigation';
import {
  equationTransactionFilterPlugin,
  createEquationNavigationExtension,
} from '../../src/editor/navigation-extension';
import { WordEquationWidget } from '../../src/editor/widget';

if (typeof (globalThis as any).PointerEvent === 'undefined') {
  class MockPointerEvent extends MouseEvent {
    constructor(type: string, params: any = {}) {
      super(type, params);
    }
  }
  (globalThis as any).PointerEvent = MockPointerEvent;
  if (typeof window !== 'undefined') {
    (window as any).PointerEvent = MockPointerEvent;
  }
}

describe('Requirement R3 Telemetry Hooks Verification', () => {
  let logger: DebugLogger;

  beforeEach(() => {
    logger = getDebugLogger();
    logger.resetForTesting();
  });

  afterEach(() => {
    logger.resetForTesting();
    clearActiveEquationState();
    vi.restoreAllMocks();
  });

  describe('Static Source Code Telemetry Hook Verification', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    it('verifies src/editor/active-session.ts has dynamic isPlaceholder check instead of hardcoded false', () => {
      const activeSessionPath = path.join(srcDir, 'editor/active-session.ts');
      const content = fs.readFileSync(activeSessionPath, 'utf8');

      // Must NOT contain hardcoded isPlaceholder: false in session state telemetry
      expect(content).not.toMatch(/isPlaceholder:\s*false/);
      // Must contain dynamic emptiness check
      expect(content).toContain('isSlotEmpty(slot)');
    });

    it('verifies src/debug/debug-logger.ts has capture-phase and bubble-phase keydown and focus tracking hooks', () => {
      const debugLoggerPath = path.join(srcDir, 'debug/debug-logger.ts');
      const content = fs.readFileSync(debugLoggerPath, 'utf8');

      expect(content).toContain("phase: 'capture'");
      expect(content).toContain("phase: 'bubble'");
      expect(content).toContain('focusShiftType');
      expect(content).toContain('cm_to_equation');
      expect(content).toContain('equation_to_cm');
      expect(content).toContain('beforeunload');
      expect(content).toContain('visibilitychange');
      expect(content).toContain('scheduleFlush');
      expect(content).toContain('attachEquationMutationObserver');
      expect(content).toContain('disconnectEquationMutationObserver');
    });

    it('verifies src/editor/navigation.ts has candidate evaluation telemetry', () => {
      const navPath = path.join(srcDir, 'editor/navigation.ts');
      const content = fs.readFileSync(navPath, 'utf8');

      expect(content).toContain('candidate_evaluation_summary');
      expect(content).toContain('candidateSlotId');
      expect(content).toContain('candidateRole');
      expect(content).toContain('decision');
      expect(content).toContain('rationale');
    });

    it('verifies src/editor/navigation-extension.ts registers EditorState.transactionFilter with cm_transaction telemetry', () => {
      const navExtPath = path.join(srcDir, 'editor/navigation-extension.ts');
      const content = fs.readFileSync(navExtPath, 'utf8');

      expect(content).toContain('EditorState.transactionFilter');
      expect(content).toContain('equationTransactionFilterPlugin');
      expect(content).toContain('cm_transaction');
      expect(content).toContain('Transaction.userEvent');
      expect(content).toContain('selectionBefore');
      expect(content).toContain('selectionAfter');
      expect(content).toContain('docChanged');
      expect(content).toContain('hasActiveEquation');
    });

    it('verifies src/editor/widget.ts tracks DOM MutationObserver and caret presence with clean teardown', () => {
      const widgetPath = path.join(srcDir, 'editor/widget.ts');
      const content = fs.readFileSync(widgetPath, 'utf8');

      expect(content).toContain('attachEquationMutationObserver');
      expect(content).toContain('disconnectEquationMutationObserver');
      expect(content).toContain('attachObserver');
      expect(content).toContain('detachObserver');
      expect(content).toContain('.eq-caret');
      expect(content).toContain('cmSelectionBefore');
      expect(content).toContain('cmSelectionAfter');
      expect(content).toContain('focusShiftType');
      expect(content).toContain('equation_to_external');
    });

    it('verifies src/debug/debug-logger.ts has capture-phase and bubble-phase pointer and mouse tracking hooks', () => {
      const debugLoggerPath = path.join(srcDir, 'debug/debug-logger.ts');
      const content = fs.readFileSync(debugLoggerPath, 'utf8');

      expect(content).toContain('POINTER_MOUSE_EVENTS');
      expect(content).toContain('pointerdown');
      expect(content).toContain('pointermove');
      expect(content).toContain('pointerup');
      expect(content).toContain('mousedown');
      expect(content).toContain('mousemove');
      expect(content).toContain('mouseup');
      expect(content).toContain('createPointerMouseHandler');
      expect(content).toContain('getActivePointerMouseListenersCount');
    });

    it('verifies src/editor/widget.ts tracks internal drag lifecycle and DOM interception telemetry', () => {
      const widgetPath = path.join(srcDir, 'editor/widget.ts');
      const content = fs.readFileSync(widgetPath, 'utf8');

      expect(content).toContain('drag_lifecycle');
      expect(content).toContain('activation_start');
      expect(content).toContain('drag_start');
      expect(content).toContain('drag_move');
      expect(content).toContain('drag_end');
      expect(content).toContain('isDragging');
      expect(content).toContain('thresholdExceeded');
      expect(content).toContain('dom_interception');
      expect(content).toContain('stopPropagation');
    });

    it('verifies zero-overhead guards in all telemetry call sites', () => {
      const widgetPath = path.join(srcDir, 'editor/widget.ts');
      const navExtPath = path.join(srcDir, 'editor/navigation-extension.ts');
      const navPath = path.join(srcDir, 'editor/navigation.ts');
      const debugLoggerPath = path.join(srcDir, 'debug/debug-logger.ts');

      const widgetContent = fs.readFileSync(widgetPath, 'utf8');
      const navExtContent = fs.readFileSync(navExtPath, 'utf8');
      const navContent = fs.readFileSync(navPath, 'utf8');
      const debugLoggerContent = fs.readFileSync(debugLoggerPath, 'utf8');

      expect(widgetContent).toContain('isDebugEnabled()');
      expect(navExtContent).toContain('isDebugEnabled()');
      expect(navContent).toContain('isDebugEnabled()');
      expect(debugLoggerContent).toContain('_isDebugModeEnabled');
    });
  });

  describe('Runtime Telemetry Behavior Verification', () => {
    it('captures capture-phase and bubble-phase keydown events with DOM tags and active element info', () => {
      logger.setEnabled(true);
      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'root', offset: 0 },
        isFocused: true,
      });

      const targetBtn = document.createElement('button');
      targetBtn.className = 'test-btn';
      document.body.appendChild(targetBtn);
      targetBtn.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        code: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      });
      targetBtn.dispatchEvent(event);

      const captureEvents = logger.getEvents().filter((e) => e.type === 'keydown' && (e.details as any).phase === 'capture');
      expect(captureEvents.length).toBeGreaterThanOrEqual(1);
      const captureEvent = captureEvents[captureEvents.length - 1];
      expect(captureEvent.details.key).toBe('ArrowRight');
      expect(captureEvent.details.phase).toBe('capture');
      expect(captureEvent.details.targetTag).toBe('button');

      const bubbleEvents = logger.getEvents().filter((e) => e.type === 'keydown' && (e.details as any).phase === 'bubble');
      expect(bubbleEvents.length).toBeGreaterThanOrEqual(1);
      const bubbleEvent = bubbleEvents[bubbleEvents.length - 1];
      expect(bubbleEvent.details.key).toBe('ArrowRight');
      expect(bubbleEvent.details.phase).toBe('bubble');

      targetBtn.remove();
    });

    it('tracks DOM focus transitions with focusShiftType', () => {
      logger.setEnabled(true);

      const cmEl = document.createElement('div');
      cmEl.className = 'cm-content';
      const eqEl = document.createElement('div');
      eqEl.className = 'cm-word-equation-widget';
      document.body.appendChild(cmEl);
      document.body.appendChild(eqEl);

      // Simulate focusin into equation widget from CM
      const focusEvent = new FocusEvent('focusin', {
        bubbles: true,
        relatedTarget: cmEl,
      });
      eqEl.dispatchEvent(focusEvent);

      const focusEvents = logger.getEvents().filter((e) => e.type === 'focus');
      expect(focusEvents.length).toBeGreaterThanOrEqual(1);
      const lastFocus = focusEvents[focusEvents.length - 1];
      expect(lastFocus.details.focusShiftType).toBe('cm_to_equation');
      expect(lastFocus.details.toClass).toContain('cm-word-equation-widget');

      cmEl.remove();
      eqEl.remove();
    });

    it('evaluates dynamic placeholder emptiness in active equation session telemetry', () => {
      logger.setEnabled(true);

      const emptySlot = createSlot('root', [], null, 'empty-slot-1');
      const filledSlot = createSlot('root', [createToken('5', 'mn', undefined, 'num-1')], null, 'filled-slot-1');

      // 1. Set active equation with empty slot -> isPlaceholder must be true
      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'empty-slot-1', offset: 0 },
        isFocused: true,
        ast: emptySlot,
      });

      const eventsAfterEmpty = logger.getEvents().filter((e) => e.type === 'caret');
      expect(eventsAfterEmpty.length).toBeGreaterThanOrEqual(1);
      const lastEmptyEvent = eventsAfterEmpty[eventsAfterEmpty.length - 1];
      expect(lastEmptyEvent.details.isPlaceholder).toBe(true);

      // 2. Set active equation with filled slot -> isPlaceholder must be false
      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'filled-slot-1', offset: 0 },
        isFocused: true,
        ast: filledSlot,
      });

      const eventsAfterFilled = logger.getEvents().filter((e) => e.type === 'caret');
      const lastFilledEvent = eventsAfterFilled[eventsAfterFilled.length - 1];
      expect(lastFilledEvent.details.isPlaceholder).toBe(false);
    });

    it('logs candidate evaluation during navigation when debug mode is enabled', () => {
      logger.setEnabled(true);

      const numSlot = createSlot('numerator', [createToken('1', 'mn')], null, 'slot-num');
      const denSlot = createSlot('denominator', [], null, 'slot-den');
      const frac = createFraction(numSlot, denSlot, undefined, 'frac-1');
      const rootSlot = createSlot('root', [frac], null, 'root-slot');
      updateParentPointers(rootSlot);

      // Move Down from numerator into denominator
      const result = handleArrowKey(rootSlot, { slotId: 'slot-num', offset: 0 }, 'ArrowDown');
      expect(result).not.toBeNull();
      expect(result.handled).toBe(true);
      expect(result.caret.slotId).toBe('slot-den');

      const placeholderEvents = logger.getEvents().filter(
        (e) => e.type === 'placeholder' && (e.details as any).action === 'candidate_evaluation_summary'
      );
      expect(placeholderEvents.length).toBeGreaterThanOrEqual(1);
      const candidateLog = placeholderEvents[0].details as any;
      expect(candidateLog.direction).toBe('ArrowDown');
      expect(candidateLog.toSlotId).toBe('slot-den');
      expect(candidateLog.handled).toBe(true);
      expect(candidateLog.isPlaceholder).toBe(true);
    });

    it('records CodeMirror transaction events with cm_transaction and selection before/after when debug mode is ON', () => {
      logger.setEnabled(true);

      const state = EditorState.create({
        doc: 'Initial document text',
        extensions: [equationTransactionFilterPlugin],
      });

      // Update state via transaction
      state.update({
        changes: { from: 7, to: 7, insert: 'added ' },
        selection: { anchor: 13 },
        userEvent: 'input.type',
      });

      const trEvents = logger.getEvents().filter(
        (e) => e.details?.eventCategory === 'cm_transaction'
      );
      expect(trEvents.length).toBeGreaterThanOrEqual(1);
      const lastTr = trEvents[trEvents.length - 1].details;
      expect(lastTr.eventCategory).toBe('cm_transaction');
      expect(lastTr.userEvent).toBe('input.type');
      expect(lastTr.docChanged).toBe(true);
      expect(lastTr.selectionBefore).toBeDefined();
      expect(lastTr.selectionAfter).toBeDefined();
      expect(lastTr.selectionAfter.anchor).toBe(13);
    });

    it('records DOM mutations with dom_mutation tracking added nodes and .eq-caret presence when debug mode is ON', async () => {
      logger.setEnabled(true);

      const container = document.createElement('div');
      container.className = 'word-equation-math eq-active';
      document.body.appendChild(container);

      const observer = attachEquationMutationObserver(container);
      expect(observer).not.toBeNull();

      // 1. Add a caret node
      const caretEl = document.createElement('span');
      caretEl.className = 'eq-caret';
      caretEl.textContent = '|';
      container.appendChild(caretEl);

      // Wait for MutationObserver queue
      await new Promise((resolve) => setTimeout(resolve, 60));

      const mutationEvents = logger.getEvents().filter(
        (e) => e.details?.eventCategory === 'dom_mutation'
      );
      expect(mutationEvents.length).toBeGreaterThanOrEqual(1);
      const lastMutation = mutationEvents[mutationEvents.length - 1].details;
      expect(lastMutation.eventCategory).toBe('dom_mutation');
      expect(lastMutation.mutationType).toBe('childList');
      expect(lastMutation.hasVisualCaret).toBe(true);
      expect(lastMutation.addedNodes).toContain('eq-caret');

      // 2. Disconnect observer and verify no further events
      disconnectEquationMutationObserver(observer);
      const countBefore = logger.getEvents().filter((e) => e.details?.eventCategory === 'dom_mutation').length;

      const extraNode = document.createElement('span');
      extraNode.className = 'eq-token';
      container.appendChild(extraNode);

      await new Promise((resolve) => setTimeout(resolve, 60));
      const countAfter = logger.getEvents().filter((e) => e.details?.eventCategory === 'dom_mutation').length;
      expect(countAfter).toBe(countBefore);

      container.remove();
    });

    it('strictly logs zero events across all new telemetry hooks when debug mode is disabled', async () => {
      logger.setEnabled(false);

      // 1. CodeMirror transaction filter
      const state = EditorState.create({
        doc: 'Zero overhead doc',
        extensions: [equationTransactionFilterPlugin],
      });
      state.update({
        changes: { from: 0, to: 4, insert: 'Test' },
        selection: { anchor: 4 },
        userEvent: 'input.type',
      });

      // 2. MutationObserver
      const container = document.createElement('div');
      container.className = 'word-equation-math eq-active';
      document.body.appendChild(container);

      const observer = attachEquationMutationObserver(container);
      expect(observer).toBeNull();

      const caret = document.createElement('span');
      caret.className = 'eq-caret';
      container.appendChild(caret);
      await new Promise((resolve) => setTimeout(resolve, 60));

      // 3. Navigation and active session
      const emptySlot = createSlot('root', [], null, 'empty-slot-1');
      setActiveEquationState({
        from: 0,
        to: 10,
        caret: { slotId: 'empty-slot-1', offset: 0 },
        isFocused: true,
        ast: emptySlot,
      });

      const numSlot = createSlot('numerator', [createToken('1', 'mn')], null, 'slot-num');
      const denSlot = createSlot('denominator', [], null, 'slot-den');
      const frac = createFraction(numSlot, denSlot, undefined, 'frac-1');
      const rootSlot = createSlot('root', [frac], null, 'root-slot');
      updateParentPointers(rootSlot);
      handleArrowKey(rootSlot, { slotId: 'slot-num', offset: 0 }, 'ArrowRight');

      // 4. Keyboard dispatch
      const btn = document.createElement('button');
      document.body.appendChild(btn);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      btn.remove();
      container.remove();

      expect(logger.getEvents().length).toBe(0);
      expect((window as any).__eqDebugEvents.length).toBe(0);
    });

    it('calling setEnabled(false) calls teardownGlobalTelemetry() and leaves 0 global event listeners and 0 active mutation observers', () => {
      // 1. Enable debug mode and verify telemetry is attached
      logger.setEnabled(true);
      expect(isGlobalTelemetryAttached()).toBe(true);

      const container = document.createElement('div');
      container.className = 'word-equation-math eq-active';
      document.body.appendChild(container);

      const observer = attachEquationMutationObserver(container);
      expect(observer).not.toBeNull();
      expect(getActiveMutationObserversCount()).toBe(1);

      // Track removal of global event listeners and observer disconnection
      const disconnectSpy = vi.spyOn(observer!, 'disconnect');
      const removeWindowSpy = vi.spyOn(window, 'removeEventListener');
      const removeDocSpy = vi.spyOn(document, 'removeEventListener');

      // 2. Disable debug mode
      logger.setEnabled(false);

      // Verify teardown behavior
      expect(disconnectSpy).toHaveBeenCalled();
      expect(removeWindowSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      expect(removeWindowSpy).toHaveBeenCalledWith('keydown', expect.any(Function), false);
      expect(removeWindowSpy).toHaveBeenCalledWith('focusin', expect.any(Function), true);
      expect(removeWindowSpy).toHaveBeenCalledWith('focusout', expect.any(Function), true);
      expect(removeWindowSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      expect(removeDocSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

      // Verify 0 global listeners and 0 active observers state
      expect(isGlobalTelemetryAttached()).toBe(false);
      expect(getActiveMutationObserversCount()).toBe(0);

      // Verify dispatched DOM events produce no logs
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(logger.getEvents().length).toBe(0);

      container.remove();
    });

    it('calling logDebugEvent with a throwing callback catches and swallows the error without throwing', () => {
      logger.setEnabled(true);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // 1. Throwing factory callback
      expect(() => {
        logDebugEvent('navigation', () => {
          throw new Error('Simulated payload factory error');
        });
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WordEquation] Telemetry error:',
        expect.objectContaining({ message: 'Simulated payload factory error' })
      );

      // 2. Throwing record method
      const recordSpy = vi.spyOn(logger, 'record').mockImplementation(() => {
        throw new Error('Simulated logger record error');
      });

      expect(() => {
        logDebugEvent('keydown', { key: 'Enter' });
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[WordEquation] Telemetry error:',
        expect.objectContaining({ message: 'Simulated logger record error' })
      );

      recordSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('equationTransactionFilterPlugin safely catches errors and returns transaction intact even if telemetry extraction throws', () => {
      logger.setEnabled(true);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const state = EditorState.create({
        doc: 'Testing CM transaction safety',
        extensions: [equationTransactionFilterPlugin],
      });

      const tr = state.update({
        changes: { from: 0, to: 0, insert: 'Safe ' },
        selection: { anchor: 5 },
      });
      expect(tr).toBeDefined();
      expect(tr.newDoc.toString()).toBe('Safe Testing CM transaction safety');

      consoleErrorSpy.mockRestore();
    });

    it('captures capture-phase and bubble-phase pointer and mouse events on window when debug mode is ON', () => {
      logger.setEnabled(true);

      const targetDiv = document.createElement('div');
      targetDiv.className = 'test-pointer-target';
      document.body.appendChild(targetDiv);

      const pointerDownEvt = new PointerEvent('pointerdown', {
        clientX: 150,
        clientY: 250,
        buttons: 1,
        button: 0,
        bubbles: true,
      });
      targetDiv.dispatchEvent(pointerDownEvt);

      const pointerDownEvents = logger.getEvents().filter(
        (e) => e.type === 'pointer' && e.details?.eventType === 'pointerdown'
      );
      expect(pointerDownEvents.length).toBeGreaterThanOrEqual(2); // Capture and bubble
      const captureEvt = pointerDownEvents.find((e) => e.details?.phase === 'capture');
      const bubbleEvt = pointerDownEvents.find((e) => e.details?.phase === 'bubble');
      expect(captureEvt).toBeDefined();
      expect(captureEvt?.details.clientX).toBe(150);
      expect(captureEvt?.details.clientY).toBe(250);
      expect(captureEvt?.details.buttons).toBe(1);
      expect(bubbleEvt).toBeDefined();

      const mouseDownEvt = new MouseEvent('mousedown', {
        clientX: 120,
        clientY: 220,
        buttons: 1,
        button: 0,
        bubbles: true,
      });
      targetDiv.dispatchEvent(mouseDownEvt);

      const mouseDownEvents = logger.getEvents().filter(
        (e) => e.type === 'mouse' && e.details?.eventType === 'mousedown'
      );
      expect(mouseDownEvents.length).toBeGreaterThanOrEqual(2);

      targetDiv.remove();
    });

    it('records drag lifecycle and DOM interception telemetry during widget pointer interactions', () => {
      logger.setEnabled(true);

      const container = document.createElement('div');
      container.className = 'cm-word-equation-widget';
      const mathBox = document.createElement('div');
      mathBox.className = 'word-equation-math';
      const slotEl = document.createElement('span');
      slotEl.className = 'eq-slot';
      slotEl.setAttribute('data-slot-id', 'root-slot');
      const tokenEl = document.createElement('span');
      tokenEl.className = 'eq-token';
      tokenEl.textContent = 'x';
      slotEl.appendChild(tokenEl);
      mathBox.appendChild(slotEl);
      container.appendChild(mathBox);
      document.body.appendChild(container);

      const rootSlot = createSlot('root', [createToken('x', 'mi')], null, 'root-slot');
      updateParentPointers(rootSlot);

      const widget = new WordEquationWidget('<math><mi>x</mi></math>', 0, 10, false);
      widget.ast = rootSlot;
      (container as any).__widget = widget;

      // Attach event listeners to container DOM
      (widget as any).attachEventListeners(container, null as any);

      // 1. Pointerdown on mathBox
      mathBox.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          clientY: 100,
          buttons: 1,
          button: 0,
          bubbles: true,
        })
      );

      const activationEvents = logger.getEvents().filter(
        (e) => e.details?.eventCategory === 'drag_lifecycle' && e.details?.lifecycleStage === 'activation_start'
      );
      expect(activationEvents.length).toBeGreaterThanOrEqual(1);
      expect(activationEvents[0].details.startX).toBe(100);
      expect(activationEvents[0].details.isDragging).toBe(false);

      // 2. Genuine drag movement with buttons: 1 >= 3px (verifies drag_start threshold detection)
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 105,
          clientY: 105,
          buttons: 1,
          bubbles: true,
        })
      );

      const dragStartEvents = logger.getEvents().filter(
        (e) => e.details?.eventCategory === 'drag_lifecycle' && e.details?.lifecycleStage === 'drag_start'
      );
      expect(dragStartEvents.length).toBeGreaterThanOrEqual(1);
      expect(dragStartEvents[0].details.isDragging).toBe(true);
      expect(dragStartEvents[0].details.thresholdExceeded).toBe(true);

      // 3. Pointerup on mathBox (verifies dom_interception stopPropagation and clean drag_end)
      mathBox.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 105,
          clientY: 105,
          buttons: 0,
          bubbles: true,
        })
      );

      const interceptionEvents = logger.getEvents().filter(
        (e) => e.details?.eventCategory === 'dom_interception' && e.details?.action === 'stopPropagation'
      );
      expect(interceptionEvents.length).toBeGreaterThanOrEqual(1);

      const dragEndEvents = logger.getEvents().filter(
        (e) => e.details?.eventCategory === 'drag_lifecycle' && e.details?.lifecycleStage === 'drag_end'
      );
      expect(dragEndEvents.length).toBeGreaterThanOrEqual(1);

      // 4. Subsequent pointermove with buttons: 0 does NOT initiate drag (verifies sticky drag fix)
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 110,
          clientY: 110,
          buttons: 0,
          bubbles: true,
        })
      );
      const postUpDragEvents = logger.getEvents().filter(
        (e) => e.details?.eventCategory === 'drag_lifecycle' && e.details?.lifecycleStage === 'drag_start' && e.details?.clientX === 110
      );
      expect(postUpDragEvents.length).toBe(0);

      container.remove();
    });

    it('teardownGlobalTelemetry cleanly removes all pointer and mouse listeners and resets listener count to 0', () => {
      logger.setEnabled(true);
      expect(getActivePointerMouseListenersCount()).toBe(POINTER_MOUSE_EVENTS.length * 2);

      logger.setEnabled(false);
      expect(getActivePointerMouseListenersCount()).toBe(0);

      // Dispatched events should produce 0 logs
      window.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 50, clientY: 50, buttons: 1, bubbles: true })
      );
      expect(logger.getEvents().length).toBe(0);
    });
  });
});
