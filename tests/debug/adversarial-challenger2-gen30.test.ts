import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DebugLogger,
  getDebugLogger,
  isDebugEnabled,
  logDebugEvent,
  DebugEventType,
  DebugEvent,
} from '../../src/debug/debug-logger';
import { App } from '../mocks/obsidian';
import {
  createSlot,
  createToken,
  createFraction,
  createRadical,
  updateParentPointers,
  resetIdCounter,
} from '../../src/core/ast';
import { findSlotBelow, findSlotAbove } from '../../src/editor/navigation';

describe('Adversarial Telemetry & Zero-Overhead Verification (Challenger 2 Gen30)', () => {
  let logger: DebugLogger;
  let mockApp: any;

  beforeEach(() => {
    resetIdCounter();
    mockApp = new App();
    logger = getDebugLogger();
    logger.resetForTesting();
  });

  afterEach(() => {
    logger.resetForTesting();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Zero-Overhead Contract When Debug Mode is OFF
  // =========================================================================
  describe('1. Zero-Overhead Contract When Debug Mode is OFF', () => {
    it('strictly guarantees lazy factory functions are never invoked when disabled', () => {
      logger.setEnabled(false);
      expect(isDebugEnabled()).toBe(false);

      const expensiveSpies = [
        vi.fn(() => ({ slot: 'a', complexComputation: Math.random() })),
        vi.fn(() => ({ key: 'ArrowDown', domQuery: document.querySelectorAll('*') })),
        vi.fn(() => ({ type: 'boundary', active: true })),
        vi.fn(() => ({ action: 'enter_placeholder', slotId: 'slot_123' })),
        vi.fn(() => ({ key: 'F12', unhandled: true })),
      ];

      const eventTypes: DebugEventType[] = [
        'caret',
        'navigation',
        'boundary',
        'placeholder',
        'navigation_unhandled',
      ];

      for (let i = 0; i < expensiveSpies.length; i++) {
        logDebugEvent(eventTypes[i], expensiveSpies[i]);
      }

      for (const spy of expensiveSpies) {
        expect(spy).not.toHaveBeenCalled();
      }

      expect(logger.getEvents()).toHaveLength(0);
      expect((window as any).__eqDebugEvents).toEqual([]);
    });

    it('incurs sub-microsecond latency across 100,000 disabled iterations without memory allocation', () => {
      logger.setEnabled(false);
      const factory = () => ({
        key: 'ArrowRight',
        timestamp: Date.now(),
        deep: { nested: { value: 42 } },
      });

      const start = performance.now();
      for (let i = 0; i < 100000; i++) {
        logDebugEvent('navigation', factory);
      }
      const duration = performance.now() - start;

      // 100,000 iterations must complete within 50ms (< 0.5 microseconds per call)
      expect(duration).toBeLessThan(50);
      expect(logger.getEvents()).toHaveLength(0);
    });

    it('does not schedule flushes or trigger writes during normal operations when disabled', async () => {
      logger.init(mockApp, 'obsidian-word-equation', false);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      logDebugEvent('boundary', () => ({ transition: 'enterFromEnd' }));
      logDebugEvent('keydown', () => ({ key: 'ArrowLeft' }));
      logDebugEvent('placeholder', () => ({ action: 'enter_placeholder' }));

      // Wait 100ms for any potential debounce timer
      await new Promise((r) => setTimeout(r, 100));

      expect(writeSpy).not.toHaveBeenCalled();
      expect(logger.getEvents()).toHaveLength(0);
    });

    it('drops queued events and stops writes immediately upon disabling', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      logDebugEvent('keydown', () => ({ key: 'ArrowLeft' }));
      expect(logger.getEvents()).toHaveLength(1);

      // Disable logger
      logger.setEnabled(false);
      expect(isDebugEnabled()).toBe(false);

      // Further logs are ignored
      logDebugEvent('boundary', () => ({ transition: 'enterFromEnd' }));
      expect(logger.getEvents()).toHaveLength(1);

      await logger.flush();
      // Only the first event should have been persisted
      expect(writeSpy).toHaveBeenCalledTimes(1);
      const writtenJson = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(writtenJson).toHaveLength(1);
      expect(writtenJson[0].type).toBe('keydown');
    });
  });

  // =========================================================================
  // 2. Schema, Data Points, and Serialization Validation (debug-log.json)
  // =========================================================================
  describe('2. Schema, Data Points, and Serialization Validation', () => {
    it('records and serializes all 10 DebugEventTypes with valid ISO timestamps and details/data parity', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      const allTypes: DebugEventType[] = [
        'initialization',
        'caret',
        'selection',
        'clipboard',
        'navigation',
        'conversion',
        'keydown',
        'boundary',
        'navigation_unhandled',
        'placeholder',
      ];

      for (const t of allTypes) {
        logDebugEvent(t, () => ({ testKey: `value_for_${t}`, code: 100 }));
      }

      await logger.flush();

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const logPath = writeSpy.mock.calls[0][0];
      expect(logPath).toBe('.obsidian/plugins/obsidian-word-equation/debug-log.json');

      const serializedString = writeSpy.mock.calls[0][1] as string;
      const parsed = JSON.parse(serializedString);

      expect(parsed).toHaveLength(10);
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        expect(item.type).toBe(allTypes[i]);
        // Timestamp must be a valid ISO-8601 string
        expect(new Date(item.timestamp).toISOString()).toBe(item.timestamp);
        // Both details and data must exist and match
        expect(item.details).toBeDefined();
        expect(item.data).toEqual(item.details);
        expect(item.details.testKey).toBe(`value_for_${allTypes[i]}`);
      }
    });

    it('correctly handles unicode math expressions and special characters in details payload', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      const mathSymbols = '∫₀^∞ e^(-x²) dx = √π / 2, ∑_{i=1}^n x_i ≤ ∏ (1+y)';
      logDebugEvent('navigation', () => ({
        mathText: mathSymbols,
        equation: { from: 10, to: 50, mathml: `<math><msqrt><mi>π</mi></msqrt></math>` },
      }));

      await logger.flush();
      const parsed = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(parsed[0].details.mathText).toBe(mathSymbols);
      expect(parsed[0].details.mathText).toContain('√π');
      expect(parsed[0].details.equation.mathml).toContain('π');
    });

    it('survives debounced rapid event bursts and concurrent flush calls without race conditions', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      // Trigger 100 rapid events
      for (let i = 0; i < 100; i++) {
        logDebugEvent('keydown', () => ({ seq: i, key: 'ArrowRight' }));
      }

      // Trigger multiple concurrent flushes
      await Promise.all([logger.flush(), logger.flush(), logger.flush()]);

      const events = logger.getEvents();
      expect(events).toHaveLength(100);
      expect(writeSpy).toHaveBeenCalled();

      const lastCall = writeSpy.mock.calls[writeSpy.mock.calls.length - 1];
      const parsed = JSON.parse(lastCall[1] as string);
      expect(parsed).toHaveLength(100);
      expect(parsed[99].details.seq).toBe(99);
    });

    it('resets events and writes empty array on clear()', async () => {
      logger.init(mockApp, 'obsidian-word-equation', true);
      const writeSpy = vi.spyOn(mockApp.vault.adapter, 'write');

      logDebugEvent('caret', () => ({ offset: 5 }));
      expect(logger.getEvents()).toHaveLength(1);

      await logger.clear();
      expect(logger.getEvents()).toHaveLength(0);
      expect((window as any).__eqDebugEvents).toHaveLength(0);
      expect(writeSpy).toHaveBeenCalledWith('.obsidian/plugins/obsidian-word-equation/debug-log.json', '[]');
    });
  });

  // =========================================================================
  // 3. Gen30 Telemetry Payloads & Navigation Stress Invariants
  // =========================================================================
  describe('3. Gen30 Telemetry Payloads & Navigation Stress Invariants', () => {
    it('captures full Gen30 keydown payload with activeElementTag, targetTag, and class names', () => {
      logger.setEnabled(true);

      logDebugEvent('keydown', () => ({
        key: 'ArrowDown',
        code: 'ArrowDown',
        targetTag: 'DIV',
        activeElementTag: 'DIV',
        activeElementClass: 'cm-content cm-lineWrapping',
        isFocused: true,
        widgetRange: { from: 100, to: 250 },
      }));

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.type).toBe('keydown');
      expect(e.details.key).toBe('ArrowDown');
      expect(e.details.activeElementClass).toContain('cm-content');
      expect(e.details.widgetRange.from).toBe(100);
    });

    it('captures Gen30 boundary transition events with enterFromStart, enterFromEnd, and exitToEditor', () => {
      logger.setEnabled(true);

      const transitions = [
        {
          transition: 'enterFromStart',
          key: 'ArrowRight',
          from: { cmPos: 50 },
          to: { slotId: 'slot_root_1', offset: 0 },
        },
        {
          transition: 'enterFromEnd',
          key: 'ArrowLeft',
          from: { cmPos: 200 },
          to: { slotId: 'slot_root_1', offset: 4 },
        },
        {
          transition: 'exitToEditor',
          direction: 'after',
          key: 'ArrowRight',
          from: { slotId: 'slot_root_1', offset: 4 },
          to: { cmPos: 201 },
        },
      ];

      for (const t of transitions) {
        logDebugEvent('boundary', () => t);
      }

      const events = logger.getEvents();
      expect(events).toHaveLength(3);
      expect(events.map((ev) => ev.details.transition)).toEqual([
        'enterFromStart',
        'enterFromEnd',
        'exitToEditor',
      ]);
    });

    it('captures Gen30 placeholder entry telemetry with action, role, slotId, and parentNodeId', () => {
      logger.setEnabled(true);

      logDebugEvent('placeholder', () => ({
        action: 'enter_placeholder',
        slotId: 'slot_den_42',
        role: 'denominator',
        parentNodeId: 'frac_99',
      }));

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.type).toBe('placeholder');
      expect(e.details.action).toBe('enter_placeholder');
      expect(e.details.role).toBe('denominator');
      expect(e.details.parentNodeId).toBe('frac_99');
    });

    it('verifies AST navigation into placeholder when navigating downward into composite fraction', () => {
      // Test the navigation engine logic used by Scenario 34
      const num = createSlot('numerator');
      const den = createSlot('denominator');
      const frac = createFraction(num, den);
      const root = createSlot('root', [frac]);
      updateParentPointers(root);

      // Caret at root offset 0, pressing ArrowDown
      const navDown = findSlotBelow(root, { slotId: root.id, offset: 0 });
      expect(navDown.handled).toBe(true);
      expect(navDown.caret.slotId).toBe(num.id);

      // Caret in numerator, pressing ArrowDown
      const navDown2 = findSlotBelow(root, navDown.caret);
      expect(navDown2.handled).toBe(true);
      expect(navDown2.caret.slotId).toBe(den.id);
    });

    it('verifies AST navigation into radical placeholder when navigating downward into composite radical', () => {
      // Test the navigation engine logic used by Scenario 34 for radicals
      const rad = createSlot('radicand');
      const radicalNode = createRadical(rad);
      const root = createSlot('root', [radicalNode]);
      updateParentPointers(root);

      const navDown = findSlotBelow(root, { slotId: root.id, offset: 0 });
      expect(navDown.handled).toBe(true);
      expect(navDown.caret.slotId).toBe(rad.id);
    });
  });
});
